// Lógica de negocio de las deudas y préstamos, con un contacto o con alguien que no lo es.
//
// Una deuda es un registro aparte: no mueve los saldos de las cuentas ni entra en los totales de
// los movimientos (si no, lo prestado contaría como un gasto y lo devuelto como un ingreso). Se
// define con quién (un contacto, o solo un nombre escrito a mano), el sentido ("me deben" o
// "debo"), de qué es, el monto, la moneda y el día, y se va saldando con pagos parciales. Cuánto falta se calcula al leer (monto menos pagos vigentes);
// no se guarda, así no se desincroniza.
//
// Toda consulta filtra por `userId`, que sale siempre de la sesión. Deudas y pagos se borran
// lógicamente (`eliminadoEn`) y un job los borra en definitivo pasado un plazo
// (servicios/contactos/limpieza.ts). Una deuda es en una sola moneda y no se convierte: los
// totales se dan por moneda.
//
// Reglas que garantiza este servicio (la base solo asegura que los montos sean positivos):
// - Es con un contacto o con un nombre, uno solo de los dos. Si es un contacto, es de la persona y
//   está activo.
// - La fecha límite (opcional) no puede ser anterior al día de la deuda.
// - Ni la deuda ni un pago pueden tener fecha futura (el "hoy" de la zona horaria de la persona).
// - Un pago no puede ser anterior a la deuda ni pasar de lo que falta. Registrar dos pagos a la
//   vez no puede dejar el saldo en negativo: el pago se valida con la fila de la deuda bloqueada.
// - El monto de una deuda no puede quedar por debajo de lo ya pagado.
//
// Un pago puede generar, si la persona lo pide, el ingreso (cobro) o gasto (pago) que le corresponde
// en una de sus cuentas. Si la cuenta es de otra moneda que la deuda, el importe se convierte como
// en una transferencia entre cuentas (cotización del día, una escrita, o el importe recibido). Todo va
// en la misma transacción:
// o se registran el pago y su movimiento, o ninguno. Quitar el pago elimina también ese movimiento.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  diaDeHoy,
  formatearMonto,
  instanteDelDia,
  type SentidoDeDeuda,
  type TipoDeContacto,
} from "@gestoria/shared";
import { and, count, desc, eq, gte, isNull, lte, type SQL, sql } from "drizzle-orm";
import type { OpcionesDeCotizacion } from "./cotizaciones.ts";
import {
  type CambioPedido,
  crearMovimiento,
  ReferenciaInvalida,
  resolverCambio,
} from "./movimientos.ts";
import { obtenerZonaHoraria } from "./periodos.ts";

export type PagoDeDeuda = {
  id: string;
  montoCentavos: number;
  /** "AAAA-MM-DD". */
  fecha: string;
  /** El ingreso o gasto que generó este pago, si lo hay y no se eliminó. */
  movimiento: { id: string; tipo: "ingreso" | "gasto"; cuenta: string } | null;
};

export type Deuda = {
  id: string;
  /** Con quién, si es un contacto. Null si la deuda es con alguien que no está en los contactos. */
  contacto: {
    id: string;
    tipo: TipoDeContacto;
    nombre: string;
    apellido: string | null;
    /** El contacto está en la papelera. */
    eliminado: boolean;
  } | null;
  /** Con quién, si no es un contacto: el nombre que se escribió. Null si es un contacto. */
  nombreLibre: string | null;
  sentido: SentidoDeDeuda;
  concepto: string;
  /** El total original, en centésimos de `moneda`. */
  montoCentavos: number;
  moneda: string;
  /** El día en que se originó. "AAAA-MM-DD". */
  fecha: string;
  /** Hasta qué día debería saldarse. "AAAA-MM-DD", o null si no se puso. */
  fechaLimite: string | null;
  pagadoCentavos: number;
  /** Lo que falta. 0 es saldada. */
  pendienteCentavos: number;
  saldada: boolean;
  creadoEn: Date;
};

/** Una deuda con sus pagos vigentes, el más nuevo primero. */
export type DeudaConPagos = Deuda & { pagos: PagoDeDeuda[] };

export type EstadoDeDeuda = "pendientes" | "saldadas" | "todas";

export type FiltrosDeDeudas = {
  contactoId?: string | undefined;
  sentido?: SentidoDeDeuda | undefined;
  /** Por defecto, solo las pendientes. */
  estado?: EstadoDeDeuda | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

/** El contacto no existe, es de otra persona o está en la papelera. */
export class ContactoInvalido extends Error {}
/** No se dijo con quién es la deuda, o se dijo un contacto y un nombre a la vez. */
export class DeudaSinQuienOConDosQuienes extends Error {}
/** La fecha límite es anterior al día en que empezó la deuda. */
export class LimiteAnteriorALaDeuda extends Error {}
/** Una fecha posterior a hoy; `campo` dice cuál. */
export class FechaEnElFuturo extends Error {}
/** El monto nuevo es menor que lo ya pagado. */
export class MontoMenorAlPagado extends Error {
  readonly pagadoCentavos: number;

  constructor(pagadoCentavos: number) {
    super("monto menor al pagado");
    this.pagadoCentavos = pagadoCentavos;
  }
}
/** El pago pasa de lo que falta (0 si la deuda ya está saldada). */
export class PagoMayorAlPendiente extends Error {
  readonly pendienteCentavos: number;

  constructor(pendienteCentavos: number) {
    super("pago mayor al pendiente");
    this.pendienteCentavos = pendienteCentavos;
  }
}
/** El pago es de un día anterior al de la deuda. */
export class PagoAnteriorALaDeuda extends Error {}

const LIMITE_POR_DEFECTO = 50;
export const LIMITE_MAXIMO_DE_DEUDAS = 100;

const { deudas, pagosDeDeudas, contactos, movimientos, cuentasFinancieras } = esquema;

/**
 * Lo pagado de cada deuda, calculado en la consulta: la suma de sus pagos vigentes.
 *
 * La deuda se referencia con su nombre completo escrito a mano (`"deudas"."id"`) y no con la
 * columna de Drizzle: en una consulta de una sola tabla Drizzle escribe las columnas sin
 * calificar, y un `id` suelto dentro de la subconsulta se resolvería contra la tabla de pagos
 * (que también tiene `id`) y la suma daría siempre cero.
 */
const pagadoSql =
  sql<number>`coalesce((select sum(${pagosDeDeudas.montoCentavos}) from ${pagosDeDeudas} where ${pagosDeDeudas.deudaId} = ${sql.raw('"deudas"."id"')} and ${pagosDeDeudas.eliminadoEn} is null), 0)`.mapWith(
    Number,
  );

type FilaDeDeuda = {
  id: string;
  sentido: string;
  concepto: string;
  montoCentavos: number;
  moneda: string;
  fecha: string;
  fechaLimite: string | null;
  creadoEn: Date;
  pagado: number;
  nombreLibre: string | null;
  contactoId: string | null;
  contactoTipo: string | null;
  contactoNombre: string | null;
  contactoApellido: string | null;
  contactoEliminadoEn: Date | null;
};

const COLUMNAS = {
  id: deudas.id,
  sentido: deudas.sentido,
  concepto: deudas.concepto,
  montoCentavos: deudas.montoCentavos,
  moneda: deudas.moneda,
  fecha: deudas.fecha,
  fechaLimite: deudas.fechaLimite,
  creadoEn: deudas.creadoEn,
  pagado: pagadoSql,
  nombreLibre: deudas.nombreLibre,
  contactoId: contactos.id,
  contactoTipo: contactos.tipo,
  contactoNombre: contactos.nombre,
  contactoApellido: contactos.apellido,
  contactoEliminadoEn: contactos.eliminadoEn,
};

function aDeuda(fila: FilaDeDeuda): Deuda {
  const pendiente = Math.max(0, fila.montoCentavos - fila.pagado);
  return {
    id: fila.id,
    // El join es "left": sin contacto (deuda con un nombre) todas sus columnas vienen en null.
    contacto:
      fila.contactoId !== null && fila.contactoTipo !== null && fila.contactoNombre !== null
        ? {
            id: fila.contactoId,
            tipo: fila.contactoTipo as TipoDeContacto,
            nombre: fila.contactoNombre,
            apellido: fila.contactoApellido,
            eliminado: fila.contactoEliminadoEn !== null,
          }
        : null,
    nombreLibre: fila.nombreLibre,
    sentido: fila.sentido as SentidoDeDeuda,
    concepto: fila.concepto,
    montoCentavos: fila.montoCentavos,
    moneda: fila.moneda,
    fecha: fila.fecha,
    fechaLimite: fila.fechaLimite,
    pagadoCentavos: fila.pagado,
    pendienteCentavos: pendiente,
    saldada: pendiente === 0,
    creadoEn: fila.creadoEn,
  };
}

/** El día de hoy para la persona. */
async function hoyDe(cliente: ClienteDb, userId: string, ahora: Date): Promise<string> {
  return diaDeHoy(await obtenerZonaHoraria(cliente, userId), ahora);
}

async function contactoActivo(
  cliente: ClienteDb,
  userId: string,
  contactoId: string,
): Promise<boolean> {
  const fila = await cliente.db.query.contactos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(
        eqCol(tabla.id, contactoId),
        eqCol(tabla.userId, userId),
        isNullCol(tabla.eliminadoEn),
      ),
    columns: { id: true },
  });
  return fila !== undefined;
}

function condicionesDe(userId: string, filtros: FiltrosDeDeudas): SQL | undefined {
  const estado = filtros.estado ?? "pendientes";
  return and(
    eq(deudas.userId, userId),
    isNull(deudas.eliminadoEn),
    filtros.contactoId ? eq(deudas.contactoId, filtros.contactoId) : undefined,
    filtros.sentido ? eq(deudas.sentido, filtros.sentido) : undefined,
    estado === "pendientes" ? sql`${deudas.montoCentavos} > ${pagadoSql}` : undefined,
    estado === "saldadas" ? sql`${deudas.montoCentavos} <= ${pagadoSql}` : undefined,
  );
}

/**
 * Las deudas de la persona, la más reciente primero, con paginación. `total` cuenta todas las
 * que cumplen los filtros. Por defecto, solo las pendientes.
 */
export async function listarDeudas(
  cliente: ClienteDb,
  userId: string,
  filtros: FiltrosDeDeudas = {},
): Promise<{ deudas: Deuda[]; total: number }> {
  const donde = condicionesDe(userId, filtros);
  const limit = Math.min(filtros.limit ?? LIMITE_POR_DEFECTO, LIMITE_MAXIMO_DE_DEUDAS);

  const [filas, [fila]] = await Promise.all([
    cliente.db
      .select(COLUMNAS)
      .from(deudas)
      .leftJoin(contactos, eq(contactos.id, deudas.contactoId))
      .where(donde)
      .orderBy(desc(deudas.fecha), desc(deudas.creadoEn), deudas.id)
      .limit(limit)
      .offset(filtros.offset ?? 0),
    cliente.db.select({ total: count() }).from(deudas).where(donde),
  ]);

  return { deudas: filas.map(aDeuda), total: fila?.total ?? 0 };
}

/**
 * Las deudas pendientes (con algo por saldar) cuya fecha límite cae entre `desde` y `hasta`, ambos
 * inclusive, la que vence antes primero. Es lo que el calendario muestra de Finanzas: una saldada
 * ya no tiene nada que vencer.
 */
export async function deudasPendientesConLimiteEnRango(
  cliente: ClienteDb,
  userId: string,
  desde: string,
  hasta: string,
): Promise<Deuda[]> {
  const filas = await cliente.db
    .select(COLUMNAS)
    .from(deudas)
    .leftJoin(contactos, eq(contactos.id, deudas.contactoId))
    .where(
      and(
        eq(deudas.userId, userId),
        isNull(deudas.eliminadoEn),
        gte(deudas.fechaLimite, desde),
        lte(deudas.fechaLimite, hasta),
        sql`${deudas.montoCentavos} > ${pagadoSql}`,
      ),
    )
    .orderBy(deudas.fechaLimite, deudas.id);
  return filas.map(aDeuda);
}

/**
 * Todas las deudas pendientes con un contacto que no está en la papelera, sin paginar. Es lo que
 * usan los widgets de Contactos: no cuenta las deudas con un nombre escrito a mano, que no son de
 * ningún contacto.
 */
export async function deudasPendientesConContactos(
  cliente: ClienteDb,
  userId: string,
): Promise<Deuda[]> {
  const filas = await cliente.db
    .select(COLUMNAS)
    .from(deudas)
    .innerJoin(contactos, eq(contactos.id, deudas.contactoId))
    .where(and(condicionesDe(userId, { estado: "pendientes" }), isNull(contactos.eliminadoEn)))
    .orderBy(deudas.fecha, deudas.id);
  return filas.map(aDeuda);
}

/** Una deuda con sus pagos, o null si no existe, es de otra persona o está eliminada. */
export async function obtenerDeuda(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<DeudaConPagos | null> {
  const [fila] = await cliente.db
    .select(COLUMNAS)
    .from(deudas)
    .leftJoin(contactos, eq(contactos.id, deudas.contactoId))
    .where(and(eq(deudas.id, id), eq(deudas.userId, userId), isNull(deudas.eliminadoEn)));
  if (!fila) return null;

  const filasDePagos = await cliente.db
    .select({
      id: pagosDeDeudas.id,
      montoCentavos: pagosDeDeudas.montoCentavos,
      fecha: pagosDeDeudas.fecha,
      movimientoId: movimientos.id,
      movimientoTipo: movimientos.tipo,
      cuenta: cuentasFinancieras.nombre,
    })
    .from(pagosDeDeudas)
    // Solo el movimiento que sigue vigente: si se eliminó, el pago queda como un pago común.
    .leftJoin(
      movimientos,
      and(eq(movimientos.id, pagosDeDeudas.movimientoId), isNull(movimientos.eliminadoEn)),
    )
    .leftJoin(cuentasFinancieras, eq(cuentasFinancieras.id, movimientos.cuentaFinancieraId))
    .where(and(eq(pagosDeDeudas.deudaId, id), isNull(pagosDeDeudas.eliminadoEn)))
    .orderBy(desc(pagosDeDeudas.fecha), desc(pagosDeDeudas.creadoEn));

  const pagos: PagoDeDeuda[] = filasDePagos.map((pago) => ({
    id: pago.id,
    montoCentavos: pago.montoCentavos,
    fecha: pago.fecha,
    movimiento:
      pago.movimientoId !== null && pago.cuenta !== null
        ? {
            id: pago.movimientoId,
            tipo: pago.movimientoTipo === "ingreso" ? "ingreso" : "gasto",
            cuenta: pago.cuenta,
          }
        : null,
  }));

  return { ...aDeuda(fila), pagos };
}

export type DatosNuevaDeuda = {
  /** Con un contacto... */
  contactoId?: string | undefined;
  /** ...o con alguien que no lo es: uno de los dos, nunca los dos ni ninguno. */
  nombreLibre?: string | undefined;
  sentido: SentidoDeDeuda;
  concepto: string;
  montoCentavos: number;
  moneda: string;
  fecha: string;
  /** Hasta qué día debería saldarse. Sin ella (o vacía), la deuda no tiene límite. */
  fechaLimite?: string | null | undefined;
};

export async function crearDeuda(
  cliente: ClienteDb,
  userId: string,
  datos: DatosNuevaDeuda,
  ahora: Date = new Date(),
): Promise<DeudaConPagos> {
  // Un texto vacío cuenta como que no vino.
  const {
    contactoId: idDelContacto,
    nombreLibre: nombreEscrito,
    fechaLimite: limiteEscrito,
    ...resto
  } = datos;
  const fechaLimite = limiteEscrito || null;
  if (fechaLimite !== null && fechaLimite < datos.fecha) throw new LimiteAnteriorALaDeuda();
  const contactoId = idDelContacto || null;
  const nombreLibre = nombreEscrito?.trim() || null;
  if ((contactoId === null) === (nombreLibre === null)) throw new DeudaSinQuienOConDosQuienes();

  if (contactoId !== null && !(await contactoActivo(cliente, userId, contactoId))) {
    throw new ContactoInvalido();
  }
  if (datos.fecha > (await hoyDe(cliente, userId, ahora))) throw new FechaEnElFuturo();

  const [fila] = await cliente.db
    .insert(deudas)
    .values({ userId, ...resto, contactoId, nombreLibre, fechaLimite })
    .returning({ id: deudas.id });
  if (!fila) throw new Error("No se pudo crear la deuda.");

  const creada = await obtenerDeuda(cliente, userId, fila.id);
  if (!creada) throw new Error("No se encontró la deuda recién creada.");
  return creada;
}

/**
 * Cambia el concepto, el monto y el día. El monto no puede quedar por debajo de lo ya pagado.
 * Devuelve null si no existe, es de otra persona o está eliminada.
 */
export async function editarDeuda(
  cliente: ClienteDb,
  userId: string,
  id: string,
  datos: {
    concepto: string;
    montoCentavos: number;
    fecha: string;
    /** Sin ella queda como estaba; vacía ("") o null la quita. */
    fechaLimite?: string | null | undefined;
  },
  ahora: Date = new Date(),
): Promise<DeudaConPagos | null> {
  const actual = await obtenerDeuda(cliente, userId, id);
  if (!actual) return null;

  const fechaLimite =
    datos.fechaLimite === undefined ? actual.fechaLimite : datos.fechaLimite || null;
  if (fechaLimite !== null && fechaLimite < datos.fecha) throw new LimiteAnteriorALaDeuda();

  if (datos.montoCentavos < actual.pagadoCentavos) {
    throw new MontoMenorAlPagado(actual.pagadoCentavos);
  }
  if (datos.fecha > (await hoyDe(cliente, userId, ahora))) throw new FechaEnElFuturo();
  // Si ya hay pagos, el día de la deuda no puede pasar a ser posterior al del primero de ellos.
  const primerPago = actual.pagos.reduce<string | null>(
    (menor, pago) => (menor === null || pago.fecha < menor ? pago.fecha : menor),
    null,
  );
  if (primerPago !== null && datos.fecha > primerPago) throw new PagoAnteriorALaDeuda();

  await cliente.db
    .update(deudas)
    .set({
      concepto: datos.concepto,
      montoCentavos: datos.montoCentavos,
      fecha: datos.fecha,
      fechaLimite,
    })
    .where(and(eq(deudas.id, id), eq(deudas.userId, userId), isNull(deudas.eliminadoEn)));

  return await obtenerDeuda(cliente, userId, id);
}

/** Borrado lógico. Devuelve false si no existe, es de otra persona o ya estaba eliminada. */
export async function eliminarDeuda(
  cliente: ClienteDb,
  userId: string,
  id: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  const filas = await cliente.db
    .update(deudas)
    .set({ eliminadoEn: ahora })
    .where(and(eq(deudas.id, id), eq(deudas.userId, userId), isNull(deudas.eliminadoEn)))
    .returning({ id: deudas.id });
  return filas.length > 0;
}

/**
 * Registra un pago (o cobro) de una deuda. Se valida con la fila de la deuda bloqueada
 * (`for update`): dos pagos simultáneos se hacen en fila y el segundo ve lo que dejó el primero,
 * así el saldo nunca queda en negativo. Devuelve null si la deuda no existe.
 */
export async function registrarPago(
  cliente: ClienteDb,
  userId: string,
  deudaId: string,
  datos: {
    montoCentavos: number;
    fecha: string;
    /**
     * Genera además un ingreso (me deben) o gasto (debo) en esa cuenta, con esa categoría. Si la
     * cuenta es de otra moneda que la deuda, `cambio` dice cómo convertir (sin él, la cotización
     * del día del pago).
     */
    movimiento?:
      | {
          cuentaFinancieraId: string;
          categoriaId: number;
          cambio?: CambioPedido | null | undefined;
        }
      | undefined;
  },
  ahora: Date = new Date(),
  opciones: OpcionesDeCotizacion = {},
): Promise<DeudaConPagos | null> {
  const zona = await obtenerZonaHoraria(cliente, userId);
  const hoy = diaDeHoy(zona, ahora);

  const registrado = await cliente.db.transaction(async (tx) => {
    const [deuda] = await tx
      .select({
        montoCentavos: deudas.montoCentavos,
        fecha: deudas.fecha,
        sentido: deudas.sentido,
        concepto: deudas.concepto,
        moneda: deudas.moneda,
        contactoId: deudas.contactoId,
      })
      .from(deudas)
      .where(and(eq(deudas.id, deudaId), eq(deudas.userId, userId), isNull(deudas.eliminadoEn)))
      .for("update");
    if (!deuda) return false;

    const [suma] = await tx
      .select({
        pagado: sql<number>`coalesce(sum(${pagosDeDeudas.montoCentavos}), 0)`.mapWith(Number),
      })
      .from(pagosDeDeudas)
      .where(and(eq(pagosDeDeudas.deudaId, deudaId), isNull(pagosDeDeudas.eliminadoEn)));
    const pendiente = deuda.montoCentavos - (suma?.pagado ?? 0);

    if (datos.montoCentavos > pendiente) throw new PagoMayorAlPendiente(Math.max(0, pendiente));
    if (datos.fecha > hoy) throw new FechaEnElFuturo();
    if (datos.fecha < deuda.fecha) throw new PagoAnteriorALaDeuda();

    // El movimiento se crea con la misma transacción: si falla (sin período abierto, cuenta de
    // otra moneda...), el pago tampoco se registra.
    let movimientoId: string | null = null;
    if (datos.movimiento) {
      const clienteDeLaTransaccion: ClienteDb = {
        ...cliente,
        db: tx as unknown as ClienteDb["db"],
      };
      const hayContactoActivo =
        deuda.contactoId !== null &&
        (await contactoActivo(clienteDeLaTransaccion, userId, deuda.contactoId));
      const cuenta = await tx.query.cuentasFinancieras.findFirst({
        where: (tabla, { eq: eqCol, and: andCol }) =>
          andCol(
            eqCol(tabla.id, datos.movimiento?.cuentaFinancieraId ?? ""),
            eqCol(tabla.userId, userId),
          ),
        columns: { moneda: true },
      });
      if (!cuenta) throw new ReferenciaInvalida("cuentaFinancieraId");

      // Hoy, a la hora de ahora; un día pasado, al mediodía de ese día en la zona de la persona.
      const fechaDelMovimiento = datos.fecha === hoy ? ahora : instanteDelDia(datos.fecha, zona);

      // El movimiento va en la moneda de la cuenta: si no es la de la deuda, se convierte el importe
      // como en una transferencia (después el movimiento se pasa a la moneda base, como cualquiera).
      const cambiaDeMoneda = cuenta.moneda !== deuda.moneda;
      const importeEnLaCuenta = (
        await resolverCambio(
          clienteDeLaTransaccion,
          {
            importeCentavos: datos.montoCentavos,
            fecha: fechaDelMovimiento,
            cambio: datos.movimiento.cambio,
          },
          { origen: deuda.moneda, destino: cuenta.moneda },
          undefined,
          opciones,
        )
      ).importeConvertidoCentavos;
      // Al convertir, la descripción dice de cuánto era el pago, que si no se pierde.
      const aclaracion = cambiaDeMoneda
        ? ` (${formatearMonto(datos.montoCentavos, deuda.moneda)})`
        : "";

      const esCobro = deuda.sentido === "me_deben";
      const movimiento = await crearMovimiento(
        clienteDeLaTransaccion,
        userId,
        {
          tipo: esCobro ? "ingreso" : "gasto",
          importeCentavos: importeEnLaCuenta,
          descripcion: `${esCobro ? "Cobro" : "Pago"}: ${deuda.concepto}`
            .slice(0, 140 - aclaracion.length)
            .concat(aclaracion),
          categoriaId: datos.movimiento.categoriaId,
          cuentaFinancieraId: datos.movimiento.cuentaFinancieraId,
          // Un contacto en la papelera no se ofrece para movimientos nuevos.
          contactoId: hayContactoActivo ? deuda.contactoId : null,
          fecha: fechaDelMovimiento,
        },
        opciones,
      );
      movimientoId = movimiento.id;
    }

    await tx.insert(pagosDeDeudas).values({
      userId,
      deudaId,
      montoCentavos: datos.montoCentavos,
      fecha: datos.fecha,
      movimientoId,
    });
    return true;
  });

  return registrado ? await obtenerDeuda(cliente, userId, deudaId) : null;
}

/** Borrado lógico de un pago (para corregir un error). Devuelve la deuda actualizada, o null si no existe. */
export async function eliminarPago(
  cliente: ClienteDb,
  userId: string,
  deudaId: string,
  pagoId: string,
  ahora: Date = new Date(),
): Promise<DeudaConPagos | null> {
  const quitado = await cliente.db.transaction(async (tx) => {
    const filas = await tx
      .update(pagosDeDeudas)
      .set({ eliminadoEn: ahora })
      .where(
        and(
          eq(pagosDeDeudas.id, pagoId),
          eq(pagosDeDeudas.deudaId, deudaId),
          eq(pagosDeDeudas.userId, userId),
          isNull(pagosDeDeudas.eliminadoEn),
          sql`exists (select 1 from ${deudas} where ${deudas.id} = ${deudaId} and ${deudas.userId} = ${userId} and ${deudas.eliminadoEn} is null)`,
        ),
      )
      .returning({ id: pagosDeDeudas.id, movimientoId: pagosDeDeudas.movimientoId });
    const [pago] = filas;
    if (!pago) return false;

    // El ingreso o gasto que generó este pago se va con él: si no, las cuentas quedarían con plata
    // que ya no corresponde a ningún pago.
    if (pago.movimientoId !== null) {
      await tx
        .update(movimientos)
        .set({ eliminadoEn: ahora })
        .where(
          and(
            eq(movimientos.id, pago.movimientoId),
            eq(movimientos.userId, userId),
            isNull(movimientos.eliminadoEn),
          ),
        );
    }
    return true;
  });
  if (!quitado) return null;

  return await obtenerDeuda(cliente, userId, deudaId);
}

export type TotalPorMoneda = { moneda: string; centavos: number; deudas: number };

export type ResumenDeDeudas = {
  /** Lo que le deben a la persona, por moneda. */
  meDeben: TotalPorMoneda[];
  /** Lo que ella debe, por moneda. */
  debo: TotalPorMoneda[];
  /** Cuántos contactos distintos tienen una deuda pendiente (no cuenta las deudas con un nombre escrito a mano). */
  contactos: number;
};

/** Cuánto falta cobrar y pagar, sumando las deudas pendientes por moneda (nunca mezcla monedas). */
export async function resumenDeDeudas(
  cliente: ClienteDb,
  userId: string,
  filtros: { contactoId?: string | undefined } = {},
): Promise<ResumenDeDeudas> {
  const filas = await cliente.db
    .select({
      sentido: deudas.sentido,
      moneda: deudas.moneda,
      montoCentavos: deudas.montoCentavos,
      contactoId: deudas.contactoId,
      pagado: pagadoSql,
    })
    .from(deudas)
    .where(condicionesDe(userId, { estado: "pendientes", contactoId: filtros.contactoId }));

  const acumular = (sentido: SentidoDeDeuda): TotalPorMoneda[] => {
    const porMoneda = new Map<string, TotalPorMoneda>();
    for (const fila of filas) {
      if (fila.sentido !== sentido) continue;
      const total = porMoneda.get(fila.moneda) ?? { moneda: fila.moneda, centavos: 0, deudas: 0 };
      total.centavos += fila.montoCentavos - fila.pagado;
      total.deudas += 1;
      porMoneda.set(fila.moneda, total);
    }
    return [...porMoneda.values()].sort((a, b) => a.moneda.localeCompare(b.moneda));
  };

  return {
    meDeben: acumular("me_deben"),
    debo: acumular("debo"),
    // Solo cuentan los contactos: una deuda con un nombre escrito a mano no es de ningún contacto.
    contactos: new Set(filas.map((fila) => fila.contactoId).filter((id) => id !== null)).size,
  };
}

/** true si el contacto tiene alguna deuda pendiente: en ese caso no se puede eliminar. */
export async function tieneDeudasPendientes(
  cliente: ClienteDb,
  userId: string,
  contactoId: string,
): Promise<boolean> {
  const [fila] = await cliente.db
    .select({ total: count() })
    .from(deudas)
    .where(condicionesDe(userId, { contactoId, estado: "pendientes" }));
  return (fila?.total ?? 0) > 0;
}

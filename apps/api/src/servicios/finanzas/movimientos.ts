// Lógica de negocio de los movimientos: ingresos, gastos y transferencias entre
// cuentas (tipo "neutro": ni ingreso ni gasto, no cuenta en los totales).
//
// Una transferencia tiene cuenta de origen (`cuentaFinancieraId`) y de destino
// (`cuentaDestinoId`), y siempre usa la categoría especial de transferencias; esa
// categoría, a su vez, solo la pueden usar las transferencias.
//
// Igual que categorías y cuentas: toda consulta filtra por `userId`, que sale
// siempre de la sesión (CLAUDE.md, Principios de arquitectura). Un movimiento
// se borra lógicamente (`eliminadoEn`), como pide
// docs/guias/seguridad-y-datos.md para los datos de usuario.
//
// Cada movimiento tiene fecha y hora, y pertenece a un solo período: el que
// contiene esa fecha (ver periodos.ts). Se deduce al crear y al editar; una
// fecha que no cae en ningún período se rechaza.
//
// Monedas: el importe está en la moneda de la cuenta. Un ingreso o gasto se convierte
// a la moneda base de la persona, y una transferencia a la moneda de la cuenta de
// destino; el tipo de cambio y el importe convertido se guardan en el movimiento
// (ver esquema/finanzas.ts) y los totales suman el convertido. El tipo de cambio sale,
// a elección de la persona, de la cotización de la fecha, de una que ella escriba o
// de los dos importes (entregado y recibido). Ver `resolverCambio`.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  convertirCentavos,
  derivarTasa,
  esTasaValida,
  redondearTasa,
  SISTEMA_TRANSFERENCIA,
} from "@gestoria/shared";
import { and, count, eq, ilike, isNull, or } from "drizzle-orm";
import { type OpcionesDeCotizacion, obtenerTasa } from "./cotizaciones.ts";
import { obtenerMonedaBase } from "./moneda-base.ts";
import { obtenerPeriodoAbierto, obtenerPeriodoQueContiene } from "./periodos.ts";

export type Movimiento = {
  id: string;
  tipo: "ingreso" | "gasto" | "neutro";
  /** En la moneda de la cuenta (la de origen, en una transferencia). */
  importeCentavos: number;
  /** Cuántas unidades de la moneda a la que se convirtió vale 1 de la de la cuenta. */
  tipoDeCambio: number;
  /**
   * `importeCentavos` convertido: en un ingreso o gasto, a la moneda base de la persona
   * (lo que suman los totales); en una transferencia, lo que llega a la cuenta de destino.
   */
  importeConvertidoCentavos: number;
  /** La persona fijó la cotización (o el importe recibido) en vez de usar la de la fecha. */
  cambioManual: boolean;
  descripcion: string;
  fecha: Date;
  periodoId: number;
  creadoEn: Date;
  categoria: { id: number; nombre: string; color: string };
  /** La cuenta del movimiento; en una transferencia, la de origen. */
  cuentaFinanciera: { id: string; nombre: string; moneda: string };
  /** Solo en una transferencia: la cuenta a la que llega la plata. */
  cuentaDestino: { id: string; nombre: string; moneda: string } | null;
  /** Con quién fue (a quién se le pagó, de quién se cobró). `eliminado`: el contacto está en la papelera. */
  contacto: { id: string; nombre: string; apellido: string | null; eliminado: boolean } | null;
};

/**
 * Cómo fijar el tipo de cambio de un movimiento entre monedas distintas (ver
 * esquemaCambio en @gestoria/shared). Los importes, en centésimos.
 */
export type CambioPedido =
  | { modo: "automatico" }
  | { modo: "tasa"; tasa: number }
  | { modo: "importe"; importeConvertidoCentavos: number };

export type DatosNuevoMovimiento = {
  tipo: "ingreso" | "gasto" | "neutro";
  importeCentavos: number;
  descripcion: string;
  categoriaId: number;
  cuentaFinancieraId: string;
  /** Obligatoria en una transferencia ("neutro") y prohibida en el resto. */
  cuentaDestinoId?: string | null | undefined;
  /** Opcional y solo en ingresos y gastos: una transferencia entre cuentas propias no tiene contraparte. */
  contactoId?: string | null | undefined;
  fecha: Date;
  /**
   * Solo si cruza monedas. Sin esto, al crear se usa la cotización de la fecha y, al
   * editar, se conserva el cambio guardado (si las cuentas siguen siendo las mismas).
   */
  cambio?: CambioPedido | null | undefined;
};

/**
 * La fecha no cae en ningún período de la persona. `sinPeriodoAbierto` distingue
 * el caso más común (todavía no abrió uno, o cerró el último) de una fecha
 * puntual que quedó en un hueco o antes del primer período.
 */
export class FechaFueraDePeriodos extends Error {
  readonly sinPeriodoAbierto: boolean;

  constructor(sinPeriodoAbierto: boolean) {
    super(sinPeriodoAbierto ? "sin período abierto" : "fecha fuera de períodos");
    this.sinPeriodoAbierto = sinPeriodoAbierto;
  }
}

/** El tipo de cambio pedido no se puede aplicar; `explicacion` dice por qué, para la persona. */
export class CambioInvalido extends Error {
  readonly explicacion: string;

  constructor(explicacion: string) {
    super(explicacion);
    this.explicacion = explicacion;
  }
}

/** Hace falta una cotización y no hay forma de traerla: la persona tiene que escribirla. */
export class CotizacionNoDisponible extends Error {
  constructor() {
    super("cotización no disponible");
  }
}

/** Cuál de las referencias no es válida para este usuario (y, si hace falta, por qué). */
export class ReferenciaInvalida extends Error {
  readonly campo: "categoriaId" | "cuentaFinancieraId" | "cuentaDestinoId" | "contactoId";
  /** Explicación para la persona; sin ella la ruta usa un mensaje genérico del campo. */
  readonly explicacion: string | undefined;

  constructor(campo: ReferenciaInvalida["campo"], explicacion?: string) {
    super(campo);
    this.campo = campo;
    this.explicacion = explicacion;
  }
}

/**
 * Valida categoría y cuentas del movimiento.
 *
 * - Una cuenta oculta no se ofrece para movimientos nuevos. `actuales` son las
 *   cuentas que ya tiene el movimiento que se está editando: si siguen siendo
 *   esas, se aceptan aunque se hayan ocultado después.
 * - Una transferencia usa la categoría especial y lleva cuenta de destino
 *   distinta de la de origen; un ingreso o gasto no puede usar la especial.
 */
async function validarReferencias(
  cliente: ClienteDb,
  userId: string,
  datos: Pick<
    DatosNuevoMovimiento,
    "tipo" | "categoriaId" | "cuentaFinancieraId" | "cuentaDestinoId" | "contactoId"
  >,
  actuales: {
    cuentaFinancieraId?: string | undefined;
    cuentaDestinoId?: string | null | undefined;
    contactoId?: string | null | undefined;
  } = {},
): Promise<{ monedaDeOrigen: string; monedaDeDestino: string | null }> {
  const cuentaActiva = (id: string, aceptaOculta: boolean) =>
    cliente.db.query.cuentasFinancieras.findFirst({
      where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
        andCol(
          eqCol(tabla.id, id),
          eqCol(tabla.userId, userId),
          isNullCol(tabla.eliminadoEn),
          aceptaOculta ? undefined : isNullCol(tabla.ocultaEn),
        ),
      columns: { id: true, moneda: true },
    });

  const [categoria, origen, destino] = await Promise.all([
    cliente.db.query.categorias.findFirst({
      where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
        andCol(
          eqCol(tabla.id, datos.categoriaId),
          eqCol(tabla.userId, userId),
          isNullCol(tabla.eliminadoEn),
        ),
      columns: { id: true, sistema: true },
    }),
    cuentaActiva(
      datos.cuentaFinancieraId,
      actuales.cuentaFinancieraId === datos.cuentaFinancieraId,
    ),
    datos.cuentaDestinoId
      ? cuentaActiva(datos.cuentaDestinoId, actuales.cuentaDestinoId === datos.cuentaDestinoId)
      : Promise.resolve(undefined),
  ]);

  if (!categoria) throw new ReferenciaInvalida("categoriaId");
  if (!origen) throw new ReferenciaInvalida("cuentaFinancieraId");
  await validarContacto(cliente, userId, datos, actuales.contactoId);

  if (datos.tipo === "neutro") {
    if (categoria.sistema !== SISTEMA_TRANSFERENCIA) {
      throw new ReferenciaInvalida(
        "categoriaId",
        "Una transferencia entre cuentas siempre usa la categoría de transferencias.",
      );
    }
    if (!destino) throw new ReferenciaInvalida("cuentaDestinoId");
    if (datos.cuentaDestinoId === datos.cuentaFinancieraId) {
      throw new ReferenciaInvalida(
        "cuentaDestinoId",
        "La cuenta de destino tiene que ser distinta de la de origen.",
      );
    }
  } else if (categoria.sistema !== null) {
    throw new ReferenciaInvalida(
      "categoriaId",
      "Esa categoría es solo para transferencias entre cuentas.",
    );
  }

  return {
    monedaDeOrigen: origen.moneda,
    monedaDeDestino: datos.tipo === "neutro" && destino ? destino.moneda : null,
  };
}

/**
 * El contacto del movimiento tiene que ser de la persona y estar activo (uno en la papelera no se
 * ofrece para movimientos nuevos; si el movimiento que se edita ya lo tenía, se acepta). Una
 * transferencia entre cuentas propias no lleva contacto.
 */
async function validarContacto(
  cliente: ClienteDb,
  userId: string,
  datos: Pick<DatosNuevoMovimiento, "tipo" | "contactoId">,
  contactoActual: string | null | undefined,
): Promise<void> {
  if (!datos.contactoId) return;

  if (datos.tipo === "neutro") {
    throw new ReferenciaInvalida(
      "contactoId",
      "Una transferencia entre tus cuentas no lleva contacto.",
    );
  }

  const contacto = await cliente.db.query.contactos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(
        eqCol(tabla.id, datos.contactoId as string),
        eqCol(tabla.userId, userId),
        datos.contactoId === contactoActual ? undefined : isNullCol(tabla.eliminadoEn),
      ),
    columns: { id: true },
  });
  if (!contacto) throw new ReferenciaInvalida("contactoId");
}

type CambioResuelto = Pick<
  Movimiento,
  "tipoDeCambio" | "importeConvertidoCentavos" | "cambioManual"
>;

/** Convierte con la tasa, traduciendo los fallos de la conversión a algo que la persona entienda. */
function convertirONegar(importeCentavos: number, tasa: number): number {
  if (!esTasaValida(tasa)) throw new CambioInvalido("Esa cotización no es válida.");
  let convertido: number;
  try {
    convertido = convertirCentavos(importeCentavos, tasa);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new CambioInvalido("Con esa cotización el importe convertido es demasiado grande.");
    }
    throw error;
  }
  if (convertido <= 0) {
    throw new CambioInvalido(
      "Con esa cotización el importe convertido da menos de un centésimo. Revisala.",
    );
  }
  return convertido;
}

/**
 * Decide el tipo de cambio y el importe convertido de un movimiento.
 *
 * - Misma moneda de los dos lados: tasa 1 y nada que elegir (pedir un cambio acá es un error).
 * - Sin `cambio`: al editar, se conserva el que ya tenía (`previo`: lo guardado, si las cuentas
 *   no cambiaron: la cotización es parte de lo que se registró y no se actualiza sola); al
 *   crear, la cotización automática de la fecha.
 * - "automatico": la cotización de la fecha; sin ella (la fuente no responde), falla y
 *   la persona la escribe a mano.
 * - "tasa": la que escribió la persona. "importe": lo que recibió, y la tasa se deduce.
 */
export async function resolverCambio(
  cliente: ClienteDb,
  datos: {
    importeCentavos: number;
    fecha: Date;
    cambio?: CambioPedido | null | undefined;
  },
  monedas: { origen: string; destino: string },
  previo: (CambioResuelto & { importeCentavos: number }) | undefined,
  opciones: OpcionesDeCotizacion,
): Promise<CambioResuelto> {
  const { importeCentavos, cambio } = datos;

  if (monedas.origen === monedas.destino) {
    if (cambio && cambio.modo !== "automatico") {
      throw new CambioInvalido("Las dos monedas son la misma: no hay cotización que indicar.");
    }
    return { tipoDeCambio: 1, importeConvertidoCentavos: importeCentavos, cambioManual: false };
  }

  if (cambio?.modo === "tasa") {
    const tasa = redondearTasa(cambio.tasa);
    return {
      tipoDeCambio: tasa,
      importeConvertidoCentavos: convertirONegar(importeCentavos, tasa),
      cambioManual: true,
    };
  }

  if (cambio?.modo === "importe") {
    const convertido = cambio.importeConvertidoCentavos;
    if (!Number.isSafeInteger(convertido) || convertido <= 0) {
      throw new CambioInvalido("El importe recibido tiene que ser mayor que cero.");
    }
    const tasa = derivarTasa(importeCentavos, convertido);
    if (tasa === null) {
      throw new CambioInvalido(
        "Esos dos importes dan una cotización que no parece correcta. Revisalos.",
      );
    }
    return { tipoDeCambio: tasa, importeConvertidoCentavos: convertido, cambioManual: true };
  }

  if (!cambio && previo) {
    return {
      tipoDeCambio: previo.tipoDeCambio,
      importeConvertidoCentavos:
        importeCentavos === previo.importeCentavos
          ? previo.importeConvertidoCentavos
          : convertirONegar(importeCentavos, previo.tipoDeCambio),
      cambioManual: previo.cambioManual,
    };
  }

  const cotizacion = await obtenerTasa(
    cliente,
    monedas.origen,
    monedas.destino,
    datos.fecha,
    opciones,
  );
  if (!cotizacion) throw new CotizacionNoDisponible();
  return {
    tipoDeCambio: cotizacion.tasa,
    importeConvertidoCentavos: convertirONegar(importeCentavos, cotizacion.tasa),
    cambioManual: false,
  };
}

/** El período al que pertenece una fecha, o error si no cae en ninguno. */
async function periodoDe(cliente: ClienteDb, userId: string, fecha: Date): Promise<number> {
  const periodo = await obtenerPeriodoQueContiene(cliente, userId, fecha);
  if (periodo) return periodo.id;

  throw new FechaFueraDePeriodos((await obtenerPeriodoAbierto(cliente, userId)) === null);
}

function aMovimiento(fila: {
  id: string;
  tipo: string;
  importeCentavos: number;
  tipoDeCambio: number;
  importeConvertidoCentavos: number;
  cambioManual: boolean;
  descripcion: string;
  fecha: Date;
  periodoId: number;
  creadoEn: Date;
  categoria: { id: number; nombre: string; color: string } | null;
  cuentaFinanciera: { id: string; nombre: string; moneda: string } | null;
  cuentaDestino: { id: string; nombre: string; moneda: string } | null;
  contacto: {
    id: string;
    nombre: string;
    apellido: string | null;
    eliminadoEn: Date | null;
  } | null;
}): Movimiento {
  return {
    id: fila.id,
    tipo: fila.tipo as "ingreso" | "gasto" | "neutro",
    importeCentavos: fila.importeCentavos,
    tipoDeCambio: fila.tipoDeCambio,
    importeConvertidoCentavos: fila.importeConvertidoCentavos,
    cambioManual: fila.cambioManual,
    descripcion: fila.descripcion,
    fecha: fila.fecha,
    periodoId: fila.periodoId,
    creadoEn: fila.creadoEn,
    // No nulos en la práctica: la referencia se valida al crear/editar y la
    // categoría/cuenta solo se borra lógicamente, nunca desaparece de verdad.
    categoria: fila.categoria ?? { id: 0, nombre: "(sin categoría)", color: "#64748b" },
    cuentaFinanciera: fila.cuentaFinanciera ?? { id: "", nombre: "(sin cuenta)", moneda: "" },
    cuentaDestino: fila.cuentaDestino,
    contacto: fila.contacto
      ? {
          id: fila.contacto.id,
          nombre: fila.contacto.nombre,
          apellido: fila.contacto.apellido,
          eliminado: fila.contacto.eliminadoEn !== null,
        }
      : null,
  };
}

export type FiltrosMovimientos = {
  periodoId?: number | undefined;
  categoriaId?: number | undefined;
  /** Movimientos de la cuenta: los suyos y las transferencias que le llegan o le salen. */
  cuentaFinancieraId?: string | undefined;
  tipo?: "ingreso" | "gasto" | "neutro" | undefined;
  /** Los movimientos con este contacto. */
  contactoId?: string | undefined;
  busqueda?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

const LIMITE_MAXIMO_LISTADO = 100;

export async function listarMovimientos(
  cliente: ClienteDb,
  userId: string,
  filtros: FiltrosMovimientos = {},
): Promise<{ movimientos: Movimiento[]; total: number }> {
  const limit = Math.min(filtros.limit ?? 20, LIMITE_MAXIMO_LISTADO);
  const offset = filtros.offset ?? 0;
  const busqueda = filtros.busqueda?.trim();

  const condiciones = [
    eq(esquema.movimientos.userId, userId),
    isNull(esquema.movimientos.eliminadoEn),
    filtros.periodoId !== undefined
      ? eq(esquema.movimientos.periodoId, filtros.periodoId)
      : undefined,
    filtros.categoriaId !== undefined
      ? eq(esquema.movimientos.categoriaId, filtros.categoriaId)
      : undefined,
    filtros.cuentaFinancieraId
      ? or(
          eq(esquema.movimientos.cuentaFinancieraId, filtros.cuentaFinancieraId),
          eq(esquema.movimientos.cuentaDestinoId, filtros.cuentaFinancieraId),
        )
      : undefined,
    filtros.tipo ? eq(esquema.movimientos.tipo, filtros.tipo) : undefined,
    filtros.contactoId ? eq(esquema.movimientos.contactoId, filtros.contactoId) : undefined,
    busqueda ? ilike(esquema.movimientos.descripcion, `%${busqueda}%`) : undefined,
  ].filter((condicion) => condicion !== undefined);
  const donde = and(...condiciones);

  const [filas, [totalFila]] = await Promise.all([
    cliente.db.query.movimientos.findMany({
      where: () => donde,
      with: {
        categoria: { columns: { id: true, nombre: true, color: true } },
        cuentaFinanciera: { columns: { id: true, nombre: true, moneda: true } },
        cuentaDestino: { columns: { id: true, nombre: true, moneda: true } },
        contacto: { columns: { id: true, nombre: true, apellido: true, eliminadoEn: true } },
      },
      // Más reciente primero; `creadoEn` desempata cuando dos movimientos
      // comparten fecha, para que el orden no salte entre pedidos.
      orderBy: (tabla, { desc: descCol }) => [descCol(tabla.fecha), descCol(tabla.creadoEn)],
      limit,
      offset,
    }),
    cliente.db.select({ total: count() }).from(esquema.movimientos).where(donde),
  ]);

  return { movimientos: filas.map(aMovimiento), total: totalFila?.total ?? 0 };
}

/**
 * Las monedas entre las que se convierte: la de la cuenta y, según el tipo, la base de la
 * persona (ingreso o gasto) o la de la cuenta de destino (transferencia).
 */
async function monedasDelMovimiento(
  cliente: ClienteDb,
  userId: string,
  referencias: { monedaDeOrigen: string; monedaDeDestino: string | null },
): Promise<{ origen: string; destino: string }> {
  return {
    origen: referencias.monedaDeOrigen,
    destino: referencias.monedaDeDestino ?? (await obtenerMonedaBase(cliente, userId)),
  };
}

export async function crearMovimiento(
  cliente: ClienteDb,
  userId: string,
  datos: DatosNuevoMovimiento,
  opciones: OpcionesDeCotizacion = {},
): Promise<Movimiento> {
  const referencias = await validarReferencias(cliente, userId, datos);
  const periodoId = await periodoDe(cliente, userId, datos.fecha);
  const monedas = await monedasDelMovimiento(cliente, userId, referencias);
  const cambio = await resolverCambio(cliente, datos, monedas, undefined, opciones);

  const [fila] = await cliente.db
    .insert(esquema.movimientos)
    .values({ userId, ...valoresDe(datos, cambio), periodoId })
    .returning({ id: esquema.movimientos.id });

  if (!fila) throw new Error("No se pudo crear el movimiento.");
  return await obtenerMovimiento(cliente, userId, fila.id);
}

/** Lo que se guarda: solo una transferencia lleva cuenta de destino, y siempre el cambio resuelto. */
function valoresDe(datos: DatosNuevoMovimiento, cambio: CambioResuelto) {
  const { cuentaDestinoId, contactoId, cambio: _pedido, ...resto } = datos;
  return {
    ...resto,
    cuentaDestinoId: datos.tipo === "neutro" ? (cuentaDestinoId ?? null) : null,
    contactoId: datos.tipo === "neutro" ? null : (contactoId ?? null),
    ...cambio,
  };
}

async function obtenerMovimiento(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<Movimiento> {
  const fila = await cliente.db.query.movimientos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol }) =>
      andCol(eqCol(tabla.id, id), eqCol(tabla.userId, userId)),
    with: {
      categoria: { columns: { id: true, nombre: true, color: true } },
      cuentaFinanciera: { columns: { id: true, nombre: true, moneda: true } },
      cuentaDestino: { columns: { id: true, nombre: true, moneda: true } },
      contacto: { columns: { id: true, nombre: true, apellido: true, eliminadoEn: true } },
    },
  });
  if (!fila) throw new Error(`Movimiento ${id} no encontrado tras crearlo/editarlo.`);
  return aMovimiento(fila);
}

export async function editarMovimiento(
  cliente: ClienteDb,
  userId: string,
  id: string,
  datos: DatosNuevoMovimiento,
  opciones: OpcionesDeCotizacion = {},
): Promise<Movimiento | null> {
  const actual = await cliente.db.query.movimientos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(eqCol(tabla.id, id), eqCol(tabla.userId, userId), isNullCol(tabla.eliminadoEn)),
    columns: {
      cuentaFinancieraId: true,
      cuentaDestinoId: true,
      contactoId: true,
      importeCentavos: true,
      tipoDeCambio: true,
      importeConvertidoCentavos: true,
      cambioManual: true,
    },
  });
  if (!actual) return null;

  const referencias = await validarReferencias(cliente, userId, datos, actual);
  const periodoId = await periodoDe(cliente, userId, datos.fecha);
  const monedas = await monedasDelMovimiento(cliente, userId, referencias);
  // Con las mismas cuentas, las monedas son las mismas (no cambian): el cambio guardado se puede conservar.
  const mismasCuentas =
    actual.cuentaFinancieraId === datos.cuentaFinancieraId &&
    actual.cuentaDestinoId === (datos.tipo === "neutro" ? (datos.cuentaDestinoId ?? null) : null);
  const cambio = await resolverCambio(
    cliente,
    datos,
    monedas,
    mismasCuentas ? actual : undefined,
    opciones,
  );

  const [fila] = await cliente.db
    .update(esquema.movimientos)
    .set({ ...valoresDe(datos, cambio), periodoId })
    .where(
      and(
        eq(esquema.movimientos.id, id),
        eq(esquema.movimientos.userId, userId),
        isNull(esquema.movimientos.eliminadoEn),
      ),
    )
    .returning({ id: esquema.movimientos.id });

  return fila ? await obtenerMovimiento(cliente, userId, fila.id) : null;
}

export async function eliminarMovimiento(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<boolean> {
  const [fila] = await cliente.db
    .update(esquema.movimientos)
    .set({ eliminadoEn: new Date() })
    .where(
      and(
        eq(esquema.movimientos.id, id),
        eq(esquema.movimientos.userId, userId),
        isNull(esquema.movimientos.eliminadoEn),
      ),
    )
    .returning({ id: esquema.movimientos.id });

  return fila !== undefined;
}

/**
 * Crea una copia de un movimiento existente, con la fecha y hora de ahora:
 * duplicar sirve para repetir algo rápido ("el mismo café de siempre"), no
 * para reescribir el pasado. Cae en el período abierto; si no hay uno, falla
 * como cualquier movimiento sin período.
 */
export async function duplicarMovimiento(
  cliente: ClienteDb,
  userId: string,
  id: string,
  opciones: OpcionesDeCotizacion = {},
): Promise<Movimiento | null> {
  const original = await cliente.db.query.movimientos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(eqCol(tabla.id, id), eqCol(tabla.userId, userId), isNullCol(tabla.eliminadoEn)),
  });
  if (!original) return null;

  // Si el contacto de la copia ya está en la papelera, la copia no lo lleva (no se ofrece para movimientos nuevos).
  const contacto = original.contactoId
    ? await cliente.db.query.contactos.findFirst({
        where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
          andCol(
            eqCol(tabla.id, original.contactoId as string),
            eqCol(tabla.userId, userId),
            isNullCol(tabla.eliminadoEn),
          ),
        columns: { id: true },
      })
    : undefined;

  return crearMovimiento(
    cliente,
    userId,
    {
      tipo: original.tipo as "ingreso" | "gasto" | "neutro",
      importeCentavos: original.importeCentavos,
      descripcion: original.descripcion,
      categoriaId: original.categoriaId,
      cuentaFinancieraId: original.cuentaFinancieraId,
      cuentaDestinoId: original.cuentaDestinoId,
      contactoId: contacto?.id ?? null,
      fecha: new Date(),
      // Una cotización que la persona fijó (la de su banco) se repite; la automática se actualiza a la de hoy.
      cambio: original.cambioManual ? { modo: "tasa", tasa: original.tipoDeCambio } : undefined,
    },
    opciones,
  );
}

export { LIMITE_MAXIMO_LISTADO };

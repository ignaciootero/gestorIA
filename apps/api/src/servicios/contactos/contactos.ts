// Lógica de negocio de los contactos: personas y empresas/servicios.
//
// Cada persona tiene los suyos; toda consulta filtra por `userId`, que sale siempre
// de la sesión, sin excepción para el admin (CLAUDE.md, Privacidad).
//
// - Borrado lógico (`eliminadoEn`): un contacto eliminado desaparece de todo y un job
//   lo borra en definitivo pasado un plazo (ver servicios/contactos/limpieza.ts).
// - Los textos opcionales llegan como cadena vacía desde un formulario en blanco y se
//   guardan como "sin dato" (null).
// - El tipo (persona o empresa) no cambia una vez creado.
// - Teléfonos, correos y etiquetas se reemplazan enteros al editar, en una transacción.
// - Al dar de alta una persona con fecha de nacimiento se puede pedir (`recordarCumpleanos`)
//   que se cree también su recordatorio de cumpleaños, en la misma transacción.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  type DatosDeContacto,
  diaDeHoy,
  TITULO_DEL_CUMPLEANOS,
  type TipoDeContacto,
  type TipoDeTelefono,
} from "@gestoria/shared";
import { and, count, desc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { tieneDeudasPendientes } from "../finanzas/deudas.ts";
import { obtenerZonaHoraria } from "../finanzas/periodos.ts";
import { patronDeBusqueda } from "./busqueda.ts";
import { type Recordatorio, recordatoriosDeContacto } from "./recordatorios.ts";

export type TelefonoDeContacto = { id: string; numero: string; tipo: TipoDeTelefono };
export type EtiquetaDeUnContacto = { id: number; nombre: string; color: string };

/** Lo que muestra el listado de contactos. */
export type ResumenDeContacto = {
  id: string;
  tipo: TipoDeContacto;
  nombre: string;
  apellido: string | null;
  /** Solo empresas. */
  rubro: string | null;
  favorito: boolean;
  telefonos: TelefonoDeContacto[];
  correos: string[];
  etiquetas: EtiquetaDeUnContacto[];
};

/** Todo lo de un contacto, con sus recordatorios próximos. */
export type Contacto = ResumenDeContacto & {
  fechaNacimiento: string | null;
  sitioWeb: string | null;
  horario: string | null;
  documento: string | null;
  personaDeContacto: string | null;
  direccion: string | null;
  notas: string | null;
  recordatorios: Recordatorio[];
  creadoEn: Date;
  actualizadoEn: Date;
};

export type FiltrosDeContactos = {
  tipo?: TipoDeContacto | undefined;
  favoritos?: boolean | undefined;
  etiquetaId?: number | undefined;
  busqueda?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

/** Alguna de las etiquetas elegidas no existe o es de otra persona. */
export class EtiquetaInvalida extends Error {}
/** La fecha de nacimiento es posterior a hoy. */
export class NacimientoEnElFuturo extends Error {}
/** Se quiso convertir una persona en empresa o al revés. */
export class TipoDeContactoDistinto extends Error {}
/** El contacto tiene deudas pendientes: no se elimina hasta saldarlas o eliminarlas. */
export class ContactoConDeudas extends Error {}

const LIMITE_POR_DEFECTO = 50;

function sinDato(texto: string | undefined): string | null {
  const limpio = texto?.trim();
  return limpio ? limpio : null;
}

function condicionesDeListado(userId: string, filtros: FiltrosDeContactos): SQL | undefined {
  const { contactos } = esquema;
  const condiciones: (SQL | undefined)[] = [
    eq(contactos.userId, userId),
    isNull(contactos.eliminadoEn),
  ];

  if (filtros.tipo) condiciones.push(eq(contactos.tipo, filtros.tipo));
  if (filtros.favoritos) condiciones.push(eq(contactos.favorito, true));

  if (filtros.etiquetaId !== undefined) {
    condiciones.push(
      sql`exists (select 1 from ${esquema.etiquetasPorContacto} where ${esquema.etiquetasPorContacto.contactoId} = ${contactos.id} and ${esquema.etiquetasPorContacto.etiquetaId} = ${filtros.etiquetaId})`,
    );
  }

  const busqueda = filtros.busqueda?.trim();
  if (busqueda) {
    const patron = patronDeBusqueda(busqueda);
    const digitos = busqueda.replace(/\D/g, "");
    const enCampos = [
      sql`${contactos.nombre} ilike ${patron}`,
      sql`${contactos.apellido} ilike ${patron}`,
      sql`concat_ws(' ', ${contactos.nombre}, ${contactos.apellido}) ilike ${patron}`,
      sql`${contactos.rubro} ilike ${patron}`,
      sql`${contactos.personaDeContacto} ilike ${patron}`,
      sql`exists (select 1 from ${esquema.correosDeContactos} where ${esquema.correosDeContactos.contactoId} = ${contactos.id} and ${esquema.correosDeContactos.direccion} ilike ${patron})`,
    ];
    // Un número se busca por sus cifras, sin importar cómo se haya escrito ("099 123" encuentra "099123456").
    if (digitos.length >= 3) {
      enCampos.push(
        sql`exists (select 1 from ${esquema.telefonosDeContactos} where ${esquema.telefonosDeContactos.contactoId} = ${contactos.id} and regexp_replace(${esquema.telefonosDeContactos.numero}, '\\D', '', 'g') like ${`%${digitos}%`})`,
      );
    }
    condiciones.push(or(...enCampos));
  }

  return and(...condiciones);
}

/** Teléfonos, correos y etiquetas de varios contactos con tres consultas, no una por contacto. */
async function cargarDetalles(cliente: ClienteDb, ids: string[]) {
  if (ids.length === 0) {
    return {
      telefonos: new Map<string, TelefonoDeContacto[]>(),
      correos: new Map<string, string[]>(),
      etiquetas: new Map<string, EtiquetaDeUnContacto[]>(),
    };
  }

  const [telefonos, correos, etiquetas] = await Promise.all([
    cliente.db
      .select()
      .from(esquema.telefonosDeContactos)
      .where(inArray(esquema.telefonosDeContactos.contactoId, ids))
      .orderBy(esquema.telefonosDeContactos.orden),
    cliente.db
      .select()
      .from(esquema.correosDeContactos)
      .where(inArray(esquema.correosDeContactos.contactoId, ids))
      .orderBy(esquema.correosDeContactos.orden),
    cliente.db
      .select({
        contactoId: esquema.etiquetasPorContacto.contactoId,
        id: esquema.etiquetasDeContactos.id,
        nombre: esquema.etiquetasDeContactos.nombre,
        color: esquema.etiquetasDeContactos.color,
      })
      .from(esquema.etiquetasPorContacto)
      .innerJoin(
        esquema.etiquetasDeContactos,
        eq(esquema.etiquetasDeContactos.id, esquema.etiquetasPorContacto.etiquetaId),
      )
      .where(inArray(esquema.etiquetasPorContacto.contactoId, ids))
      .orderBy(sql`lower(${esquema.etiquetasDeContactos.nombre})`),
  ]);

  const agrupar = <T, V>(filas: T[], clave: (fila: T) => string, valor: (fila: T) => V) => {
    const mapa = new Map<string, V[]>();
    for (const fila of filas) {
      const lista = mapa.get(clave(fila)) ?? [];
      lista.push(valor(fila));
      mapa.set(clave(fila), lista);
    }
    return mapa;
  };

  return {
    telefonos: agrupar(
      telefonos,
      (fila) => fila.contactoId,
      (fila) => ({ id: fila.id, numero: fila.numero, tipo: fila.tipo as TipoDeTelefono }),
    ),
    correos: agrupar(
      correos,
      (fila) => fila.contactoId,
      (fila) => fila.direccion,
    ),
    etiquetas: agrupar(
      etiquetas,
      (fila) => fila.contactoId,
      (fila) => ({ id: fila.id, nombre: fila.nombre, color: fila.color }),
    ),
  };
}

type FilaDeContacto = typeof esquema.contactos.$inferSelect;

function aResumen(
  fila: FilaDeContacto,
  detalles: Awaited<ReturnType<typeof cargarDetalles>>,
): ResumenDeContacto {
  return {
    id: fila.id,
    tipo: fila.tipo as TipoDeContacto,
    nombre: fila.nombre,
    apellido: fila.apellido,
    rubro: fila.rubro,
    favorito: fila.favorito,
    telefonos: detalles.telefonos.get(fila.id) ?? [],
    correos: detalles.correos.get(fila.id) ?? [],
    etiquetas: detalles.etiquetas.get(fila.id) ?? [],
  };
}

/**
 * Los contactos de la persona, favoritos primero y después por nombre, con
 * paginación. `total` cuenta todos los que cumplen los filtros, no solo la página.
 */
export async function listarContactos(
  cliente: ClienteDb,
  userId: string,
  filtros: FiltrosDeContactos = {},
): Promise<{ contactos: ResumenDeContacto[]; total: number }> {
  const donde = condicionesDeListado(userId, filtros);
  const { contactos } = esquema;

  const [filas, [fila]] = await Promise.all([
    cliente.db
      .select()
      .from(contactos)
      .where(donde)
      .orderBy(
        desc(contactos.favorito),
        sql`lower(${contactos.nombre})`,
        sql`lower(coalesce(${contactos.apellido}, ''))`,
        contactos.id,
      )
      .limit(filtros.limit ?? LIMITE_POR_DEFECTO)
      .offset(filtros.offset ?? 0),
    cliente.db.select({ total: count() }).from(contactos).where(donde),
  ]);

  const detalles = await cargarDetalles(
    cliente,
    filas.map((contacto) => contacto.id),
  );
  return {
    contactos: filas.map((contacto) => aResumen(contacto, detalles)),
    total: fila?.total ?? 0,
  };
}

/** Un contacto de la persona, o null si no existe, es de otra persona o está eliminado. */
export async function obtenerContacto(
  cliente: ClienteDb,
  userId: string,
  id: string,
  ahora: Date = new Date(),
): Promise<Contacto | null> {
  const [fila] = await cliente.db
    .select()
    .from(esquema.contactos)
    .where(
      and(
        eq(esquema.contactos.id, id),
        eq(esquema.contactos.userId, userId),
        isNull(esquema.contactos.eliminadoEn),
      ),
    );
  if (!fila) return null;

  const [detalles, recordatorios] = await Promise.all([
    cargarDetalles(cliente, [fila.id]),
    recordatoriosDeContacto(cliente, userId, fila.id, ahora),
  ]);

  return {
    ...aResumen(fila, detalles),
    fechaNacimiento: fila.fechaNacimiento,
    sitioWeb: fila.sitioWeb,
    horario: fila.horario,
    documento: fila.documento,
    personaDeContacto: fila.personaDeContacto,
    direccion: fila.direccion,
    notas: fila.notas,
    recordatorios,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}

/** Las columnas del contacto según su tipo; lo que no corresponde queda en null. */
function columnasDe(datos: DatosDeContacto) {
  const comunes = {
    nombre: datos.nombre,
    direccion: sinDato(datos.direccion),
    notas: sinDato(datos.notas),
    favorito: datos.favorito,
  };

  if (datos.tipo === "persona") {
    return {
      ...comunes,
      apellido: sinDato(datos.apellido),
      fechaNacimiento: sinDato(datos.fechaNacimiento),
      rubro: null,
      sitioWeb: null,
      horario: null,
      documento: null,
      personaDeContacto: null,
    };
  }
  return {
    ...comunes,
    apellido: null,
    fechaNacimiento: null,
    rubro: sinDato(datos.rubro),
    sitioWeb: sinDato(datos.sitioWeb),
    horario: sinDato(datos.horario),
    documento: sinDato(datos.documento),
    personaDeContacto: sinDato(datos.personaDeContacto),
  };
}

/** Que cada etiqueta exista y sea de la persona: nunca se vincula una ajena. */
async function validarEtiquetas(
  tx: Pick<ClienteDb["db"], "select">,
  userId: string,
  etiquetaIds: number[],
): Promise<number[]> {
  const unicas = [...new Set(etiquetaIds)];
  if (unicas.length === 0) return [];

  const propias = await tx
    .select({ id: esquema.etiquetasDeContactos.id })
    .from(esquema.etiquetasDeContactos)
    .where(
      and(
        eq(esquema.etiquetasDeContactos.userId, userId),
        inArray(esquema.etiquetasDeContactos.id, unicas),
      ),
    );
  if (propias.length !== unicas.length) throw new EtiquetaInvalida();
  return unicas;
}

/** Reemplaza teléfonos, correos y etiquetas del contacto por los que vienen. */
async function guardarDetalles(
  tx: Parameters<Parameters<ClienteDb["db"]["transaction"]>[0]>[0],
  userId: string,
  contactoId: string,
  datos: DatosDeContacto,
): Promise<void> {
  const etiquetaIds = await validarEtiquetas(tx, userId, datos.etiquetaIds);

  await tx
    .delete(esquema.telefonosDeContactos)
    .where(eq(esquema.telefonosDeContactos.contactoId, contactoId));
  await tx
    .delete(esquema.correosDeContactos)
    .where(eq(esquema.correosDeContactos.contactoId, contactoId));
  await tx
    .delete(esquema.etiquetasPorContacto)
    .where(eq(esquema.etiquetasPorContacto.contactoId, contactoId));

  if (datos.telefonos.length > 0) {
    await tx.insert(esquema.telefonosDeContactos).values(
      datos.telefonos.map((telefono, orden) => ({
        contactoId,
        numero: telefono.numero,
        tipo: telefono.tipo,
        orden,
      })),
    );
  }

  // El mismo correo dos veces no aporta nada: se queda con la primera aparición.
  const correos = [...new Set(datos.correos)];
  if (correos.length > 0) {
    await tx
      .insert(esquema.correosDeContactos)
      .values(correos.map((direccion, orden) => ({ contactoId, direccion, orden })));
  }

  if (etiquetaIds.length > 0) {
    await tx
      .insert(esquema.etiquetasPorContacto)
      .values(etiquetaIds.map((etiquetaId) => ({ contactoId, etiquetaId })));
  }
}

async function validarNacimiento(
  cliente: ClienteDb,
  userId: string,
  datos: DatosDeContacto,
  ahora: Date,
): Promise<void> {
  if (datos.tipo !== "persona" || !datos.fechaNacimiento) return;
  const hoy = diaDeHoy(await obtenerZonaHoraria(cliente, userId), ahora);
  if (datos.fechaNacimiento > hoy) throw new NacimientoEnElFuturo();
}

export async function crearContacto(
  cliente: ClienteDb,
  userId: string,
  datos: DatosDeContacto,
  ahora: Date = new Date(),
): Promise<Contacto> {
  await validarNacimiento(cliente, userId, datos, ahora);

  const id = await cliente.db.transaction(async (tx) => {
    const [fila] = await tx
      .insert(esquema.contactos)
      .values({ userId, tipo: datos.tipo, ...columnasDe(datos) })
      .returning({ id: esquema.contactos.id });
    if (!fila) throw new Error("No se pudo crear el contacto.");
    await guardarDetalles(tx, userId, fila.id, datos);

    // El cumpleaños, si se pidió: anual, el día y el mes de la fecha de nacimiento (es "AAAA-MM-DD").
    if (datos.tipo === "persona" && datos.recordarCumpleanos && datos.fechaNacimiento) {
      await tx.insert(esquema.recordatoriosDeContactos).values({
        userId,
        contactoId: fila.id,
        titulo: TITULO_DEL_CUMPLEANOS,
        repeticion: "anual",
        diaDelMes: Number(datos.fechaNacimiento.slice(8, 10)),
        mes: Number(datos.fechaNacimiento.slice(5, 7)),
      });
    }
    return fila.id;
  });

  const contacto = await obtenerContacto(cliente, userId, id, ahora);
  if (!contacto) throw new Error("No se encontró el contacto recién creado.");
  return contacto;
}

/**
 * Reemplaza los datos del contacto por los que vienen (el formulario manda todo).
 * Devuelve null si no existe, es de otra persona o está eliminado.
 */
export async function editarContacto(
  cliente: ClienteDb,
  userId: string,
  id: string,
  datos: DatosDeContacto,
  ahora: Date = new Date(),
): Promise<Contacto | null> {
  const actual = await cliente.db.query.contactos.findFirst({
    where: () =>
      and(
        eq(esquema.contactos.id, id),
        eq(esquema.contactos.userId, userId),
        isNull(esquema.contactos.eliminadoEn),
      ),
    columns: { tipo: true },
  });
  if (!actual) return null;
  if (actual.tipo !== datos.tipo) throw new TipoDeContactoDistinto();

  await validarNacimiento(cliente, userId, datos, ahora);

  await cliente.db.transaction(async (tx) => {
    await tx
      .update(esquema.contactos)
      .set({ ...columnasDe(datos), actualizadoEn: ahora })
      .where(and(eq(esquema.contactos.id, id), eq(esquema.contactos.userId, userId)));
    await guardarDetalles(tx, userId, id, datos);
  });

  return await obtenerContacto(cliente, userId, id, ahora);
}

/** Marca o desmarca como favorito. Devuelve false si no existe o es de otra persona. */
export async function marcarFavorito(
  cliente: ClienteDb,
  userId: string,
  id: string,
  favorito: boolean,
): Promise<boolean> {
  const filas = await cliente.db
    .update(esquema.contactos)
    .set({ favorito })
    .where(
      and(
        eq(esquema.contactos.id, id),
        eq(esquema.contactos.userId, userId),
        isNull(esquema.contactos.eliminadoEn),
      ),
    )
    .returning({ id: esquema.contactos.id });
  return filas.length > 0;
}

/**
 * Borrado lógico. Devuelve false si no existe, es de otra persona o ya estaba eliminado. Un
 * contacto con deudas pendientes no se elimina: la deuda quedaría apuntando a alguien que ya no
 * se ve (`ContactoConDeudas`).
 */
export async function eliminarContacto(
  cliente: ClienteDb,
  userId: string,
  id: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  if (await tieneDeudasPendientes(cliente, userId, id)) throw new ContactoConDeudas();

  const filas = await cliente.db
    .update(esquema.contactos)
    .set({ eliminadoEn: ahora })
    .where(
      and(
        eq(esquema.contactos.id, id),
        eq(esquema.contactos.userId, userId),
        isNull(esquema.contactos.eliminadoEn),
      ),
    )
    .returning({ id: esquema.contactos.id });
  return filas.length > 0;
}

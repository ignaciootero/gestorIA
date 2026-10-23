// Lógica de negocio de los recordatorios de un contacto ("Cumpleaños", "Pagar el
// servicio"...).
//
// Cada uno tiene una repetición (una sola vez, o cada día, semana, mes o año) y, según
// ella, lo que corresponde: una sola vez, el día; diaria, la hora; semanal, el día de la
// semana; mensual, el día del mes; anual, el día y el mes. La hora es opcional salvo en la
// diaria. Es un aviso dentro de la aplicación: se muestra en la ficha del contacto, en
// la lista de recordatorios y en los widgets, pero no manda correos ni
// notificaciones (eso queda para el módulo de notificaciones, que los va a reutilizar).
//
// "Hoy" es el de la zona horaria de la persona. De un recordatorio se guarda cuándo cae
// (el día de la semana, del mes...), no la próxima fecha: esa se calcula al leer
// (`proximaOcurrencia`, en @gestoria/shared), así no hay nada que mantener al día. La hora
// es de reloj de la persona, sin zona.
//
// Uno de una sola vez que ya pasó pasa al histórico ("Pasados" en la pestaña Recordatorios)
// y deja de ser un recordatorio vigente. Es el único que puede estar pasado; los que se repiten siempre tienen una
// próxima vez. Un pasado ya no aparece en la ficha, en los widgets ni cuenta para el máximo por
// contacto. Lo que ocurrió vive en el histórico (servicios/contactos/historial-de-recordatorios.ts),
// que guarda cada vez que un recordatorio cayó, también en los que se repiten.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  type DatosDeRecordatorio,
  diaDeHoy,
  diasEntre,
  MAXIMO_DE_RECORDATORIOS_POR_CONTACTO,
  proximaOcurrencia,
  type Repeticion,
  recortarHora,
  sumarDias,
  type TipoDeContacto,
} from "@gestoria/shared";
import { and, count, eq, isNull, not, or, type SQL, sql } from "drizzle-orm";
import { obtenerZonaHoraria } from "../finanzas/periodos.ts";
import { patronDeBusqueda } from "./busqueda.ts";
import type { EtiquetaDeUnContacto } from "./contactos.ts";
import { etiquetasDeLosContactos } from "./etiquetas.ts";

export type Recordatorio = {
  id: string;
  contactoId: string;
  titulo: string;
  repeticion: Repeticion;
  /** Cuándo cae, según la repetición; lo que ella no usa va en nulo. */
  fecha: string | null;
  diaSemana: number | null;
  diaDelMes: number | null;
  mes: number | null;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  /** Lleva un distintivo; no cambia el orden de las listas. */
  importante: boolean;
  /** La próxima vez que cae, desde hoy inclusive. */
  proximaFecha: string;
  /** Cuántos días faltan: 0 es hoy. */
  diasRestantes: number;
};

/**
 * Un recordatorio de la lista general, con el contacto al que pertenece. Lleva sus etiquetas
 * para que la lista pinte el avatar con el mismo color que en el listado de contactos.
 */
export type RecordatorioConContacto = Recordatorio & {
  contacto: {
    id: string;
    tipo: TipoDeContacto;
    nombre: string;
    apellido: string | null;
    etiquetas: EtiquetaDeUnContacto[];
  };
};

/** Se quiso poner un recordatorio de una sola vez en un día que ya pasó. */
export class RecordatorioEnElPasado extends Error {}
/** El contacto ya tiene el máximo de recordatorios. */
export class LimiteDeRecordatorios extends Error {}

type FilaDeRecordatorio = typeof esquema.recordatoriosDeContactos.$inferSelect;

/** El día de hoy para la persona. */
export async function hoyDeLaPersona(
  cliente: ClienteDb,
  userId: string,
  ahora: Date,
): Promise<string> {
  return diaDeHoy(await obtenerZonaHoraria(cliente, userId), ahora);
}

/** Devuelve null si ya no tiene próxima vez: uno de una sola vez cuyo día pasó (ahora vive en el histórico). */
function aRecordatorio(fila: FilaDeRecordatorio, hoy: string): Recordatorio | null {
  const repeticion = fila.repeticion as Repeticion;
  const proximaFecha = proximaOcurrencia(
    {
      repeticion,
      fecha: fila.fecha,
      diaSemana: fila.diaSemana,
      diaDelMes: fila.diaDelMes,
      mes: fila.mes,
    },
    hoy,
  );
  if (proximaFecha === null) return null;
  return {
    id: fila.id,
    contactoId: fila.contactoId,
    titulo: fila.titulo,
    repeticion,
    fecha: fila.fecha,
    diaSemana: fila.diaSemana,
    diaDelMes: fila.diaDelMes,
    mes: fila.mes,
    hora: recortarHora(fila.hora),
    importante: fila.importante,
    proximaFecha,
    diasRestantes: diasEntre(hoy, proximaFecha),
  };
}

/** Primero el que cae antes; el mismo día, el de todo el día y después por hora, y por título. */
function porProximaFecha(a: Recordatorio, b: Recordatorio): number {
  return (
    a.proximaFecha.localeCompare(b.proximaFecha) ||
    (a.hora ?? "").localeCompare(b.hora ?? "") ||
    a.titulo.localeCompare(b.titulo, "es")
  );
}

/** Uno de una sola vez cuyo día ya pasó, como condición SQL (los que se repiten nunca lo están). */
export function estaPasado(hoy: string): SQL {
  return sql`(${esquema.recordatoriosDeContactos.repeticion} = 'unica' and ${esquema.recordatoriosDeContactos.fecha} < ${hoy})`;
}

/** Los recordatorios vigentes de un contacto (sin los pasados), el que cae antes primero. */
export async function recordatoriosDeContacto(
  cliente: ClienteDb,
  userId: string,
  contactoId: string,
  ahora: Date,
): Promise<Recordatorio[]> {
  const [hoy, filas] = await Promise.all([
    hoyDeLaPersona(cliente, userId, ahora),
    cliente.db
      .select()
      .from(esquema.recordatoriosDeContactos)
      .where(
        and(
          eq(esquema.recordatoriosDeContactos.userId, userId),
          eq(esquema.recordatoriosDeContactos.contactoId, contactoId),
          isNull(esquema.recordatoriosDeContactos.eliminadoEn),
        ),
      ),
  ]);

  return filas
    .map((fila) => aRecordatorio(fila, hoy))
    .filter((recordatorio): recordatorio is Recordatorio => recordatorio !== null)
    .sort(porProximaFecha);
}

/**
 * Los recordatorios vigentes de la persona (de contactos no eliminados), el que cae antes primero.
 * Con `dias`, solo los que caen dentro de esa cantidad de días a partir de hoy. Los filtros
 * `busqueda` (en el título y en el nombre del contacto), `repeticion` y `contactoId` se aplican en la
 * consulta. `total` cuenta todos los que cumplen, aunque `limit` recorte la lista.
 */
export async function listarRecordatorios(
  cliente: ClienteDb,
  userId: string,
  opciones: {
    dias?: number | undefined;
    busqueda?: string | undefined;
    repeticion?: Repeticion | undefined;
    contactoId?: string | undefined;
    limit?: number | undefined;
    ahora?: Date | undefined;
  } = {},
): Promise<{ recordatorios: RecordatorioConContacto[]; total: number }> {
  const ahora = opciones.ahora ?? new Date();
  const hoy = await hoyDeLaPersona(cliente, userId, ahora);
  const { recordatoriosDeContactos: recordatorios, contactos } = esquema;

  const condiciones = [
    eq(recordatorios.userId, userId),
    isNull(recordatorios.eliminadoEn),
    eq(contactos.userId, userId),
    isNull(contactos.eliminadoEn),
    not(estaPasado(hoy)),
  ];
  if (opciones.repeticion) condiciones.push(eq(recordatorios.repeticion, opciones.repeticion));
  if (opciones.contactoId) condiciones.push(eq(recordatorios.contactoId, opciones.contactoId));
  const busqueda = opciones.busqueda?.trim();
  if (busqueda) {
    const patron = patronDeBusqueda(busqueda);
    const coincide = or(
      sql`${recordatorios.titulo} ilike ${patron}`,
      sql`concat_ws(' ', ${contactos.nombre}, ${contactos.apellido}) ilike ${patron}`,
    );
    if (coincide) condiciones.push(coincide);
  }

  const filas = await cliente.db
    .select({
      recordatorio: recordatorios,
      contacto: {
        id: contactos.id,
        tipo: contactos.tipo,
        nombre: contactos.nombre,
        apellido: contactos.apellido,
      },
    })
    .from(recordatorios)
    .innerJoin(contactos, eq(contactos.id, recordatorios.contactoId))
    .where(and(...condiciones));

  const lista: (Recordatorio & {
    contacto: Omit<RecordatorioConContacto["contacto"], "etiquetas">;
  })[] = [];
  for (const { recordatorio, contacto } of filas) {
    const aviso = aRecordatorio(recordatorio, hoy);
    if (!aviso) continue;
    if (opciones.dias !== undefined && aviso.diasRestantes > opciones.dias) continue;
    lista.push({ ...aviso, contacto: { ...contacto, tipo: contacto.tipo as TipoDeContacto } });
  }
  lista.sort(porProximaFecha);

  // Las etiquetas, solo de los contactos que quedan en la lista, con una consulta para todos.
  const visibles = lista.slice(0, opciones.limit ?? 100);
  const etiquetas = await etiquetasDeLosContactos(cliente, [
    ...new Set(visibles.map((aviso) => aviso.contactoId)),
  ]);
  return {
    recordatorios: visibles.map((aviso) => ({
      ...aviso,
      contacto: { ...aviso.contacto, etiquetas: etiquetas.get(aviso.contactoId) ?? [] },
    })),
    total: lista.length,
  };
}

/** El contacto es de la persona y no está eliminado. */
async function contactoActivo(
  cliente: ClienteDb,
  userId: string,
  contactoId: string,
): Promise<boolean> {
  const fila = await cliente.db.query.contactos.findFirst({
    where: () =>
      and(
        eq(esquema.contactos.id, contactoId),
        eq(esquema.contactos.userId, userId),
        isNull(esquema.contactos.eliminadoEn),
      ),
    columns: { id: true },
  });
  return fila !== undefined;
}

/** Uno de una sola vez tiene que caer hoy o más adelante; los que se repiten siempre tienen una próxima vez. */
function validarDia(datos: DatosDeRecordatorio, hoy: string): void {
  if (datos.repeticion === "unica" && datos.fecha < hoy) throw new RecordatorioEnElPasado();
}

/** Las columnas de la tabla para unos datos: cada repetición llena las suyas y deja el resto en nulo. */
function columnasDe(datos: DatosDeRecordatorio) {
  const vacias = { fecha: null, diaSemana: null, diaDelMes: null, mes: null, hora: null };
  // Sin `importante` no se toca (al crear queda en que no).
  const base = {
    titulo: datos.titulo,
    repeticion: datos.repeticion,
    ...(datos.importante === undefined ? {} : { importante: datos.importante }),
  };
  const hora = datos.hora === "" ? null : datos.hora;

  switch (datos.repeticion) {
    case "unica":
      return { ...vacias, ...base, fecha: datos.fecha, hora };
    case "diaria":
      return { ...vacias, ...base, hora };
    case "semanal":
      return { ...vacias, ...base, diaSemana: datos.diaSemana, hora };
    case "mensual":
      return { ...vacias, ...base, diaDelMes: datos.diaDelMes, hora };
    case "anual":
      return { ...vacias, ...base, diaDelMes: datos.diaDelMes, mes: datos.mes, hora };
  }
}

/** Devuelve null si el contacto no existe, es de otra persona o está eliminado. */
export async function crearRecordatorio(
  cliente: ClienteDb,
  userId: string,
  contactoId: string,
  datos: DatosDeRecordatorio,
  ahora: Date = new Date(),
): Promise<Recordatorio | null> {
  if (!(await contactoActivo(cliente, userId, contactoId))) return null;

  const hoy = await hoyDeLaPersona(cliente, userId, ahora);
  validarDia(datos, hoy);

  const [existentes] = await cliente.db
    .select({ total: count() })
    .from(esquema.recordatoriosDeContactos)
    .where(
      and(
        eq(esquema.recordatoriosDeContactos.userId, userId),
        eq(esquema.recordatoriosDeContactos.contactoId, contactoId),
        isNull(esquema.recordatoriosDeContactos.eliminadoEn),
        // Uno que ya pasó está en el histórico: no ocupa lugar en el máximo.
        not(estaPasado(hoy)),
      ),
    );
  if ((existentes?.total ?? 0) >= MAXIMO_DE_RECORDATORIOS_POR_CONTACTO) {
    throw new LimiteDeRecordatorios();
  }

  const [fila] = await cliente.db
    .insert(esquema.recordatoriosDeContactos)
    // Nace sin historia: nada de antes de hoy va al histórico.
    .values({ userId, contactoId, ...columnasDe(datos), historialHasta: sumarDias(hoy, -1) })
    .returning();
  const recordatorio = fila ? aRecordatorio(fila, hoy) : null;
  if (!recordatorio) throw new Error("No se pudo crear el recordatorio.");
  return recordatorio;
}

/** Devuelve null si no existe, es de otra persona, o su contacto está eliminado. */
export async function editarRecordatorio(
  cliente: ClienteDb,
  userId: string,
  contactoId: string,
  id: string,
  datos: DatosDeRecordatorio,
  ahora: Date = new Date(),
): Promise<Recordatorio | null> {
  if (!(await contactoActivo(cliente, userId, contactoId))) return null;

  const hoy = await hoyDeLaPersona(cliente, userId, ahora);
  validarDia(datos, hoy);

  const [fila] = await cliente.db
    .update(esquema.recordatoriosDeContactos)
    .set(columnasDe(datos))
    .where(
      and(
        eq(esquema.recordatoriosDeContactos.id, id),
        eq(esquema.recordatoriosDeContactos.userId, userId),
        eq(esquema.recordatoriosDeContactos.contactoId, contactoId),
        isNull(esquema.recordatoriosDeContactos.eliminadoEn),
      ),
    )
    .returning();
  return fila ? aRecordatorio(fila, hoy) : null;
}

/** Borrado lógico. Devuelve false si no existe, es de otra persona o ya estaba eliminado. */
export async function eliminarRecordatorio(
  cliente: ClienteDb,
  userId: string,
  contactoId: string,
  id: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  const filas = await cliente.db
    .update(esquema.recordatoriosDeContactos)
    .set({ eliminadoEn: ahora })
    .where(
      and(
        eq(esquema.recordatoriosDeContactos.id, id),
        eq(esquema.recordatoriosDeContactos.userId, userId),
        eq(esquema.recordatoriosDeContactos.contactoId, contactoId),
        isNull(esquema.recordatoriosDeContactos.eliminadoEn),
      ),
    )
    .returning({ id: esquema.recordatoriosDeContactos.id });
  return filas.length > 0;
}

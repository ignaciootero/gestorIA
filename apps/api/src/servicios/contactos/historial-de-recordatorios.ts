// El histórico de los recordatorios: cada vez que uno cayó y su día ya pasó.
//
// El recordatorio principal sigue vivo —uno que se repite, "Cumpleaños" cada 12 de mayo, sigue
// avisando— y cada vez que pasa su día deja una entrada aparte en el histórico. Uno de una sola vez
// deja su única entrada y, como ya no tiene próxima vez, se da de baja (borrado lógico). La persona
// puede eliminar entradas sueltas o vaciar todo el histórico; eso nunca toca los recordatorios.
//
// Las entradas se generan al leer el histórico y en la limpieza periódica (`limpiarContactos`),
// nunca al crear el recordatorio. Cada recordatorio lleva `historialHasta`, el último día ya pasado
// al histórico: de ahí en adelante se calcula qué días cayó (`proximaOcurrencia`, la misma cuenta que
// el calendario y las listas) y se agregan. Como solo se avanza ese puntero, lo que la persona borra
// no vuelve a aparecer. Si pasó mucho tiempo sin generar, solo se recuperan los últimos
// DIAS_DE_HISTORIAL_A_RECUPERAR días, para que un recordatorio diario no llene la base.
//
// Cada entrada guarda una copia del título, la repetición y la hora: sigue igual aunque el principal
// se edite o se elimine. Es un borrado en duro: son datos derivados, no hay nada que recuperar.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  diasEntre,
  ocurrenciasEnRango,
  proximaOcurrencia,
  type Repeticion,
  recortarHora,
  sumarDias,
  type TipoDeContacto,
} from "@gestoria/shared";
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { patronDeBusqueda } from "./busqueda.ts";
import type { EtiquetaDeUnContacto } from "./contactos.ts";
import { etiquetasDeLosContactos } from "./etiquetas.ts";
import { hoyDeLaPersona } from "./recordatorios.ts";

/** Hasta cuántos días atrás se recuperan las veces que cayó un recordatorio que se repite. */
export const DIAS_DE_HISTORIAL_A_RECUPERAR = 90;

export type EntradaDelHistorial = {
  id: string;
  contactoId: string;
  /** El recordatorio de origen (puede que ya no exista). */
  recordatorioId: string;
  titulo: string;
  /** Cómo se repite el recordatorio de origen. */
  repeticion: Repeticion;
  /** El día en que cayó, "AAAA-MM-DD". */
  dia: string;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  /** Si el recordatorio de origen era importante cuando cayó. */
  importante: boolean;
  /** Cuántos días pasaron desde entonces: 1 es ayer. */
  diasAtras: number;
  contacto: {
    id: string;
    tipo: TipoDeContacto;
    nombre: string;
    apellido: string | null;
    etiquetas: EtiquetaDeUnContacto[];
  };
};

/**
 * Pasa al histórico lo que ya ocurrió de los recordatorios de la persona (de contactos no eliminados)
 * y devuelve cuántas entradas nuevas agregó. Es idempotente: correrla dos veces no duplica nada.
 */
export async function generarHistorial(
  cliente: ClienteDb,
  userId: string,
  ahora: Date = new Date(),
): Promise<number> {
  const hoy = await hoyDeLaPersona(cliente, userId, ahora);
  const ayer = sumarDias(hoy, -1);
  const piso = sumarDias(hoy, -DIAS_DE_HISTORIAL_A_RECUPERAR);
  const { recordatoriosDeContactos: recordatorios, contactos } = esquema;

  const filas = await cliente.db
    .select({ recordatorio: recordatorios })
    .from(recordatorios)
    .innerJoin(contactos, eq(contactos.id, recordatorios.contactoId))
    .where(
      and(
        eq(recordatorios.userId, userId),
        isNull(recordatorios.eliminadoEn),
        eq(contactos.userId, userId),
        isNull(contactos.eliminadoEn),
      ),
    );

  const entradas: (typeof esquema.historialDeRecordatorios.$inferInsert)[] = [];
  const avanzados: string[] = [];
  const terminados: string[] = [];

  for (const { recordatorio } of filas) {
    const dias: string[] = [];
    if (recordatorio.repeticion === "unica") {
      if (recordatorio.fecha === null || recordatorio.fecha >= hoy) continue;
      dias.push(recordatorio.fecha);
      terminados.push(recordatorio.id);
    } else {
      if (recordatorio.historialHasta >= ayer) continue;
      const desde = sumarDias(recordatorio.historialHasta, 1);
      const cuando = {
        repeticion: recordatorio.repeticion as Repeticion,
        fecha: recordatorio.fecha,
        diaSemana: recordatorio.diaSemana,
        diaDelMes: recordatorio.diaDelMes,
        mes: recordatorio.mes,
      };
      dias.push(
        ...ocurrenciasEnRango(
          (cursor) => proximaOcurrencia(cuando, cursor),
          desde > piso ? desde : piso,
          ayer,
        ),
      );
      avanzados.push(recordatorio.id);
    }
    for (const dia of dias) {
      entradas.push({
        userId,
        contactoId: recordatorio.contactoId,
        recordatorioId: recordatorio.id,
        titulo: recordatorio.titulo,
        repeticion: recordatorio.repeticion,
        dia,
        hora: recordatorio.hora,
        importante: recordatorio.importante,
      });
    }
  }

  if (entradas.length === 0 && avanzados.length === 0 && terminados.length === 0) return 0;

  return await cliente.db.transaction(async (tx) => {
    let agregadas = 0;
    // De a tandas: un diario recuperando 90 días son muchas filas, y cada una lleva varios parámetros.
    for (let desde = 0; desde < entradas.length; desde += 500) {
      const insertadas = await tx
        .insert(esquema.historialDeRecordatorios)
        .values(entradas.slice(desde, desde + 500))
        .onConflictDoNothing()
        .returning({ id: esquema.historialDeRecordatorios.id });
      agregadas += insertadas.length;
    }
    for (const id of avanzados) {
      await tx.update(recordatorios).set({ historialHasta: ayer }).where(eq(recordatorios.id, id));
    }
    for (const id of terminados) {
      await tx.update(recordatorios).set({ eliminadoEn: ahora }).where(eq(recordatorios.id, id));
    }
    return agregadas;
  });
}

/** Lo mismo para todas las personas que tienen recordatorios vigentes (lo usa la limpieza periódica). */
export async function generarHistorialDeTodos(
  cliente: ClienteDb,
  ahora: Date = new Date(),
): Promise<number> {
  const personas = await cliente.db
    .selectDistinct({ userId: esquema.recordatoriosDeContactos.userId })
    .from(esquema.recordatoriosDeContactos)
    .where(isNull(esquema.recordatoriosDeContactos.eliminadoEn));
  let total = 0;
  for (const { userId } of personas) total += await generarHistorial(cliente, userId, ahora);
  return total;
}

/**
 * El histórico de la persona (de contactos no eliminados), lo más reciente primero. Antes de leer
 * pone al día las entradas que falten. Filtros: `busqueda` (en el título y en el nombre del
 * contacto), `repeticion` (la del recordatorio de origen) y `contactoId`. `total` cuenta todas las
 * que cumplen, aunque `limit` recorte la lista.
 */
export async function listarHistorial(
  cliente: ClienteDb,
  userId: string,
  opciones: {
    busqueda?: string | undefined;
    repeticion?: Repeticion | undefined;
    contactoId?: string | undefined;
    limit?: number | undefined;
    ahora?: Date | undefined;
  } = {},
): Promise<{ entradas: EntradaDelHistorial[]; total: number }> {
  const ahora = opciones.ahora ?? new Date();
  await generarHistorial(cliente, userId, ahora);
  const hoy = await hoyDeLaPersona(cliente, userId, ahora);
  const { historialDeRecordatorios: historial, contactos } = esquema;

  const condiciones = [
    eq(historial.userId, userId),
    eq(contactos.userId, userId),
    isNull(contactos.eliminadoEn),
  ];
  if (opciones.repeticion) condiciones.push(eq(historial.repeticion, opciones.repeticion));
  if (opciones.contactoId) condiciones.push(eq(historial.contactoId, opciones.contactoId));
  const busqueda = opciones.busqueda?.trim();
  if (busqueda) {
    const patron = patronDeBusqueda(busqueda);
    const coincide = or(
      sql`${historial.titulo} ilike ${patron}`,
      sql`concat_ws(' ', ${contactos.nombre}, ${contactos.apellido}) ilike ${patron}`,
    );
    if (coincide) condiciones.push(coincide);
  }

  const base = cliente.db
    .select({ n: count() })
    .from(historial)
    .innerJoin(contactos, eq(contactos.id, historial.contactoId))
    .where(and(...condiciones));
  const [filas, [cantidad]] = await Promise.all([
    cliente.db
      .select({
        entrada: historial,
        contacto: {
          id: contactos.id,
          tipo: contactos.tipo,
          nombre: contactos.nombre,
          apellido: contactos.apellido,
        },
      })
      .from(historial)
      .innerJoin(contactos, eq(contactos.id, historial.contactoId))
      .where(and(...condiciones))
      // El más reciente primero; el mismo día, lo que tiene hora más tarde antes y el de todo el día al final.
      .orderBy(desc(historial.dia), sql`${historial.hora} desc nulls last`, historial.titulo)
      .limit(opciones.limit ?? 200),
    base,
  ]);

  const etiquetas = await etiquetasDeLosContactos(cliente, [
    ...new Set(filas.map(({ entrada }) => entrada.contactoId)),
  ]);
  return {
    entradas: filas.map(({ entrada, contacto }) => ({
      id: entrada.id,
      contactoId: entrada.contactoId,
      recordatorioId: entrada.recordatorioId,
      titulo: entrada.titulo,
      repeticion: entrada.repeticion as Repeticion,
      dia: entrada.dia,
      hora: recortarHora(entrada.hora),
      importante: entrada.importante,
      diasAtras: diasEntre(entrada.dia, hoy),
      contacto: {
        ...contacto,
        tipo: contacto.tipo as TipoDeContacto,
        etiquetas: etiquetas.get(entrada.contactoId) ?? [],
      },
    })),
    total: cantidad?.n ?? 0,
  };
}

/** Elimina una entrada del histórico. Devuelve false si no existe o es de otra persona. */
export async function eliminarDelHistorial(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<boolean> {
  const filas = await cliente.db
    .delete(esquema.historialDeRecordatorios)
    .where(
      and(
        eq(esquema.historialDeRecordatorios.id, id),
        eq(esquema.historialDeRecordatorios.userId, userId),
      ),
    )
    .returning({ id: esquema.historialDeRecordatorios.id });
  return filas.length > 0;
}

/**
 * Vacía todo el histórico de la persona y devuelve cuántas entradas eliminó. No toca los
 * recordatorios. Antes pasa al histórico lo que ya había ocurrido, así nada de lo anterior
 * reaparece después.
 */
export async function vaciarHistorial(
  cliente: ClienteDb,
  userId: string,
  ahora: Date = new Date(),
): Promise<number> {
  await generarHistorial(cliente, userId, ahora);
  const filas = await cliente.db
    .delete(esquema.historialDeRecordatorios)
    .where(eq(esquema.historialDeRecordatorios.userId, userId))
    .returning({ id: esquema.historialDeRecordatorios.id });
  return filas.length;
}

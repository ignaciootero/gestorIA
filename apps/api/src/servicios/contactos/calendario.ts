// Lo que Contactos aporta al calendario: los recordatorios de los contactos, en cada día que caen.
//
// De un recordatorio se guarda cuándo cae (el día de la semana, del mes...), no una lista de fechas:
// acá se calcula en qué días del rango cae (`ocurrenciasEnRango`), así uno que se repite aparece en
// todos los que le tocan y nada se desincroniza. Solo cuentan los de contactos que no están en la
// papelera. A diferencia de las listas de Contactos —que muestran lo que viene—, el calendario también
// se puede mirar hacia atrás, así que muestra el día que le toca aunque ya haya pasado. Un recordatorio no
// se tilda como una tarea: se considera `completado` cuando el día en que cae ya pasó (antes de hoy).

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  type EventoDeCalendario,
  nombreCompletoDeContacto,
  ocurrenciasEnRango,
  proximaOcurrencia,
  type RangoDeEventos,
  type Repeticion,
  recortarHora,
} from "@gestoria/shared";
import { and, eq, isNull, or, sql } from "drizzle-orm";

/** Los recordatorios de la persona que caen en el rango (`hoy` es el día de su zona). */
export async function eventosDeContactos(
  cliente: ClienteDb,
  userId: string,
  rango: RangoDeEventos,
  hoy: string,
): Promise<EventoDeCalendario[]> {
  const { recordatoriosDeContactos: recordatorios, contactos } = esquema;
  const filas = await cliente.db
    .select({
      recordatorio: recordatorios,
      nombre: contactos.nombre,
      apellido: contactos.apellido,
    })
    .from(recordatorios)
    .innerJoin(contactos, eq(contactos.id, recordatorios.contactoId))
    .where(
      and(
        eq(recordatorios.userId, userId),
        isNull(recordatorios.eliminadoEn),
        eq(contactos.userId, userId),
        isNull(contactos.eliminadoEn),
        // Uno de una sola vez solo importa si cae dentro del rango; los que se repiten, siempre.
        or(
          sql`${recordatorios.repeticion} <> 'unica'`,
          and(
            sql`${recordatorios.fecha} >= ${rango.desde}`,
            sql`${recordatorios.fecha} <= ${rango.hasta}`,
          ),
        ),
      ),
    );

  // Uno de una sola vez que ya pasó se dio de baja y vive en el histórico: se sigue viendo en su día.
  const delHistorial = await cliente.db
    .select({
      entrada: esquema.historialDeRecordatorios,
      nombre: contactos.nombre,
      apellido: contactos.apellido,
    })
    .from(esquema.historialDeRecordatorios)
    .innerJoin(contactos, eq(contactos.id, esquema.historialDeRecordatorios.contactoId))
    .where(
      and(
        eq(esquema.historialDeRecordatorios.userId, userId),
        eq(esquema.historialDeRecordatorios.repeticion, "unica"),
        sql`${esquema.historialDeRecordatorios.dia} >= ${rango.desde}`,
        sql`${esquema.historialDeRecordatorios.dia} <= ${rango.hasta}`,
        eq(contactos.userId, userId),
        isNull(contactos.eliminadoEn),
      ),
    );
  const eventosDelHistorial = delHistorial.map(
    ({ entrada, nombre, apellido }): EventoDeCalendario => ({
      id: `recordatorio:${entrada.recordatorioId}:${entrada.dia}`,
      origen: "contactos",
      titulo: entrada.titulo,
      detalle: nombreCompletoDeContacto({ nombre, apellido }),
      dia: entrada.dia,
      hora: recortarHora(entrada.hora),
      repeticion: "unica",
      completado: true,
      fallido: false,
    }),
  );

  const eventos = filas.flatMap(({ recordatorio, nombre, apellido }) => {
    const cuando = {
      repeticion: recordatorio.repeticion as Repeticion,
      fecha: recordatorio.fecha,
      diaSemana: recordatorio.diaSemana,
      diaDelMes: recordatorio.diaDelMes,
      mes: recordatorio.mes,
    };
    return ocurrenciasEnRango(
      (desde) => proximaOcurrencia(cuando, desde),
      rango.desde,
      rango.hasta,
    ).map(
      (dia): EventoDeCalendario => ({
        id: `recordatorio:${recordatorio.id}:${dia}`,
        origen: "contactos",
        titulo: recordatorio.titulo,
        detalle: nombreCompletoDeContacto({ nombre, apellido }),
        dia,
        hora: recortarHora(recordatorio.hora),
        repeticion: cuando.repeticion,
        // No se tilda: está completado cuando su día ya pasó. El de hoy todavía no.
        completado: dia < hoy,
        fallido: false,
      }),
    );
  });
  return [...eventos, ...eventosDelHistorial];
}

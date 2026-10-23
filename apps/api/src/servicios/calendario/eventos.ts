// Los eventos del calendario: junta en una sola lista, ordenada, lo que viene de cada módulo.
//
// - Calendario: los eventos que la persona anotó a mano (eventos-manuales.ts).
// - Finanzas: el vencimiento de las deudas pendientes.
// - Contactos: los recordatorios de los contactos.
// - Tareas: las tareas (las tildadas, marcadas como completadas).
//
// Cada módulo arma sus eventos a partir de sus propias tablas (`calendario.ts` de cada carpeta):
// el calendario no guarda copias, así que lo que se ve siempre coincide con el módulo de origen.
// Se piden en paralelo y se ordenan por día y hora (`compararEventos`, en @gestoria/shared). Todo
// filtra por el usuario de la sesión.

import type { ClienteDb } from "@gestoria/db";
import {
  compararEventos,
  diaDeHoy,
  type EventoDeCalendario,
  type RangoDeEventos,
} from "@gestoria/shared";
import { eventosDeContactos } from "../contactos/calendario.ts";
import { eventosDeFinanzas } from "../finanzas/calendario.ts";
import { obtenerZonaHoraria } from "../finanzas/periodos.ts";
import { eventosDeTareas } from "../tareas/calendario.ts";
import { eventosManuales } from "./eventos-manuales.ts";

/** Todos los eventos de la persona entre `desde` y `hasta` (ambos inclusive), en orden. */
export async function listarEventosDelCalendario(
  cliente: ClienteDb,
  userId: string,
  rango: RangoDeEventos,
  ahora: Date = new Date(),
): Promise<EventoDeCalendario[]> {
  const hoy = diaDeHoy(await obtenerZonaHoraria(cliente, userId), ahora);

  const listas = await Promise.all([
    eventosManuales(cliente, userId, rango),
    eventosDeFinanzas(cliente, userId, rango),
    eventosDeContactos(cliente, userId, rango, hoy),
    eventosDeTareas(cliente, userId, rango, hoy),
  ]);
  return listas.flat().sort(compararEventos);
}

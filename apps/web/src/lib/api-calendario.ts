// Cliente de las rutas del calendario (apps/api/src/rutas/calendario.ts).
//
// Mismo patrón que lib/api-tareas.ts: un `pedir` genérico y una función por endpoint. Los eventos
// llegan ya ordenados por día y hora, y cada uno dice de qué módulo viene.

import type { DatosDeEventoDeCalendario, EventoDeCalendario } from "@gestoria/shared";
import { URL_API } from "./entorno";

export type { DatosDeEventoDeCalendario, EventoDeCalendario };

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    credentials: "include",
    ...opciones,
    headers: { "content-type": "application/json", ...opciones?.headers },
  });

  if (!respuesta.ok) {
    throw await respuesta.json();
  }

  return respuesta.json() as Promise<T>;
}

/** Los eventos entre dos días (ambos inclusive; hasta 70 días de una vez), en orden. */
export async function obtenerEventos(desde: string, hasta: string): Promise<EventoDeCalendario[]> {
  const { eventos } = await pedir<{ eventos: EventoDeCalendario[] }>(
    `/api/calendario/eventos?desde=${desde}&hasta=${hasta}`,
  );
  return eventos;
}

export function crearEvento(datos: DatosDeEventoDeCalendario): Promise<EventoDeCalendario> {
  return pedir("/api/calendario/eventos", { method: "POST", body: JSON.stringify(datos) });
}

export function editarEvento(
  id: string,
  datos: DatosDeEventoDeCalendario,
): Promise<EventoDeCalendario> {
  return pedir(`/api/calendario/eventos/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}

export function eliminarEvento(id: string): Promise<{ ok: true }> {
  return pedir(`/api/calendario/eventos/${id}`, { method: "DELETE" });
}

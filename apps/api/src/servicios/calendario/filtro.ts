// El filtro del calendario de cada persona: qué orígenes, repeticiones y estados oculta. Se guarda en
// la cuenta (tabla `filtros_del_calendario`) para que se mantenga en cualquier dispositivo hasta que la
// persona lo vuelva a cambiar.
//
// Una fila por persona. Sin fila, `null`: el cliente usa el filtro por defecto. Lo guardado se vuelve a
// validar al leerlo; si no pasa (por ejemplo, porque cambió el formato), también es `null`.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { esquemaFiltroDeEventos, type FiltroDeEventosGuardado } from "@gestoria/shared";
import { eq } from "drizzle-orm";

/** El filtro guardado de la persona, o null si nunca guardó uno (o lo guardado ya no es válido). */
export async function obtenerFiltroDelCalendario(
  cliente: ClienteDb,
  userId: string,
): Promise<FiltroDeEventosGuardado | null> {
  const [fila] = await cliente.db
    .select({
      origenesOcultos: esquema.filtrosDelCalendario.origenesOcultos,
      repeticionesOcultas: esquema.filtrosDelCalendario.repeticionesOcultas,
      estadosOcultos: esquema.filtrosDelCalendario.estadosOcultos,
    })
    .from(esquema.filtrosDelCalendario)
    .where(eq(esquema.filtrosDelCalendario.userId, userId));
  if (!fila) return null;
  const resultado = esquemaFiltroDeEventos.safeParse(fila);
  return resultado.success ? resultado.data : null;
}

/** Guarda el filtro (ya validado) de la persona: lo crea la primera vez y lo reemplaza después. */
export async function guardarFiltroDelCalendario(
  cliente: ClienteDb,
  userId: string,
  filtro: FiltroDeEventosGuardado,
): Promise<FiltroDeEventosGuardado> {
  const valores = {
    origenesOcultos: filtro.origenesOcultos,
    repeticionesOcultas: filtro.repeticionesOcultas,
    estadosOcultos: filtro.estadosOcultos,
    actualizadoEn: new Date(),
  };
  await cliente.db
    .insert(esquema.filtrosDelCalendario)
    .values({ userId, ...valores })
    .onConflictDoUpdate({ target: esquema.filtrosDelCalendario.userId, set: valores });
  return filtro;
}

// Apariencia de la persona: el color de acento y los ajustes del fondo animado, uno por modo.
//
// Null es "el de la app" (el verde agua y el fondo de siempre). Lo que se deriva de cada valor
// lo calcula cada cliente con packages/ui-tokens: acá solo se guarda lo que eligió.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import type { ColoresDeAcento, Fondos } from "@gestoria/shared";
import { eq } from "drizzle-orm";

/** Guarda los dos colores de una vez (los dos se mandan siempre: null vuelve al de la app). */
export async function guardarColoresDeAcento(
  cliente: ClienteDb,
  userId: string,
  colores: ColoresDeAcento,
): Promise<ColoresDeAcento> {
  const [fila] = await cliente.db
    .update(esquema.usuarios)
    .set({ colorDeAcentoClaro: colores.claro, colorDeAcentoOscuro: colores.oscuro })
    .where(eq(esquema.usuarios.id, userId))
    .returning({
      claro: esquema.usuarios.colorDeAcentoClaro,
      oscuro: esquema.usuarios.colorDeAcentoOscuro,
    });
  return fila ?? colores;
}

/**
 * Guarda los ajustes del fondo de los dos modos (null vuelve al de la app). Van como texto JSON:
 * ya vienen validados por esquemaFondos.
 */
export async function guardarFondos(
  cliente: ClienteDb,
  userId: string,
  fondos: Fondos,
): Promise<Fondos> {
  await cliente.db
    .update(esquema.usuarios)
    .set({
      fondoClaro: fondos.claro ? JSON.stringify(fondos.claro) : null,
      fondoOscuro: fondos.oscuro ? JSON.stringify(fondos.oscuro) : null,
    })
    .where(eq(esquema.usuarios.id, userId));
  return fondos;
}

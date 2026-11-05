// Colores de acento de la persona: uno para el modo claro y otro para el oscuro.
//
// Null es "el de la app" (el verde agua). Los tonos que se derivan de cada color los calcula
// cada cliente con packages/ui-tokens: acá solo se guarda lo que eligió.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import type { ColoresDeAcento } from "@gestoria/shared";
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

// Colores de acento que elige cada persona: uno para el modo claro y otro para el oscuro.
//
// Se guardan en la cuenta (te siguen en todos los dispositivos). Null es "el de la app" (el verde
// agua): así, volver al original es guardar null y no hay que acordarse de qué color era. Los
// tonos que se derivan de cada color están en packages/ui-tokens (acento-personalizado.ts).

import { z } from "zod";

/** "#rrggbb", tal como lo da un <input type="color">; se guarda en minúsculas. */
const esquemaColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Ese color no es válido.")
  .toLowerCase();

export const esquemaColoresDeAcento = z.strictObject({
  claro: esquemaColor.nullable(),
  oscuro: esquemaColor.nullable(),
});

export type ColoresDeAcento = z.infer<typeof esquemaColoresDeAcento>;

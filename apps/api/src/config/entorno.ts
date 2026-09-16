// Validacion de las variables de entorno de la API.
//
// Se valida al arrancar y, si falta algo, el proceso muere con un mensaje que
// dice exactamente que variable esta mal (docs/guias/seguridad-y-datos.md).
// Es preferible no arrancar a arrancar a medias y fallar en la primera petición.

import { z } from "zod";

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Lista separada por comas. CORS nunca usa "*": solo nuestros propios dominios.
  ORIGENES_PERMITIDOS: z
    .string()
    .min(1, "Indicá al menos un origen permitido para CORS")
    .transform((valor) =>
      valor
        .split(",")
        .map((origen) => origen.trim())
        .filter((origen) => origen.length > 0),
    )
    .refine((origenes) => origenes.length > 0, {
      message: "Indicá al menos un origen permitido para CORS",
    })
    .refine((origenes) => !origenes.includes("*"), {
      message: 'CORS no admite "*": listá los dominios propios',
    }),
});

export type EntornoApi = z.infer<typeof esquemaEntorno>;

/**
 * Lee y valida las variables de entorno de la API.
 * Lanza un error con el detalle por variable si algo falta o es invalido.
 */
export function leerEntornoApi(fuente: NodeJS.ProcessEnv = process.env): EntornoApi {
  const resultado = esquemaEntorno.safeParse(fuente);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `  - ${problema.path.join(".")}: ${problema.message}`)
      .join("\n");
    throw new Error(
      `Variables de entorno de la API inválidas:\n${detalle}\n` +
        "Copiá .env.example a .env y completá los valores.",
    );
  }

  return resultado.data;
}

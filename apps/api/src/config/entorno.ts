// Validacion de las variables de entorno de la API.
//
// Se valida al arrancar y, si falta algo, el proceso muere con un mensaje que
// dice exactamente que variable esta mal (docs/guias/seguridad-y-datos.md).
// Es preferible no arrancar a arrancar a medias y fallar en la primera petición.

import { z } from "zod";

/**
 * URL con protocolo http o https obligatorio.
 *
 * `z.url()` a secas da por válido "localhost:3001", interpretando "localhost"
 * como el esquema. Con esa URL la API arrancaría igual y recién fallaría al
 * armar las cookies de sesión, que es el peor momento para enterarse.
 */
function esquemaUrlHttp(nombre: string, ejemplo: string) {
  const mensaje = `${nombre} tiene que ser una URL completa con http:// o https://, por ejemplo ${ejemplo}`;

  return z.url(mensaje).refine((valor) => /^https?:\/\//.test(valor), { message: mensaje });
}

/**
 * Variable opcional que además tolera venir vacía.
 *
 * En un archivo `.env`, una clave sin valor (`SMTP_HOST=`) llega como cadena
 * vacía, no como ausente. Sin esto, copiar `.env.example` tal cual dejaría a la
 * API sin arrancar por las variables que justamente son opcionales.
 */
const opcionalVacio = z
  .string()
  .optional()
  .transform((valor) => (valor === undefined || valor.trim() === "" ? undefined : valor.trim()));

const esquemaEntorno = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Al menos 32 caracteres: es la clave con la que Better Auth firma y cifra.
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "Tiene que tener al menos 32 caracteres. Generá uno con: openssl rand -base64 32"),
  // URL publica de la API: Better Auth la usa para armar cookies y callbacks.
  BETTER_AUTH_URL: esquemaUrlHttp("BETTER_AUTH_URL", "http://localhost:3001"),
  // A donde manda la web a la persona despues de entrar.
  URL_WEB: esquemaUrlHttp("URL_WEB", "http://localhost:3000"),

  // --- SMTP (envío de correo) ---
  // Opcional a propósito: sin SMTP configurado la API arranca igual y escribe los
  // correos en el log, para poder probar el flujo en desarrollo sin servidor de
  // correo. En producción hay que configurarlo.
  SMTP_HOST: opcionalVacio,
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
  SMTP_SEGURO: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  SMTP_USUARIO: opcionalVacio,
  SMTP_PASSWORD: opcionalVacio,
  // De quién dice venir el correo. Por ejemplo: Gestión <no-responder@midominio.com>
  SMTP_REMITENTE: opcionalVacio,

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

/**
 * Configuración de SMTP, o undefined si no está completa.
 *
 * Se exige el juego completo: un SMTP a medias falla recién al mandar el primer
 * correo, que es el peor momento para enterarse.
 */
export function leerConfigSmtp(entorno: EntornoApi) {
  if (!entorno.SMTP_HOST || !entorno.SMTP_USUARIO || !entorno.SMTP_PASSWORD) {
    return undefined;
  }

  return {
    host: entorno.SMTP_HOST,
    port: entorno.SMTP_PORT,
    seguro: entorno.SMTP_SEGURO,
    usuario: entorno.SMTP_USUARIO,
    password: entorno.SMTP_PASSWORD,
    remitente: entorno.SMTP_REMITENTE ?? entorno.SMTP_USUARIO,
  };
}

// Lo que comparten la compilación y el arranque del ambiente de prueba (Render; ver
// docs/despliegue-render.md).
//
// En ese ambiente la web y la API viven en un mismo servicio, con una sola URL pública: la web
// atiende afuera y le reenvía `/api/...` a la API, que escucha solo adentro. Por eso casi todas las
// URLs son la misma, y se completan acá a partir de la pública en vez de cargarlas a mano una por una.

/**
 * El puerto en el que escucha la API dentro del servicio (la web usa el que da Render en PORT). Se
 * puede cambiar con PUERTO_API_INTERNO para probarlo en una máquina que ya usa el 3001.
 */
export const PUERTO_API_INTERNO = Number(process.env["PUERTO_API_INTERNO"] ?? 3001);

/**
 * Completa las variables de entorno que se deducen de la URL pública del servicio, sin pisar las que
 * ya estén definidas. La URL pública sale de URL_PUBLICA o, si no está, de RENDER_EXTERNAL_URL (la
 * que Render define sola en cada servicio web, al compilar y al arrancar).
 */
export function completarEntorno(entorno: NodeJS.ProcessEnv): void {
  const publica = (entorno["URL_PUBLICA"] ?? entorno["RENDER_EXTERNAL_URL"])?.replace(/\/+$/, "");
  if (!publica) {
    throw new Error(
      "Falta la URL pública del servicio: definí URL_PUBLICA (Render define RENDER_EXTERNAL_URL solo).",
    );
  }
  const porDefecto: Record<string, string> = {
    // La web le habla a la API por su propia URL: el reenvío la lleva adentro.
    NEXT_PUBLIC_URL_API: publica,
    URL_API_INTERNA: `http://127.0.0.1:${PUERTO_API_INTERNO}`,
    // Better Auth arma las cookies y los enlaces de verificación con la URL que ve el navegador.
    BETTER_AUTH_URL: publica,
    URL_WEB: publica,
    ORIGENES_PERMITIDOS: publica,
  };
  for (const [clave, valor] of Object.entries(porDefecto)) {
    entorno[clave] ??= valor;
  }
  completarBaseDeDatos(entorno);
}

/**
 * Render da la base como una sola cadena de conexión (DATABASE_URL); la aplicación la lee por partes
 * (POSTGRES_HOST, POSTGRES_USER…, ver packages/db/src/entorno.ts). Se reparte acá, sin pisar las que
 * ya estén definidas. La base de tests no existe en este ambiente: se le pone la misma, que nunca se
 * usa (solo es obligatoria en la configuración).
 */
export function completarBaseDeDatos(entorno: NodeJS.ProcessEnv): void {
  const cadena = entorno["DATABASE_URL"];
  if (!cadena) return;
  const url = new URL(cadena);
  const base = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const partes: Record<string, string> = {
    POSTGRES_HOST: url.hostname,
    POSTGRES_PORT: url.port || "5432",
    POSTGRES_USER: decodeURIComponent(url.username),
    POSTGRES_PASSWORD: decodeURIComponent(url.password),
    POSTGRES_DB: base,
    POSTGRES_DB_TEST: base,
  };
  for (const [clave, valor] of Object.entries(partes)) {
    entorno[clave] ??= valor;
  }
}

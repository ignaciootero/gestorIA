// Atajos de los tests para armar períodos a través de la API real.
// No se incluye en el build de produccion (ver tsconfig.build.json).

import { type appDePrueba, leerJson } from "./entorno-de-prueba.ts";

type App = ReturnType<typeof appDePrueba>;

export type PeriodoJson = {
  id: number;
  nombre: string;
  aperturaEn: string;
  cierreEn: string | null;
  abierto: boolean;
};

/**
 * Apertura de los períodos "amplios" de los tests: lo bastante atrás como para
 * que cualquier fecha fija que usen (2026-01 en adelante) caiga adentro.
 */
export const APERTURA_AMPLIA = "2026-01-01T00:00:00.000Z";

function pedirJson(app: App, cookies: string, ruta: string, metodo: string, cuerpo: unknown) {
  return app.request(ruta, {
    method: metodo,
    headers: { cookie: cookies, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
}

/** POST /api/finanzas/periodos, devolviendo la respuesta cruda para poder probar errores. */
export function pedirAbrirPeriodo(
  app: App,
  cookies: string,
  cuerpo: { nombre?: string; aperturaEn?: string } = {},
) {
  return pedirJson(app, cookies, "/api/finanzas/periodos", "POST", cuerpo);
}

/** POST /api/finanzas/periodos/:id/cerrar, devolviendo la respuesta cruda. */
export function pedirCerrarPeriodo(
  app: App,
  cookies: string,
  id: number,
  cuerpo: { cierreEn?: string } = {},
) {
  return pedirJson(app, cookies, `/api/finanzas/periodos/${id}/cerrar`, "POST", cuerpo);
}

/** POST /api/finanzas/periodos/:id/reabrir, devolviendo la respuesta cruda. */
export function pedirReabrirPeriodo(app: App, cookies: string, id: number) {
  return pedirJson(app, cookies, `/api/finanzas/periodos/${id}/reabrir`, "POST", {});
}

/** DELETE /api/finanzas/periodos/:id, devolviendo la respuesta cruda. */
export function pedirEliminarPeriodo(app: App, cookies: string, id: number) {
  return app.request(`/api/finanzas/periodos/${id}`, {
    method: "DELETE",
    headers: { cookie: cookies },
  });
}

/** Abre un período y espera que salga bien. */
export async function abrirPeriodo(
  app: App,
  cookies: string,
  cuerpo: { nombre?: string; aperturaEn?: string } = {},
): Promise<PeriodoJson> {
  const respuesta = await pedirAbrirPeriodo(app, cookies, cuerpo);
  if (respuesta.status !== 201) {
    throw new Error(`No se pudo abrir el período (${respuesta.status}): ${await respuesta.text()}`);
  }
  return leerJson<PeriodoJson>(respuesta);
}

/** Cierra un período y espera que salga bien. */
export async function cerrarPeriodo(
  app: App,
  cookies: string,
  id: number,
  cuerpo: { cierreEn?: string } = {},
): Promise<PeriodoJson> {
  const respuesta = await pedirCerrarPeriodo(app, cookies, id, cuerpo);
  if (respuesta.status !== 200) {
    throw new Error(
      `No se pudo cerrar el período (${respuesta.status}): ${await respuesta.text()}`,
    );
  }
  return leerJson<PeriodoJson>(respuesta);
}

/** Abre un período abierto desde `APERTURA_AMPLIA`: el punto de partida de casi todos los tests. */
export function abrirPeriodoAmplio(app: App, cookies: string, nombre?: string) {
  return abrirPeriodo(app, cookies, {
    aperturaEn: APERTURA_AMPLIA,
    ...(nombre === undefined ? {} : { nombre }),
  });
}

export async function listarPeriodosPorApi(app: App, cookies: string): Promise<PeriodoJson[]> {
  const cuerpo = await leerJson<{ periodos: PeriodoJson[] }>(
    await app.request("/api/finanzas/periodos", { headers: { cookie: cookies } }),
  );
  return cuerpo.periodos;
}

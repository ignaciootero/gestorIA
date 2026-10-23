// Tests unitarios de la fuente real de cotizaciones, con `fetch` simulado: no salen a internet.
// (La caché y el resto del servicio están en cotizaciones.integracion.test.ts.)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fuenteDeCotizaciones, olvidarFallosDeLaFuente } from "./cotizaciones.ts";

const URL_JSDELIVR = "cdn.jsdelivr.net";
const URL_PAGES = "currency-api.pages.dev";

/** Lo que publica la fuente: cuántas unidades de cada moneda vale un dólar (en minúsculas). */
function cuerpoDeLaFuente(fecha = "2026-10-03", usd: Record<string, unknown> = {}) {
  return { date: fecha, usd: { uyu: 40.25, ars: 1500, eur: 0.8, brl: 5, btc: 0.00001, ...usd } };
}

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado });
}

const fetchSimulado = vi.fn<(url: string) => Promise<Response>>();

beforeEach(() => {
  fetchSimulado.mockReset();
  olvidarFallosDeLaFuente();
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fuenteDeCotizaciones", () => {
  it("trae las últimas y se queda solo con las monedas admitidas, más el dólar en 1", async () => {
    fetchSimulado.mockImplementation(async () => respuestaJson(cuerpoDeLaFuente()));

    const cotizaciones = await fuenteDeCotizaciones("ultimas");

    expect(cotizaciones).toEqual({
      fechaDeLaFuente: "2026-10-03",
      unidadesPorDolar: { UYU: 40.25, ARS: 1500, EUR: 0.8, BRL: 5, USD: 1 },
    });
  });

  it("pide 'latest' para las últimas y la versión con fecha para un día", async () => {
    fetchSimulado.mockImplementation(async () => respuestaJson(cuerpoDeLaFuente("2026-09-01")));

    await fuenteDeCotizaciones("ultimas");
    await fuenteDeCotizaciones("2026-09-01");

    const urls = fetchSimulado.mock.calls.map(([url]) => url);
    expect(urls.some((url) => url.includes("@latest/"))).toBe(true);
    expect(urls.some((url) => url.includes("@2026-09-01/"))).toBe(true);
    expect(urls.some((url) => url.includes("2026-09-01.currency-api.pages.dev"))).toBe(true);
  });

  it("si una de las dos CDN falla, vale la otra", async () => {
    fetchSimulado.mockImplementation(async (url) =>
      url.includes(URL_JSDELIVR)
        ? respuestaJson({ error: "no" }, 500)
        : respuestaJson(cuerpoDeLaFuente()),
    );

    expect((await fuenteDeCotizaciones("ultimas"))?.unidadesPorDolar.UYU).toBe(40.25);
  });

  it("si las dos CDN fallan, devuelve null: no hay otra fuente", async () => {
    fetchSimulado.mockImplementation(async () => respuestaJson({}, 503));

    expect(await fuenteDeCotizaciones("ultimas")).toBeNull();
    expect(fetchSimulado.mock.calls.every(([url]) => url.includes("currency-api"))).toBe(true);
  });

  it("descarta valores que no son números positivos", async () => {
    fetchSimulado.mockImplementation(async () =>
      respuestaJson(cuerpoDeLaFuente("2026-10-03", { uyu: "40", ars: -5, eur: 0, brl: null })),
    );

    const cotizaciones = await fuenteDeCotizaciones("ultimas");

    expect(cotizaciones?.unidadesPorDolar).toEqual({ USD: 1 });
  });

  it("rechaza una respuesta con otra forma", async () => {
    fetchSimulado.mockImplementation(async () => respuestaJson({ hola: 1 }));

    expect(await fuenteDeCotizaciones("ultimas")).toBeNull();
  });

  it("si no hay red (fetch lanza), devuelve null en vez de fallar", async () => {
    fetchSimulado.mockRejectedValue(new TypeError("fetch failed"));
    expect(await fuenteDeCotizaciones("ultimas")).toBeNull();
  });

  it("tras un fallo no vuelve a insistir enseguida", async () => {
    fetchSimulado.mockRejectedValue(new TypeError("fetch failed"));

    expect(await fuenteDeCotizaciones("ultimas")).toBeNull();
    const pedidosDelPrimerIntento = fetchSimulado.mock.calls.length;
    expect(await fuenteDeCotizaciones("ultimas")).toBeNull();

    expect(fetchSimulado.mock.calls.length).toBe(pedidosDelPrimerIntento);
  });

  it("la pausa de un día fallido no afecta a otro día", async () => {
    fetchSimulado.mockImplementation(async (url) =>
      url.includes("@2026-09-01/") || url.includes("2026-09-01.")
        ? respuestaJson({}, 500)
        : respuestaJson(cuerpoDeLaFuente()),
    );

    expect(await fuenteDeCotizaciones("2026-09-01")).toBeNull();
    expect((await fuenteDeCotizaciones("2026-09-02"))?.unidadesPorDolar.UYU).toBe(40.25);
  });

  it("al volver a funcionar, deja de estar en pausa", async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError("fetch failed"));
    fetchSimulado.mockRejectedValueOnce(new TypeError("fetch failed"));
    fetchSimulado.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await fuenteDeCotizaciones("ultimas")).toBeNull();

    olvidarFallosDeLaFuente();
    fetchSimulado.mockImplementation(async () => respuestaJson(cuerpoDeLaFuente()));
    expect(await fuenteDeCotizaciones("ultimas")).not.toBeNull();
  });

  it("usa las dos CDN a la vez, no una después de la otra", async () => {
    fetchSimulado.mockImplementation(async () => respuestaJson(cuerpoDeLaFuente()));

    await fuenteDeCotizaciones("ultimas");

    const urls = fetchSimulado.mock.calls.map(([url]) => url);
    expect(urls.some((url) => url.includes(URL_JSDELIVR))).toBe(true);
    expect(urls.some((url) => url.includes(URL_PAGES))).toBe(true);
  });
});

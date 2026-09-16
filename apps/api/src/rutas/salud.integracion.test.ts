// Tests de integracion del endpoint de salud, contra la base gestion_test real.
// Ver docs/guias/testing.md: nada de mocks de la base.

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RespuestaError } from "../errores/error-api.ts";
import {
  appDePrueba,
  type CuerpoSalud,
  clienteDePrueba,
  clienteHaciaBaseCaida,
  leerJson,
  ORIGEN_PERMITIDO,
} from "../pruebas/entorno-de-prueba.ts";

describe("GET /health con la base disponible", () => {
  let cliente: ClienteDb;
  let app: ReturnType<typeof appDePrueba>;

  beforeAll(() => {
    cliente = clienteDePrueba();
    app = appDePrueba(cliente);
  });

  afterAll(async () => {
    await cliente.cerrar();
  });

  it("responde 200 con el estado de la API y de la base", async () => {
    const respuesta = await app.request("/health");

    expect(respuesta.status).toBe(200);

    const cuerpo = await leerJson<CuerpoSalud>(respuesta);
    expect(cuerpo).toMatchObject({
      estado: "ok",
      base: { estado: "ok" },
    });
    expect(cuerpo.base?.duracionMs).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(Date.parse(cuerpo.tiempo ?? ""))).toBe(false);
  });

  it("no permite cachear la respuesta", async () => {
    const respuesta = await app.request("/health");

    expect(respuesta.headers.get("cache-control")).toBe("no-store");
  });

  it("devuelve un id de peticion distinto en cada llamada", async () => {
    const primera = await app.request("/health");
    const segunda = await app.request("/health");

    const idPrimera = primera.headers.get("x-request-id");
    const idSegunda = segunda.headers.get("x-request-id");

    expect(idPrimera).toBeTruthy();
    expect(idSegunda).toBeTruthy();
    expect(idPrimera).not.toBe(idSegunda);
  });

  it("aplica las cabeceras de seguridad", async () => {
    const respuesta = await app.request("/health");

    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
    expect(respuesta.headers.get("x-frame-options")).toBe("DENY");
    expect(respuesta.headers.get("referrer-policy")).toBe("no-referrer");
    expect(respuesta.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("habilita CORS solo para los origenes configurados", async () => {
    const permitida = await app.request("/health", {
      headers: { Origin: ORIGEN_PERMITIDO },
    });
    const ajena = await app.request("/health", {
      headers: { Origin: "https://sitio-ajeno.example" },
    });

    expect(permitida.headers.get("access-control-allow-origin")).toBe(ORIGEN_PERMITIDO);
    expect(ajena.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("responde en menos de 200 ms", async () => {
    // Objetivo de docs/guias/rendimiento.md. Con la base local es un margen amplio;
    // si esto empieza a fallar es señal de que algo se degradó.
    const inicio = performance.now();
    await app.request("/health");
    const duracion = performance.now() - inicio;

    expect(duracion).toBeLessThan(200);
  });
});

describe("GET /health con la base no disponible", () => {
  let cliente: ClienteDb;
  let app: ReturnType<typeof appDePrueba>;

  beforeAll(() => {
    cliente = clienteHaciaBaseCaida();
    app = appDePrueba(cliente);
  });

  afterAll(async () => {
    await cliente.cerrar();
  });

  it("responde 503 con el codigo BASE_NO_DISPONIBLE y el formato de error de la guia", async () => {
    const respuesta = await app.request("/health");

    expect(respuesta.status).toBe(503);

    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("BASE_NO_DISPONIBLE");
    expect(typeof cuerpo.error.mensaje).toBe("string");
    expect(cuerpo.error.mensaje.length).toBeGreaterThan(0);
    expect(cuerpo.error.idPeticion).toBe(respuesta.headers.get("x-request-id"));
  });

  it("no filtra detalles tecnicos ni credenciales en la respuesta", async () => {
    const respuesta = await app.request("/health");
    const texto = await respuesta.text();

    expect(texto).not.toMatch(/gestoria_base_inexistente/i);
    expect(texto).not.toMatch(/password|contrase/i);
    expect(texto).not.toMatch(/stack|at Object\.|node_modules/i);
    expect(texto).not.toMatch(/select 1/i);
  });

  it("no incluye el estado de la base cuando falla", async () => {
    const respuesta = await app.request("/health");
    const cuerpo = await leerJson<CuerpoSalud>(respuesta);

    expect(cuerpo.estado).toBeUndefined();
    expect(cuerpo.base).toBeUndefined();
  });
});

describe("rutas inexistentes", () => {
  let cliente: ClienteDb;
  let app: ReturnType<typeof appDePrueba>;

  beforeAll(() => {
    cliente = clienteDePrueba();
    app = appDePrueba(cliente);
  });

  afterAll(async () => {
    await cliente.cerrar();
  });

  it("responde 404 con el mismo formato de error", async () => {
    const respuesta = await app.request("/no-existe");

    expect(respuesta.status).toBe(404);

    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("NO_ENCONTRADO");
    expect(cuerpo.error.idPeticion).toBe(respuesta.headers.get("x-request-id"));
  });
});

// Tests de integración de los períodos, contra la base gestion_test real.

import type { ClienteDb } from "@gestoria/db";
import type { RespuestaError } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import {
  APERTURA_AMPLIA,
  abrirPeriodo,
  cerrarPeriodo,
  listarPeriodosPorApi,
  type PeriodoJson,
  pedirAbrirPeriodo,
  pedirCerrarPeriodo,
  pedirEliminarPeriodo,
  pedirReabrirPeriodo,
} from "../../pruebas/periodos-de-prueba.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
});

afterAll(async () => {
  await cliente.cerrar();
});

async function entrarComoUsuario(): Promise<string> {
  const datos = await registrarAprobado(app, cliente);
  return cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
}

/** Un usuario con categoría y cuenta listas, para poder cargar movimientos. */
async function prepararConMovimientos(): Promise<{
  cookies: string;
  cargar: (fecha: string, descripcion?: string) => Promise<Response>;
}> {
  const cookies = await entrarComoUsuario();
  const categorias = await leerJson<{ categorias: { id: number }[] }>(
    await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
  );
  const cuentas = await leerJson<{ cuentas: { id: string }[] }>(
    await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
  );

  return {
    cookies,
    cargar: async (fecha, descripcion = "Movimiento") =>
      app.request("/api/finanzas/movimientos", {
        method: "POST",
        headers: { cookie: cookies, "content-type": "application/json" },
        body: JSON.stringify({
          tipo: "gasto",
          importe: 10,
          descripcion,
          categoriaId: categorias.categorias[0]?.id,
          cuentaFinancieraId: cuentas.cuentas[0]?.id,
          fecha,
        }),
      }),
  };
}

function campoDelError(cuerpo: RespuestaError): string | undefined {
  return cuerpo.error.campos?.[0]?.campo;
}

describe("permisos de /api/finanzas/periodos", () => {
  it("responde 401 sin sesión", async () => {
    expect((await app.request("/api/finanzas/periodos")).status).toBe(401);
    expect(
      (
        await app.request("/api/finanzas/periodos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
    expect((await app.request("/api/finanzas/periodos/1/cerrar", { method: "POST" })).status).toBe(
      401,
    );
    expect((await app.request("/api/finanzas/periodos/1", { method: "PATCH" })).status).toBe(401);
  });
});

describe("POST /api/finanzas/periodos (abrir)", () => {
  it("abre un período con mes y año de la apertura como nombre", async () => {
    const cookies = await entrarComoUsuario();

    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-15T15:00:00.000Z" });

    expect(periodo.nombre).toBe("Marzo 2026");
    expect(periodo.abierto).toBe(true);
    expect(periodo.cierreEn).toBeNull();
    expect(periodo.aperturaEn).toBe("2026-03-15T15:00:00.000Z");
  });

  it("el nombre sugerido usa el mes en la zona horaria de la persona, no en UTC", async () => {
    const cookies = await entrarComoUsuario();

    // 01:00 UTC del 1/10 es todavía 30/09 en Montevideo (UTC-3).
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-10-01T01:00:00.000Z" });

    expect(periodo.nombre).toBe("Setiembre 2026");
  });

  it("sin cuerpo abre ahora, con el nombre del mes actual", async () => {
    const cookies = await entrarComoUsuario();
    const antes = Date.now();

    const respuesta = await app.request("/api/finanzas/periodos", {
      method: "POST",
      headers: { cookie: cookies },
    });

    expect(respuesta.status).toBe(201);
    const periodo = await leerJson<PeriodoJson>(respuesta);
    expect(periodo.abierto).toBe(true);
    expect(new Date(periodo.aperturaEn).getTime()).toBeGreaterThanOrEqual(antes - 1);
    expect(new Date(periodo.aperturaEn).getTime()).toBeLessThanOrEqual(Date.now());
    expect(periodo.nombre.length).toBeGreaterThan(0);
  });

  it("respeta el nombre que elige la persona y le recorta los espacios", async () => {
    const cookies = await entrarComoUsuario();

    const periodo = await abrirPeriodo(app, cookies, {
      nombre: "  Vacaciones  ",
      aperturaEn: "2026-03-01T00:00:00.000Z",
    });

    expect(periodo.nombre).toBe("Vacaciones");
  });

  it("agrega un número incremental al nombre sugerido cuando ya existe", async () => {
    const cookies = await entrarComoUsuario();

    const primero = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-03-10T12:00:00.000Z" });
    const segundo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-12T12:00:00.000Z" });
    await cerrarPeriodo(app, cookies, segundo.id, { cierreEn: "2026-03-20T12:00:00.000Z" });
    const tercero = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-22T12:00:00.000Z" });

    expect([primero.nombre, segundo.nombre, tercero.nombre]).toEqual([
      "Marzo 2026",
      "Marzo 2026 2",
      "Marzo 2026 3",
    ]);
  });

  it("rechaza abrir un período si ya hay uno abierto", async () => {
    const cookies = await entrarComoUsuario();
    await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });

    const respuesta = await pedirAbrirPeriodo(app, cookies, {
      aperturaEn: "2026-03-05T12:00:00.000Z",
    });

    expect(respuesta.status).toBe(409);
    expect((await leerJson<RespuestaError>(respuesta)).error.mensaje).toContain("período abierto");
    expect(await listarPeriodosPorApi(app, cookies)).toHaveLength(1);
  });

  it("dos aperturas simultáneas: una gana y la otra recibe un conflicto, nunca un error del servidor", async () => {
    const cookies = await entrarComoUsuario();

    // Las dos pasan la validación previa si se pisan; el índice único parcial
    // de la base decide, y el servicio lo traduce a un 409 claro.
    const respuestas = await Promise.all([
      pedirAbrirPeriodo(app, cookies, { nombre: "Uno", aperturaEn: "2026-03-01T12:00:00.000Z" }),
      pedirAbrirPeriodo(app, cookies, { nombre: "Dos", aperturaEn: "2026-03-01T12:00:00.000Z" }),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await listarPeriodosPorApi(app, cookies)).toHaveLength(1);
  });

  it("rechaza un nombre que ya existe, sin distinguir mayúsculas", async () => {
    const cookies = await entrarComoUsuario();
    const primero = await abrirPeriodo(app, cookies, {
      nombre: "Vacaciones",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-03-10T12:00:00.000Z" });

    const respuesta = await pedirAbrirPeriodo(app, cookies, {
      nombre: "vACACIONES",
      aperturaEn: "2026-03-12T12:00:00.000Z",
    });

    expect(respuesta.status).toBe(400);
    expect(campoDelError(await leerJson<RespuestaError>(respuesta))).toBe("nombre");
  });

  it("dos personas pueden usar el mismo nombre: la unicidad es por usuario", async () => {
    const primero = await entrarComoUsuario();
    const segundo = await entrarComoUsuario();

    const deUno = await abrirPeriodo(app, primero, { nombre: "Marzo" });
    const deOtro = await abrirPeriodo(app, segundo, { nombre: "Marzo" });

    expect(deUno.nombre).toBe("Marzo");
    expect(deOtro.nombre).toBe("Marzo");
  });

  it.each([
    ["vacío", { nombre: "   " }],
    ["de más de 40 caracteres", { nombre: "a".repeat(41) }],
    ["con apertura sin hora", { aperturaEn: "2026-03-01" }],
    ["con apertura inválida", { aperturaEn: "ayer" }],
  ])("rechaza un cuerpo inválido: %s", async (_caso, cuerpo) => {
    const cookies = await entrarComoUsuario();

    const respuesta = await pedirAbrirPeriodo(app, cookies, cuerpo);

    expect(respuesta.status).toBe(400);
  });

  it("rechaza una apertura en el futuro", async () => {
    const cookies = await entrarComoUsuario();
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const respuesta = await pedirAbrirPeriodo(app, cookies, { aperturaEn: manana });

    expect(respuesta.status).toBe(400);
    expect(campoDelError(await leerJson<RespuestaError>(respuesta))).toBe("aperturaEn");
  });

  it("rechaza una apertura que se solapa con un período anterior", async () => {
    const cookies = await entrarComoUsuario();
    const primero = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-03-31T12:00:00.000Z" });

    const respuesta = await pedirAbrirPeriodo(app, cookies, {
      aperturaEn: "2026-03-20T12:00:00.000Z",
    });

    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(campoDelError(cuerpo)).toBe("aperturaEn");
    // Dice con quién se solapa y qué día termina ese período (sin hora).
    expect(cuerpo.error.mensaje).toContain("Marzo");
    expect(cuerpo.error.mensaje).toContain("31/03/2026");
  });

  it("rechaza una apertura anterior al primer período aunque esté cerrado y haya hueco", async () => {
    const cookies = await entrarComoUsuario();
    const primero = await abrirPeriodo(app, cookies, { aperturaEn: "2026-05-01T12:00:00.000Z" });
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-05-31T12:00:00.000Z" });

    // Antes del primero: el nuevo no tiene cierre y abarcaría al de mayo.
    const respuesta = await pedirAbrirPeriodo(app, cookies, {
      aperturaEn: "2026-02-01T12:00:00.000Z",
    });

    expect(respuesta.status).toBe(400);
  });

  it("permite que el siguiente abra justo en el instante en que cerró el anterior", async () => {
    const cookies = await entrarComoUsuario();
    const primero = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-03-31T12:00:00.000Z" });

    const segundo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-31T12:00:00.000Z" });

    expect(segundo.abierto).toBe(true);
  });

  it("permite huecos entre períodos", async () => {
    const cookies = await entrarComoUsuario();
    const primero = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-03-31T12:00:00.000Z" });

    const segundo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-05-01T12:00:00.000Z" });

    expect(segundo.abierto).toBe(true);
    expect(await listarPeriodosPorApi(app, cookies)).toHaveLength(2);
  });
});

describe("POST /api/finanzas/periodos/:id/cerrar", () => {
  it("cierra ahora por defecto", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: APERTURA_AMPLIA });
    const antes = Date.now();

    const cerrado = await cerrarPeriodo(app, cookies, periodo.id);

    expect(cerrado.abierto).toBe(false);
    expect(new Date(cerrado.cierreEn ?? 0).getTime()).toBeGreaterThanOrEqual(antes - 1);
    expect(new Date(cerrado.cierreEn ?? 0).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("cierra en la fecha y hora elegidas", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });

    const cerrado = await cerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-20T18:45:00.000Z",
    });

    expect(cerrado.cierreEn).toBe("2026-03-20T18:45:00.000Z");
  });

  it("responde 404 si el período no existe", async () => {
    const cookies = await entrarComoUsuario();

    expect((await pedirCerrarPeriodo(app, cookies, 999_999)).status).toBe(404);
  });

  it("responde 404 y no cierra el período de otra persona", async () => {
    const dueno = await entrarComoUsuario();
    const intruso = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, dueno, { aperturaEn: "2026-03-01T12:00:00.000Z" });

    const respuesta = await pedirCerrarPeriodo(app, intruso, periodo.id);

    expect(respuesta.status).toBe(404);
    expect((await listarPeriodosPorApi(app, dueno))[0]?.abierto).toBe(true);
  });

  it("rechaza un id que no es un número", async () => {
    const cookies = await entrarComoUsuario();

    const respuesta = await app.request("/api/finanzas/periodos/abc/cerrar", {
      method: "POST",
      headers: { cookie: cookies },
    });

    expect(respuesta.status).toBeGreaterThanOrEqual(400);
    expect(respuesta.status).toBeLessThan(500);
  });

  it("rechaza cerrar un período que ya está cerrado, sin cambiarle el cierre", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cerrarPeriodo(app, cookies, periodo.id, { cierreEn: "2026-03-10T12:00:00.000Z" });

    const respuesta = await pedirCerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-20T12:00:00.000Z",
    });

    expect(respuesta.status).toBe(409);
    expect((await listarPeriodosPorApi(app, cookies))[0]?.cierreEn).toBe(
      "2026-03-10T12:00:00.000Z",
    );
  });

  it("rechaza un cierre en el futuro", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: APERTURA_AMPLIA });
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const respuesta = await pedirCerrarPeriodo(app, cookies, periodo.id, { cierreEn: manana });

    expect(respuesta.status).toBe(400);
    expect(campoDelError(await leerJson<RespuestaError>(respuesta))).toBe("cierreEn");
  });

  it("rechaza un cierre anterior o igual a la apertura", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-10T12:00:00.000Z" });

    const anterior = await pedirCerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-09T12:00:00.000Z",
    });
    const igual = await pedirCerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-10T12:00:00.000Z",
    });

    expect(anterior.status).toBe(400);
    expect(igual.status).toBe(400);
    expect((await listarPeriodosPorApi(app, cookies))[0]?.abierto).toBe(true);
  });

  it("rechaza un cierre sin hora", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: APERTURA_AMPLIA });

    const respuesta = await pedirCerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-10",
    });

    expect(respuesta.status).toBe(400);
  });

  it("rechaza un cierre que dejaría movimientos por fuera, y dice cuántos y hasta cuándo", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cargar("2026-03-10T12:00:00.000Z");
    await cargar("2026-03-20T12:00:00.000Z");

    const respuesta = await pedirCerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-15T12:00:00.000Z",
    });

    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(campoDelError(cuerpo)).toBe("cierreEn");
    expect(cuerpo.error.mensaje).toContain("1 movimiento");
    // 12:00 UTC es 09:00 en Montevideo.
    expect(cuerpo.error.mensaje).toContain("20/03/2026 09:00");
    expect((await listarPeriodosPorApi(app, cookies))[0]?.abierto).toBe(true);
  });

  it("un movimiento justo en el instante de cierre queda por fuera: el cierre no se incluye", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cargar("2026-03-10T12:00:00.000Z");

    const igual = await pedirCerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-10T12:00:00.000Z",
    });
    const unInstanteDespues = await pedirCerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-10T12:00:00.001Z",
    });

    expect(igual.status).toBe(400);
    expect(unInstanteDespues.status).toBe(200);
  });

  it("los movimientos eliminados no impiden cerrar", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    const creado = await leerJson<{ id: string }>(await cargar("2026-03-20T12:00:00.000Z"));
    await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "DELETE",
      headers: { cookie: cookies },
    });

    const respuesta = await pedirCerrarPeriodo(app, cookies, periodo.id, {
      cierreEn: "2026-03-15T12:00:00.000Z",
    });

    expect(respuesta.status).toBe(200);
  });

  it("después de cerrar se puede abrir el siguiente en el mismo instante, y los movimientos quedan en su período", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const primero = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    const enPrimero = await leerJson<{ periodoId: number }>(
      await cargar("2026-03-10T12:00:00.000Z"),
    );
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-03-15T12:00:00.000Z" });
    const segundo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-15T12:00:00.000Z" });
    // Justo en la frontera: pertenece al que abre ahí, no al que cierra.
    const enFrontera = await leerJson<{ periodoId: number }>(
      await cargar("2026-03-15T12:00:00.000Z"),
    );

    expect(enPrimero.periodoId).toBe(primero.id);
    expect(enFrontera.periodoId).toBe(segundo.id);
  });
});

describe("PATCH /api/finanzas/periodos/:id (renombrar)", () => {
  async function renombrar(cookies: string, id: number, cuerpo: unknown) {
    return app.request(`/api/finanzas/periodos/${id}`, {
      method: "PATCH",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  }

  it("cambia el nombre sin tocar los movimientos, que siguen en el mismo período", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: APERTURA_AMPLIA });
    const movimiento = await leerJson<{ id: string; periodoId: number }>(
      await cargar("2026-03-10T12:00:00.000Z"),
    );

    const respuesta = await renombrar(cookies, periodo.id, { nombre: "Primer semestre" });

    expect(respuesta.status).toBe(200);
    const renombrado = await leerJson<PeriodoJson>(respuesta);
    expect(renombrado.nombre).toBe("Primer semestre");
    expect(renombrado.id).toBe(periodo.id);

    const listado = await leerJson<{ movimientos: { id: string; periodoId: number }[] }>(
      await app.request(`/api/finanzas/movimientos?periodoId=${periodo.id}`, {
        headers: { cookie: cookies },
      }),
    );
    expect(listado.movimientos).toEqual([
      expect.objectContaining({ id: movimiento.id, periodoId: periodo.id }),
    ]);
  });

  it("deja cambiar solo las mayúsculas del propio nombre", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, { nombre: "vacaciones" });

    const respuesta = await renombrar(cookies, periodo.id, { nombre: "Vacaciones" });

    expect(respuesta.status).toBe(200);
  });

  it("rechaza el nombre de otro período propio, sin distinguir mayúsculas", async () => {
    const cookies = await entrarComoUsuario();
    const primero = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-03-10T12:00:00.000Z" });
    const segundo = await abrirPeriodo(app, cookies, {
      nombre: "Abril",
      aperturaEn: "2026-04-01T12:00:00.000Z",
    });

    const respuesta = await renombrar(cookies, segundo.id, { nombre: "MARZO" });

    expect(respuesta.status).toBe(400);
    expect(campoDelError(await leerJson<RespuestaError>(respuesta))).toBe("nombre");
  });

  it("permite usar un nombre que tiene otra persona", async () => {
    const primero = await entrarComoUsuario();
    const segundo = await entrarComoUsuario();
    await abrirPeriodo(app, primero, { nombre: "Marzo" });
    const deOtro = await abrirPeriodo(app, segundo, { nombre: "Abril" });

    expect((await renombrar(segundo, deOtro.id, { nombre: "Marzo" })).status).toBe(200);
  });

  it.each([{ nombre: "   " }, { nombre: "a".repeat(41) }, {}])(
    "rechaza un nombre inválido: %j",
    async (cuerpo) => {
      const cookies = await entrarComoUsuario();
      const periodo = await abrirPeriodo(app, cookies);

      expect((await renombrar(cookies, periodo.id, cuerpo)).status).toBe(400);
    },
  );

  it("responde 404 con un período inexistente o de otra persona, y no lo modifica", async () => {
    const dueno = await entrarComoUsuario();
    const intruso = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, dueno, { nombre: "Mío" });

    expect((await renombrar(intruso, periodo.id, { nombre: "Robado" })).status).toBe(404);
    expect((await renombrar(dueno, 999_999, { nombre: "Nada" })).status).toBe(404);
    expect((await listarPeriodosPorApi(app, dueno))[0]?.nombre).toBe("Mío");
  });
});

describe("GET /api/finanzas/periodos", () => {
  it("lista del más nuevo al más viejo y marca cuál está abierto", async () => {
    const cookies = await entrarComoUsuario();
    const primero = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cerrarPeriodo(app, cookies, primero.id, { cierreEn: "2026-03-31T12:00:00.000Z" });
    await abrirPeriodo(app, cookies, { aperturaEn: "2026-04-01T12:00:00.000Z" });

    const periodos = await listarPeriodosPorApi(app, cookies);

    expect(periodos.map((p) => [p.nombre, p.abierto])).toEqual([
      ["Abril 2026", true],
      ["Marzo 2026", false],
    ]);
  });

  it("está vacío para quien todavía no abrió ninguno", async () => {
    const cookies = await entrarComoUsuario();

    expect(await listarPeriodosPorApi(app, cookies)).toEqual([]);
  });

  it("no incluye los períodos de otra persona", async () => {
    const primero = await entrarComoUsuario();
    const segundo = await entrarComoUsuario();
    await abrirPeriodo(app, primero);

    expect(await listarPeriodosPorApi(app, segundo)).toEqual([]);
  });

  it("el identificador es un número y el nombre no es la identidad", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, { nombre: "Uno" });

    expect(Number.isInteger(periodo.id)).toBe(true);
    expect(typeof periodo.id).toBe("number");
  });
});

describe("POST /api/finanzas/periodos/:id/reabrir", () => {
  it("reabre un período cerrado: vuelve a estar abierto, con su nombre y apertura", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cerrarPeriodo(app, cookies, periodo.id, { cierreEn: "2026-03-31T12:00:00.000Z" });

    const respuesta = await pedirReabrirPeriodo(app, cookies, periodo.id);

    expect(respuesta.status).toBe(200);
    const reabierto = await leerJson<PeriodoJson>(respuesta);
    expect(reabierto).toMatchObject({
      id: periodo.id,
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
      cierreEn: null,
      abierto: true,
    });
    expect((await listarPeriodosPorApi(app, cookies)).map((p) => p.abierto)).toEqual([true]);
  });

  it("conserva los movimientos del período y vuelve a admitir otros nuevos", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cargar("2026-03-10T12:00:00.000Z", "Viejo");
    await cerrarPeriodo(app, cookies, periodo.id, { cierreEn: "2026-03-20T12:00:00.000Z" });
    // Con el período cerrado, una fecha posterior al cierre no tiene dónde caer.
    expect((await cargar("2026-03-25T12:00:00.000Z")).status).toBe(400);

    await pedirReabrirPeriodo(app, cookies, periodo.id);

    expect((await cargar("2026-03-25T12:00:00.000Z", "Nuevo")).status).toBe(201);
    const movimientos = await cliente.db.query.movimientos.findMany();
    expect(movimientos.map((m) => m.descripcion).sort()).toEqual(["Nuevo", "Viejo"]);
    expect(new Set(movimientos.map((m) => m.periodoId))).toEqual(new Set([periodo.id]));
  });

  it("rechaza (409) reabrir si ya hay otro período abierto, sin cambiar nada", async () => {
    const cookies = await entrarComoUsuario();
    const marzo = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cerrarPeriodo(app, cookies, marzo.id, { cierreEn: "2026-04-01T12:00:00.000Z" });
    await abrirPeriodo(app, cookies, { nombre: "Abril", aperturaEn: "2026-04-01T12:00:00.000Z" });

    const respuesta = await pedirReabrirPeriodo(app, cookies, marzo.id);

    expect(respuesta.status).toBe(409);
    expect((await listarPeriodosPorApi(app, cookies)).map((p) => [p.nombre, p.abierto])).toEqual([
      ["Abril", true],
      ["Marzo", false],
    ]);
  });

  it("rechaza (409) reabrir uno que no es el último: pisaría al período que sigue", async () => {
    const cookies = await entrarComoUsuario();
    const marzo = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cerrarPeriodo(app, cookies, marzo.id, { cierreEn: "2026-04-01T12:00:00.000Z" });
    const abril = await abrirPeriodo(app, cookies, {
      nombre: "Abril",
      aperturaEn: "2026-04-01T12:00:00.000Z",
    });
    await cerrarPeriodo(app, cookies, abril.id, { cierreEn: "2026-05-01T12:00:00.000Z" });

    const respuesta = await pedirReabrirPeriodo(app, cookies, marzo.id);

    expect(respuesta.status).toBe(409);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.mensaje).toContain("Abril");
    // El último sí se puede reabrir.
    expect((await pedirReabrirPeriodo(app, cookies, abril.id)).status).toBe(200);
  });

  it("rechaza (409) reabrir un período que ya está abierto", async () => {
    const cookies = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, cookies);

    expect((await pedirReabrirPeriodo(app, cookies, periodo.id)).status).toBe(409);
  });

  it("responde 404 con un período inexistente o de otra persona, y no lo modifica", async () => {
    const dueno = await entrarComoUsuario();
    const otra = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, dueno, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cerrarPeriodo(app, dueno, periodo.id, { cierreEn: "2026-03-31T12:00:00.000Z" });

    expect((await pedirReabrirPeriodo(app, otra, periodo.id)).status).toBe(404);
    expect((await pedirReabrirPeriodo(app, dueno, 999999)).status).toBe(404);
    expect((await listarPeriodosPorApi(app, dueno))[0]?.abierto).toBe(false);
  });

  it("rechaza un id que no es un número y pide sesión", async () => {
    const cookies = await entrarComoUsuario();

    expect((await pedirReabrirPeriodo(app, cookies, Number.NaN)).status).toBe(400);
    expect((await app.request("/api/finanzas/periodos/1/reabrir", { method: "POST" })).status).toBe(
      401,
    );
  });
});

describe("DELETE /api/finanzas/periodos/:id (eliminar)", () => {
  type CuentaJson = { id: string; nombre: string; saldoCentavos: number };

  async function saldos(cookies: string): Promise<Record<string, number>> {
    const cuerpo = await leerJson<{ cuentas: CuentaJson[] }>(
      await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
    );
    return Object.fromEntries(cuerpo.cuentas.map((c) => [c.nombre, c.saldoCentavos]));
  }

  async function pedirJsonCon(cookies: string, ruta: string, metodo: string, cuerpo: unknown) {
    return app.request(ruta, {
      method: metodo,
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  }

  it("elimina un período sin movimientos, abierto o cerrado", async () => {
    const cookies = await entrarComoUsuario();
    const marzo = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cerrarPeriodo(app, cookies, marzo.id, { cierreEn: "2026-04-01T12:00:00.000Z" });
    const abril = await abrirPeriodo(app, cookies, {
      nombre: "Abril",
      aperturaEn: "2026-04-01T12:00:00.000Z",
    });

    const primera = await pedirEliminarPeriodo(app, cookies, abril.id);
    expect(primera.status).toBe(200);
    expect(await leerJson(primera)).toEqual({ ok: true, movimientosEliminados: 0 });
    expect((await pedirEliminarPeriodo(app, cookies, marzo.id)).status).toBe(200);

    expect(await listarPeriodosPorApi(app, cookies)).toEqual([]);
  });

  it("con movimientos también lo elimina, y se lleva todos sus movimientos", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await cargar("2026-03-10T12:00:00.000Z");
    await cargar("2026-03-11T12:00:00.000Z");

    const respuesta = await pedirEliminarPeriodo(app, cookies, periodo.id);

    expect(respuesta.status).toBe(200);
    expect(await leerJson(respuesta)).toEqual({ ok: true, movimientosEliminados: 2 });
    expect(await listarPeriodosPorApi(app, cookies)).toEqual([]);
    expect(await cliente.db.query.movimientos.findMany()).toEqual([]);
  });

  it("los movimientos ya eliminados se borran con el período pero no se cuentan", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    const creado = await leerJson<{ id: string }>(await cargar("2026-03-10T12:00:00.000Z"));
    await cargar("2026-03-11T12:00:00.000Z");
    await app.request(`/api/finanzas/movimientos/${creado.id}`, {
      method: "DELETE",
      headers: { cookie: cookies },
    });

    const respuesta = await pedirEliminarPeriodo(app, cookies, periodo.id);

    expect(await leerJson(respuesta)).toEqual({ ok: true, movimientosEliminados: 1 });
    expect(await cliente.db.query.movimientos.findMany()).toEqual([]);
  });

  it("no toca los movimientos de otros períodos", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const marzo = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cargar("2026-03-10T12:00:00.000Z", "De marzo");
    await cerrarPeriodo(app, cookies, marzo.id, { cierreEn: "2026-04-01T12:00:00.000Z" });
    const abril = await abrirPeriodo(app, cookies, {
      nombre: "Abril",
      aperturaEn: "2026-04-01T12:00:00.000Z",
    });
    await cargar("2026-04-10T12:00:00.000Z", "De abril");

    expect((await pedirEliminarPeriodo(app, cookies, abril.id)).status).toBe(200);

    expect((await listarPeriodosPorApi(app, cookies)).map((p) => p.nombre)).toEqual(["Marzo"]);
    const quedan = await cliente.db.query.movimientos.findMany();
    expect(quedan.map((m) => m.descripcion)).toEqual(["De marzo"]);
  });

  it("el saldo de las cuentas vuelve a lo que era sin esos movimientos (gastos, ingresos y ajustes aparte)", async () => {
    const cookies = await entrarComoUsuario();
    const categorias = await leerJson<{ categorias: { id: number; sistema: string | null }[] }>(
      await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
    );
    const categoriaId = categorias.categorias.find((c) => c.sistema === null)?.id;
    const cuentas = await leerJson<{ cuentas: CuentaJson[] }>(
      await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
    );
    const efectivo = cuentas.cuentas.find((c) => c.nombre === "Efectivo");
    const banco = cuentas.cuentas.find((c) => c.nombre === "Banco");
    if (!efectivo || !banco) throw new Error("Faltan las cuentas por defecto");

    const marzo = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    const cargar = (cuerpo: object) =>
      pedirJsonCon(cookies, "/api/finanzas/movimientos", "POST", {
        descripcion: "Mov",
        categoriaId,
        fecha: "2026-03-10T12:00:00.000Z",
        ...cuerpo,
      });
    // Antes: Efectivo 0, Banco 0. Se ajusta Banco a 500 (un ajuste manual, no un movimiento).
    await pedirJsonCon(cookies, `/api/finanzas/cuentas/${banco.id}/ajustar-saldo`, "POST", {
      saldo: 500,
    });
    const antes = await saldos(cookies);
    expect(antes).toMatchObject({ Efectivo: 0, Banco: 50000 });

    await cargar({ tipo: "ingreso", importe: 300, cuentaFinancieraId: efectivo.id });
    await cargar({ tipo: "gasto", importe: 120.5, cuentaFinancieraId: banco.id });
    expect(await saldos(cookies)).toMatchObject({ Efectivo: 30000, Banco: 50000 - 12050 });

    const respuesta = await pedirEliminarPeriodo(app, cookies, marzo.id);

    expect(respuesta.status).toBe(200);
    // El ajuste manual no pertenece al período: se conserva, y los movimientos se revierten.
    expect(await saldos(cookies)).toMatchObject({ Efectivo: 0, Banco: 50000 });
  });

  it("una transferencia eliminada se revierte en las dos cuentas a la vez", async () => {
    const cookies = await entrarComoUsuario();
    const categorias = await leerJson<{ categorias: { id: number; sistema: string | null }[] }>(
      await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
    );
    const transferenciaId = categorias.categorias.find((c) => c.sistema === "transferencia")?.id;
    const cuentas = await leerJson<{ cuentas: CuentaJson[] }>(
      await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
    );
    const efectivo = cuentas.cuentas.find((c) => c.nombre === "Efectivo");
    const banco = cuentas.cuentas.find((c) => c.nombre === "Banco");
    if (!efectivo || !banco) throw new Error("Faltan las cuentas por defecto");
    const marzo = await abrirPeriodo(app, cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });

    const creada = await pedirJsonCon(cookies, "/api/finanzas/movimientos", "POST", {
      tipo: "neutro",
      importe: 80,
      descripcion: "Pasaje",
      categoriaId: transferenciaId,
      cuentaFinancieraId: banco.id,
      cuentaDestinoId: efectivo.id,
      fecha: "2026-03-10T12:00:00.000Z",
    });
    expect(creada.status).toBe(201);
    expect(await saldos(cookies)).toMatchObject({ Efectivo: 8000, Banco: -8000 });

    await pedirEliminarPeriodo(app, cookies, marzo.id);

    expect(await saldos(cookies)).toMatchObject({ Efectivo: 0, Banco: 0 });
  });

  it("el listado dice cuántos movimientos tiene cada período (sin contar los eliminados)", async () => {
    const { cookies, cargar } = await prepararConMovimientos();
    const marzo = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cargar("2026-03-10T12:00:00.000Z");
    const borrado = await leerJson<{ id: string }>(await cargar("2026-03-11T12:00:00.000Z"));
    await app.request(`/api/finanzas/movimientos/${borrado.id}`, {
      method: "DELETE",
      headers: { cookie: cookies },
    });
    await cerrarPeriodo(app, cookies, marzo.id, { cierreEn: "2026-04-01T12:00:00.000Z" });
    await abrirPeriodo(app, cookies, { nombre: "Abril", aperturaEn: "2026-04-01T12:00:00.000Z" });

    const listado = (await listarPeriodosPorApi(app, cookies)) as (PeriodoJson & {
      cantidadMovimientos: number;
    })[];

    expect(listado.map((p) => [p.nombre, p.cantidadMovimientos])).toEqual([
      ["Abril", 0],
      ["Marzo", 1],
    ]);
  });

  it("el listado no cuenta los movimientos de otra persona", async () => {
    const primero = await prepararConMovimientos();
    await abrirPeriodo(app, primero.cookies, { aperturaEn: "2026-03-01T12:00:00.000Z" });
    await primero.cargar("2026-03-10T12:00:00.000Z");
    const segundo = await entrarComoUsuario();
    await abrirPeriodo(app, segundo, { aperturaEn: "2026-03-01T12:00:00.000Z" });

    const listado = (await listarPeriodosPorApi(app, segundo)) as (PeriodoJson & {
      cantidadMovimientos: number;
    })[];

    expect(listado[0]?.cantidadMovimientos).toBe(0);
  });

  it("al eliminar el período abierto, el anterior vuelve a ser el último y se puede reabrir", async () => {
    const cookies = await entrarComoUsuario();
    const marzo = await abrirPeriodo(app, cookies, {
      nombre: "Marzo",
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await cerrarPeriodo(app, cookies, marzo.id, { cierreEn: "2026-04-01T12:00:00.000Z" });
    const abril = await abrirPeriodo(app, cookies, {
      nombre: "Abril",
      aperturaEn: "2026-04-01T12:00:00.000Z",
    });
    await pedirEliminarPeriodo(app, cookies, abril.id);

    expect((await pedirReabrirPeriodo(app, cookies, marzo.id)).status).toBe(200);
  });

  it("el nombre de un período eliminado queda libre", async () => {
    const cookies = await entrarComoUsuario();
    const abril = await abrirPeriodo(app, cookies, { nombre: "Abril" });
    await pedirEliminarPeriodo(app, cookies, abril.id);

    expect((await pedirAbrirPeriodo(app, cookies, { nombre: "Abril" })).status).toBe(201);
  });

  it("responde 404 con un período inexistente o de otra persona, y no toca sus movimientos", async () => {
    const dueno = await prepararConMovimientos();
    const otra = await entrarComoUsuario();
    const periodo = await abrirPeriodo(app, dueno.cookies, {
      aperturaEn: "2026-03-01T12:00:00.000Z",
    });
    await dueno.cargar("2026-03-10T12:00:00.000Z");

    expect((await pedirEliminarPeriodo(app, otra, periodo.id)).status).toBe(404);
    expect((await pedirEliminarPeriodo(app, dueno.cookies, 999999)).status).toBe(404);
    expect(await listarPeriodosPorApi(app, dueno.cookies)).toHaveLength(1);
    expect(await cliente.db.query.movimientos.findMany()).toHaveLength(1);
  });

  it("rechaza un id que no es un número y pide sesión", async () => {
    const cookies = await entrarComoUsuario();

    expect((await pedirEliminarPeriodo(app, cookies, Number.NaN)).status).toBe(400);
    expect((await app.request("/api/finanzas/periodos/1", { method: "DELETE" })).status).toBe(401);
  });
});

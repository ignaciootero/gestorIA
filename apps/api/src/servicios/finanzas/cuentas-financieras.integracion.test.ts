// Tests de integración de las cuentas: ajustes manuales de saldo, ocultar,
// eliminar y el historial. Contra la base gestion_test real.

import type { ClienteDb } from "@gestoria/db";
import { IMPORTE_MAXIMO, type RespuestaError } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { abrirPeriodoAmplio } from "../../pruebas/periodos-de-prueba.ts";

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

type CuentaJson = {
  id: string;
  nombre: string;
  saldoInicialCentavos: number;
  saldoCentavos: number;
  oculta: boolean;
  tieneMovimientos: boolean;
};

type ItemJson = {
  origen: "movimiento" | "ajuste" | "saldo_inicial";
  id: string;
  fecha: string;
  montoCentavos: number;
  tipo?: string;
  descripcion?: string;
  categoria?: { nombre: string; color: string };
  periodo?: { nombre: string };
  saldoIndicadoCentavos?: number;
};

type Entorno = {
  cookies: string;
  categoriaId: number;
  /** Una cuenta recién creada (saldo inicial 0), sin movimientos. */
  cuenta: CuentaJson;
};

async function entrarComoUsuario(): Promise<string> {
  const datos = await registrarAprobado(app, cliente);
  return cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
}

function pedir(cookies: string, ruta: string, metodo = "GET", cuerpo?: unknown) {
  return app.request(ruta, {
    method: metodo,
    headers: {
      cookie: cookies,
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

async function crearCuenta(cookies: string, nombre: string, saldoInicial = 0): Promise<CuentaJson> {
  return leerJson<CuentaJson>(
    await pedir(cookies, "/api/finanzas/cuentas", "POST", { nombre, saldoInicial }),
  );
}

async function listarCuentas(cookies: string): Promise<CuentaJson[]> {
  return (await leerJson<{ cuentas: CuentaJson[] }>(await pedir(cookies, "/api/finanzas/cuentas")))
    .cuentas;
}

/** Entra, abre un período amplio y crea una cuenta propia ("Ahorros") para trabajar sobre ella. */
async function prepararEntorno(): Promise<Entorno> {
  const cookies = await entrarComoUsuario();
  await abrirPeriodoAmplio(app, cookies, "Amplio");
  const categorias = await leerJson<{ categorias: { id: number }[] }>(
    await pedir(cookies, "/api/finanzas/categorias"),
  );
  return {
    cookies,
    categoriaId: categorias.categorias[0]?.id ?? 0,
    cuenta: await crearCuenta(cookies, "Ahorros"),
  };
}

function cargarMovimiento(
  entorno: Pick<Entorno, "cookies" | "categoriaId">,
  cuentaId: string,
  datos: { tipo?: "ingreso" | "gasto"; importe: number; fecha?: string; descripcion?: string },
) {
  return pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
    tipo: "gasto",
    descripcion: "Movimiento",
    fecha: "2026-03-10T12:00:00.000Z",
    categoriaId: entorno.categoriaId,
    cuentaFinancieraId: cuentaId,
    ...datos,
  });
}

function ajustar(cookies: string, cuentaId: string, cuerpo: unknown) {
  return pedir(cookies, `/api/finanzas/cuentas/${cuentaId}/ajustar-saldo`, "POST", cuerpo);
}

async function historial(cookies: string, cuentaId: string, consulta = "") {
  return leerJson<{ items: ItemJson[]; total: number }>(
    await pedir(cookies, `/api/finanzas/cuentas/${cuentaId}/historial${consulta}`),
  );
}

describe("permisos de las rutas nuevas de cuentas", () => {
  it("responden 401 sin sesión", async () => {
    const id = "00000000-0000-0000-0000-000000000000";
    for (const [metodo, ruta] of [
      ["POST", `/api/finanzas/cuentas/${id}/ajustar-saldo`],
      ["POST", `/api/finanzas/cuentas/${id}/ocultar`],
      ["POST", `/api/finanzas/cuentas/${id}/mostrar`],
      ["GET", `/api/finanzas/cuentas/${id}/historial`],
    ] as const) {
      expect((await app.request(ruta, { method: metodo })).status).toBe(401);
    }
  });
});

describe("POST /api/finanzas/cuentas/:id/ajustar-saldo", () => {
  it("fija el saldo indicado y guarda la diferencia como un ajuste", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 3000 });

    expect(respuesta.status).toBe(201);
    const ajuste = await leerJson<{
      id: string;
      saldoIndicadoCentavos: number;
      diferenciaCentavos: number;
      fecha: string;
    }>(respuesta);
    expect(ajuste.saldoIndicadoCentavos).toBe(300_000);
    expect(ajuste.diferenciaCentavos).toBe(300_000);
    expect(Math.abs(new Date(ajuste.fecha).getTime() - Date.now())).toBeLessThan(10_000);

    const cuenta = (await listarCuentas(entorno.cookies)).find((c) => c.id === entorno.cuenta.id);
    expect(cuenta?.saldoCentavos).toBe(300_000);
    // El saldo inicial (fijado al crear) no se toca: el ajuste es aparte.
    expect(cuenta?.saldoInicialCentavos).toBe(0);
  });

  it("la diferencia se calcula contra el saldo que la cuenta mostraba (inicial + movimientos + ajustes previos)", async () => {
    const cookies = await entrarComoUsuario();
    await abrirPeriodoAmplio(app, cookies);
    const categorias = await leerJson<{ categorias: { id: number }[] }>(
      await pedir(cookies, "/api/finanzas/categorias"),
    );
    const entorno = { cookies, categoriaId: categorias.categorias[0]?.id ?? 0 };
    const cuenta = await crearCuenta(cookies, "Banco", 100);
    await cargarMovimiento(entorno, cuenta.id, { tipo: "ingreso", importe: 50 });
    await cargarMovimiento(entorno, cuenta.id, { tipo: "gasto", importe: 20 });
    // Saldo mostrado: 100 + 50 - 20 = 130.

    const primero = await leerJson<{ diferenciaCentavos: number }>(
      await ajustar(cookies, cuenta.id, { saldo: 300 }),
    );
    const segundo = await leerJson<{ diferenciaCentavos: number }>(
      await ajustar(cookies, cuenta.id, { saldo: 250 }),
    );

    expect(primero.diferenciaCentavos).toBe(17_000); // 300 - 130
    expect(segundo.diferenciaCentavos).toBe(-5_000); // 250 - 300
    const actual = (await listarCuentas(cookies)).find((c) => c.id === cuenta.id);
    expect(actual?.saldoCentavos).toBe(25_000);
  });

  it("no genera ningún movimiento ni cambia los totales del período, pero sí el disponible", async () => {
    const entorno = await prepararEntorno();
    const periodos = await leerJson<{ periodos: { id: number }[] }>(
      await pedir(entorno.cookies, "/api/finanzas/periodos"),
    );
    const periodoId = periodos.periodos[0]?.id;
    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 3000 });

    const movimientos = await leerJson<{ total: number }>(
      await pedir(entorno.cookies, "/api/finanzas/movimientos"),
    );
    const resumen = await leerJson<{
      ingresosCentavos: number;
      gastosCentavos: number;
      balanceCentavos: number;
      disponibleCentavos: number;
      ultimosMovimientos: unknown[];
    }>(await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${periodoId}`));

    expect(movimientos.total).toBe(0);
    expect(resumen).toMatchObject({
      ingresosCentavos: 0,
      gastosCentavos: 0,
      balanceCentavos: 0,
      disponibleCentavos: 300_000,
    });
    expect(resumen.ultimosMovimientos).toEqual([]);
  });

  it("acepta cero y un saldo negativo (una deuda)", async () => {
    const entorno = await prepararEntorno();
    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 100 });

    const aCero = await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 0 });
    const negativo = await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: -250.5 });

    expect(aCero.status).toBe(201);
    expect(negativo.status).toBe(201);
    const cuenta = (await listarCuentas(entorno.cookies)).find((c) => c.id === entorno.cuenta.id);
    expect(cuenta?.saldoCentavos).toBe(-25_050);
  });

  it("redondea a centésimos sin errores de punto flotante", async () => {
    const entorno = await prepararEntorno();

    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 1234.56 });

    const cuenta = (await listarCuentas(entorno.cookies)).find((c) => c.id === entorno.cuenta.id);
    expect(cuenta?.saldoCentavos).toBe(123_456);
  });

  it("los movimientos cargados después mueven el saldo a partir del ajuste", async () => {
    const entorno = await prepararEntorno();
    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 1000 });

    await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 150 });

    const cuenta = (await listarCuentas(entorno.cookies)).find((c) => c.id === entorno.cuenta.id);
    expect(cuenta?.saldoCentavos).toBe(85_000);
  });

  it("rechaza un saldo igual al actual: no hay nada que ajustar", async () => {
    const entorno = await prepararEntorno();
    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 500 });

    const respuesta = await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 500 });

    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.campos?.[0]?.campo).toBe("saldo");
    expect((await historial(entorno.cookies, entorno.cuenta.id)).total).toBe(1);
  });

  it("una cuenta nueva con saldo 0 tampoco admite ajustar a 0", async () => {
    const entorno = await prepararEntorno();

    expect((await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 0 })).status).toBe(400);
  });

  it.each([
    ["sin saldo", {}],
    ["texto", { saldo: "mucho" }],
    ["demasiado grande", { saldo: IMPORTE_MAXIMO + 1 }],
    ["demasiado negativo", { saldo: -IMPORTE_MAXIMO - 1 }],
  ])("rechaza un saldo inválido: %s", async (_caso, cuerpo) => {
    const entorno = await prepararEntorno();

    const respuesta = await ajustar(entorno.cookies, entorno.cuenta.id, cuerpo);

    expect(respuesta.status).toBe(400);
    expect((await historial(entorno.cookies, entorno.cuenta.id)).total).toBe(0);
  });

  it("responde 404 con una cuenta inexistente o de otra persona, y no registra nada", async () => {
    const dueno = await prepararEntorno();
    const intruso = await entrarComoUsuario();

    const ajena = await ajustar(intruso, dueno.cuenta.id, { saldo: 999 });
    const inexistente = await ajustar(dueno.cookies, "00000000-0000-0000-0000-000000000000", {
      saldo: 1,
    });

    expect(ajena.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect((await historial(dueno.cookies, dueno.cuenta.id)).total).toBe(0);
  });

  it("responde 404 con una cuenta eliminada", async () => {
    const entorno = await prepararEntorno();
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}`, "DELETE");

    expect((await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 5 })).status).toBe(404);
  });

  it("se puede ajustar una cuenta oculta", async () => {
    const entorno = await prepararEntorno();
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}/ocultar`, "POST");

    expect((await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 70 })).status).toBe(201);
  });
});

describe("ocultar y mostrar una cuenta", () => {
  it("la oculta sin perder saldo ni historial, y sigue sumando al disponible", async () => {
    const entorno = await prepararEntorno();
    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 400 });

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/cuentas/${entorno.cuenta.id}/ocultar`,
      "POST",
    );

    expect(respuesta.status).toBe(200);
    const cuenta = await leerJson<CuentaJson>(respuesta);
    expect(cuenta).toMatchObject({ oculta: true, saldoCentavos: 40_000 });
    expect((await historial(entorno.cookies, entorno.cuenta.id)).total).toBe(1);

    const periodos = await leerJson<{ periodos: { id: number }[] }>(
      await pedir(entorno.cookies, "/api/finanzas/periodos"),
    );
    const resumen = await leerJson<{ disponibleCentavos: number }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${periodos.periodos[0]?.id}`),
    );
    expect(resumen.disponibleCentavos).toBe(40_000);
  });

  it("se vuelve a mostrar, y ocultar o mostrar dos veces no falla", async () => {
    const entorno = await prepararEntorno();
    const ruta = `/api/finanzas/cuentas/${entorno.cuenta.id}`;

    expect((await pedir(entorno.cookies, `${ruta}/ocultar`, "POST")).status).toBe(200);
    expect((await pedir(entorno.cookies, `${ruta}/ocultar`, "POST")).status).toBe(200);
    expect((await pedir(entorno.cookies, `${ruta}/mostrar`, "POST")).status).toBe(200);
    expect((await pedir(entorno.cookies, `${ruta}/mostrar`, "POST")).status).toBe(200);

    expect(
      (await listarCuentas(entorno.cookies)).find((c) => c.id === entorno.cuenta.id)?.oculta,
    ).toBe(false);
  });

  it("lista las cuentas ocultas después de las visibles", async () => {
    const entorno = await prepararEntorno();
    // "Ahorros" empieza con A: sin la regla, quedaría antes que Billetera digital, Efectivo...
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}/ocultar`, "POST");

    const cuentas = await listarCuentas(entorno.cookies);

    expect(cuentas.at(-1)?.id).toBe(entorno.cuenta.id);
    expect(cuentas.slice(0, -1).every((c) => !c.oculta)).toBe(true);
  });

  it("responde 404 con una cuenta inexistente o de otra persona, y no la toca", async () => {
    const dueno = await prepararEntorno();
    const intruso = await entrarComoUsuario();

    const ajena = await pedir(intruso, `/api/finanzas/cuentas/${dueno.cuenta.id}/ocultar`, "POST");
    const inexistente = await pedir(
      dueno.cookies,
      "/api/finanzas/cuentas/00000000-0000-0000-0000-000000000000/mostrar",
      "POST",
    );

    expect(ajena.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect((await listarCuentas(dueno.cookies)).find((c) => c.id === dueno.cuenta.id)?.oculta).toBe(
      false,
    );
  });

  it("una cuenta oculta no se puede elegir para un movimiento nuevo", async () => {
    const entorno = await prepararEntorno();
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}/ocultar`, "POST");

    const respuesta = await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10 });

    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.campos?.[0]?.campo).toBe("cuentaFinancieraId");
  });

  it("al volver a mostrarla se puede usar de nuevo", async () => {
    const entorno = await prepararEntorno();
    const ruta = `/api/finanzas/cuentas/${entorno.cuenta.id}`;
    await pedir(entorno.cookies, `${ruta}/ocultar`, "POST");
    await pedir(entorno.cookies, `${ruta}/mostrar`, "POST");

    expect((await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10 })).status).toBe(201);
  });

  it("un movimiento que ya estaba en la cuenta puede editarse aunque ahora esté oculta", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<{ id: string }>(
      await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10, descripcion: "Original" }),
    );
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}/ocultar`, "POST");

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/movimientos/${creado.id}`,
      "PATCH",
      {
        tipo: "gasto",
        importe: 12,
        descripcion: "Corregido",
        fecha: "2026-03-10T12:00:00.000Z",
        categoriaId: entorno.categoriaId,
        cuentaFinancieraId: entorno.cuenta.id,
      },
    );

    expect(respuesta.status).toBe(200);
  });

  it("pero no se puede mover un movimiento a otra cuenta que esté oculta", async () => {
    const entorno = await prepararEntorno();
    const otra = await crearCuenta(entorno.cookies, "Otra");
    const creado = await leerJson<{ id: string }>(
      await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10 }),
    );
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${otra.id}/ocultar`, "POST");

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/movimientos/${creado.id}`,
      "PATCH",
      {
        tipo: "gasto",
        importe: 10,
        descripcion: "Movimiento",
        fecha: "2026-03-10T12:00:00.000Z",
        categoriaId: entorno.categoriaId,
        cuentaFinancieraId: otra.id,
      },
    );

    expect(respuesta.status).toBe(400);
  });

  it("duplicar un movimiento de una cuenta oculta se rechaza", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<{ id: string }>(
      await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10 }),
    );
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}/ocultar`, "POST");

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/movimientos/${creado.id}/duplicar`,
      "POST",
    );

    expect(respuesta.status).toBe(400);
  });
});

describe("DELETE /api/finanzas/cuentas/:id", () => {
  it("elimina una cuenta sin movimientos, aunque tenga saldo inicial y ajustes", async () => {
    const cookies = await entrarComoUsuario();
    const cuenta = await crearCuenta(cookies, "Ahorros", 100);
    await ajustar(cookies, cuenta.id, { saldo: 500 });

    const respuesta = await pedir(cookies, `/api/finanzas/cuentas/${cuenta.id}`, "DELETE");

    expect(respuesta.status).toBe(200);
    expect((await listarCuentas(cookies)).some((c) => c.id === cuenta.id)).toBe(false);
  });

  it("no elimina una cuenta con movimientos: responde 409 y le sugiere ocultarla", async () => {
    const entorno = await prepararEntorno();
    await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10 });

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/cuentas/${entorno.cuenta.id}`,
      "DELETE",
    );

    expect(respuesta.status).toBe(409);
    expect((await leerJson<RespuestaError>(respuesta)).error.mensaje).toContain("ocultarla");
    const cuenta = (await listarCuentas(entorno.cookies)).find((c) => c.id === entorno.cuenta.id);
    expect(cuenta).toBeDefined();
    expect(cuenta?.tieneMovimientos).toBe(true);
  });

  it("una cuenta oculta con movimientos tampoco se puede eliminar", async () => {
    const entorno = await prepararEntorno();
    await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10 });
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}/ocultar`, "POST");

    expect(
      (await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}`, "DELETE")).status,
    ).toBe(409);
  });

  it("los movimientos eliminados no cuentan: la cuenta se puede eliminar", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<{ id: string }>(
      await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10 }),
    );
    await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}`, "DELETE");

    const cuenta = (await listarCuentas(entorno.cookies)).find((c) => c.id === entorno.cuenta.id);
    expect(cuenta?.tieneMovimientos).toBe(false);
    expect(
      (await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}`, "DELETE")).status,
    ).toBe(200);
  });

  it("la cuenta se puede eliminar de nuevo después de que se eliminen todos sus movimientos, y no antes", async () => {
    const entorno = await prepararEntorno();
    const uno = await leerJson<{ id: string }>(
      await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10 }),
    );
    const dos = await leerJson<{ id: string }>(
      await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 20 }),
    );
    await pedir(entorno.cookies, `/api/finanzas/movimientos/${uno.id}`, "DELETE");

    expect(
      (await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}`, "DELETE")).status,
    ).toBe(409);

    await pedir(entorno.cookies, `/api/finanzas/movimientos/${dos.id}`, "DELETE");
    expect(
      (await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}`, "DELETE")).status,
    ).toBe(200);
  });

  it("el saldo de una cuenta eliminada deja de sumar al disponible", async () => {
    const entorno = await prepararEntorno();
    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 700 });
    const periodos = await leerJson<{ periodos: { id: number }[] }>(
      await pedir(entorno.cookies, "/api/finanzas/periodos"),
    );
    const disponible = async () =>
      (
        await leerJson<{ disponibleCentavos: number }>(
          await pedir(
            entorno.cookies,
            `/api/finanzas/resumen?periodoId=${periodos.periodos[0]?.id}`,
          ),
        )
      ).disponibleCentavos;
    expect(await disponible()).toBe(70_000);

    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}`, "DELETE");

    expect(await disponible()).toBe(0);
  });

  it("responde 404 con una cuenta de otra persona y no la elimina", async () => {
    const dueno = await prepararEntorno();
    const intruso = await entrarComoUsuario();

    const respuesta = await pedir(intruso, `/api/finanzas/cuentas/${dueno.cuenta.id}`, "DELETE");

    expect(respuesta.status).toBe(404);
    expect((await listarCuentas(dueno.cookies)).some((c) => c.id === dueno.cuenta.id)).toBe(true);
  });

  it("eliminar dos veces: la segunda responde 404", async () => {
    const entorno = await prepararEntorno();
    const ruta = `/api/finanzas/cuentas/${entorno.cuenta.id}`;

    expect((await pedir(entorno.cookies, ruta, "DELETE")).status).toBe(200);
    expect((await pedir(entorno.cookies, ruta, "DELETE")).status).toBe(404);
  });
});

describe("GET /api/finanzas/cuentas/:id/historial", () => {
  it("está vacío para una cuenta sin movimientos ni ajustes", async () => {
    const entorno = await prepararEntorno();

    expect(await historial(entorno.cookies, entorno.cuenta.id)).toEqual({ items: [], total: 0 });
  });

  it("junta movimientos y ajustes manuales, y distingue cada caso, del más nuevo al más viejo", async () => {
    const entorno = await prepararEntorno();
    await cargarMovimiento(entorno, entorno.cuenta.id, {
      tipo: "ingreso",
      importe: 500,
      fecha: "2026-03-01T12:00:00.000Z",
      descripcion: "Sueldo",
    });
    await cargarMovimiento(entorno, entorno.cuenta.id, {
      importe: 120.5,
      fecha: "2026-03-15T12:00:00.000Z",
      descripcion: "Super",
    });
    // El ajuste es "de ahora": más nuevo que los dos movimientos.
    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 1000 });

    const { items, total } = await historial(entorno.cookies, entorno.cuenta.id);

    expect(total).toBe(3);
    expect(items.map((i) => i.origen)).toEqual(["ajuste", "movimiento", "movimiento"]);

    // Ajuste: lo que indicó la persona y cuánto cambió el saldo (379,50 → 1000).
    expect(items[0]).toMatchObject({ saldoIndicadoCentavos: 100_000, montoCentavos: 62_050 });
    // Gasto: efecto negativo sobre el saldo, con su categoría.
    expect(items[1]).toMatchObject({
      tipo: "gasto",
      descripcion: "Super",
      montoCentavos: -12_050,
      fecha: "2026-03-15T12:00:00.000Z",
    });
    expect(items[1]?.categoria?.nombre).toBeTruthy();
    // Cada movimiento dice a qué período pertenece; el ajuste, que no es de ningún período, no.
    expect(items[1]?.periodo).toEqual({ nombre: "Amplio" });
    expect(items[2]?.periodo).toEqual({ nombre: "Amplio" });
    expect(items[0]?.periodo).toBeUndefined();
    // Ingreso: efecto positivo.
    expect(items[2]).toMatchObject({
      tipo: "ingreso",
      descripcion: "Sueldo",
      montoCentavos: 50_000,
    });
  });

  it("la suma de los montos del historial (carga inicial incluida) da el saldo de la cuenta", async () => {
    const cookies = await entrarComoUsuario();
    await abrirPeriodoAmplio(app, cookies);
    const categorias = await leerJson<{ categorias: { id: number }[] }>(
      await pedir(cookies, "/api/finanzas/categorias"),
    );
    const entorno = { cookies, categoriaId: categorias.categorias[0]?.id ?? 0 };
    const cuenta = await crearCuenta(cookies, "Banco", 250);
    await cargarMovimiento(entorno, cuenta.id, { tipo: "ingreso", importe: 80 });
    await cargarMovimiento(entorno, cuenta.id, { importe: 30 });
    await ajustar(cookies, cuenta.id, { saldo: 1000 });
    await cargarMovimiento(entorno, cuenta.id, { importe: 15.25 });

    const { items } = await historial(cookies, cuenta.id);
    const actual = (await listarCuentas(cookies)).find((c) => c.id === cuenta.id);

    const suma = items.reduce((acumulado, item) => acumulado + item.montoCentavos, 0);
    expect(suma).toBe(actual?.saldoCentavos);
  });

  describe("carga inicial", () => {
    it("una cuenta creada con saldo muestra la carga inicial, con ese monto y la fecha de creación", async () => {
      const cookies = await entrarComoUsuario();
      const antes = Date.now();
      const cuenta = await crearCuenta(cookies, "Banco", 1250.5);

      const { items, total } = await historial(cookies, cuenta.id);

      expect(total).toBe(1);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ origen: "saldo_inicial", montoCentavos: 125_050 });
      const creada = new Date(items[0]?.fecha ?? "").getTime();
      expect(creada).toBeGreaterThanOrEqual(antes - 1000);
      expect(creada).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it("no aparece si la cuenta se creó sin saldo", async () => {
      const entorno = await prepararEntorno();

      const { items } = await historial(entorno.cookies, entorno.cuenta.id);

      expect(items.map((i) => i.origen)).not.toContain("saldo_inicial");
    });

    it("un saldo inicial negativo figura con monto negativo", async () => {
      const cookies = await entrarComoUsuario();
      const cuenta = await crearCuenta(cookies, "Tarjeta", -300);

      const { items } = await historial(cookies, cuenta.id);

      expect(items[0]).toMatchObject({ origen: "saldo_inicial", montoCentavos: -30_000 });
    });

    it("va siempre al final, aun con movimientos de fecha anterior a la creación de la cuenta", async () => {
      const cookies = await entrarComoUsuario();
      await abrirPeriodoAmplio(app, cookies);
      const categorias = await leerJson<{ categorias: { id: number }[] }>(
        await pedir(cookies, "/api/finanzas/categorias"),
      );
      const entorno = { cookies, categoriaId: categorias.categorias[0]?.id ?? 0 };
      const cuenta = await crearCuenta(cookies, "Banco", 100);
      // Un movimiento con fecha muy anterior a la creación de la cuenta.
      await cargarMovimiento(entorno, cuenta.id, {
        importe: 10,
        fecha: "2026-01-05T12:00:00.000Z",
        descripcion: "Viejo",
      });
      await ajustar(cookies, cuenta.id, { saldo: 500 });

      const { items, total } = await historial(cookies, cuenta.id);

      expect(total).toBe(3);
      expect(items.map((i) => i.origen)).toEqual(["ajuste", "movimiento", "saldo_inicial"]);
    });

    it("se pagina junto con el resto y cuenta en el total", async () => {
      const cookies = await entrarComoUsuario();
      await abrirPeriodoAmplio(app, cookies);
      const categorias = await leerJson<{ categorias: { id: number }[] }>(
        await pedir(cookies, "/api/finanzas/categorias"),
      );
      const entorno = { cookies, categoriaId: categorias.categorias[0]?.id ?? 0 };
      const cuenta = await crearCuenta(cookies, "Banco", 100);
      for (let i = 1; i <= 3; i += 1) {
        await cargarMovimiento(entorno, cuenta.id, {
          importe: i,
          descripcion: `M${i}`,
          fecha: `2026-03-0${i}T12:00:00.000Z`,
        });
      }

      const primera = await historial(cookies, cuenta.id, "?limit=2&offset=0");
      const segunda = await historial(cookies, cuenta.id, "?limit=2&offset=2");

      expect(primera.items.map((i) => i.origen)).toEqual(["movimiento", "movimiento"]);
      expect(segunda.items.map((i) => i.origen)).toEqual(["movimiento", "saldo_inicial"]);
      expect([primera.total, segunda.total]).toEqual([4, 4]);
    });

    it("es una sola y no cambia al actualizar el saldo; el ajuste se agrega aparte", async () => {
      const cookies = await entrarComoUsuario();
      const cuenta = await crearCuenta(cookies, "Banco", 100);

      await ajustar(cookies, cuenta.id, { saldo: 700 });

      const { items } = await historial(cookies, cuenta.id);
      expect(items.filter((i) => i.origen === "saldo_inicial")).toEqual([
        expect.objectContaining({ montoCentavos: 10_000 }),
      ]);
      expect(items.map((i) => i.origen)).toEqual(["ajuste", "saldo_inicial"]);
    });

    it("no se mezcla entre cuentas ni entre personas", async () => {
      const dueno = await entrarComoUsuario();
      const otra = await entrarComoUsuario();
      const cuenta = await crearCuenta(dueno, "Mía", 100);
      const ajena = await crearCuenta(otra, "Ajena", 999);
      const segunda = await crearCuenta(dueno, "Segunda", 5);

      expect((await historial(dueno, cuenta.id)).items).toEqual([
        expect.objectContaining({ origen: "saldo_inicial", montoCentavos: 10_000 }),
      ]);
      expect((await historial(dueno, segunda.id)).items).toEqual([
        expect.objectContaining({ origen: "saldo_inicial", montoCentavos: 500 }),
      ]);
      // La de otra persona sigue sin poder leerse.
      expect((await pedir(dueno, `/api/finanzas/cuentas/${ajena.id}/historial`)).status).toBe(404);
    });
  });

  it("no incluye movimientos de otras cuentas ni movimientos eliminados", async () => {
    const entorno = await prepararEntorno();
    const otra = await crearCuenta(entorno.cookies, "Otra");
    await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 10, descripcion: "Mío" });
    await cargarMovimiento(entorno, otra.id, { importe: 20, descripcion: "De otra cuenta" });
    const borrado = await leerJson<{ id: string }>(
      await cargarMovimiento(entorno, entorno.cuenta.id, { importe: 30, descripcion: "Borrado" }),
    );
    await pedir(entorno.cookies, `/api/finanzas/movimientos/${borrado.id}`, "DELETE");
    await ajustar(entorno.cookies, otra.id, { saldo: 999 });

    const { items, total } = await historial(entorno.cookies, entorno.cuenta.id);

    expect(total).toBe(1);
    expect(items.map((i) => i.descripcion)).toEqual(["Mío"]);
  });

  it("pagina con limit y offset, y el total no cambia", async () => {
    const entorno = await prepararEntorno();
    for (let i = 1; i <= 5; i += 1) {
      await cargarMovimiento(entorno, entorno.cuenta.id, {
        importe: i,
        descripcion: `M${i}`,
        fecha: `2026-03-0${i}T12:00:00.000Z`,
      });
    }

    const primera = await historial(entorno.cookies, entorno.cuenta.id, "?limit=2&offset=0");
    const segunda = await historial(entorno.cookies, entorno.cuenta.id, "?limit=2&offset=2");
    const ultima = await historial(entorno.cookies, entorno.cuenta.id, "?limit=2&offset=4");

    expect(primera.items.map((i) => i.descripcion)).toEqual(["M5", "M4"]);
    expect(segunda.items.map((i) => i.descripcion)).toEqual(["M3", "M2"]);
    expect(ultima.items.map((i) => i.descripcion)).toEqual(["M1"]);
    expect([primera.total, segunda.total, ultima.total]).toEqual([5, 5, 5]);
  });

  it.each(["?limit=0", "?limit=101", "?limit=abc", "?offset=-1"])(
    "rechaza una paginación inválida: %s",
    async (consulta) => {
      const entorno = await prepararEntorno();

      const respuesta = await pedir(
        entorno.cookies,
        `/api/finanzas/cuentas/${entorno.cuenta.id}/historial${consulta}`,
      );

      expect(respuesta.status).toBe(400);
    },
  );

  it("responde 404 con una cuenta ajena, inexistente o eliminada, sin mostrar nada", async () => {
    const dueno = await prepararEntorno();
    const intruso = await entrarComoUsuario();
    await ajustar(dueno.cookies, dueno.cuenta.id, { saldo: 5 });

    expect(
      (await pedir(intruso, `/api/finanzas/cuentas/${dueno.cuenta.id}/historial`)).status,
    ).toBe(404);
    expect(
      (
        await pedir(
          dueno.cookies,
          "/api/finanzas/cuentas/00000000-0000-0000-0000-000000000000/historial",
        )
      ).status,
    ).toBe(404);

    // Eliminada (sin movimientos): su historial deja de estar disponible.
    await pedir(dueno.cookies, `/api/finanzas/cuentas/${dueno.cuenta.id}`, "DELETE");
    expect(
      (await pedir(dueno.cookies, `/api/finanzas/cuentas/${dueno.cuenta.id}/historial`)).status,
    ).toBe(404);
  });

  it("el historial de una cuenta oculta sigue disponible", async () => {
    const entorno = await prepararEntorno();
    await ajustar(entorno.cookies, entorno.cuenta.id, { saldo: 5 });
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuenta.id}/ocultar`, "POST");

    expect((await historial(entorno.cookies, entorno.cuenta.id)).total).toBe(1);
  });
});

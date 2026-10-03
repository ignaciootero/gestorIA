// Tests de integración de las transferencias entre cuentas (movimientos de tipo
// "neutro"): saldos, totales, validaciones, historial y borrado de cuentas.
// Contra la base gestion_test real.

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
  saldoCentavos: number;
  tieneMovimientos: boolean;
  oculta: boolean;
};
type CategoriaJson = { id: number; nombre: string; sistema: string | null };
type MovimientoJson = {
  id: string;
  tipo: string;
  importeCentavos: number;
  descripcion: string;
  periodoId: number;
  categoria: { id: number; nombre: string };
  cuentaFinanciera: { id: string; nombre: string };
  cuentaDestino: { id: string; nombre: string } | null;
};
type ItemJson = {
  origen: string;
  tipo?: string;
  montoCentavos: number;
  descripcion?: string;
  transferencia?: { desde: string; hacia: string } | null;
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

type Entorno = {
  cookies: string;
  /** Efectivo (saldo inicial 1000) y Banco (saldo inicial 200), propias. */
  efectivo: CuentaJson;
  banco: CuentaJson;
  transferenciaId: number;
  comunId: number;
  periodoId: number;
};

async function crearCuenta(
  cookies: string,
  nombre: string,
  saldoInicial: number,
): Promise<CuentaJson> {
  return leerJson<CuentaJson>(
    await pedir(cookies, "/api/finanzas/cuentas", "POST", { nombre, saldoInicial }),
  );
}

async function prepararEntorno(): Promise<Entorno> {
  const cookies = await entrarComoUsuario();
  const periodo = await abrirPeriodoAmplio(app, cookies);
  const categorias = (
    await leerJson<{ categorias: CategoriaJson[] }>(
      await pedir(cookies, "/api/finanzas/categorias"),
    )
  ).categorias;
  return {
    cookies,
    efectivo: await crearCuenta(cookies, "Efectivo propio", 1000),
    banco: await crearCuenta(cookies, "Banco propio", 200),
    transferenciaId: categorias.find((c) => c.sistema === "transferencia")?.id ?? 0,
    comunId: categorias.find((c) => c.sistema === null)?.id ?? 0,
    periodoId: periodo.id,
  };
}

async function saldos(cookies: string): Promise<Record<string, number>> {
  const { cuentas } = await leerJson<{ cuentas: CuentaJson[] }>(
    await pedir(cookies, "/api/finanzas/cuentas"),
  );
  return Object.fromEntries(cuentas.map((c) => [c.nombre, c.saldoCentavos]));
}

function transferir(
  entorno: Entorno,
  datos: Record<string, unknown> = {},
  desde: CuentaJson = entorno.efectivo,
  hacia: CuentaJson = entorno.banco,
) {
  return pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
    tipo: "neutro",
    importe: 300,
    descripcion: "Pasé plata",
    fecha: "2026-03-10T12:00:00.000Z",
    categoriaId: entorno.transferenciaId,
    cuentaFinancieraId: desde.id,
    cuentaDestinoId: hacia.id,
    ...datos,
  });
}

async function disponible(entorno: Entorno): Promise<number> {
  return (
    await leerJson<{ disponibleCentavos: number }>(
      await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.periodoId}`),
    )
  ).disponibleCentavos;
}

describe("crear una transferencia", () => {
  it("resta de la cuenta de origen y suma a la de destino, y el disponible total no cambia", async () => {
    const entorno = await prepararEntorno();
    const antes = await disponible(entorno);

    const respuesta = await transferir(entorno);

    expect(respuesta.status).toBe(201);
    const s = await saldos(entorno.cookies);
    expect(s["Efectivo propio"]).toBe(70_000); // 1000 - 300
    expect(s["Banco propio"]).toBe(50_000); // 200 + 300
    expect(await disponible(entorno)).toBe(antes);
  });

  it("devuelve el movimiento con tipo neutro, la categoría especial y ambas cuentas", async () => {
    const entorno = await prepararEntorno();

    const movimiento = await leerJson<MovimientoJson>(await transferir(entorno));

    expect(movimiento).toMatchObject({
      tipo: "neutro",
      importeCentavos: 30_000,
      periodoId: entorno.periodoId,
      categoria: { id: entorno.transferenciaId },
      cuentaFinanciera: { id: entorno.efectivo.id },
      cuentaDestino: { id: entorno.banco.id, nombre: "Banco propio" },
    });
  });

  it("no es ingreso ni gasto: no cuenta en los totales del período, ni en las estadísticas", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno);

    const resumen = await leerJson<{
      ingresosCentavos: number;
      gastosCentavos: number;
      balanceCentavos: number;
    }>(await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.periodoId}`));
    const estadisticas = await leerJson<{
      gastosPorCategoria: unknown[];
      evolucionPorPeriodo: { ingresosCentavos: number; gastosCentavos: number }[];
    }>(await pedir(entorno.cookies, `/api/finanzas/estadisticas?periodoId=${entorno.periodoId}`));

    expect(resumen).toMatchObject({ ingresosCentavos: 0, gastosCentavos: 0, balanceCentavos: 0 });
    expect(estadisticas.gastosPorCategoria).toEqual([]);
    expect(estadisticas.evolucionPorPeriodo.at(-1)).toMatchObject({
      ingresosCentavos: 0,
      gastosCentavos: 0,
    });
  });

  it("puede transferir más de lo que hay: el origen queda en negativo", async () => {
    const entorno = await prepararEntorno();

    await transferir(entorno, { importe: 1500 });

    expect((await saldos(entorno.cookies))["Efectivo propio"]).toBe(-50_000);
  });

  it("se suman varias transferencias, en los dos sentidos", async () => {
    const entorno = await prepararEntorno();

    await transferir(entorno, { importe: 100 });
    await transferir(entorno, { importe: 50 }, entorno.banco, entorno.efectivo);

    const s = await saldos(entorno.cookies);
    expect(s["Efectivo propio"]).toBe(100_000 - 10_000 + 5_000);
    expect(s["Banco propio"]).toBe(20_000 + 10_000 - 5_000);
  });

  it("conviven con ingresos y gastos de las mismas cuentas", async () => {
    const entorno = await prepararEntorno();
    await pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
      tipo: "ingreso",
      importe: 500,
      descripcion: "Sueldo",
      fecha: "2026-03-01T12:00:00.000Z",
      categoriaId: entorno.comunId,
      cuentaFinancieraId: entorno.banco.id,
    });
    await transferir(entorno, { importe: 200 }, entorno.banco, entorno.efectivo);

    const s = await saldos(entorno.cookies);
    expect(s["Banco propio"]).toBe(20_000 + 50_000 - 20_000);
    expect(s["Efectivo propio"]).toBe(100_000 + 20_000);
  });

  it("la fecha decide el período, igual que en cualquier movimiento", async () => {
    const entorno = await prepararEntorno();

    const fuera = await transferir(entorno, { fecha: "2020-01-01T12:00:00.000Z" });

    expect(fuera.status).toBe(400);
    expect((await saldos(entorno.cookies))["Efectivo propio"]).toBe(100_000);
  });
});

describe("validaciones de una transferencia", () => {
  async function cuerpoDeError(respuesta: Response) {
    return leerJson<RespuestaError>(respuesta);
  }

  it("exige la cuenta de destino", async () => {
    const entorno = await prepararEntorno();

    for (const cuentaDestinoId of [undefined, null]) {
      const respuesta = await transferir(entorno, { cuentaDestinoId });
      expect(respuesta.status).toBe(400);
      expect((await cuerpoDeError(respuesta)).error.campos?.[0]?.campo).toBe("cuentaDestinoId");
    }
  });

  it("rechaza el mismo origen y destino", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await transferir(entorno, {}, entorno.efectivo, entorno.efectivo);

    expect(respuesta.status).toBe(400);
    // El detalle va en el campo afectado.
    expect((await cuerpoDeError(respuesta)).error.campos?.[0]).toMatchObject({
      campo: "cuentaDestinoId",
      mensaje: expect.stringContaining("distinta"),
    });
  });

  it("rechaza un destino inexistente, de otra persona, eliminado u oculto", async () => {
    const entorno = await prepararEntorno();
    const ajeno = await prepararEntorno();
    const eliminada = await crearCuenta(entorno.cookies, "Para borrar", 0);
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${eliminada.id}`, "DELETE");
    const oculta = await crearCuenta(entorno.cookies, "Escondida", 0);
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${oculta.id}/ocultar`, "POST");

    for (const destino of [
      "00000000-0000-0000-0000-000000000000",
      ajeno.efectivo.id,
      eliminada.id,
      oculta.id,
    ]) {
      const respuesta = await transferir(entorno, { cuentaDestinoId: destino });
      expect(respuesta.status).toBe(400);
      expect((await cuerpoDeError(respuesta)).error.campos?.[0]?.campo).toBe("cuentaDestinoId");
    }
  });

  it("rechaza un origen oculto", async () => {
    const entorno = await prepararEntorno();
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.efectivo.id}/ocultar`, "POST");

    expect((await transferir(entorno)).status).toBe(400);
  });

  it("una transferencia solo puede usar la categoría especial", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await transferir(entorno, { categoriaId: entorno.comunId });

    expect(respuesta.status).toBe(400);
    const error = (await cuerpoDeError(respuesta)).error;
    expect(error.campos?.[0]?.campo).toBe("categoriaId");
    expect(error.mensaje).toContain("categoría de transferencias");
  });

  it("un gasto o un ingreso no pueden usar la categoría especial", async () => {
    const entorno = await prepararEntorno();

    for (const tipo of ["gasto", "ingreso"]) {
      const respuesta = await pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
        tipo,
        importe: 10,
        descripcion: "X",
        fecha: "2026-03-10T12:00:00.000Z",
        categoriaId: entorno.transferenciaId,
        cuentaFinancieraId: entorno.efectivo.id,
      });
      expect(respuesta.status).toBe(400);
      expect((await cuerpoDeError(respuesta)).error.campos?.[0]?.campo).toBe("categoriaId");
    }
  });

  it("un gasto o ingreso no puede llevar cuenta de destino", async () => {
    const entorno = await prepararEntorno();

    const respuesta = await transferir(entorno, { tipo: "gasto", categoriaId: entorno.comunId });

    expect(respuesta.status).toBe(400);
    expect((await cuerpoDeError(respuesta)).error.campos?.[0]?.campo).toBe("cuentaDestinoId");
  });

  it.each([0, -5])("rechaza un importe inválido: %s", async (importe) => {
    const entorno = await prepararEntorno();

    expect((await transferir(entorno, { importe })).status).toBe(400);
  });

  it("no se guarda nada cuando se rechaza", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno, {}, entorno.efectivo, entorno.efectivo);
    await transferir(entorno, { cuentaDestinoId: null });

    const lista = await leerJson<{ total: number }>(
      await pedir(entorno.cookies, "/api/finanzas/movimientos"),
    );
    expect(lista.total).toBe(0);
  });
});

describe("editar, duplicar y eliminar una transferencia", () => {
  it("cambiar el monto o el destino actualiza los saldos", async () => {
    const entorno = await prepararEntorno();
    const otra = await crearCuenta(entorno.cookies, "Tercera", 0);
    const creada = await leerJson<MovimientoJson>(await transferir(entorno));

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/movimientos/${creada.id}`,
      "PATCH",
      {
        tipo: "neutro",
        importe: 100,
        descripcion: "Pasé menos",
        fecha: "2026-03-10T12:00:00.000Z",
        categoriaId: entorno.transferenciaId,
        cuentaFinancieraId: entorno.efectivo.id,
        cuentaDestinoId: otra.id,
      },
    );

    expect(respuesta.status).toBe(200);
    const s = await saldos(entorno.cookies);
    expect(s["Efectivo propio"]).toBe(90_000);
    expect(s["Banco propio"]).toBe(20_000);
    expect(s["Tercera"]).toBe(10_000);
  });

  it("una transferencia se puede convertir en gasto (sin destino, con otra categoría)", async () => {
    const entorno = await prepararEntorno();
    const creada = await leerJson<MovimientoJson>(await transferir(entorno));

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/movimientos/${creada.id}`,
      "PATCH",
      {
        tipo: "gasto",
        importe: 300,
        descripcion: "Era un gasto",
        fecha: "2026-03-10T12:00:00.000Z",
        categoriaId: entorno.comunId,
        cuentaFinancieraId: entorno.efectivo.id,
      },
    );

    expect(respuesta.status).toBe(200);
    expect((await leerJson<MovimientoJson>(respuesta)).cuentaDestino).toBeNull();
    // El gasto resta una vez; el destino ya no recibe nada.
    const s = await saldos(entorno.cookies);
    expect(s["Efectivo propio"]).toBe(70_000);
    expect(s["Banco propio"]).toBe(20_000);
  });

  it("un gasto se puede convertir en transferencia", async () => {
    const entorno = await prepararEntorno();
    const gasto = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
        tipo: "gasto",
        importe: 300,
        descripcion: "Gasto",
        fecha: "2026-03-10T12:00:00.000Z",
        categoriaId: entorno.comunId,
        cuentaFinancieraId: entorno.efectivo.id,
      }),
    );

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/movimientos/${gasto.id}`,
      "PATCH",
      {
        tipo: "neutro",
        importe: 300,
        descripcion: "Ahora es transferencia",
        fecha: "2026-03-10T12:00:00.000Z",
        categoriaId: entorno.transferenciaId,
        cuentaFinancieraId: entorno.efectivo.id,
        cuentaDestinoId: entorno.banco.id,
      },
    );

    expect(respuesta.status).toBe(200);
    expect((await saldos(entorno.cookies))["Banco propio"]).toBe(50_000);
  });

  it("una transferencia en una cuenta que después se ocultó se puede seguir editando", async () => {
    const entorno = await prepararEntorno();
    const creada = await leerJson<MovimientoJson>(await transferir(entorno));
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.efectivo.id}/ocultar`, "POST");
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.banco.id}/ocultar`, "POST");

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/movimientos/${creada.id}`,
      "PATCH",
      {
        tipo: "neutro",
        importe: 350,
        descripcion: "Corregida",
        fecha: "2026-03-10T12:00:00.000Z",
        categoriaId: entorno.transferenciaId,
        cuentaFinancieraId: entorno.efectivo.id,
        cuentaDestinoId: entorno.banco.id,
      },
    );

    expect(respuesta.status).toBe(200);
  });

  it("al eliminarla, los saldos vuelven a como estaban", async () => {
    const entorno = await prepararEntorno();
    const creada = await leerJson<MovimientoJson>(await transferir(entorno));

    expect(
      (await pedir(entorno.cookies, `/api/finanzas/movimientos/${creada.id}`, "DELETE")).status,
    ).toBe(200);

    const s = await saldos(entorno.cookies);
    expect(s["Efectivo propio"]).toBe(100_000);
    expect(s["Banco propio"]).toBe(20_000);
  });

  it("duplicarla repite la transferencia con la fecha de ahora", async () => {
    const entorno = await prepararEntorno();
    const creada = await leerJson<MovimientoJson>(await transferir(entorno));

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/movimientos/${creada.id}/duplicar`,
      "POST",
    );

    expect(respuesta.status).toBe(201);
    expect(await leerJson<MovimientoJson>(respuesta)).toMatchObject({
      tipo: "neutro",
      cuentaDestino: { id: entorno.banco.id },
    });
    expect((await saldos(entorno.cookies))["Efectivo propio"]).toBe(40_000);
  });
});

describe("las transferencias en los listados y en el historial de las cuentas", () => {
  it("el listado las muestra con su cuenta de destino y se pueden filtrar por tipo", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno);
    await pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
      tipo: "gasto",
      importe: 5,
      descripcion: "Gasto común",
      fecha: "2026-03-10T12:00:00.000Z",
      categoriaId: entorno.comunId,
      cuentaFinancieraId: entorno.efectivo.id,
    });

    const soloTransferencias = await leerJson<{ movimientos: MovimientoJson[] }>(
      await pedir(entorno.cookies, "/api/finanzas/movimientos?tipo=neutro"),
    );

    expect(soloTransferencias.movimientos).toHaveLength(1);
    expect(soloTransferencias.movimientos[0]?.cuentaDestino?.nombre).toBe("Banco propio");
  });

  it("filtrar por cuenta incluye las transferencias que le llegan, no solo las que salen", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno);

    const delDestino = await leerJson<{ total: number }>(
      await pedir(
        entorno.cookies,
        `/api/finanzas/movimientos?cuentaFinancieraId=${entorno.banco.id}`,
      ),
    );
    const delOrigen = await leerJson<{ total: number }>(
      await pedir(
        entorno.cookies,
        `/api/finanzas/movimientos?cuentaFinancieraId=${entorno.efectivo.id}`,
      ),
    );

    expect([delOrigen.total, delDestino.total]).toEqual([1, 1]);
  });

  it("el historial de cada cuenta la muestra: negativa en el origen y positiva en el destino", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno);

    const delOrigen = await leerJson<{ items: ItemJson[]; total: number }>(
      await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.efectivo.id}/historial`),
    );
    const delDestino = await leerJson<{ items: ItemJson[]; total: number }>(
      await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.banco.id}/historial`),
    );

    // Cada cuenta se creó con saldo, así que además de la transferencia figura la carga inicial.
    expect(delOrigen.total).toBe(2);
    expect(delOrigen.items[1]?.origen).toBe("saldo_inicial");
    expect(delOrigen.items[0]).toMatchObject({
      origen: "movimiento",
      tipo: "neutro",
      montoCentavos: -30_000,
      transferencia: { desde: "Efectivo propio", hacia: "Banco propio" },
    });
    expect(delDestino.total).toBe(2);
    expect(delDestino.items[1]?.origen).toBe("saldo_inicial");
    expect(delDestino.items[0]).toMatchObject({
      tipo: "neutro",
      montoCentavos: 30_000,
      transferencia: { desde: "Efectivo propio", hacia: "Banco propio" },
    });
  });

  it("la suma del historial (con la carga inicial) = saldo, en las dos cuentas, con transferencias de ida y vuelta", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno, { importe: 120 });
    await transferir(entorno, { importe: 45.5 }, entorno.banco, entorno.efectivo);
    await pedir(
      entorno.cookies,
      `/api/finanzas/cuentas/${entorno.banco.id}/ajustar-saldo`,
      "POST",
      {
        saldo: 999,
      },
    );

    for (const cuenta of [entorno.efectivo, entorno.banco]) {
      const { items } = await leerJson<{ items: ItemJson[] }>(
        await pedir(entorno.cookies, `/api/finanzas/cuentas/${cuenta.id}/historial`),
      );
      const actual = (await saldos(entorno.cookies))[cuenta.nombre];
      expect(items.reduce((suma, item) => suma + item.montoCentavos, 0)).toBe(actual);
    }
  });
});

describe("cuentas con transferencias", () => {
  it("la cuenta de destino cuenta como cuenta con movimientos: no se puede eliminar", async () => {
    const entorno = await prepararEntorno();
    const destino = await crearCuenta(entorno.cookies, "Solo destino", 0);
    await transferir(entorno, {}, entorno.efectivo, destino);

    const cuentas = await leerJson<{ cuentas: CuentaJson[] }>(
      await pedir(entorno.cookies, "/api/finanzas/cuentas"),
    );
    expect(cuentas.cuentas.find((c) => c.id === destino.id)?.tieneMovimientos).toBe(true);
    const respuesta = await pedir(entorno.cookies, `/api/finanzas/cuentas/${destino.id}`, "DELETE");
    expect(respuesta.status).toBe(409);
  });

  it("si la transferencia se elimina, la cuenta vuelve a poder eliminarse", async () => {
    const entorno = await prepararEntorno();
    const destino = await crearCuenta(entorno.cookies, "Solo destino", 0);
    const creada = await leerJson<MovimientoJson>(
      await transferir(entorno, {}, entorno.efectivo, destino),
    );
    await pedir(entorno.cookies, `/api/finanzas/movimientos/${creada.id}`, "DELETE");

    expect(
      (await pedir(entorno.cookies, `/api/finanzas/cuentas/${destino.id}`, "DELETE")).status,
    ).toBe(200);
  });

  it("una cuenta oculta con una transferencia conserva su saldo y sigue sumando al disponible", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno);
    await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.banco.id}/ocultar`, "POST");

    expect((await saldos(entorno.cookies))["Banco propio"]).toBe(50_000);
    expect(await disponible(entorno)).toBe(120_000);
  });

  it("no se puede transferir hacia o desde la cuenta de otra persona", async () => {
    const entorno = await prepararEntorno();
    const ajeno = await prepararEntorno();

    expect((await transferir(entorno, {}, entorno.efectivo, ajeno.banco)).status).toBe(400);
    expect((await transferir(entorno, {}, ajeno.efectivo, entorno.banco)).status).toBe(400);
    expect((await saldos(ajeno.cookies))["Efectivo propio"]).toBe(100_000);
  });
});

describe("las transferencias no cambian las categorías", () => {
  it("la categoría especial cuenta sus transferencias como movimientos (no se puede eliminar igual)", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno);

    const categorias = (
      await leerJson<{ categorias: (CategoriaJson & { movimientos: number })[] }>(
        await pedir(entorno.cookies, "/api/finanzas/categorias"),
      )
    ).categorias;

    expect(categorias.find((c) => c.sistema === "transferencia")?.movimientos).toBe(1);
  });
});

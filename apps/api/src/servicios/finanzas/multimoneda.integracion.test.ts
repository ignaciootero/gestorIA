// Tests de integración del manejo de varias monedas: cuentas con su moneda, movimientos
// y transferencias convertidos con el tipo de cambio elegido (automático, escrito o
// deducido de dos importes), totales en la moneda base y disponible estimado.
// Contra la base gestion_test real; las cotizaciones salen de una fuente falsa en la
// que 1 dólar = 40 pesos uruguayos (ver pruebas/cotizaciones-de-prueba.ts).

import type { ClienteDb } from "@gestoria/db";
import { IMPORTE_MAXIMO, type RespuestaError } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { crearFuenteDePrueba, type FuenteDePrueba } from "../../pruebas/cotizaciones-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { abrirPeriodoAmplio } from "../../pruebas/periodos-de-prueba.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let fuente: FuenteDePrueba;

beforeAll(() => {
  cliente = clienteDePrueba();
});

beforeEach(async () => {
  await limpiarBase(cliente);
  // Una fuente nueva por test: así cada test cuenta sus propias consultas.
  fuente = crearFuenteDePrueba();
  app = appDePrueba(cliente, undefined, fuente.fuente);
});

afterAll(async () => {
  await cliente.cerrar();
});

type CuentaJson = {
  id: string;
  nombre: string;
  moneda: string;
  saldoCentavos: number;
  saldoInicialCentavos: number;
};
type CategoriaJson = { id: number; nombre: string; sistema: string | null };
type MovimientoJson = {
  id: string;
  tipo: string;
  importeCentavos: number;
  tipoDeCambio: number;
  importeConvertidoCentavos: number;
  cambioManual: boolean;
  descripcion: string;
  cuentaFinanciera: { id: string; nombre: string; moneda: string };
  cuentaDestino: { id: string; nombre: string; moneda: string } | null;
};
type ItemJson = {
  origen: string;
  montoCentavos: number;
  cambio?: {
    tipoDeCambio: number;
    manual: boolean;
    convertidoCentavos: number;
    monedaDeOrigen: string;
    monedaDeDestino: string | null;
  };
};

const FECHA = "2026-03-10T12:00:00.000Z";
const DIA_DE_LA_FECHA = "2026-03-10";

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
  periodoId: number;
  /** Cuentas propias: efectivo en pesos (saldo 1000), caja en dólares (saldo 100) y otra en dólares. */
  pesos: CuentaJson;
  dolares: CuentaJson;
  masDolares: CuentaJson;
  gastoId: number;
  transferenciaId: number;
};

async function crearCuenta(
  cookies: string,
  nombre: string,
  saldoInicial: number,
  moneda?: string,
): Promise<CuentaJson> {
  return leerJson<CuentaJson>(
    await pedir(cookies, "/api/finanzas/cuentas", "POST", {
      nombre,
      saldoInicial,
      ...(moneda ? { moneda } : {}),
    }),
  );
}

async function prepararEntorno(): Promise<Entorno> {
  const datos = await registrarAprobado(app, cliente);
  const cookies = cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
  const periodo = await abrirPeriodoAmplio(app, cookies);
  const categorias = (
    await leerJson<{ categorias: CategoriaJson[] }>(
      await pedir(cookies, "/api/finanzas/categorias"),
    )
  ).categorias;
  return {
    cookies,
    periodoId: periodo.id,
    pesos: await crearCuenta(cookies, "Efectivo pesos", 1000),
    dolares: await crearCuenta(cookies, "Caja en dólares", 100, "USD"),
    masDolares: await crearCuenta(cookies, "Efectivo dólares", 0, "USD"),
    gastoId: categorias.find((c) => c.sistema === null)?.id ?? 0,
    transferenciaId: categorias.find((c) => c.sistema === "transferencia")?.id ?? 0,
  };
}

function cargar(entorno: Entorno, datos: Record<string, unknown> = {}) {
  return pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
    tipo: "gasto",
    importe: 10,
    descripcion: "Compra",
    fecha: FECHA,
    categoriaId: entorno.gastoId,
    cuentaFinancieraId: entorno.dolares.id,
    ...datos,
  });
}

function transferir(
  entorno: Entorno,
  desde: CuentaJson,
  hacia: CuentaJson,
  datos: Record<string, unknown> = {},
) {
  return cargar(entorno, {
    tipo: "neutro",
    descripcion: "Cambié plata",
    categoriaId: entorno.transferenciaId,
    cuentaFinancieraId: desde.id,
    cuentaDestinoId: hacia.id,
    ...datos,
  });
}

async function saldos(cookies: string): Promise<Record<string, number>> {
  const { cuentas } = await leerJson<{ cuentas: CuentaJson[] }>(
    await pedir(cookies, "/api/finanzas/cuentas"),
  );
  return Object.fromEntries(cuentas.map((c) => [c.nombre, c.saldoCentavos]));
}

async function resumen(entorno: Entorno) {
  return await leerJson<{
    monedaBase: string;
    ingresosCentavos: number;
    gastosCentavos: number;
    balanceCentavos: number;
    disponibleCentavos: number;
    disponibleEsEstimado: boolean;
    monedasSinCotizacion: string[];
  }>(await pedir(entorno.cookies, `/api/finanzas/resumen?periodoId=${entorno.periodoId}`));
}

describe("cuentas con moneda", () => {
  it("las cuentas por defecto nacen en la moneda base de la persona", async () => {
    const datos = await registrarAprobado(app, cliente);
    const cookies = cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
    const { cuentas } = await leerJson<{ cuentas: CuentaJson[] }>(
      await pedir(cookies, "/api/finanzas/cuentas"),
    );

    expect(cuentas.length).toBeGreaterThan(0);
    expect(cuentas.every((cuenta) => cuenta.moneda === "UYU")).toBe(true);
  });

  it("una cuenta nueva sin moneda nace en la base; con moneda, en esa", async () => {
    const entorno = await prepararEntorno();
    expect(entorno.pesos.moneda).toBe("UYU");
    expect(entorno.dolares.moneda).toBe("USD");

    const listadas = await leerJson<{ cuentas: CuentaJson[] }>(
      await pedir(entorno.cookies, "/api/finanzas/cuentas"),
    );
    expect(listadas.cuentas.find((c) => c.id === entorno.dolares.id)?.moneda).toBe("USD");
  });

  it.each(["usd", "XYZ", "", "DOLARES", 5])("rechaza la moneda %j", async (moneda) => {
    const entorno = await prepararEntorno();
    const respuesta = await pedir(entorno.cookies, "/api/finanzas/cuentas", "POST", {
      nombre: "Cuenta rara",
      moneda,
    });
    expect(respuesta.status).toBe(400);
  });

  it("el saldo de una cuenta en dólares está en dólares", async () => {
    const entorno = await prepararEntorno();
    await cargar(entorno, { importe: 10, cambio: { modo: "tasa", tasa: 40 } });

    expect((await saldos(entorno.cookies))["Caja en dólares"]).toBe(10_000 - 1_000);
  });
});

describe("un gasto o ingreso en otra moneda", () => {
  it("usa la cotización de la fecha y la guarda en el movimiento", async () => {
    const entorno = await prepararEntorno();
    const respuesta = await cargar(entorno);
    const movimiento = await leerJson<MovimientoJson>(respuesta);

    expect(respuesta.status).toBe(201);
    expect(movimiento).toMatchObject({
      importeCentavos: 1_000,
      tipoDeCambio: 40,
      importeConvertidoCentavos: 40_000,
      cambioManual: false,
      cuentaFinanciera: { moneda: "USD" },
    });
    expect(fuente.llamadas).toEqual([DIA_DE_LA_FECHA]);
  });

  it("en una cuenta de la moneda base no hay conversión ni consulta", async () => {
    const entorno = await prepararEntorno();
    const movimiento = await leerJson<MovimientoJson>(
      await cargar(entorno, { cuentaFinancieraId: entorno.pesos.id, importe: 123.45 }),
    );

    expect(movimiento).toMatchObject({
      importeCentavos: 12_345,
      tipoDeCambio: 1,
      importeConvertidoCentavos: 12_345,
      cambioManual: false,
    });
    expect(fuente.llamadas).toEqual([]);
  });

  it("acepta una cotización escrita por la persona (la de su banco) y no consulta nada", async () => {
    const entorno = await prepararEntorno();
    const movimiento = await leerJson<MovimientoJson>(
      await cargar(entorno, { cambio: { modo: "tasa", tasa: 38.5 } }),
    );

    expect(movimiento).toMatchObject({
      tipoDeCambio: 38.5,
      importeConvertidoCentavos: 38_500,
      cambioManual: true,
    });
    expect(fuente.llamadas).toEqual([]);
  });

  it("deduce la cotización de lo entregado y lo recibido", async () => {
    const entorno = await prepararEntorno();
    // Se pagaron US$ 10 y el banco cobró $ 395: cotización 39,5.
    const movimiento = await leerJson<MovimientoJson>(
      await cargar(entorno, { cambio: { modo: "importe", importeConvertido: 395 } }),
    );

    expect(movimiento).toMatchObject({
      tipoDeCambio: 39.5,
      importeConvertidoCentavos: 39_500,
      cambioManual: true,
    });
  });

  it("un importe recibido que no es redondo conserva el importe exacto indicado", async () => {
    const entorno = await prepararEntorno();
    // 33,33 por 100 → tasa 0,3333 (redondeada); el convertido guardado es el indicado, no un recálculo.
    const movimiento = await leerJson<MovimientoJson>(
      await cargar(entorno, {
        importe: 100,
        cambio: { modo: "importe", importeConvertido: 4_011.37 },
      }),
    );

    expect(movimiento.importeConvertidoCentavos).toBe(401_137);
    expect(movimiento.tipoDeCambio).toBeCloseTo(40.1137, 8);
  });

  it("el modo automático pedido de forma explícita es igual al de por defecto", async () => {
    const entorno = await prepararEntorno();
    const movimiento = await leerJson<MovimientoJson>(
      await cargar(entorno, { cambio: { modo: "automatico" } }),
    );
    expect(movimiento).toMatchObject({ tipoDeCambio: 40, cambioManual: false });
  });

  it("pedir un cambio en una cuenta de la moneda base es un error", async () => {
    const entorno = await prepararEntorno();
    const respuesta = await cargar(entorno, {
      cuentaFinancieraId: entorno.pesos.id,
      cambio: { modo: "tasa", tasa: 2 },
    });
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(respuesta.status).toBe(400);
    expect(cuerpo.error.campos?.[0]?.campo).toBe("cambio");
  });

  it.each([
    { modo: "tasa", tasa: 0 },
    { modo: "tasa", tasa: -2 },
    { modo: "importe", importeConvertido: 0 },
    { modo: "otro" },
  ])("rechaza un cambio inválido: %j", async (cambio) => {
    const entorno = await prepararEntorno();
    expect((await cargar(entorno, { cambio })).status).toBe(400);
  });

  it("rechaza una cotización con la que el importe convertido no llega a un centésimo", async () => {
    const entorno = await prepararEntorno();
    // $ 0,01 de una cuenta en pesos hacia dólares: 0,01 × 0,025 = 0,00025.
    const respuesta = await transferir(entorno, entorno.pesos, entorno.dolares, { importe: 0.01 });
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(respuesta.status).toBe(400);
    expect(cuerpo.error.campos?.[0]?.campo).toBe("cambio");
  });

  it("sin cotización disponible pide escribirla, y escrita a mano se puede cargar igual", async () => {
    const entorno = await prepararEntorno();
    fuente.caida = true;

    const sin = await cargar(entorno);
    const cuerpo = await leerJson<RespuestaError>(sin);
    expect(sin.status).toBe(400);
    expect(cuerpo.error.campos?.[0]).toMatchObject({ campo: "cambio" });
    expect(cuerpo.error.mensaje).toContain("Escribila");

    const conTasa = await cargar(entorno, { cambio: { modo: "tasa", tasa: 39 } });
    expect(conTasa.status).toBe(201);
  });

  it("acepta el importe máximo en dólares convertido a pesos", async () => {
    const entorno = await prepararEntorno();
    const movimiento = await leerJson<MovimientoJson>(
      await cargar(entorno, { importe: IMPORTE_MAXIMO }),
    );
    expect(movimiento.importeConvertidoCentavos).toBe(IMPORTE_MAXIMO * 100 * 40);
  });

  it("un ingreso en dólares suma a los ingresos en pesos", async () => {
    const entorno = await prepararEntorno();
    await cargar(entorno, { tipo: "ingreso", importe: 50 });

    const { ingresosCentavos } = await resumen(entorno);
    expect(ingresosCentavos).toBe(5_000 * 40);
  });
});

describe("totales en la moneda base", () => {
  it("el resumen suma los gastos ya convertidos de todas las cuentas", async () => {
    const entorno = await prepararEntorno();
    await cargar(entorno, { importe: 10 }); // US$ 10 → $ 400
    await cargar(entorno, { importe: 100, cuentaFinancieraId: entorno.pesos.id }); // $ 100
    await cargar(entorno, { tipo: "ingreso", importe: 1000, cuentaFinancieraId: entorno.pesos.id });

    expect(await resumen(entorno)).toMatchObject({
      monedaBase: "UYU",
      gastosCentavos: 40_000 + 10_000,
      ingresosCentavos: 100_000,
      balanceCentavos: 100_000 - 50_000,
    });
  });

  it("los totales no cambian cuando cambia la cotización: queda la que se usó al cargar", async () => {
    const entorno = await prepararEntorno();
    await cargar(entorno, { importe: 10 });
    fuente.unidadesPorDolar.UYU = 50;
    await cargar(entorno, { importe: 10, fecha: "2026-03-11T12:00:00.000Z" });

    expect((await resumen(entorno)).gastosCentavos).toBe(40_000 + 50_000);
  });

  it("las estadísticas por categoría y los presupuestos usan el importe convertido", async () => {
    const entorno = await prepararEntorno();
    await cargar(entorno, { importe: 10 });
    await pedir(entorno.cookies, `/api/finanzas/presupuestos/${entorno.gastoId}`, "PUT", {
      monto: 1000,
    });

    const estadisticas = await leerJson<{
      gastosPorCategoria: { categoriaId: number; totalCentavos: number }[];
    }>(await pedir(entorno.cookies, `/api/finanzas/estadisticas?periodoId=${entorno.periodoId}`));
    expect(
      estadisticas.gastosPorCategoria.find((g) => g.categoriaId === entorno.gastoId)?.totalCentavos,
    ).toBe(40_000);

    const { presupuestos } = await leerJson<{
      presupuestos: { gastadoCentavos: number; restanteCentavos: number }[];
    }>(await pedir(entorno.cookies, `/api/finanzas/presupuestos?periodoId=${entorno.periodoId}`));
    expect(presupuestos[0]).toMatchObject({ gastadoCentavos: 40_000, restanteCentavos: 60_000 });
  });
});

describe("disponible total", () => {
  it("convierte los saldos en otra moneda con la cotización de hoy y lo marca como estimado", async () => {
    const entorno = await prepararEntorno();
    const antes = await resumen(entorno);

    // Efectivo pesos $ 1000 + caja US$ 100 (× 40) + efectivo dólares 0 + cuentas por defecto vacías.
    expect(antes).toMatchObject({
      disponibleCentavos: 100_000 + 10_000 * 40,
      disponibleEsEstimado: true,
      monedasSinCotizacion: [],
    });
  });

  it("si todas las cuentas están en la moneda base, no es una estimación", async () => {
    const datos = await registrarAprobado(app, cliente);
    const cookies = cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
    const periodo = await abrirPeriodoAmplio(app, cookies);
    const respuesta = await leerJson<{
      disponibleEsEstimado: boolean;
      monedasSinCotizacion: string[];
    }>(await pedir(cookies, `/api/finanzas/resumen?periodoId=${periodo.id}`));

    expect(respuesta.disponibleEsEstimado).toBe(false);
    expect(respuesta.monedasSinCotizacion).toEqual([]);
  });

  it("sin cotización de una moneda, esa cuenta no suma y se avisa", async () => {
    const entorno = await prepararEntorno();
    fuente.caida = true;

    expect(await resumen(entorno)).toMatchObject({
      disponibleCentavos: 100_000,
      disponibleEsEstimado: true,
      monedasSinCotizacion: ["USD"],
    });
  });

  it("un saldo negativo en dólares (una deuda) resta convertido", async () => {
    const entorno = await prepararEntorno();
    await cargar(entorno, { importe: 150, cambio: { modo: "tasa", tasa: 40 } }); // la caja queda en US$ -50

    const { disponibleCentavos } = await resumen(entorno);
    expect(disponibleCentavos).toBe(100_000 - 5_000 * 40);
  });
});

describe("transferencias entre cuentas de distinta moneda", () => {
  it("de pesos a dólares usa la cotización de la fecha: sale en pesos y llega en dólares", async () => {
    const entorno = await prepararEntorno();
    const respuesta = await transferir(entorno, entorno.pesos, entorno.dolares, { importe: 400 });
    const movimiento = await leerJson<MovimientoJson>(respuesta);

    expect(respuesta.status).toBe(201);
    expect(movimiento).toMatchObject({
      importeCentavos: 40_000,
      tipoDeCambio: 0.025,
      importeConvertidoCentavos: 1_000,
      cambioManual: false,
      cuentaFinanciera: { moneda: "UYU" },
      cuentaDestino: { moneda: "USD" },
    });
    const despues = await saldos(entorno.cookies);
    expect(despues["Efectivo pesos"]).toBe(100_000 - 40_000);
    expect(despues["Caja en dólares"]).toBe(10_000 + 1_000);
  });

  it("de dólares a pesos", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno, entorno.dolares, entorno.pesos, { importe: 10 });

    const despues = await saldos(entorno.cookies);
    expect(despues["Caja en dólares"]).toBe(10_000 - 1_000);
    expect(despues["Efectivo pesos"]).toBe(100_000 + 40_000);
  });

  it("indicando los dos importes, la cotización se deduce", async () => {
    const entorno = await prepararEntorno();
    // Se entregaron $ 4.000 y llegaron US$ 98: cotización 0,0245.
    const movimiento = await leerJson<MovimientoJson>(
      await transferir(entorno, entorno.pesos, entorno.dolares, {
        importe: 4000,
        cambio: { modo: "importe", importeConvertido: 98 },
      }),
    );

    expect(movimiento).toMatchObject({
      importeCentavos: 400_000,
      importeConvertidoCentavos: 9_800,
      tipoDeCambio: 0.0245,
      cambioManual: true,
    });
    expect((await saldos(entorno.cookies))["Caja en dólares"]).toBe(10_000 + 9_800);
  });

  it("con una cotización escrita", async () => {
    const entorno = await prepararEntorno();
    const movimiento = await leerJson<MovimientoJson>(
      await transferir(entorno, entorno.pesos, entorno.dolares, {
        importe: 400,
        cambio: { modo: "tasa", tasa: 0.0255 },
      }),
    );
    expect(movimiento).toMatchObject({ importeConvertidoCentavos: 1_020, cambioManual: true });
  });

  it("entre dos cuentas de la misma moneda extranjera no hay conversión", async () => {
    const entorno = await prepararEntorno();
    const movimiento = await leerJson<MovimientoJson>(
      await transferir(entorno, entorno.dolares, entorno.masDolares, { importe: 25 }),
    );

    expect(movimiento).toMatchObject({
      tipoDeCambio: 1,
      importeCentavos: 2_500,
      importeConvertidoCentavos: 2_500,
    });
    expect(fuente.llamadas).toEqual([]);
    const despues = await saldos(entorno.cookies);
    expect(despues["Caja en dólares"]).toBe(10_000 - 2_500);
    expect(despues["Efectivo dólares"]).toBe(2_500);
  });

  it("no es ingreso ni gasto: no cuenta en los totales, y el disponible solo cambia por la diferencia de cotización", async () => {
    const entorno = await prepararEntorno();
    const antes = await resumen(entorno);
    await transferir(entorno, entorno.pesos, entorno.dolares, { importe: 400 });
    const despues = await resumen(entorno);

    expect(despues.ingresosCentavos).toBe(0);
    expect(despues.gastosCentavos).toBe(0);
    // $ 400 salieron y llegaron US$ 10 = $ 400 a la cotización de hoy: el total se mantiene.
    expect(despues.disponibleCentavos).toBe(antes.disponibleCentavos);
  });

  it("el historial de la cuenta de destino muestra lo que llegó y con qué cambio", async () => {
    const entorno = await prepararEntorno();
    await transferir(entorno, entorno.pesos, entorno.dolares, {
      importe: 4000,
      cambio: { modo: "importe", importeConvertido: 98 },
    });

    const destino = await leerJson<{ items: ItemJson[] }>(
      await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.dolares.id}/historial`),
    );
    const llegada = destino.items.find((item) => item.origen === "movimiento");
    expect(llegada?.montoCentavos).toBe(9_800);
    expect(llegada?.cambio).toEqual({
      tipoDeCambio: 0.0245,
      manual: true,
      convertidoCentavos: 9_800,
      monedaDeOrigen: "UYU",
      monedaDeDestino: "USD",
    });

    const origen = await leerJson<{ items: ItemJson[] }>(
      await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.pesos.id}/historial`),
    );
    expect(origen.items.find((item) => item.origen === "movimiento")?.montoCentavos).toBe(-400_000);
  });

  it("el historial de un gasto en dólares muestra su equivalente en pesos", async () => {
    const entorno = await prepararEntorno();
    await cargar(entorno);

    const historial = await leerJson<{ items: ItemJson[] }>(
      await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.dolares.id}/historial`),
    );
    const gasto = historial.items.find((item) => item.origen === "movimiento");
    expect(gasto?.montoCentavos).toBe(-1_000);
    expect(gasto?.cambio).toMatchObject({
      tipoDeCambio: 40,
      convertidoCentavos: 40_000,
      monedaDeOrigen: "USD",
      monedaDeDestino: null,
    });
  });
});

describe("editar y duplicar un movimiento en otra moneda", () => {
  it("al editar sin tocar el cambio se conserva la cotización guardada, aunque ya valga otra", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, { cambio: { modo: "tasa", tasa: 38.5 } }),
    );

    fuente.unidadesPorDolar.UYU = 55;
    const editado = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}`, "PATCH", {
        tipo: "gasto",
        importe: 10,
        descripcion: "Otra descripción",
        fecha: FECHA,
        categoriaId: entorno.gastoId,
        cuentaFinancieraId: entorno.dolares.id,
      }),
    );

    expect(editado).toMatchObject({
      descripcion: "Otra descripción",
      tipoDeCambio: 38.5,
      importeConvertidoCentavos: 38_500,
      cambioManual: true,
    });
    expect(fuente.llamadas).toEqual([]);
  });

  it("al cambiar el importe se recalcula con la misma cotización", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, { cambio: { modo: "tasa", tasa: 38.5 } }),
    );

    const editado = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}`, "PATCH", {
        tipo: "gasto",
        importe: 20,
        descripcion: "Compra",
        fecha: FECHA,
        categoriaId: entorno.gastoId,
        cuentaFinancieraId: entorno.dolares.id,
      }),
    );
    expect(editado).toMatchObject({ tipoDeCambio: 38.5, importeConvertidoCentavos: 77_000 });
  });

  it("sin cambiar el importe se conserva el importe convertido exacto que se había indicado", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, {
        importe: 100,
        cambio: { modo: "importe", importeConvertido: 4_011.37 },
      }),
    );

    const editado = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}`, "PATCH", {
        tipo: "gasto",
        importe: 100,
        descripcion: "Compra editada",
        fecha: FECHA,
        categoriaId: entorno.gastoId,
        cuentaFinancieraId: entorno.dolares.id,
      }),
    );
    expect(editado.importeConvertidoCentavos).toBe(401_137);
  });

  it("pidiendo el modo automático al editar, vuelve a la cotización de la fecha", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, { cambio: { modo: "tasa", tasa: 38.5 } }),
    );

    const editado = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}`, "PATCH", {
        tipo: "gasto",
        importe: 10,
        descripcion: "Compra",
        fecha: FECHA,
        categoriaId: entorno.gastoId,
        cuentaFinancieraId: entorno.dolares.id,
        cambio: { modo: "automatico" },
      }),
    );
    expect(editado).toMatchObject({ tipoDeCambio: 40, cambioManual: false });
  });

  it("al pasar el movimiento a una cuenta de otra moneda, se calcula de nuevo", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, { cambio: { modo: "tasa", tasa: 38.5 } }),
    );

    const aPesos = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}`, "PATCH", {
        tipo: "gasto",
        importe: 10,
        descripcion: "Compra",
        fecha: FECHA,
        categoriaId: entorno.gastoId,
        cuentaFinancieraId: entorno.pesos.id,
      }),
    );
    expect(aPesos).toMatchObject({
      tipoDeCambio: 1,
      importeConvertidoCentavos: 1_000,
      cambioManual: false,
    });
  });

  it("al editar una transferencia se conserva su cotización", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await transferir(entorno, entorno.pesos, entorno.dolares, {
        importe: 4000,
        cambio: { modo: "importe", importeConvertido: 98 },
      }),
    );

    fuente.unidadesPorDolar.UYU = 60;
    const editado = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}`, "PATCH", {
        tipo: "neutro",
        importe: 4000,
        descripcion: "Cambié plata otra vez",
        fecha: FECHA,
        categoriaId: entorno.transferenciaId,
        cuentaFinancieraId: entorno.pesos.id,
        cuentaDestinoId: entorno.dolares.id,
      }),
    );
    expect(editado).toMatchObject({ tipoDeCambio: 0.0245, importeConvertidoCentavos: 9_800 });
  });

  it("duplicar repite la cotización que la persona fijó", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(
      await cargar(entorno, { cambio: { modo: "tasa", tasa: 38.5 } }),
    );

    const copia = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}/duplicar`, "POST"),
    );
    expect(copia).toMatchObject({
      tipoDeCambio: 38.5,
      importeConvertidoCentavos: 38_500,
      cambioManual: true,
    });
  });

  it("duplicar un movimiento con cotización automática usa la de ese momento", async () => {
    const entorno = await prepararEntorno();
    const creado = await leerJson<MovimientoJson>(await cargar(entorno));
    fuente.unidadesPorDolar.UYU = 42;
    fuente.llamadas.length = 0;

    const copia = await leerJson<MovimientoJson>(
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${creado.id}/duplicar`, "POST"),
    );
    expect(copia).toMatchObject({ tipoDeCambio: 42, cambioManual: false });
    expect(fuente.llamadas).toEqual(["ultimas"]);
  });
});

describe("GET /api/finanzas/cotizacion", () => {
  it("devuelve la tasa entre dos monedas para una fecha", async () => {
    const entorno = await prepararEntorno();
    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/cotizacion?desde=USD&hacia=UYU&fecha=${encodeURIComponent(FECHA)}`,
    );

    expect(respuesta.status).toBe(200);
    expect(await leerJson(respuesta)).toEqual({
      tasa: 40,
      fechaDeLaFuente: DIA_DE_LA_FECHA,
      desactualizada: false,
    });
  });

  it("sin fecha usa la de hoy", async () => {
    const entorno = await prepararEntorno();
    await pedir(entorno.cookies, "/api/finanzas/cotizacion?desde=UYU&hacia=USD");
    expect(fuente.llamadas).toEqual(["ultimas"]);
  });

  it("la misma moneda de los dos lados da 1", async () => {
    const entorno = await prepararEntorno();
    const cuerpo = await leerJson<{ tasa: number }>(
      await pedir(entorno.cookies, "/api/finanzas/cotizacion?desde=USD&hacia=USD"),
    );
    expect(cuerpo.tasa).toBe(1);
  });

  it("rechaza una moneda desconocida o que falte, y una fecha inválida", async () => {
    const entorno = await prepararEntorno();
    for (const consulta of [
      "desde=XYZ&hacia=UYU",
      "desde=USD",
      "hacia=UYU",
      "desde=USD&hacia=UYU&fecha=ayer",
    ]) {
      const respuesta = await pedir(entorno.cookies, `/api/finanzas/cotizacion?${consulta}`);
      expect(respuesta.status).toBe(400);
    }
  });

  it("sin cotización disponible responde 503 con un código estable", async () => {
    const entorno = await prepararEntorno();
    fuente.caida = true;
    const respuesta = await pedir(entorno.cookies, "/api/finanzas/cotizacion?desde=USD&hacia=UYU");
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(respuesta.status).toBe(503);
    expect(cuerpo.error.codigo).toBe("COTIZACION_NO_DISPONIBLE");
  });

  it("exige sesión", async () => {
    const respuesta = await app.request("/api/finanzas/cotizacion?desde=USD&hacia=UYU");
    expect(respuesta.status).toBe(401);
  });
});

describe("privacidad con varias monedas", () => {
  it("no se puede cargar un movimiento en una cuenta en dólares de otra persona", async () => {
    const entorno = await prepararEntorno();
    const otro = await registrarAprobado(app, cliente);
    const cookiesDelOtro = cookiesDe(await entrarConUsuario(app, otro.usuario, otro.password));
    await abrirPeriodoAmplio(app, cookiesDelOtro);
    // Con una categoría propia, para que lo único ajeno sea la cuenta.
    const { categorias } = await leerJson<{ categorias: CategoriaJson[] }>(
      await pedir(cookiesDelOtro, "/api/finanzas/categorias"),
    );

    const respuesta = await pedir(cookiesDelOtro, "/api/finanzas/movimientos", "POST", {
      tipo: "gasto",
      importe: 10,
      descripcion: "Intruso",
      fecha: FECHA,
      categoriaId: categorias.find((c) => c.sistema === null)?.id ?? 0,
      cuentaFinancieraId: entorno.dolares.id,
    });
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(respuesta.status).toBe(400);
    expect(cuerpo.error.campos?.[0]?.campo).toBe("cuentaFinancieraId");
  });
});

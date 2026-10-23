// Tests de integración de los widgets de Finanzas, contra gestion_test.
//
// Los datos se arman por la API real; el cálculo se prueba llamando al servicio con
// un `ahora` fijo (cuántos días van, hace cuánto fue el último movimiento), y la ruta
// se prueba aparte (sesión, aislamiento entre personas y forma de la respuesta).

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { crearFuenteDePrueba } from "../../pruebas/cotizaciones-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { abrirPeriodo, cerrarPeriodo } from "../../pruebas/periodos-de-prueba.ts";
import { obtenerWidgetsDeFinanzas, type WidgetsDeFinanzas } from "./widgets.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
const fuente = crearFuenteDePrueba();

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente, undefined, fuente.fuente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
});

afterAll(async () => {
  await cliente.cerrar();
});

/** Setiembre abierto desde el 1/9 a las 00:00 UTC; "ahora" es el 11/9 a mediodía: van 11 días. */
const AHORA = new Date("2026-09-11T12:00:00.000Z");

type CategoriaJson = { id: number; nombre: string; sistema: string | null };
type CuentaJson = { id: string; nombre: string; saldoCentavos: number };

type Entorno = {
  cookies: string;
  userId: string;
  cuentaId: string;
  /** Dos categorías comunes. */
  comida: CategoriaJson;
  ocio: CategoriaJson;
};

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

async function prepararEntorno(): Promise<Entorno> {
  const datos = await registrarAprobado(app, cliente);
  const cookies = cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
  const usuario = await cliente.db.query.usuarios.findFirst({
    where: (tabla, { eq }) => eq(tabla.email, datos.email),
    columns: { id: true },
  });
  const { categorias } = await leerJson<{ categorias: CategoriaJson[] }>(
    await pedir(cookies, "/api/finanzas/categorias"),
  );
  const { cuentas } = await leerJson<{ cuentas: CuentaJson[] }>(
    await pedir(cookies, "/api/finanzas/cuentas"),
  );
  const comunes = categorias.filter((categoria) => categoria.sistema === null);
  return {
    cookies,
    userId: usuario?.id ?? "",
    cuentaId: cuentas[0]?.id ?? "",
    comida: comunes[0] as CategoriaJson,
    ocio: comunes[1] as CategoriaJson,
  };
}

async function cargar(
  entorno: Entorno,
  datos: {
    tipo: "ingreso" | "gasto";
    importe: number;
    fecha: string;
    categoriaId?: number;
    descripcion?: string;
    cuentaFinancieraId?: string;
  },
): Promise<void> {
  const respuesta = await pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
    descripcion: "Movimiento",
    cuentaFinancieraId: entorno.cuentaId,
    categoriaId: entorno.comida.id,
    ...datos,
  });
  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear el movimiento (${respuesta.status}): ${await respuesta.text()}`,
    );
  }
}

async function fijarPresupuesto(entorno: Entorno, categoriaId: number, monto: number) {
  const respuesta = await pedir(
    entorno.cookies,
    `/api/finanzas/presupuestos/${categoriaId}`,
    "PUT",
    {
      monto,
    },
  );
  expect(respuesta.status).toBe(200);
}

function widgets(entorno: Entorno, ahora = AHORA): Promise<WidgetsDeFinanzas> {
  return obtenerWidgetsDeFinanzas(cliente, entorno.userId, { ahora, fuente: fuente.fuente });
}

async function abrirSetiembre(entorno: Entorno) {
  return abrirPeriodo(app, entorno.cookies, {
    nombre: "Setiembre",
    aperturaEn: "2026-09-01T00:00:00.000Z",
  });
}

describe("obtenerWidgetsDeFinanzas", () => {
  it("sin ningún período devuelve solo lo que no depende de uno", async () => {
    const entorno = await prepararEntorno();

    const resultado = await widgets(entorno);

    expect(resultado.periodo).toBeNull();
    expect(resultado.monedaBase).toBe("UYU");
    expect(resultado.disponible).toEqual({
      centavos: 0,
      esEstimado: false,
      monedasSinCotizacion: [],
    });
    expect(resultado.cuentasEnNegativo).toEqual([]);
  });

  it("calcula ingresos, gastos y balance del período y los compara con el anterior", async () => {
    const entorno = await prepararEntorno();
    const agosto = await abrirPeriodo(app, entorno.cookies, {
      nombre: "Agosto",
      aperturaEn: "2026-08-01T00:00:00.000Z",
    });
    await cerrarPeriodo(app, entorno.cookies, agosto.id, { cierreEn: "2026-09-01T00:00:00.000Z" });
    await abrirSetiembre(entorno);
    await cargar(entorno, { tipo: "ingreso", importe: 500, fecha: "2026-08-02T12:00:00.000Z" });
    await cargar(entorno, { tipo: "gasto", importe: 100, fecha: "2026-08-03T12:00:00.000Z" });
    await cargar(entorno, { tipo: "ingreso", importe: 1000, fecha: "2026-09-02T12:00:00.000Z" });
    await cargar(entorno, { tipo: "gasto", importe: 300, fecha: "2026-09-05T12:00:00.000Z" });

    const { periodo } = await widgets(entorno);

    expect(periodo).toMatchObject({
      nombre: "Setiembre",
      abierto: true,
      diasTranscurridos: 11,
      ingresosCentavos: 100_000,
      gastosCentavos: 30_000,
      balanceCentavos: 70_000,
      cantidadDeMovimientos: 2,
      anterior: { nombre: "Agosto", balanceCentavos: 40_000, gastosAlMismoDiaCentavos: 10_000 },
    });
  });

  it("el primer período no tiene anterior con el que compararse", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);

    const { periodo } = await widgets(entorno);

    expect(periodo?.anterior).toBeNull();
  });

  it("dice en qué categoría se gastó más, con su parte del total", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);
    await cargar(entorno, { tipo: "gasto", importe: 150, fecha: "2026-09-02T12:00:00.000Z" });
    await cargar(entorno, { tipo: "gasto", importe: 50, fecha: "2026-09-03T12:00:00.000Z" });
    await cargar(entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-09-04T12:00:00.000Z",
      categoriaId: entorno.ocio.id,
    });

    const { periodo } = await widgets(entorno);

    expect(periodo?.categoriaPrincipal).toMatchObject({
      nombre: entorno.comida.nombre,
      totalCentavos: 20_000,
      porcentajeDelGasto: 67,
    });
  });

  it("devuelve el promedio por día, el gasto más grande y hace cuánto fue el último movimiento", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);
    await cargar(entorno, {
      tipo: "gasto",
      importe: 110,
      fecha: "2026-09-02T12:00:00.000Z",
      descripcion: "Chico",
    });
    await cargar(entorno, {
      tipo: "gasto",
      importe: 880,
      fecha: "2026-09-06T12:00:00.000Z",
      descripcion: "Grande",
    });

    const { periodo } = await widgets(entorno);

    // 990 repartido en 11 días.
    expect(periodo?.promedioPorDiaCentavos).toBe(9_000);
    expect(periodo?.gastoMasGrande).toMatchObject({
      importeCentavos: 88_000,
      descripcion: "Grande",
      categoria: entorno.comida.nombre,
    });
    // Del 6/9 a mediodía al 11/9 a mediodía: 5 días justos.
    expect(periodo?.diasDesdeElUltimoMovimiento).toBe(5);
  });

  it("sin gastos no inventa categoría principal ni gasto más grande", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);
    await cargar(entorno, { tipo: "ingreso", importe: 100, fecha: "2026-09-02T12:00:00.000Z" });

    const { periodo } = await widgets(entorno);

    expect(periodo).toMatchObject({
      categoriaPrincipal: null,
      gastoMasGrande: null,
      promedioPorDiaCentavos: 0,
    });
  });

  it("un período sin movimientos no tiene fecha del último", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);

    const { periodo } = await widgets(entorno);

    expect(periodo).toMatchObject({ cantidadDeMovimientos: 0, diasDesdeElUltimoMovimiento: null });
  });

  it("un movimiento cargado hoy mismo cuenta cero días, aunque tenga fecha posterior", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);
    await cargar(entorno, { tipo: "gasto", importe: 10, fecha: "2026-09-11T11:00:00.000Z" });
    await cargar(entorno, { tipo: "gasto", importe: 10, fecha: "2026-09-20T12:00:00.000Z" });

    const { periodo } = await widgets(entorno);

    expect(periodo?.diasDesdeElUltimoMovimiento).toBe(0);
  });

  it("sin período abierto mira el más reciente, marcado como cerrado", async () => {
    const entorno = await prepararEntorno();
    const julio = await abrirPeriodo(app, entorno.cookies, {
      nombre: "Julio",
      aperturaEn: "2026-07-01T00:00:00.000Z",
    });
    await cerrarPeriodo(app, entorno.cookies, julio.id, { cierreEn: "2026-08-01T00:00:00.000Z" });
    const agosto = await abrirPeriodo(app, entorno.cookies, {
      nombre: "Agosto",
      aperturaEn: "2026-08-01T00:00:00.000Z",
    });
    await cerrarPeriodo(app, entorno.cookies, agosto.id, { cierreEn: "2026-09-01T00:00:00.000Z" });

    const { periodo } = await widgets(entorno);

    expect(periodo).toMatchObject({ nombre: "Agosto", abierto: false });
  });

  describe("presupuestos", () => {
    it("avisa de los superados y de los que van por el 80 % o más, y no de los demás", async () => {
      const entorno = await prepararEntorno();
      await abrirSetiembre(entorno);
      const [, , tercera, cuarta] = (
        await leerJson<{ categorias: CategoriaJson[] }>(
          await pedir(entorno.cookies, "/api/finanzas/categorias"),
        )
      ).categorias.filter((categoria) => categoria.sistema === null);
      // Comida: se pasó (120 de 100). Ocio: justo 80 %. Tercera: 79 %. Cuarta: sin gastar.
      await fijarPresupuesto(entorno, entorno.comida.id, 100);
      await fijarPresupuesto(entorno, entorno.ocio.id, 100);
      await fijarPresupuesto(entorno, tercera?.id ?? 0, 100);
      await fijarPresupuesto(entorno, cuarta?.id ?? 0, 100);
      await cargar(entorno, { tipo: "gasto", importe: 120, fecha: "2026-09-02T12:00:00.000Z" });
      await cargar(entorno, {
        tipo: "gasto",
        importe: 80,
        fecha: "2026-09-02T12:00:00.000Z",
        categoriaId: entorno.ocio.id,
      });
      await cargar(entorno, {
        tipo: "gasto",
        importe: 79,
        fecha: "2026-09-02T12:00:00.000Z",
        categoriaId: tercera?.id ?? 0,
      });

      const { periodo } = await widgets(entorno);

      expect(periodo?.presupuestos.superados).toEqual([
        { nombre: entorno.comida.nombre, diferenciaCentavos: 2_000, usadoPorcentaje: 120 },
      ]);
      expect(periodo?.presupuestos.porAgotarse).toEqual([
        { nombre: entorno.ocio.nombre, diferenciaCentavos: 2_000, usadoPorcentaje: 80 },
      ]);
    });

    it("llegar justo al límite no es pasarse: queda por agotarse", async () => {
      const entorno = await prepararEntorno();
      await abrirSetiembre(entorno);
      await fijarPresupuesto(entorno, entorno.comida.id, 100);
      await cargar(entorno, { tipo: "gasto", importe: 100, fecha: "2026-09-02T12:00:00.000Z" });

      const { periodo } = await widgets(entorno);

      expect(periodo?.presupuestos.superados).toEqual([]);
      expect(periodo?.presupuestos.porAgotarse).toEqual([
        { nombre: entorno.comida.nombre, diferenciaCentavos: 0, usadoPorcentaje: 100 },
      ]);
    });

    it("lista como mucho tres de cada tipo, los más pasados primero", async () => {
      const entorno = await prepararEntorno();
      await abrirSetiembre(entorno);
      const comunes = (
        await leerJson<{ categorias: CategoriaJson[] }>(
          await pedir(entorno.cookies, "/api/finanzas/categorias"),
        )
      ).categorias.filter((categoria) => categoria.sistema === null);
      expect(comunes.length).toBeGreaterThanOrEqual(5);
      // Cinco categorías pasadas en 110 %, 130 %, 150 %, 170 % y 190 %.
      for (const [indice, categoria] of comunes.slice(0, 5).entries()) {
        await fijarPresupuesto(entorno, categoria.id, 100);
        await cargar(entorno, {
          tipo: "gasto",
          importe: 110 + indice * 20,
          fecha: "2026-09-02T12:00:00.000Z",
          categoriaId: categoria.id,
        });
      }

      const { periodo } = await widgets(entorno);

      expect(periodo?.presupuestos.superados.map((p) => p.usadoPorcentaje)).toEqual([
        190, 170, 150,
      ]);
    });

    it("no cuenta lo gastado en otro período", async () => {
      const entorno = await prepararEntorno();
      const agosto = await abrirPeriodo(app, entorno.cookies, {
        nombre: "Agosto",
        aperturaEn: "2026-08-01T00:00:00.000Z",
      });
      await cerrarPeriodo(app, entorno.cookies, agosto.id, {
        cierreEn: "2026-09-01T00:00:00.000Z",
      });
      await abrirSetiembre(entorno);
      await fijarPresupuesto(entorno, entorno.comida.id, 100);
      await cargar(entorno, { tipo: "gasto", importe: 500, fecha: "2026-08-10T12:00:00.000Z" });

      const { periodo } = await widgets(entorno);

      // Nada superado ni por agotarse, y el total presupuestado no incluye lo gastado en agosto.
      expect(periodo?.presupuestos).toEqual({
        superados: [],
        porAgotarse: [],
        total: { presupuestadoCentavos: 10_000, gastadoCentavos: 0 },
      });
    });
  });

  describe("cuentas y disponible", () => {
    it("avisa de las cuentas visibles que quedaron en negativo, con su saldo", async () => {
      const entorno = await prepararEntorno();
      await abrirSetiembre(entorno);
      await cargar(entorno, { tipo: "gasto", importe: 250, fecha: "2026-09-02T12:00:00.000Z" });

      const resultado = await widgets(entorno);

      expect(resultado.cuentasEnNegativo).toHaveLength(1);
      expect(resultado.cuentasEnNegativo[0]).toMatchObject({
        moneda: "UYU",
        saldoCentavos: -25_000,
      });
      expect(resultado.disponible.centavos).toBe(-25_000);
    });

    it("una cuenta oculta en negativo no se avisa, pero sigue sumando al disponible", async () => {
      const entorno = await prepararEntorno();
      await abrirSetiembre(entorno);
      await cargar(entorno, { tipo: "gasto", importe: 250, fecha: "2026-09-02T12:00:00.000Z" });
      expect(
        (await pedir(entorno.cookies, `/api/finanzas/cuentas/${entorno.cuentaId}/ocultar`, "POST"))
          .status,
      ).toBe(200);

      const resultado = await widgets(entorno);

      expect(resultado.cuentasEnNegativo).toEqual([]);
      expect(resultado.disponible.centavos).toBe(-25_000);
    });

    it("convierte las cuentas en otra moneda y avisa de que el disponible es una estimación", async () => {
      const entorno = await prepararEntorno();
      const dolares = await leerJson<CuentaJson>(
        await pedir(entorno.cookies, "/api/finanzas/cuentas", "POST", {
          nombre: "Caja en dólares",
          saldoInicial: 100,
          moneda: "USD",
        }),
      );
      expect(dolares.saldoCentavos).toBe(10_000);

      const { disponible } = await widgets(entorno);

      // 1 dólar = 40 pesos en la fuente de prueba.
      expect(disponible).toEqual({
        centavos: 400_000,
        esEstimado: true,
        monedasSinCotizacion: [],
      });
    });

    it("si no hay cotización de una moneda, esa cuenta no suma y se avisa", async () => {
      const entorno = await prepararEntorno();
      await pedir(entorno.cookies, "/api/finanzas/cuentas", "POST", {
        nombre: "Caja en dólares",
        saldoInicial: 100,
        moneda: "USD",
      });
      const sinFuente = crearFuenteDePrueba();
      sinFuente.caida = true;

      const { disponible } = await obtenerWidgetsDeFinanzas(cliente, entorno.userId, {
        ahora: AHORA,
        fuente: sinFuente.fuente,
      });

      expect(disponible).toEqual({
        centavos: 0,
        esEstimado: true,
        monedasSinCotizacion: ["USD"],
      });
    });
  });
});

describe("datos para los gráficos", () => {
  async function conAgostoYSetiembre(entorno: Entorno) {
    const agosto = await abrirPeriodo(app, entorno.cookies, {
      nombre: "Agosto",
      aperturaEn: "2026-08-01T00:00:00.000Z",
    });
    await cerrarPeriodo(app, entorno.cookies, agosto.id, { cierreEn: "2026-09-01T00:00:00.000Z" });
    await abrirSetiembre(entorno);
  }

  it("la evolución trae los últimos períodos, del más viejo al actual", async () => {
    const entorno = await prepararEntorno();
    await conAgostoYSetiembre(entorno);
    await cargar(entorno, { tipo: "gasto", importe: 100, fecha: "2026-08-03T12:00:00.000Z" });
    await cargar(entorno, { tipo: "ingreso", importe: 500, fecha: "2026-09-02T12:00:00.000Z" });
    await cargar(entorno, { tipo: "gasto", importe: 300, fecha: "2026-09-05T12:00:00.000Z" });

    const { periodo } = await widgets(entorno);

    expect(periodo?.evolucion).toEqual([
      { nombre: "Agosto", ingresosCentavos: 0, gastosCentavos: 10_000 },
      { nombre: "Setiembre", ingresosCentavos: 50_000, gastosCentavos: 30_000 },
    ]);
  });

  it("el ritmo compara día a día con el período anterior; sin anterior es null", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);
    expect((await widgets(entorno)).periodo?.ritmo).toBeNull();

    await limpiarBase(cliente);
    const otro = await prepararEntorno();
    await conAgostoYSetiembre(otro);
    await cargar(otro, { tipo: "gasto", importe: 100, fecha: "2026-08-03T12:00:00.000Z" });
    await cargar(otro, { tipo: "gasto", importe: 40, fecha: "2026-09-02T12:00:00.000Z" });

    const ritmo = (await widgets(otro)).periodo?.ritmo;

    // Setiembre lleva 11 días; Agosto duró 31: el actual se corta en el día 11 y el anterior sigue.
    expect(ritmo?.actualCentavos).toHaveLength(31);
    expect(ritmo?.actualCentavos.slice(0, 11)).toEqual([
      0, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000,
    ]);
    expect(ritmo?.actualCentavos[11]).toBeNull();
    expect(ritmo?.anteriorCentavos[0]).toBe(0);
    expect(ritmo?.anteriorCentavos[2]).toBe(10_000);
    expect(ritmo?.anteriorCentavos[30]).toBe(10_000);
  });

  it("el gasto diario trae los últimos siete días, con ceros en los que no se gastó", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);
    await cargar(entorno, { tipo: "gasto", importe: 110, fecha: "2026-09-02T12:00:00.000Z" });
    await cargar(entorno, { tipo: "gasto", importe: 880, fecha: "2026-09-06T12:00:00.000Z" });

    const { periodo } = await widgets(entorno);

    // Van 11 días: los últimos siete son del día 5 al 11, y el gasto del 6 es el segundo.
    expect(periodo?.gastoDiarioCentavos).toEqual([0, 88_000, 0, 0, 0, 0, 0]);
  });

  it("con menos de siete días trae los que hay", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);

    const { periodo } = await widgets(entorno, new Date("2026-09-03T06:00:00.000Z"));

    expect(periodo?.gastoDiarioCentavos).toEqual([0, 0, 0]);
  });

  it("las categorías principales son las tres que más gastaron, de mayor a menor", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);
    const comunes = (
      await leerJson<{ categorias: CategoriaJson[] }>(
        await pedir(entorno.cookies, "/api/finanzas/categorias"),
      )
    ).categorias.filter((categoria) => categoria.sistema === null);
    for (const [indice, categoria] of comunes.slice(0, 4).entries()) {
      await cargar(entorno, {
        tipo: "gasto",
        importe: 100 * (indice + 1),
        fecha: "2026-09-02T12:00:00.000Z",
        categoriaId: categoria.id,
      });
    }

    const { periodo } = await widgets(entorno);

    expect(periodo?.categoriasPrincipales.map((categoria) => categoria.totalCentavos)).toEqual([
      40_000, 30_000, 20_000,
    ]);
    expect(periodo?.categoriasPrincipales[0]?.color).toMatch(/^#/);
  });

  it("el total presupuestado suma los límites y lo gastado en esas categorías; sin límites es null", async () => {
    const entorno = await prepararEntorno();
    await abrirSetiembre(entorno);
    await cargar(entorno, { tipo: "gasto", importe: 70, fecha: "2026-09-02T12:00:00.000Z" });
    // Gasto en una categoría sin límite: no cuenta en el total presupuestado.
    await cargar(entorno, {
      tipo: "gasto",
      importe: 500,
      fecha: "2026-09-02T12:00:00.000Z",
      categoriaId: entorno.ocio.id,
    });
    expect((await widgets(entorno)).periodo?.presupuestos.total).toBeNull();

    await fijarPresupuesto(entorno, entorno.comida.id, 100);

    expect((await widgets(entorno)).periodo?.presupuestos.total).toEqual({
      presupuestadoCentavos: 10_000,
      gastadoCentavos: 7_000,
    });
  });
});

describe("GET /api/finanzas/widgets", () => {
  it("responde 401 sin sesión", async () => {
    expect((await app.request("/api/finanzas/widgets")).status).toBe(401);
  });

  it("responde con la forma esperada, sin pedir ningún parámetro", async () => {
    const entorno = await prepararEntorno();
    await abrirPeriodo(app, entorno.cookies, { aperturaEn: "2026-01-01T00:00:00.000Z" });
    await cargar(entorno, { tipo: "gasto", importe: 40, fecha: "2026-03-01T12:00:00.000Z" });

    const respuesta = await pedir(entorno.cookies, "/api/finanzas/widgets");

    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<WidgetsDeFinanzas>(respuesta);
    expect(cuerpo.monedaBase).toBe("UYU");
    expect(cuerpo.periodo).toMatchObject({ abierto: true, gastosCentavos: 4_000 });
    expect(cuerpo.disponible.centavos).toBe(-4_000);
  });

  it("solo muestra los datos de la persona de la sesión", async () => {
    const dueno = await prepararEntorno();
    await abrirPeriodo(app, dueno.cookies, { aperturaEn: "2026-01-01T00:00:00.000Z" });
    await cargar(dueno, { tipo: "gasto", importe: 999, fecha: "2026-03-01T12:00:00.000Z" });
    const otra = await prepararEntorno();

    const cuerpo = await leerJson<WidgetsDeFinanzas>(
      await pedir(otra.cookies, "/api/finanzas/widgets"),
    );

    expect(cuerpo.periodo).toBeNull();
    expect(cuerpo.disponible.centavos).toBe(0);
    expect(cuerpo.cuentasEnNegativo).toEqual([]);
  });
});

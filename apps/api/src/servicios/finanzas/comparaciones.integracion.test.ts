// Tests de integración de las estadísticas comparativas (variación por categoría, ritmo
// de gasto y datos rápidos), contra gestion_test. Se prueban por la API con períodos
// cerrados (no dependen de la hora actual) y, para el período abierto, llamando al
// servicio con un "ahora" fijo.

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { abrirPeriodo, cerrarPeriodo, type PeriodoJson } from "../../pruebas/periodos-de-prueba.ts";
import { type EstadisticasComparativas, estadisticasComparativas } from "./comparaciones.ts";
import type { Periodo } from "./periodos.ts";

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

type Entorno = {
  cookies: string;
  userId: string;
  cuentaId: string;
  categorias: Record<string, number>;
};

async function prepararEntorno(): Promise<Entorno> {
  const datos = await registrarAprobado(app, cliente);
  const cookies = cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
  const categorias = await leerJson<{ categorias: { id: number; nombre: string }[] }>(
    await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
  );
  const cuentas = await leerJson<{ cuentas: { id: string }[] }>(
    await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
  );
  const usuario = await cliente.db.query.usuarios.findFirst({
    where: (tabla, { eq }) => eq(tabla.email, datos.email),
    columns: { id: true },
  });

  return {
    cookies,
    userId: usuario?.id ?? "",
    cuentaId: cuentas.cuentas[0]?.id ?? "",
    categorias: Object.fromEntries(categorias.categorias.map((c) => [c.nombre, c.id])),
  };
}

async function crearMovimiento(
  entorno: Entorno,
  datos: {
    tipo: "ingreso" | "gasto";
    importe: number;
    fecha: string;
    categoria?: string;
    descripcion?: string;
  },
): Promise<void> {
  const respuesta = await app.request("/api/finanzas/movimientos", {
    method: "POST",
    headers: { cookie: entorno.cookies, "content-type": "application/json" },
    body: JSON.stringify({
      tipo: datos.tipo,
      importe: datos.importe,
      fecha: datos.fecha,
      descripcion: datos.descripcion ?? "Movimiento",
      cuentaFinancieraId: entorno.cuentaId,
      categoriaId: entorno.categorias[datos.categoria ?? "Otros"],
    }),
  });
  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear el movimiento (${respuesta.status}): ${await respuesta.text()}`,
    );
  }
}

/** Agosto (1/8 a 1/9) y Setiembre (1/9 a 1/10), los dos cerrados. */
async function prepararDosPeriodosCerrados(): Promise<
  Entorno & { agosto: PeriodoJson; setiembre: PeriodoJson }
> {
  const entorno = await prepararEntorno();
  const agosto = await abrirPeriodo(app, entorno.cookies, {
    nombre: "Agosto",
    aperturaEn: "2026-08-01T00:00:00.000Z",
  });
  await cerrarPeriodo(app, entorno.cookies, agosto.id, { cierreEn: "2026-09-01T00:00:00.000Z" });
  const setiembre = await abrirPeriodo(app, entorno.cookies, {
    nombre: "Setiembre",
    aperturaEn: "2026-09-01T00:00:00.000Z",
  });
  await cerrarPeriodo(app, entorno.cookies, setiembre.id, {
    cierreEn: "2026-10-01T00:00:00.000Z",
  });
  return { ...entorno, agosto, setiembre };
}

async function pedirEstadisticas(
  cookies: string,
  periodoId: number,
): Promise<EstadisticasComparativasJson> {
  return leerJson<EstadisticasComparativasJson>(
    await app.request(`/api/finanzas/estadisticas?periodoId=${periodoId}`, {
      headers: { cookie: cookies },
    }),
  );
}

/** Lo que llega por HTTP: igual que el servicio pero con la fecha como texto. */
type EstadisticasComparativasJson = Omit<EstadisticasComparativas, "datosRapidos"> & {
  datosRapidos: Omit<EstadisticasComparativas["datosRapidos"], "gastoMasGrande"> & {
    gastoMasGrande: {
      importeCentavos: number;
      descripcion: string;
      categoria: string;
      fecha: string;
    } | null;
  };
};

describe("variación de gastos por categoría contra el período anterior", () => {
  it("compara cada categoría con el período anterior y ordena por lo que más cambió", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    const gastos = [
      // Agosto: Alimentación 100, Transporte 50, Otros 30.
      ["Alimentación", 100, "2026-08-05T12:00:00.000Z"],
      ["Transporte", 50, "2026-08-06T12:00:00.000Z"],
      ["Otros", 30, "2026-08-07T12:00:00.000Z"],
      // Setiembre: Alimentación 150, Salud 40 (nueva), Otros 30 (igual), Transporte nada.
      ["Alimentación", 150, "2026-09-05T12:00:00.000Z"],
      ["Salud", 40, "2026-09-06T12:00:00.000Z"],
      ["Otros", 30, "2026-09-07T12:00:00.000Z"],
    ] as const;
    for (const [categoria, importe, fecha] of gastos) {
      await crearMovimiento(entorno, { tipo: "gasto", importe, fecha, categoria });
    }

    const { variacionPorCategoria } = await pedirEstadisticas(
      entorno.cookies,
      entorno.setiembre.id,
    );

    expect(variacionPorCategoria?.periodoAnterior).toBe("Agosto");
    expect(
      variacionPorCategoria?.categorias.map((c) => [
        c.nombre,
        c.actualCentavos,
        c.anteriorCentavos,
        c.diferenciaCentavos,
        c.porcentaje,
      ]),
    ).toEqual([
      // Empatan en 50: se desempata por nombre. "Otros" no cambió, así que no aparece.
      ["Alimentación", 15_000, 10_000, 5_000, 50],
      ["Transporte", 0, 5_000, -5_000, -100],
      // Antes no se gastó nada en Salud: no hay porcentaje, no un 0 % ni un infinito.
      ["Salud", 4_000, 0, 4_000, null],
    ]);
  });

  it("es null en el primer período, que no tiene con qué compararse", async () => {
    const entorno = await prepararDosPeriodosCerrados();

    const estadisticas = await pedirEstadisticas(entorno.cookies, entorno.agosto.id);

    expect(estadisticas.variacionPorCategoria).toBeNull();
    expect(estadisticas.ritmoDeGasto.anterior).toBeNull();
  });

  it("no cuenta ingresos, movimientos eliminados ni transferencias", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    await crearMovimiento(entorno, {
      tipo: "ingreso",
      importe: 900,
      fecha: "2026-09-05T12:00:00.000Z",
      categoria: "Alimentación",
    });
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 70,
      fecha: "2026-09-06T12:00:00.000Z",
      categoria: "Alimentación",
    });
    // Se elimina un gasto de 500: no debe contar.
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 500,
      fecha: "2026-09-07T12:00:00.000Z",
      categoria: "Alimentación",
      descripcion: "Borrar",
    });
    const lista = await leerJson<{ movimientos: { id: string; descripcion: string }[] }>(
      await app.request(`/api/finanzas/movimientos?periodoId=${entorno.setiembre.id}`, {
        headers: { cookie: entorno.cookies },
      }),
    );
    const aBorrar = lista.movimientos.find((m) => m.descripcion === "Borrar");
    await app.request(`/api/finanzas/movimientos/${aBorrar?.id}`, {
      method: "DELETE",
      headers: { cookie: entorno.cookies },
    });

    const { variacionPorCategoria } = await pedirEstadisticas(
      entorno.cookies,
      entorno.setiembre.id,
    );

    expect(variacionPorCategoria?.categorias).toEqual([
      expect.objectContaining({ nombre: "Alimentación", actualCentavos: 7_000 }),
    ]);
  });

  it("muestra solo las 8 categorías que más cambiaron", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    const nombres = [
      "Alimentación",
      "Transporte",
      "Vivienda",
      "Servicios",
      "Salud",
      "Entretenimiento",
      "Compras",
      "Educación",
      "Otros",
    ];
    for (const [indice, categoria] of nombres.entries()) {
      await crearMovimiento(entorno, {
        tipo: "gasto",
        importe: 10 * (indice + 1),
        fecha: "2026-09-05T12:00:00.000Z",
        categoria,
      });
    }

    const { variacionPorCategoria } = await pedirEstadisticas(
      entorno.cookies,
      entorno.setiembre.id,
    );

    expect(variacionPorCategoria?.categorias).toHaveLength(8);
    // La de menos cambio (Alimentación, 10) quedó afuera.
    expect(variacionPorCategoria?.categorias.map((c) => c.nombre)).not.toContain("Alimentación");
    expect(variacionPorCategoria?.categorias[0]?.nombre).toBe("Otros");
  });

  it("devuelve una lista vacía si nada cambió entre los dos períodos", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-08-05T12:00:00.000Z",
    });
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-09-05T12:00:00.000Z",
    });

    const { variacionPorCategoria } = await pedirEstadisticas(
      entorno.cookies,
      entorno.setiembre.id,
    );

    expect(variacionPorCategoria?.categorias).toEqual([]);
  });
});

describe("ritmo de gasto", () => {
  it("acumula el gasto día a día y lo alinea con el del período anterior", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    // Agosto (31 días): 100 el día 1, 50 el día 3.
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-08-01T00:00:00.000Z",
    });
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 50,
      fecha: "2026-08-03T10:00:00.000Z",
    });
    // Setiembre (30 días): 200 el día 2, 10 el día 30 (a las 23:59 del último día).
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 200,
      fecha: "2026-09-02T08:00:00.000Z",
    });
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 10,
      fecha: "2026-09-30T23:59:00.000Z",
    });

    const { ritmoDeGasto } = await pedirEstadisticas(entorno.cookies, entorno.setiembre.id);

    expect(ritmoDeGasto.diasTranscurridos).toBe(30);
    expect(ritmoDeGasto.acumuladoCentavos).toBe(21_000);
    // Agosto, hasta el día 30, llevaba 150 (todo): ya había gastado todo lo suyo.
    expect(ritmoDeGasto.anterior).toEqual({
      nombre: "Agosto",
      acumuladoAlMismoDiaCentavos: 15_000,
    });
    // El eje cubre el período más largo (Agosto, 31 días).
    expect(ritmoDeGasto.puntos).toHaveLength(31);
    expect(ritmoDeGasto.puntos[0]).toEqual({ dia: 1, actualCentavos: 0, anteriorCentavos: 10_000 });
    expect(ritmoDeGasto.puntos[1]).toEqual({
      dia: 2,
      actualCentavos: 20_000,
      anteriorCentavos: 10_000,
    });
    expect(ritmoDeGasto.puntos[2]).toEqual({
      dia: 3,
      actualCentavos: 20_000,
      anteriorCentavos: 15_000,
    });
    expect(ritmoDeGasto.puntos[29]).toEqual({
      dia: 30,
      actualCentavos: 21_000,
      anteriorCentavos: 15_000,
    });
    // El día 31 ya no existe en Setiembre: la línea actual se corta.
    expect(ritmoDeGasto.puntos[30]).toEqual({
      dia: 31,
      actualCentavos: null,
      anteriorCentavos: 15_000,
    });
  });

  it("un movimiento justo en el cierre del día va al día siguiente", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    // 24 h exactas desde la apertura: ya es el día 2, no el 1.
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 80,
      fecha: "2026-09-02T00:00:00.000Z",
    });

    const { ritmoDeGasto } = await pedirEstadisticas(entorno.cookies, entorno.setiembre.id);

    expect(ritmoDeGasto.puntos[0]?.actualCentavos).toBe(0);
    expect(ritmoDeGasto.puntos[1]?.actualCentavos).toBe(8_000);
  });

  it("sin gastos, la línea queda en cero", async () => {
    const entorno = await prepararDosPeriodosCerrados();

    const { ritmoDeGasto } = await pedirEstadisticas(entorno.cookies, entorno.setiembre.id);

    expect(ritmoDeGasto.acumuladoCentavos).toBe(0);
    // Los 30 días de Setiembre en cero (el 31 es solo del período anterior).
    expect(ritmoDeGasto.puntos.slice(0, 30).every((p) => p.actualCentavos === 0)).toBe(true);
  });

  describe("con el período abierto", () => {
    async function prepararAbierto(): Promise<{
      entorno: Entorno;
      agosto: PeriodoJson;
      setiembre: Periodo;
    }> {
      const entorno = await prepararEntorno();
      const agosto = await abrirPeriodo(app, entorno.cookies, {
        nombre: "Agosto",
        aperturaEn: "2026-08-01T00:00:00.000Z",
      });
      await cerrarPeriodo(app, entorno.cookies, agosto.id, {
        cierreEn: "2026-09-01T00:00:00.000Z",
      });
      const setiembre = await abrirPeriodo(app, entorno.cookies, {
        nombre: "Setiembre",
        aperturaEn: "2026-09-01T00:00:00.000Z",
      });
      return {
        entorno,
        agosto,
        setiembre: {
          id: setiembre.id,
          nombre: setiembre.nombre,
          aperturaEn: new Date(setiembre.aperturaEn),
          cierreEn: null,
          abierto: true,
        },
      };
    }

    it("cuenta los días que van hasta ahora y compara con el mismo día del anterior", async () => {
      const { entorno, setiembre } = await prepararAbierto();
      await crearMovimiento(entorno, {
        tipo: "gasto",
        importe: 100,
        fecha: "2026-08-02T12:00:00.000Z",
      });
      await crearMovimiento(entorno, {
        tipo: "gasto",
        importe: 900,
        fecha: "2026-08-20T12:00:00.000Z",
      });
      await crearMovimiento(entorno, {
        tipo: "gasto",
        importe: 300,
        fecha: "2026-09-03T12:00:00.000Z",
      });

      // 10 días y medio desde la apertura: va por el día 11.
      const ahora = new Date("2026-09-11T12:00:00.000Z");
      const { ritmoDeGasto, datosRapidos } = await estadisticasComparativas(
        cliente,
        entorno.userId,
        setiembre,
        ahora,
      );

      expect(ritmoDeGasto.diasTranscurridos).toBe(11);
      expect(ritmoDeGasto.acumuladoCentavos).toBe(30_000);
      // Al día 11 de Agosto llevaba 100 (lo de 900 fue el día 20).
      expect(ritmoDeGasto.anterior?.acumuladoAlMismoDiaCentavos).toBe(10_000);
      // La línea actual llega hasta hoy; la del anterior, hasta el final de Agosto.
      expect(ritmoDeGasto.puntos.at(10)?.actualCentavos).toBe(30_000);
      expect(ritmoDeGasto.puntos.at(11)?.actualCentavos).toBeNull();
      expect(ritmoDeGasto.puntos).toHaveLength(31);
      // 300 / 11 días = 27,27: se redondea al centavo.
      expect(datosRapidos.promedioPorDiaCentavos).toBe(2_727);
    });

    it("el primer día de un período recién abierto cuenta como un día, no como cero", async () => {
      const { entorno, setiembre } = await prepararAbierto();
      await crearMovimiento(entorno, {
        tipo: "gasto",
        importe: 60,
        fecha: "2026-09-01T01:00:00.000Z",
      });

      const { ritmoDeGasto, datosRapidos } = await estadisticasComparativas(
        cliente,
        entorno.userId,
        setiembre,
        new Date("2026-09-01T01:30:00.000Z"),
      );

      expect(ritmoDeGasto.diasTranscurridos).toBe(1);
      expect(datosRapidos.promedioPorDiaCentavos).toBe(6_000);
    });

    it("un gasto cargado por adelantado extiende los días para no perderlo", async () => {
      const { entorno, setiembre } = await prepararAbierto();
      await crearMovimiento(entorno, {
        tipo: "gasto",
        importe: 50,
        fecha: "2026-09-05T12:00:00.000Z",
      });

      // "Hoy" es el día 2, pero hay un gasto con fecha del día 5.
      const { ritmoDeGasto } = await estadisticasComparativas(
        cliente,
        entorno.userId,
        setiembre,
        new Date("2026-09-02T12:00:00.000Z"),
      );

      expect(ritmoDeGasto.diasTranscurridos).toBe(5);
      expect(ritmoDeGasto.acumuladoCentavos).toBe(5_000);
    });
  });

  it("no mezcla los gastos de otra persona", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-09-05T12:00:00.000Z",
    });
    const ajeno = await prepararEntorno();
    const periodoAjeno = await abrirPeriodo(app, ajeno.cookies, {
      nombre: "Ajeno",
      aperturaEn: "2026-09-01T00:00:00.000Z",
    });
    await crearMovimiento(ajeno, {
      tipo: "gasto",
      importe: 999,
      fecha: "2026-09-05T12:00:00.000Z",
    });

    const propio = await pedirEstadisticas(entorno.cookies, entorno.setiembre.id);
    const delAjeno = await pedirEstadisticas(ajeno.cookies, periodoAjeno.id);

    expect(propio.ritmoDeGasto.acumuladoCentavos).toBe(10_000);
    expect(delAjeno.ritmoDeGasto.acumuladoCentavos).toBe(99_900);
  });
});

describe("datos rápidos", () => {
  it("calcula el promedio por día, la cantidad de movimientos y el gasto más grande", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 300,
      fecha: "2026-09-02T12:00:00.000Z",
      categoria: "Compras",
      descripcion: "Zapatillas",
    });
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 600,
      fecha: "2026-09-10T12:00:00.000Z",
      categoria: "Vivienda",
      descripcion: "Alquiler",
    });
    await crearMovimiento(entorno, {
      tipo: "ingreso",
      importe: 5000,
      fecha: "2026-09-15T12:00:00.000Z",
    });
    // De otro período: no cuenta.
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 9999,
      fecha: "2026-08-10T12:00:00.000Z",
    });

    const { datosRapidos } = await pedirEstadisticas(entorno.cookies, entorno.setiembre.id);

    // 900 en 30 días = 30 por día.
    expect(datosRapidos.promedioPorDiaCentavos).toBe(3_000);
    // Dos gastos y un ingreso.
    expect(datosRapidos.cantidadDeMovimientos).toBe(3);
    expect(datosRapidos.gastoMasGrande).toEqual({
      importeCentavos: 60_000,
      descripcion: "Alquiler",
      categoria: "Vivienda",
      fecha: "2026-09-10T12:00:00.000Z",
    });
  });

  it("a igual importe, el gasto más grande es el más reciente", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-09-02T12:00:00.000Z",
      descripcion: "Viejo",
    });
    await crearMovimiento(entorno, {
      tipo: "gasto",
      importe: 100,
      fecha: "2026-09-20T12:00:00.000Z",
      descripcion: "Nuevo",
    });

    const { datosRapidos } = await pedirEstadisticas(entorno.cookies, entorno.setiembre.id);

    expect(datosRapidos.gastoMasGrande?.descripcion).toBe("Nuevo");
  });

  it("sin movimientos: promedio cero, nada contado y sin gasto más grande", async () => {
    const entorno = await prepararDosPeriodosCerrados();

    const { datosRapidos } = await pedirEstadisticas(entorno.cookies, entorno.setiembre.id);

    expect(datosRapidos).toEqual({
      promedioPorDiaCentavos: 0,
      cantidadDeMovimientos: 0,
      gastoMasGrande: null,
    });
  });

  it("solo ingresos: no hay gasto más grande", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    await crearMovimiento(entorno, {
      tipo: "ingreso",
      importe: 100,
      fecha: "2026-09-02T12:00:00.000Z",
    });

    const { datosRapidos } = await pedirEstadisticas(entorno.cookies, entorno.setiembre.id);

    expect(datosRapidos.cantidadDeMovimientos).toBe(1);
    expect(datosRapidos.gastoMasGrande).toBeNull();
  });
});

describe("GET /api/finanzas/estadisticas (comparativas)", () => {
  it("sigue exigiendo sesión y un período propio", async () => {
    const entorno = await prepararDosPeriodosCerrados();
    const intruso = await prepararEntorno();

    expect(
      (await app.request(`/api/finanzas/estadisticas?periodoId=${entorno.setiembre.id}`)).status,
    ).toBe(401);
    expect(
      (
        await app.request(`/api/finanzas/estadisticas?periodoId=${entorno.setiembre.id}`, {
          headers: { cookie: intruso.cookies },
        })
      ).status,
    ).toBe(404);
  });
});

// Tests de integración de la evolución de lo gastado o ingresado en una categoría por
// período (GET /api/finanzas/estadisticas/categoria), contra gestion_test.

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

type Evolucion = {
  tipo: "gasto" | "ingreso";
  periodos: {
    periodoId: number;
    nombre: string;
    totalCentavos: number;
    ingresosCentavos: number;
    porcentajeDeIngresos: number | null;
  }[];
  presupuestoCentavos: number | null;
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

async function entrarComoUsuario(): Promise<string> {
  const datos = await registrarAprobado(app, cliente);
  return cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
}

type Entorno = {
  cookies: string;
  alimentacionId: number;
  transporteId: number;
  transferenciaId: number;
  cuentaId: string;
  otraCuentaId: string;
};

async function prepararEntorno(): Promise<Entorno> {
  const cookies = await entrarComoUsuario();
  const { categorias } = await leerJson<{
    categorias: { id: number; nombre: string; sistema: string | null }[];
  }>(await pedir(cookies, "/api/finanzas/categorias"));
  const { cuentas } = await leerJson<{ cuentas: { id: string }[] }>(
    await pedir(cookies, "/api/finanzas/cuentas"),
  );
  return {
    cookies,
    alimentacionId: categorias.find((c) => c.nombre === "Alimentación")?.id ?? 0,
    transporteId: categorias.find((c) => c.nombre === "Transporte")?.id ?? 0,
    transferenciaId: categorias.find((c) => c.sistema === "transferencia")?.id ?? 0,
    cuentaId: cuentas[0]?.id ?? "",
    otraCuentaId: cuentas[1]?.id ?? "",
  };
}

function cargar(
  entorno: Entorno,
  categoriaId: number,
  datos: { tipo?: "ingreso" | "gasto"; importe: number; fecha: string },
) {
  return pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
    tipo: "gasto",
    descripcion: "Movimiento",
    categoriaId,
    cuentaFinancieraId: entorno.cuentaId,
    ...datos,
  });
}

/** Tres períodos cerrados (Enero, Febrero, Marzo) y uno abierto (Abril), de 2026. */
async function prepararCuatroPeriodos(cookies: string): Promise<PeriodoJson[]> {
  const periodos: PeriodoJson[] = [];
  const inicios = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"];
  for (const [i, inicio] of inicios.entries()) {
    const periodo = await abrirPeriodo(app, cookies, { aperturaEn: `${inicio}T03:00:00.000Z` });
    periodos.push(periodo);
    const siguiente = inicios[i + 1];
    if (siguiente) {
      await cerrarPeriodo(app, cookies, periodo.id, { cierreEn: `${siguiente}T03:00:00.000Z` });
    }
  }
  return periodos;
}

function evolucion(
  cookies: string,
  periodoId: number,
  categoriaId: number,
  tipo?: "gasto" | "ingreso" | string,
) {
  const parteDelTipo = tipo === undefined ? "" : `&tipo=${tipo}`;
  return pedir(
    cookies,
    `/api/finanzas/estadisticas/categoria?periodoId=${periodoId}&categoriaId=${categoriaId}${parteDelTipo}`,
  );
}

describe("GET /api/finanzas/estadisticas/categoria", () => {
  it("responde 401 sin sesión", async () => {
    const respuesta = await app.request(
      "/api/finanzas/estadisticas/categoria?periodoId=1&categoriaId=1",
    );

    expect(respuesta.status).toBe(401);
  });

  it("da lo gastado en la categoría en cada período, del más viejo al más nuevo", async () => {
    const entorno = await prepararEntorno();
    const periodos = await prepararCuatroPeriodos(entorno.cookies);
    const cat = entorno.alimentacionId;
    await cargar(entorno, cat, { importe: 100, fecha: "2026-01-10T12:00:00Z" });
    await cargar(entorno, cat, { importe: 50.5, fecha: "2026-01-20T12:00:00Z" });
    await cargar(entorno, cat, { tipo: "ingreso", importe: 40, fecha: "2026-01-21T12:00:00Z" });
    await cargar(entorno, cat, { importe: 300, fecha: "2026-03-05T12:00:00Z" });
    await cargar(entorno, cat, { importe: 80, fecha: "2026-04-02T12:00:00Z" });

    const respuesta = await evolucion(entorno.cookies, periodos[3]?.id ?? 0, cat);

    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<Evolucion>(respuesta);
    expect(cuerpo.periodos.map((p) => [p.nombre, p.totalCentavos])).toEqual([
      // Los ingresos de la categoría no se suman a los gastos.
      ["Enero 2026", 15_050],
      // Febrero no tuvo gastos: aparece igual, con 0.
      ["Febrero 2026", 0],
      ["Marzo 2026", 30_000],
      ["Abril 2026", 8_000],
    ]);
    expect(cuerpo.periodos.map((p) => p.periodoId)).toEqual(periodos.map((p) => p.id));
  });

  describe("gastos o ingresos de la misma categoría", () => {
    /** Una categoría con ingresos y gastos que se cruzan: más ingresos que gastos un mes y al revés otro. */
    async function prepararCategoriaMixta() {
      const entorno = await prepararEntorno();
      const periodos = await prepararCuatroPeriodos(entorno.cookies);
      const cat = entorno.alimentacionId;
      // Enero: ingresa 1.000 y gasta 300 (más ingresos que gastos).
      await cargar(entorno, cat, { tipo: "ingreso", importe: 1000, fecha: "2026-01-05T12:00:00Z" });
      await cargar(entorno, cat, { importe: 300, fecha: "2026-01-10T12:00:00Z" });
      // Febrero: ingresa 200 y gasta 800 (más gastos que ingresos).
      await cargar(entorno, cat, { tipo: "ingreso", importe: 200, fecha: "2026-02-05T12:00:00Z" });
      await cargar(entorno, cat, { importe: 800, fecha: "2026-02-10T12:00:00Z" });
      // Marzo: solo ingresos. Abril: solo gastos.
      await cargar(entorno, cat, { tipo: "ingreso", importe: 500, fecha: "2026-03-05T12:00:00Z" });
      await cargar(entorno, cat, { importe: 90, fecha: "2026-04-05T12:00:00Z" });
      return { entorno, periodos, cat };
    }

    it("por defecto mira los gastos", async () => {
      const { entorno, periodos, cat } = await prepararCategoriaMixta();

      const sinTipo = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, periodos[3]?.id ?? 0, cat),
      );
      const explicito = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, periodos[3]?.id ?? 0, cat, "gasto"),
      );

      expect(sinTipo.tipo).toBe("gasto");
      expect(sinTipo).toEqual(explicito);
      expect(sinTipo.periodos.map((p) => p.totalCentavos)).toEqual([30_000, 80_000, 0, 9_000]);
    });

    it("con tipo=ingreso da lo ingresado en la categoría, sin mezclar los gastos", async () => {
      const { entorno, periodos, cat } = await prepararCategoriaMixta();

      const cuerpo = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, periodos[3]?.id ?? 0, cat, "ingreso"),
      );

      expect(cuerpo.tipo).toBe("ingreso");
      expect(cuerpo.periodos.map((p) => p.totalCentavos)).toEqual([100_000, 20_000, 50_000, 0]);
    });

    it("la misma categoría puede dar más ingresos que gastos un mes y al revés otro", async () => {
      const { entorno, periodos, cat } = await prepararCategoriaMixta();
      const id = periodos[3]?.id ?? 0;

      const gastos = await leerJson<Evolucion>(await evolucion(entorno.cookies, id, cat, "gasto"));
      const ingresos = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, id, cat, "ingreso"),
      );

      const neto = ingresos.periodos.map(
        (punto, i) => punto.totalCentavos - (gastos.periodos[i]?.totalCentavos ?? 0),
      );
      expect(neto).toEqual([70_000, -60_000, 50_000, -9_000]);
    });

    it("el porcentaje de los ingresos es de la categoría sobre los ingresos totales del período", async () => {
      const entorno = await prepararEntorno();
      const [enero] = await prepararCuatroPeriodos(entorno.cookies);
      // Ingresos del período: 1.000 en Alimentación y 3.000 en Transporte (4.000 en total).
      await cargar(entorno, entorno.alimentacionId, {
        tipo: "ingreso",
        importe: 1000,
        fecha: "2026-01-05T12:00:00Z",
      });
      await cargar(entorno, entorno.transporteId, {
        tipo: "ingreso",
        importe: 3000,
        fecha: "2026-01-06T12:00:00Z",
      });

      const cuerpo = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId, "ingreso"),
      );

      // Alimentación aportó 1.000 de 4.000: 25 %.
      expect(cuerpo.periodos[0]).toMatchObject({
        totalCentavos: 100_000,
        ingresosCentavos: 400_000,
        porcentajeDeIngresos: 25,
      });
    });

    it("con ingresos no hay presupuesto aunque la categoría tenga uno", async () => {
      const { entorno, periodos, cat } = await prepararCategoriaMixta();
      await pedir(entorno.cookies, `/api/finanzas/presupuestos/${cat}`, "PUT", { monto: 500 });
      const id = periodos[3]?.id ?? 0;

      const gastos = await leerJson<Evolucion>(await evolucion(entorno.cookies, id, cat, "gasto"));
      const ingresos = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, id, cat, "ingreso"),
      );

      expect(gastos.presupuestoCentavos).toBe(50_000);
      expect(ingresos.presupuestoCentavos).toBeNull();
    });

    it("rechaza (400) un tipo inválido, incluido el de las transferencias", async () => {
      const entorno = await prepararEntorno();
      const [enero] = await prepararCuatroPeriodos(entorno.cookies);

      for (const tipo of ["neutro", "otro", "GASTO", ""]) {
        const respuesta = await evolucion(
          entorno.cookies,
          enero?.id ?? 0,
          entorno.alimentacionId,
          tipo,
        );
        expect(respuesta.status, `tipo "${tipo}"`).toBe(400);
      }
    });
  });

  it("termina en el período indicado: los posteriores no aparecen", async () => {
    const entorno = await prepararEntorno();
    const periodos = await prepararCuatroPeriodos(entorno.cookies);
    await cargar(entorno, entorno.alimentacionId, { importe: 10, fecha: "2026-03-05T12:00:00Z" });
    await cargar(entorno, entorno.alimentacionId, { importe: 20, fecha: "2026-04-05T12:00:00Z" });

    const cuerpo = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, periodos[1]?.id ?? 0, entorno.alimentacionId),
    );

    expect(cuerpo.periodos.map((p) => p.nombre)).toEqual(["Enero 2026", "Febrero 2026"]);
  });

  it("solo cuenta los movimientos de esa categoría, sin transferencias", async () => {
    const entorno = await prepararEntorno();
    const [enero] = await prepararCuatroPeriodos(entorno.cookies);
    await cargar(entorno, entorno.alimentacionId, { importe: 100, fecha: "2026-01-10T12:00:00Z" });
    await cargar(entorno, entorno.alimentacionId, {
      tipo: "ingreso",
      importe: 500,
      fecha: "2026-01-12T12:00:00Z",
    });
    // Otra categoría: ni su gasto ni su ingreso cuentan.
    await cargar(entorno, entorno.transporteId, { importe: 999, fecha: "2026-01-11T12:00:00Z" });
    await cargar(entorno, entorno.transporteId, {
      tipo: "ingreso",
      importe: 888,
      fecha: "2026-01-11T13:00:00Z",
    });
    // Una transferencia (neutro) no cuenta.
    await pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
      tipo: "neutro",
      importe: 700,
      descripcion: "Pasaje",
      categoriaId: entorno.transferenciaId,
      cuentaFinancieraId: entorno.cuentaId,
      cuentaDestinoId: entorno.otraCuentaId,
      fecha: "2026-01-13T12:00:00Z",
    });

    const cuerpo = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId),
    );

    expect(cuerpo.periodos[0]?.totalCentavos).toBe(10_000);
    const deIngresos = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId, "ingreso"),
    );
    expect(deIngresos.periodos[0]?.totalCentavos).toBe(50_000);
  });

  it("no cuenta los movimientos eliminados", async () => {
    const entorno = await prepararEntorno();
    const [enero] = await prepararCuatroPeriodos(entorno.cookies);
    await cargar(entorno, entorno.alimentacionId, { importe: 100, fecha: "2026-01-10T12:00:00Z" });
    const gastoBorrado = await leerJson<{ id: string }>(
      await cargar(entorno, entorno.alimentacionId, { importe: 40, fecha: "2026-01-11T12:00:00Z" }),
    );
    const ingresoBorrado = await leerJson<{ id: string }>(
      await cargar(entorno, entorno.alimentacionId, {
        tipo: "ingreso",
        importe: 60,
        fecha: "2026-01-12T12:00:00Z",
      }),
    );
    await pedir(entorno.cookies, `/api/finanzas/movimientos/${gastoBorrado.id}`, "DELETE");
    await pedir(entorno.cookies, `/api/finanzas/movimientos/${ingresoBorrado.id}`, "DELETE");

    const cuerpo = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId),
    );

    expect(cuerpo.periodos[0]?.totalCentavos).toBe(10_000);
    const deIngresos = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId, "ingreso"),
    );
    expect(deIngresos.periodos[0]?.totalCentavos).toBe(0);
  });

  describe("gastos como porcentaje de los ingresos del período", () => {
    it("da lo gastado en la categoría sobre los ingresos de cada período, con un decimal", async () => {
      const entorno = await prepararEntorno();
      const periodos = await prepararCuatroPeriodos(entorno.cookies);
      // Enero: 250 de 2.000 de ingresos → 12,5 %.
      await cargar(entorno, entorno.alimentacionId, {
        importe: 250,
        fecha: "2026-01-10T12:00:00Z",
      });
      await cargar(entorno, entorno.alimentacionId, {
        tipo: "ingreso",
        importe: 2000,
        fecha: "2026-01-05T12:00:00Z",
      });
      // Marzo: 100 de 300 de ingresos → 33,3 % (redondeado a un decimal).
      await cargar(entorno, entorno.alimentacionId, {
        importe: 100,
        fecha: "2026-03-10T12:00:00Z",
      });
      await cargar(entorno, entorno.transporteId, {
        tipo: "ingreso",
        importe: 300,
        fecha: "2026-03-05T12:00:00Z",
      });

      const cuerpo = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, periodos[3]?.id ?? 0, entorno.alimentacionId),
      );

      expect(
        cuerpo.periodos.map((p) => [p.nombre, p.ingresosCentavos, p.porcentajeDeIngresos]),
      ).toEqual([
        ["Enero 2026", 200_000, 12.5],
        // Sin ingresos no hay porcentaje (no se inventa un 0 ni un infinito).
        ["Febrero 2026", 0, null],
        // Los ingresos son los de todo el período, no solo los de la categoría.
        ["Marzo 2026", 30_000, 33.3],
        ["Abril 2026", 0, null],
      ]);
    });

    it("sin ingresos el porcentaje es null aunque haya gastos", async () => {
      const entorno = await prepararEntorno();
      const [enero] = await prepararCuatroPeriodos(entorno.cookies);
      await cargar(entorno, entorno.alimentacionId, { importe: 90, fecha: "2026-01-10T12:00:00Z" });

      const cuerpo = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId),
      );

      expect(cuerpo.periodos[0]).toMatchObject({
        totalCentavos: 9_000,
        porcentajeDeIngresos: null,
      });
    });

    it("puede pasar del 100 % y no cuenta transferencias ni movimientos eliminados como ingresos", async () => {
      const entorno = await prepararEntorno();
      const [enero] = await prepararCuatroPeriodos(entorno.cookies);
      await cargar(entorno, entorno.alimentacionId, {
        importe: 300,
        fecha: "2026-01-10T12:00:00Z",
      });
      await cargar(entorno, entorno.alimentacionId, {
        tipo: "ingreso",
        importe: 200,
        fecha: "2026-01-05T12:00:00Z",
      });
      // Un ingreso eliminado y una transferencia: ninguno suma a los ingresos.
      const borrado = await leerJson<{ id: string }>(
        await cargar(entorno, entorno.alimentacionId, {
          tipo: "ingreso",
          importe: 5000,
          fecha: "2026-01-06T12:00:00Z",
        }),
      );
      await pedir(entorno.cookies, `/api/finanzas/movimientos/${borrado.id}`, "DELETE");
      await pedir(entorno.cookies, "/api/finanzas/movimientos", "POST", {
        tipo: "neutro",
        importe: 9000,
        descripcion: "Pasaje",
        categoriaId: entorno.transferenciaId,
        cuentaFinancieraId: entorno.cuentaId,
        cuentaDestinoId: entorno.otraCuentaId,
        fecha: "2026-01-07T12:00:00Z",
      });

      const cuerpo = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId),
      );

      // 300 gastados sobre 200 de ingresos: 150 %.
      expect(cuerpo.periodos[0]).toMatchObject({
        ingresosCentavos: 20_000,
        porcentajeDeIngresos: 150,
      });
    });

    it("no suma los ingresos de otra persona", async () => {
      const entorno = await prepararEntorno();
      const [enero] = await prepararCuatroPeriodos(entorno.cookies);
      const otra = await prepararEntorno();
      await abrirPeriodo(app, otra.cookies, { aperturaEn: "2026-01-01T03:00:00.000Z" });
      await cargar(otra, otra.alimentacionId, {
        tipo: "ingreso",
        importe: 7777,
        fecha: "2026-01-05T12:00:00Z",
      });
      await cargar(entorno, entorno.alimentacionId, { importe: 10, fecha: "2026-01-10T12:00:00Z" });

      const cuerpo = await leerJson<Evolucion>(
        await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId),
      );

      expect(cuerpo.periodos[0]).toMatchObject({
        ingresosCentavos: 0,
        porcentajeDeIngresos: null,
      });
    });
  });

  it("incluye el presupuesto de la categoría, o null si no tiene", async () => {
    const entorno = await prepararEntorno();
    const [enero] = await prepararCuatroPeriodos(entorno.cookies);

    const sin = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId),
    );
    await pedir(entorno.cookies, `/api/finanzas/presupuestos/${entorno.alimentacionId}`, "PUT", {
      monto: 1500.5,
    });
    const con = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId),
    );
    const otraCategoria = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, enero?.id ?? 0, entorno.transporteId),
    );

    expect(sin.presupuestoCentavos).toBeNull();
    expect(con.presupuestoCentavos).toBe(150_050);
    expect(otraCategoria.presupuestoCentavos).toBeNull();
  });

  it("muestra como máximo los últimos 12 períodos", async () => {
    const entorno = await prepararEntorno();
    let ultimo: PeriodoJson | undefined;
    for (let mes = 1; mes <= 14; mes += 1) {
      const anio = 2025 + Math.floor((mes - 1) / 12);
      const numero = ((mes - 1) % 12) + 1;
      const inicio = `${anio}-${String(numero).padStart(2, "0")}-01T03:00:00.000Z`;
      if (ultimo) {
        await cerrarPeriodo(app, entorno.cookies, ultimo.id, { cierreEn: inicio });
      }
      ultimo = await abrirPeriodo(app, entorno.cookies, { aperturaEn: inicio });
    }

    const cuerpo = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, ultimo?.id ?? 0, entorno.alimentacionId),
    );

    expect(cuerpo.periodos).toHaveLength(12);
    expect(cuerpo.periodos[11]?.periodoId).toBe(ultimo?.id);
  });

  it("un importe grande no desborda (más de 32 bits en la suma)", async () => {
    const entorno = await prepararEntorno();
    const [enero] = await prepararCuatroPeriodos(entorno.cookies);
    for (const dia of ["10", "11", "12"]) {
      await cargar(entorno, entorno.alimentacionId, {
        importe: 9_999_999_999,
        fecha: `2026-01-${dia}T12:00:00Z`,
      });
      await cargar(entorno, entorno.alimentacionId, {
        tipo: "ingreso",
        importe: 9_999_999_999,
        fecha: `2026-01-${dia}T13:00:00Z`,
      });
    }

    const cuerpo = await leerJson<Evolucion>(
      await evolucion(entorno.cookies, enero?.id ?? 0, entorno.alimentacionId),
    );

    // 3 gastos máximos sobre 3 ingresos máximos: las sumas pasan de 32 bits y dan 100 %.
    expect(cuerpo.periodos[0]).toMatchObject({
      totalCentavos: 3 * 999_999_999_900,
      porcentajeDeIngresos: 100,
    });
  });

  it("no mezcla los datos de otra persona", async () => {
    const entorno = await prepararEntorno();
    const [enero] = await prepararCuatroPeriodos(entorno.cookies);
    await cargar(entorno, entorno.alimentacionId, { importe: 100, fecha: "2026-01-10T12:00:00Z" });

    const intruso = await prepararEntorno();
    const suyo = await abrirPeriodo(app, intruso.cookies, {
      aperturaEn: "2026-01-01T03:00:00.000Z",
    });

    // Su propio período y categoría: no ve nada del otro.
    const propio = await leerJson<Evolucion>(
      await evolucion(intruso.cookies, suyo.id, intruso.alimentacionId),
    );
    expect(propio.periodos.map((p) => p.totalCentavos)).toEqual([0]);
    // El período o la categoría de otra persona: 404.
    expect((await evolucion(intruso.cookies, enero?.id ?? 0, intruso.alimentacionId)).status).toBe(
      404,
    );
    expect((await evolucion(intruso.cookies, suyo.id, entorno.alimentacionId)).status).toBe(404);
  });

  it("responde 404 con un período o una categoría que no existen", async () => {
    const entorno = await prepararEntorno();
    const [enero] = await prepararCuatroPeriodos(entorno.cookies);

    expect((await evolucion(entorno.cookies, 999_999, entorno.alimentacionId)).status).toBe(404);
    expect((await evolucion(entorno.cookies, enero?.id ?? 0, 999_999)).status).toBe(404);
  });

  it.each([
    ["sin período", "categoriaId=1"],
    ["período que no es número", "periodoId=abc&categoriaId=1"],
    ["sin categoría", "periodoId=PERIODO"],
    ["categoría que no es número", "periodoId=PERIODO&categoriaId=abc"],
    ["categoría en cero", "periodoId=PERIODO&categoriaId=0"],
  ])("rechaza (400) un pedido inválido: %s", async (_caso, consulta) => {
    const entorno = await prepararEntorno();
    const [enero] = await prepararCuatroPeriodos(entorno.cookies);

    const respuesta = await pedir(
      entorno.cookies,
      `/api/finanzas/estadisticas/categoria?${consulta.replace("PERIODO", String(enero?.id))}`,
    );

    expect(respuesta.status).toBe(400);
  });
});

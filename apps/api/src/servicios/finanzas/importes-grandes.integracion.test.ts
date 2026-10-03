// Tests de integración de los importes grandes: los montos se guardan en bigint, no
// en integer (32 bits, unos 21 millones), así que el tope de un importe
// (IMPORTE_MAXIMO, 9.999.999.999) y sus sumas tienen que funcionar de punta a punta.
// Contra la base gestion_test real.

import type { ClienteDb } from "@gestoria/db";
import { IMPORTE_MAXIMO } from "@gestoria/shared";
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

/** El tope, en centésimos (lo que se guarda y devuelve la API). */
const MAXIMO_CENTAVOS = IMPORTE_MAXIMO * 100;

type CuentaJson = {
  id: string;
  nombre: string;
  saldoCentavos: number;
  saldoInicialCentavos: number;
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

async function preparar() {
  const datos = await registrarAprobado(app, cliente);
  const cookies = cookiesDe(await entrarConUsuario(app, datos.usuario, datos.password));
  const periodo = await abrirPeriodoAmplio(app, cookies, "Amplio");
  const categorias = await leerJson<{ categorias: { id: number; sistema: string | null }[] }>(
    await pedir(cookies, "/api/finanzas/categorias"),
  );
  const cuentas = (
    await leerJson<{ cuentas: CuentaJson[] }>(await pedir(cookies, "/api/finanzas/cuentas"))
  ).cuentas;
  return {
    cookies,
    periodo,
    categoriaId: categorias.categorias.find((c) => c.sistema === null)?.id ?? 0,
    transferenciaId: categorias.categorias.find((c) => c.sistema === "transferencia")?.id ?? 0,
    cuentas,
  };
}

async function cargar(
  cookies: string,
  categoriaId: number,
  cuentaId: string,
  tipo: "ingreso" | "gasto",
  importe: number,
) {
  return pedir(cookies, "/api/finanzas/movimientos", "POST", {
    tipo,
    importe,
    descripcion: "Grande",
    categoriaId,
    cuentaFinancieraId: cuentaId,
    fecha: "2026-03-10T12:00:00.000Z",
  });
}

async function saldoDe(cookies: string, cuentaId: string): Promise<number> {
  const { cuentas } = await leerJson<{ cuentas: CuentaJson[] }>(
    await pedir(cookies, "/api/finanzas/cuentas"),
  );
  return cuentas.find((c) => c.id === cuentaId)?.saldoCentavos ?? Number.NaN;
}

describe("importes grandes", () => {
  it("el tope es 9.999.999.999", () => {
    expect(IMPORTE_MAXIMO).toBe(9_999_999_999);
  });

  it("acepta un movimiento por el importe máximo y lo devuelve exacto", async () => {
    const { cookies, categoriaId, cuentas } = await preparar();
    const cuenta = cuentas[0];

    const respuesta = await cargar(
      cookies,
      categoriaId,
      cuenta?.id ?? "",
      "ingreso",
      IMPORTE_MAXIMO,
    );

    expect(respuesta.status).toBe(201);
    const creado = await leerJson<{ importeCentavos: number }>(respuesta);
    expect(creado.importeCentavos).toBe(MAXIMO_CENTAVOS);
    expect(await saldoDe(cookies, cuenta?.id ?? "")).toBe(MAXIMO_CENTAVOS);
  });

  it("rechaza (400) un importe un peso por encima del tope, sin guardar nada", async () => {
    const { cookies, categoriaId, cuentas } = await preparar();

    const respuesta = await cargar(
      cookies,
      categoriaId,
      cuentas[0]?.id ?? "",
      "gasto",
      IMPORTE_MAXIMO + 1,
    );

    expect(respuesta.status).toBe(400);
    expect(await saldoDe(cookies, cuentas[0]?.id ?? "")).toBe(0);
  });

  it("conserva los centavos en importes enormes", async () => {
    const { cookies, categoriaId, cuentas } = await preparar();

    await cargar(cookies, categoriaId, cuentas[0]?.id ?? "", "ingreso", 9_999_999_999.99 - 1);

    // 9.999.999.998,99 → 999.999.999.899 centésimos, sin redondeos raros.
    expect(await saldoDe(cookies, cuentas[0]?.id ?? "")).toBe(999_999_999_899);
  });

  it("las sumas superan los 32 bits: tres gastos máximos dan totales exactos en el resumen, el saldo y las estadísticas", async () => {
    const { cookies, categoriaId, cuentas, periodo } = await preparar();
    const cuenta = cuentas[0];
    for (let i = 0; i < 3; i += 1) {
      const respuesta = await cargar(
        cookies,
        categoriaId,
        cuenta?.id ?? "",
        "gasto",
        IMPORTE_MAXIMO,
      );
      expect(respuesta.status).toBe(201);
    }
    const total = 3 * MAXIMO_CENTAVOS;

    const resumen = await leerJson<{
      gastosCentavos: number;
      ingresosCentavos: number;
      balanceCentavos: number;
      disponibleCentavos: number;
    }>(await pedir(cookies, `/api/finanzas/resumen?periodoId=${periodo.id}`));
    const estadisticas = await leerJson<{
      gastosPorCategoria: { categoriaId: number; totalCentavos: number }[];
    }>(await pedir(cookies, `/api/finanzas/estadisticas?periodoId=${periodo.id}`));

    expect(resumen.gastosCentavos).toBe(total);
    expect(resumen.ingresosCentavos).toBe(0);
    expect(resumen.balanceCentavos).toBe(-total);
    expect(resumen.disponibleCentavos).toBe(-total);
    expect(await saldoDe(cookies, cuenta?.id ?? "")).toBe(-total);
    expect(estadisticas.gastosPorCategoria[0]?.totalCentavos).toBe(total);
  });

  it("el presupuesto y lo gastado admiten importes grandes", async () => {
    const { cookies, categoriaId, cuentas, periodo } = await preparar();
    await cargar(cookies, categoriaId, cuentas[0]?.id ?? "", "gasto", IMPORTE_MAXIMO);
    await cargar(cookies, categoriaId, cuentas[0]?.id ?? "", "gasto", IMPORTE_MAXIMO);

    const fijado = await pedir(cookies, `/api/finanzas/presupuestos/${categoriaId}`, "PUT", {
      monto: IMPORTE_MAXIMO,
    });
    const { presupuestos } = await leerJson<{
      presupuestos: {
        categoriaId: number;
        presupuestadoCentavos: number;
        gastadoCentavos: number;
        restanteCentavos: number;
      }[];
    }>(await pedir(cookies, `/api/finanzas/presupuestos?periodoId=${periodo.id}`));

    expect(fijado.status).toBe(200);
    const fila = presupuestos.find((p) => p.categoriaId === categoriaId);
    expect(fila).toMatchObject({
      presupuestadoCentavos: MAXIMO_CENTAVOS,
      gastadoCentavos: 2 * MAXIMO_CENTAVOS,
      restanteCentavos: -MAXIMO_CENTAVOS,
    });
  });

  it("el saldo inicial, el ajuste manual y el historial de una cuenta aguantan el tope", async () => {
    const { cookies } = await preparar();
    const respuesta = await pedir(cookies, "/api/finanzas/cuentas", "POST", {
      nombre: "Grande",
      saldoInicial: IMPORTE_MAXIMO,
    });
    const cuenta = await leerJson<CuentaJson>(respuesta);
    expect(respuesta.status).toBe(201);
    expect(cuenta.saldoInicialCentavos).toBe(MAXIMO_CENTAVOS);

    // Ajustarlo al tope negativo: la diferencia (casi 2 × el tope) supera los 32 bits.
    const ajuste = await pedir(
      cookies,
      `/api/finanzas/cuentas/${cuenta.id}/ajustar-saldo`,
      "POST",
      {
        saldo: -IMPORTE_MAXIMO,
      },
    );
    expect(ajuste.status).toBe(201);

    const { items } = await leerJson<{
      items: { origen: string; montoCentavos: number; saldoIndicadoCentavos?: number }[];
    }>(await pedir(cookies, `/api/finanzas/cuentas/${cuenta.id}/historial`));
    expect(items).toEqual([
      expect.objectContaining({
        origen: "ajuste",
        montoCentavos: -2 * MAXIMO_CENTAVOS,
        saldoIndicadoCentavos: -MAXIMO_CENTAVOS,
      }),
      expect.objectContaining({ origen: "saldo_inicial", montoCentavos: MAXIMO_CENTAVOS }),
    ]);
    // Todo es numérico (no texto) y la suma del historial da el saldo.
    expect(items.every((item) => typeof item.montoCentavos === "number")).toBe(true);
    expect(await saldoDe(cookies, cuenta.id)).toBe(-MAXIMO_CENTAVOS);
  });

  it("una transferencia por el importe máximo mueve el saldo de las dos cuentas", async () => {
    const { cookies, transferenciaId, cuentas } = await preparar();
    const [origen, destino] = cuentas;

    const respuesta = await pedir(cookies, "/api/finanzas/movimientos", "POST", {
      tipo: "neutro",
      importe: IMPORTE_MAXIMO,
      descripcion: "Grande",
      categoriaId: transferenciaId,
      cuentaFinancieraId: origen?.id,
      cuentaDestinoId: destino?.id,
      fecha: "2026-03-10T12:00:00.000Z",
    });

    expect(respuesta.status).toBe(201);
    expect(await saldoDe(cookies, origen?.id ?? "")).toBe(-MAXIMO_CENTAVOS);
    expect(await saldoDe(cookies, destino?.id ?? "")).toBe(MAXIMO_CENTAVOS);
  });

  it("el saldo de una cuenta puede superar el tope de un importe individual", async () => {
    const { cookies, categoriaId, cuentas } = await preparar();
    const cuenta = cuentas[0];
    for (let i = 0; i < 2; i += 1) {
      await cargar(cookies, categoriaId, cuenta?.id ?? "", "ingreso", IMPORTE_MAXIMO);
    }

    expect(await saldoDe(cookies, cuenta?.id ?? "")).toBe(2 * MAXIMO_CENTAVOS);
  });
});

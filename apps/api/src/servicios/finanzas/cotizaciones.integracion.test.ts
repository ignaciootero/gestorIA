// Tests de integración del servicio de cotizaciones: la caché es la base real
// (gestion_test) y la fuente de internet es una falsa (ver pruebas/cotizaciones-de-prueba.ts).

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import { crearFuenteDePrueba } from "../../pruebas/cotizaciones-de-prueba.ts";
import { clienteDePrueba } from "../../pruebas/entorno-de-prueba.ts";
import { obtenerTasa, PRIMER_DIA_CON_COTIZACIONES } from "./cotizaciones.ts";

let cliente: ClienteDb;

beforeAll(() => {
  cliente = clienteDePrueba();
});

beforeEach(async () => {
  await limpiarBase(cliente);
});

afterAll(async () => {
  await cliente.cerrar();
});

const AHORA = new Date("2026-10-03T12:00:00.000Z");
const HOY = "2026-10-03";

/** La fuente falsa, que dice que "las últimas" son las de HOY (el reloj de los tests está fijo). */
function crearFuente(unidades?: Parameters<typeof crearFuenteDePrueba>[0]) {
  const prueba = crearFuenteDePrueba(unidades);
  prueba.diaDeLasUltimas = HOY;
  return prueba;
}

describe("obtenerTasa", () => {
  it("con la misma moneda de los dos lados es 1 y no consulta nada", async () => {
    const prueba = crearFuente();
    const tasa = await obtenerTasa(cliente, "UYU", "UYU", AHORA, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });

    expect(tasa).toEqual({ tasa: 1, fechaDeLaFuente: HOY, desactualizada: false });
    expect(prueba.llamadas).toEqual([]);
  });

  it("de dólares a pesos es lo que vale el dólar, y pide 'lo último' para hoy", async () => {
    const prueba = crearFuente();
    const tasa = await obtenerTasa(cliente, "USD", "UYU", AHORA, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });

    expect(tasa).toEqual({ tasa: 40, fechaDeLaFuente: HOY, desactualizada: false });
    expect(prueba.llamadas).toEqual(["ultimas"]);
  });

  it("de pesos a dólares es la inversa", async () => {
    const prueba = crearFuente();
    const tasa = await obtenerTasa(cliente, "UYU", "USD", AHORA, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });
    expect(tasa?.tasa).toBe(0.025);
  });

  it("cruza dos monedas que no son el dólar", async () => {
    const prueba = crearFuente();
    // 1 USD = 40 UYU y 1 USD = 0,8 EUR → 1 EUR = 50 UYU
    const tasa = await obtenerTasa(cliente, "EUR", "UYU", AHORA, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });
    expect(tasa?.tasa).toBe(50);
  });

  it("guarda lo que trae: la segunda vez no vuelve a consultar", async () => {
    const prueba = crearFuente();
    const opciones = { fuente: prueba.fuente, ahora: AHORA };

    await obtenerTasa(cliente, "USD", "UYU", AHORA, opciones);
    const otra = await obtenerTasa(cliente, "ARS", "UYU", AHORA, opciones);

    expect(prueba.llamadas).toHaveLength(1);
    expect(otra?.tasa).toBeCloseTo(40 / 1500, 8);
    const guardadas = await cliente.db.select().from(esquema.cotizaciones);
    expect(guardadas.length).toBeGreaterThanOrEqual(5);
  });

  it("para un día pasado pide ese día y no vuelve a pedirlo nunca", async () => {
    const prueba = crearFuente();
    const fecha = new Date("2026-09-01T15:00:00.000Z");

    const primera = await obtenerTasa(cliente, "USD", "UYU", fecha, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });
    // Mucho tiempo después, igual está guardada: un día pasado ya no cambia.
    const despues = new Date("2026-10-20T12:00:00.000Z");
    const segunda = await obtenerTasa(cliente, "USD", "UYU", fecha, {
      fuente: prueba.fuente,
      ahora: despues,
    });

    expect(prueba.llamadas).toEqual(["2026-09-01"]);
    expect(primera?.fechaDeLaFuente).toBe("2026-09-01");
    expect(segunda?.tasa).toBe(40);
  });

  it("una fecha futura usa la cotización de hoy", async () => {
    const prueba = crearFuente();
    const tasa = await obtenerTasa(cliente, "USD", "UYU", new Date("2026-12-25T00:00:00.000Z"), {
      fuente: prueba.fuente,
      ahora: AHORA,
    });

    expect(tasa?.tasa).toBe(40);
    expect(prueba.llamadas).toEqual(["ultimas"]);
  });

  it("antes del primer día con datos no hay cotización y ni se consulta", async () => {
    const prueba = crearFuente();
    const tasa = await obtenerTasa(cliente, "USD", "UYU", new Date("2023-05-10T00:00:00.000Z"), {
      fuente: prueba.fuente,
      ahora: AHORA,
    });

    expect(tasa).toBeNull();
    expect(prueba.llamadas).toEqual([]);
    expect(PRIMER_DIA_CON_COTIZACIONES).toBe("2024-03-02");
  });

  it("la cotización de hoy también se guarda: no se vuelve a pedir en todo el día", async () => {
    const prueba = crearFuente();
    await obtenerTasa(cliente, "USD", "UYU", AHORA, { fuente: prueba.fuente, ahora: AHORA });

    // Aunque pasen las horas y la fuente cambie, el día ya está en la base: se usa esa.
    prueba.unidadesPorDolar.UYU = 41;
    const nocheDeHoy = new Date("2026-10-03T23:00:00.000Z");
    const otraVez = await obtenerTasa(cliente, "USD", "UYU", nocheDeHoy, {
      fuente: prueba.fuente,
      ahora: nocheDeHoy,
    });

    expect(otraVez?.tasa).toBe(40);
    expect(prueba.llamadas).toHaveLength(1);
  });

  it("un solo pedido a la fuente guarda todas las monedas: pedir otro par no vuelve a consultarla", async () => {
    const prueba = crearFuente();
    const opciones = { fuente: prueba.fuente, ahora: AHORA };

    await obtenerTasa(cliente, "USD", "UYU", AHORA, opciones);
    await obtenerTasa(cliente, "EUR", "ARS", AHORA, opciones);
    await obtenerTasa(cliente, "BRL", "USD", AHORA, opciones);

    expect(prueba.llamadas).toHaveLength(1);
  });

  it("si la moneda pedida no estaba en lo guardado, se consulta la fuente de nuevo", async () => {
    const prueba = crearFuente({ USD: 1, UYU: 40 });
    const opciones = { fuente: prueba.fuente, ahora: AHORA };
    await obtenerTasa(cliente, "USD", "UYU", AHORA, opciones);

    prueba.unidadesPorDolar.BRL = 5;
    const tasa = await obtenerTasa(cliente, "USD", "BRL", AHORA, opciones);

    expect(tasa?.tasa).toBe(5);
    expect(prueba.llamadas).toHaveLength(2);
  });

  it("sin cotización guardada y con la fuente caída devuelve null", async () => {
    const prueba = crearFuente();
    prueba.caida = true;
    const tasa = await obtenerTasa(cliente, "USD", "UYU", AHORA, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });
    expect(tasa).toBeNull();
  });

  it("con la fuente caída usa la guardada de un día anterior y la marca desactualizada", async () => {
    const prueba = crearFuente();
    prueba.diaDeLasUltimas = "2026-10-02";
    const ayer = new Date("2026-10-02T12:00:00.000Z");
    await obtenerTasa(cliente, "USD", "UYU", ayer, { fuente: prueba.fuente, ahora: ayer });

    prueba.caida = true;
    const tasa = await obtenerTasa(cliente, "USD", "UYU", AHORA, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });

    expect(tasa).toEqual({ tasa: 40, fechaDeLaFuente: "2026-10-02", desactualizada: true });
  });

  it("no usa una guardada de hace más de una semana", async () => {
    const prueba = crearFuente();
    const antes = new Date("2026-09-20T12:00:00.000Z");
    await obtenerTasa(cliente, "USD", "UYU", antes, { fuente: prueba.fuente, ahora: AHORA });

    prueba.caida = true;
    const tasa = await obtenerTasa(cliente, "USD", "UYU", AHORA, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });
    expect(tasa).toBeNull();
  });

  it("si la fuente falla con una excepción, se trata como caída", async () => {
    const tasa = await obtenerTasa(cliente, "USD", "UYU", AHORA, {
      fuente: async () => {
        throw new Error("sin red");
      },
      ahora: AHORA,
    });
    expect(tasa).toBeNull();
  });

  it("si la fuente no trae una de las monedas, no inventa la tasa", async () => {
    const prueba = crearFuente({ USD: 1, UYU: 40 });
    const tasa = await obtenerTasa(cliente, "USD", "BRL", AHORA, {
      fuente: prueba.fuente,
      ahora: AHORA,
    });
    expect(tasa).toBeNull();
  });
});

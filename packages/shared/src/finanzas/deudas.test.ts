// Tests unitarios de los esquemas de deudas y pagos.

import { describe, expect, it } from "vitest";
import {
  avisoDeFechaLimite,
  esquemaDeuda,
  esquemaEditarDeuda,
  esquemaPagoDeDeuda,
} from "./deudas.ts";

const contactoId = "00000000-0000-4000-8000-000000000001";
const valida = {
  contactoId,
  sentido: "me_deben",
  concepto: "Préstamo para el alquiler",
  monto: 5000,
  moneda: "UYU",
  fecha: "2026-10-20",
};

describe("esquemaDeuda", () => {
  it("acepta una deuda completa, en los dos sentidos", () => {
    expect(esquemaDeuda.safeParse(valida).success).toBe(true);
    expect(esquemaDeuda.safeParse({ ...valida, sentido: "debo" }).success).toBe(true);
  });

  it("rechaza el sentido desconocido, el contacto inválido y la moneda fuera de la lista", () => {
    expect(esquemaDeuda.safeParse({ ...valida, sentido: "regalo" }).success).toBe(false);
    expect(esquemaDeuda.safeParse({ ...valida, contactoId: "ana" }).success).toBe(false);
    expect(esquemaDeuda.safeParse({ ...valida, moneda: "XYZ" }).success).toBe(false);
  });

  it("pide un concepto corto y un monto positivo y razonable", () => {
    expect(esquemaDeuda.safeParse({ ...valida, concepto: "  " }).success).toBe(false);
    expect(esquemaDeuda.safeParse({ ...valida, concepto: "a".repeat(141) }).success).toBe(false);
    for (const monto of [0, -1, Number.NaN, 10_000_000_000]) {
      expect(esquemaDeuda.safeParse({ ...valida, monto }).success, String(monto)).toBe(false);
    }
  });

  it("pide un día que exista", () => {
    expect(esquemaDeuda.safeParse({ ...valida, fecha: "2026-02-30" }).success).toBe(false);
    expect(esquemaDeuda.safeParse({ ...valida, fecha: "ayer" }).success).toBe(false);
  });
});

describe("esquemaDeuda: con quién", () => {
  const { contactoId: _contacto, ...sinContacto } = valida;

  it("acepta una deuda con alguien que no es un contacto, solo con su nombre", () => {
    const resultado = esquemaDeuda.safeParse({
      ...sinContacto,
      nombreLibre: "  Beto el del taller  ",
    });
    expect(resultado.success && resultado.data.nombreLibre).toBe("Beto el del taller");
  });

  it("un texto vacío cuenta como que no vino: el formulario puede mandar los dos campos", () => {
    expect(esquemaDeuda.safeParse({ ...valida, nombreLibre: "" }).success).toBe(true);
    expect(
      esquemaDeuda.safeParse({ ...sinContacto, contactoId: "", nombreLibre: "Beto" }).success,
    ).toBe(true);
  });

  it("pide uno de los dos: sin ninguno falla, y avisa en los dos campos", () => {
    for (const datos of [
      sinContacto,
      { ...sinContacto, nombreLibre: "   " },
      { ...valida, contactoId: "" },
    ]) {
      const resultado = esquemaDeuda.safeParse(datos);
      expect(resultado.success).toBe(false);
      const campos = resultado.error?.issues.map((aviso) => aviso.path[0]);
      expect(campos).toEqual(expect.arrayContaining(["contactoId", "nombreLibre"]));
    }
  });

  it("no acepta un contacto y un nombre a la vez", () => {
    const resultado = esquemaDeuda.safeParse({ ...valida, nombreLibre: "Beto" });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.path).toEqual(["nombreLibre"]);
  });

  it("el nombre no puede pasar de 80 caracteres", () => {
    expect(esquemaDeuda.safeParse({ ...sinContacto, nombreLibre: "a".repeat(80) }).success).toBe(
      true,
    );
    expect(esquemaDeuda.safeParse({ ...sinContacto, nombreLibre: "a".repeat(81) }).success).toBe(
      false,
    );
  });
});

describe("fecha límite", () => {
  it("es opcional: sin ella, vacía o con un día vale", () => {
    expect(esquemaDeuda.safeParse(valida).success).toBe(true);
    expect(esquemaDeuda.safeParse({ ...valida, fechaLimite: "" }).success).toBe(true);
    expect(esquemaDeuda.safeParse({ ...valida, fechaLimite: "2026-12-31" }).success).toBe(true);
  });

  it("puede ser el mismo día de la deuda, pero no uno anterior", () => {
    expect(esquemaDeuda.safeParse({ ...valida, fechaLimite: valida.fecha }).success).toBe(true);
    const resultado = esquemaDeuda.safeParse({ ...valida, fechaLimite: "2026-10-19" });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.path).toEqual(["fechaLimite"]);
  });

  it("tiene que ser un día que exista", () => {
    for (const fechaLimite of ["2026-02-30", "mañana", "31/12/2026"]) {
      expect(esquemaDeuda.safeParse({ ...valida, fechaLimite }).success, fechaLimite).toBe(false);
    }
  });

  it("también se valida al editar, y ahí vacía quiere decir quitarla", () => {
    const edicion = { concepto: "x", monto: 10, fecha: "2026-10-20" };
    expect(esquemaEditarDeuda.safeParse({ ...edicion, fechaLimite: "2026-11-01" }).success).toBe(
      true,
    );
    expect(esquemaEditarDeuda.safeParse({ ...edicion, fechaLimite: "" }).success).toBe(true);
    expect(esquemaEditarDeuda.safeParse({ ...edicion, fechaLimite: "2026-10-01" }).success).toBe(
      false,
    );
  });

  it("avisoDeFechaLimite: sin límite o sin día de la deuda no avisa nada", () => {
    expect(avisoDeFechaLimite({ fecha: "2026-10-20" })).toBeUndefined();
    expect(avisoDeFechaLimite({ fecha: "2026-10-20", fechaLimite: "" })).toBeUndefined();
    expect(avisoDeFechaLimite({ fechaLimite: "2026-10-01" })).toBeUndefined();
    expect(avisoDeFechaLimite({ fecha: "2026-10-20", fechaLimite: "2026-10-19" })).toMatch(
      /anterior/,
    );
  });
});

describe("esquemaPagoDeDeuda con movimiento", () => {
  const pago = { monto: 100, fecha: "2026-10-20" };
  const cuenta = "00000000-0000-4000-8000-0000000000aa";

  it("el movimiento es opcional", () => {
    expect(esquemaPagoDeDeuda.safeParse(pago).success).toBe(true);
  });

  it("con movimiento pide la cuenta (un id) y la categoría (un número)", () => {
    const bien = { ...pago, movimiento: { cuentaFinancieraId: cuenta, categoriaId: 3 } };
    expect(esquemaPagoDeDeuda.safeParse(bien).success).toBe(true);
    for (const movimiento of [
      { categoriaId: 3 },
      { cuentaFinancieraId: cuenta },
      { cuentaFinancieraId: "efectivo", categoriaId: 3 },
      { cuentaFinancieraId: cuenta, categoriaId: 0 },
      { cuentaFinancieraId: cuenta, categoriaId: 1.5 },
      { cuentaFinancieraId: cuenta, categoriaId: "3" },
    ]) {
      expect(
        esquemaPagoDeDeuda.safeParse({ ...pago, movimiento }).success,
        JSON.stringify(movimiento),
      ).toBe(false);
    }
  });
});

describe("esquemaEditarDeuda y esquemaPagoDeDeuda", () => {
  it("al editar solo se cambian concepto, monto y día", () => {
    const resultado = esquemaEditarDeuda.safeParse({ ...valida, concepto: "Otro" });
    expect(resultado.success && Object.keys(resultado.data).sort()).toEqual([
      "concepto",
      "fecha",
      "monto",
    ]);
  });

  it("un pago necesita monto positivo y día", () => {
    expect(esquemaPagoDeDeuda.safeParse({ monto: 100, fecha: "2026-10-20" }).success).toBe(true);
    expect(esquemaPagoDeDeuda.safeParse({ monto: 0, fecha: "2026-10-20" }).success).toBe(false);
    expect(esquemaPagoDeDeuda.safeParse({ monto: 100 }).success).toBe(false);
  });
});

// Tests unitarios de los esquemas del módulo de ingresos y gastos.

import { describe, expect, it } from "vitest";
import {
  esquemaAbrirPeriodo,
  esquemaAjusteDeSaldo,
  esquemaCerrarPeriodo,
  esquemaCrearCategoria,
  esquemaCrearCuentaFinanciera,
  esquemaMovimiento,
  esquemaPresupuesto,
  esquemaReemplazarCategoria,
  esquemaRenombrarCuentaFinanciera,
  esquemaRenombrarPeriodo,
  IMPORTE_MAXIMO,
} from "./esquemas.ts";

const MOVIMIENTO_VALIDO = {
  tipo: "gasto",
  importe: 1500.5,
  descripcion: "Supermercado",
  categoriaId: 7,
  cuentaFinancieraId: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e",
  fecha: "2026-09-15T14:30:00.000Z",
};

describe("esquemaMovimiento", () => {
  it("acepta un movimiento válido", () => {
    expect(esquemaMovimiento.safeParse(MOVIMIENTO_VALIDO).success).toBe(true);
  });

  it("rechaza un tipo que no sea ingreso o gasto", () => {
    const resultado = esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, tipo: "transferencia" });
    expect(resultado.success).toBe(false);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, IMPORTE_MAXIMO + 1])(
    "rechaza un importe inválido: %s",
    (importe) => {
      expect(esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, importe }).success).toBe(false);
    },
  );

  it("acepta el importe máximo permitido", () => {
    expect(
      esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, importe: IMPORTE_MAXIMO }).success,
    ).toBe(true);
  });

  it("recorta espacios sobrantes de la descripción", () => {
    const resultado = esquemaMovimiento.parse({
      ...MOVIMIENTO_VALIDO,
      descripcion: "  Supermercado  ",
    });
    expect(resultado.descripcion).toBe("Supermercado");
  });

  it("rechaza una descripción vacía", () => {
    expect(esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, descripcion: "   " }).success).toBe(
      false,
    );
  });

  it.each(["no-es-un-numero", "7", 0, -1, 1.5, null])(
    "rechaza una categoría que no sea un número entero positivo: %j",
    (categoriaId) => {
      expect(esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, categoriaId }).success).toBe(
        false,
      );
    },
  );

  it("rechaza una cuenta que no sea un id válido", () => {
    expect(
      esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, cuentaFinancieraId: "no-es-un-uuid" })
        .success,
    ).toBe(false);
  });

  it.each([
    "15/09/2026",
    // Sin hora: ya no alcanza con el día, el período se deduce de la fecha y la hora.
    "2026-09-15",
    // Sin zona: sería ambiguo (¿hora de quién?).
    "2026-09-15T14:30:00",
    "2026-13-45T14:30:00Z",
    "",
  ])("rechaza una fecha con formato inválido: %j", (fecha) => {
    expect(esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, fecha }).success).toBe(false);
  });

  it("acepta una fecha con desfase horario explícito", () => {
    expect(
      esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, fecha: "2026-09-15T11:30:00-03:00" })
        .success,
    ).toBe(true);
  });
});

describe("esquemaMovimiento: transferencias entre cuentas (tipo neutro)", () => {
  const ORIGEN = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e";
  const DESTINO = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6f";
  const TRANSFERENCIA = {
    ...MOVIMIENTO_VALIDO,
    tipo: "neutro",
    cuentaFinancieraId: ORIGEN,
    cuentaDestinoId: DESTINO,
  };

  it("acepta una transferencia con origen y destino distintos", () => {
    expect(esquemaMovimiento.safeParse(TRANSFERENCIA).success).toBe(true);
  });

  it("exige la cuenta de destino", () => {
    const sinDestino = esquemaMovimiento.safeParse({
      ...TRANSFERENCIA,
      cuentaDestinoId: undefined,
    });
    const conNulo = esquemaMovimiento.safeParse({ ...TRANSFERENCIA, cuentaDestinoId: null });

    expect(sinDestino.success).toBe(false);
    expect(conNulo.success).toBe(false);
    expect(sinDestino.error?.issues[0]?.path).toEqual(["cuentaDestinoId"]);
  });

  it("rechaza el mismo origen y destino", () => {
    const resultado = esquemaMovimiento.safeParse({ ...TRANSFERENCIA, cuentaDestinoId: ORIGEN });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toContain("distinta");
  });

  it.each(["gasto", "ingreso"])("un %s no puede tener cuenta de destino", (tipo) => {
    expect(esquemaMovimiento.safeParse({ ...TRANSFERENCIA, tipo }).success).toBe(false);
  });

  it("un gasto o ingreso sin destino (o con destino nulo) sigue siendo válido", () => {
    expect(
      esquemaMovimiento.safeParse({ ...MOVIMIENTO_VALIDO, cuentaDestinoId: null }).success,
    ).toBe(true);
  });

  it("rechaza un destino que no sea un id válido", () => {
    expect(esquemaMovimiento.safeParse({ ...TRANSFERENCIA, cuentaDestinoId: "otra" }).success).toBe(
      false,
    );
  });
});

describe("esquemaReemplazarCategoria", () => {
  it("acepta una categoría existente", () => {
    expect(esquemaReemplazarCategoria.safeParse({ porCategoriaId: 3 }).success).toBe(true);
  });

  it("acepta una categoría nueva, con o sin color", () => {
    expect(esquemaReemplazarCategoria.safeParse({ nueva: { nombre: "Mascotas" } }).success).toBe(
      true,
    );
    expect(
      esquemaReemplazarCategoria.safeParse({ nueva: { nombre: "Mascotas", color: "#112233" } })
        .success,
    ).toBe(true);
  });

  it("rechaza pedir las dos cosas a la vez o ninguna", () => {
    expect(
      esquemaReemplazarCategoria.safeParse({ porCategoriaId: 3, nueva: { nombre: "X" } }).success,
    ).toBe(false);
    expect(esquemaReemplazarCategoria.safeParse({}).success).toBe(false);
  });

  it("rechaza una categoría existente inválida o una nueva sin nombre", () => {
    expect(esquemaReemplazarCategoria.safeParse({ porCategoriaId: "3" }).success).toBe(false);
    expect(esquemaReemplazarCategoria.safeParse({ nueva: { nombre: "  " } }).success).toBe(false);
  });
});

describe("esquemaAbrirPeriodo", () => {
  it("acepta un cuerpo vacío: abre ahora y con el nombre sugerido", () => {
    expect(esquemaAbrirPeriodo.safeParse({}).success).toBe(true);
  });

  it("acepta nombre y apertura, y recorta el nombre", () => {
    const resultado = esquemaAbrirPeriodo.parse({
      nombre: "  Vacaciones  ",
      aperturaEn: "2026-09-15T14:30:00.000Z",
    });
    expect(resultado.nombre).toBe("Vacaciones");
  });

  it("rechaza un nombre vacío o de más de 40 caracteres", () => {
    expect(esquemaAbrirPeriodo.safeParse({ nombre: "   " }).success).toBe(false);
    expect(esquemaAbrirPeriodo.safeParse({ nombre: "a".repeat(41) }).success).toBe(false);
  });

  it("rechaza una apertura sin hora o con formato inválido", () => {
    expect(esquemaAbrirPeriodo.safeParse({ aperturaEn: "2026-09-15" }).success).toBe(false);
    expect(esquemaAbrirPeriodo.safeParse({ aperturaEn: "ayer" }).success).toBe(false);
  });
});

describe("esquemaCerrarPeriodo", () => {
  it("acepta un cuerpo vacío: cierra ahora", () => {
    expect(esquemaCerrarPeriodo.safeParse({}).success).toBe(true);
  });

  it("rechaza un cierre sin hora", () => {
    expect(esquemaCerrarPeriodo.safeParse({ cierreEn: "2026-09-30" }).success).toBe(false);
  });
});

describe("esquemaRenombrarPeriodo", () => {
  it("exige un nombre", () => {
    expect(esquemaRenombrarPeriodo.safeParse({}).success).toBe(false);
    expect(esquemaRenombrarPeriodo.safeParse({ nombre: "Octubre" }).success).toBe(true);
  });
});

describe("esquemaCrearCategoria", () => {
  it("acepta un nombre válido y recorta espacios", () => {
    // Sin color: queda sin color, y el servidor elige el más distinto.
    expect(esquemaCrearCategoria.parse({ nombre: "  Mascotas  " })).toEqual({ nombre: "Mascotas" });
  });

  it("rechaza un nombre vacío", () => {
    expect(esquemaCrearCategoria.safeParse({ nombre: "   " }).success).toBe(false);
  });

  it("rechaza un nombre de más de 40 caracteres", () => {
    expect(esquemaCrearCategoria.safeParse({ nombre: "a".repeat(41) }).success).toBe(false);
  });
});

describe("esquemaCrearCuentaFinanciera", () => {
  it("el saldo inicial es 0 si no se manda", () => {
    expect(esquemaCrearCuentaFinanciera.parse({ nombre: "Efectivo" }).saldoInicial).toBe(0);
  });

  it("acepta un saldo inicial negativo (deuda, por ejemplo una tarjeta)", () => {
    const resultado = esquemaCrearCuentaFinanciera.safeParse({
      nombre: "Tarjeta",
      saldoInicial: -500,
    });
    expect(resultado.success).toBe(true);
  });
});

describe("esquemaAjusteDeSaldo", () => {
  it.each([0, 3000, -500, 1234.56])("acepta un saldo de %s", (saldo) => {
    expect(esquemaAjusteDeSaldo.safeParse({ saldo }).success).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, IMPORTE_MAXIMO + 1, -IMPORTE_MAXIMO - 1, "100"])(
    "rechaza un saldo inválido: %s",
    (saldo) => {
      expect(esquemaAjusteDeSaldo.safeParse({ saldo }).success).toBe(false);
    },
  );

  it("exige el saldo", () => {
    expect(esquemaAjusteDeSaldo.safeParse({}).success).toBe(false);
  });
});

describe("esquemaRenombrarCuentaFinanciera", () => {
  it("acepta un nombre, lo recorta, e ignora un saldo que venga de más", () => {
    expect(
      esquemaRenombrarCuentaFinanciera.parse({ nombre: "  Banco  ", saldoInicial: 999 }),
    ).toEqual({ nombre: "Banco" });
  });

  it("rechaza un nombre vacío o de más de 40 caracteres", () => {
    expect(esquemaRenombrarCuentaFinanciera.safeParse({ nombre: "  " }).success).toBe(false);
    expect(esquemaRenombrarCuentaFinanciera.safeParse({ nombre: "a".repeat(41) }).success).toBe(
      false,
    );
  });
});

describe("esquemaPresupuesto", () => {
  it("acepta un monto en cero (equivale a sin presupuesto)", () => {
    expect(esquemaPresupuesto.safeParse({ monto: 0 }).success).toBe(true);
  });

  it("rechaza un monto negativo", () => {
    expect(esquemaPresupuesto.safeParse({ monto: -1 }).success).toBe(false);
  });
});

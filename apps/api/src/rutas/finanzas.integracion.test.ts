// Tests de integración de categorías y cuentas del módulo de ingresos y
// gastos, contra la base gestion_test real.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  CATEGORIA_DE_TRANSFERENCIA,
  CATEGORIAS_POR_DEFECTO,
  CUENTAS_FINANCIERAS_POR_DEFECTO,
  distanciaDeColor,
  type RespuestaError,
} from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";
import { abrirPeriodoAmplio } from "../pruebas/periodos-de-prueba.ts";
import { buscarCuenta } from "../servicios/usuarios/cuentas.ts";

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

/** Registra, aprueba y entra. Devuelve las cookies y el id de la cuenta. */
async function entrarComoUsuario(): Promise<{ cookies: string; id: string }> {
  const datos = await registrarAprobado(app, cliente);
  const cuenta = await buscarCuenta(cliente, datos.usuario);
  const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);
  return { cookies: cookiesDe(respuesta), id: cuenta?.id ?? "" };
}

type CategoriaJson = {
  id: number;
  nombre: string;
  color: string;
  sistema: "transferencia" | null;
  movimientos: number;
};
type CuentaJson = {
  id: string;
  nombre: string;
  saldoInicialCentavos: number;
  saldoCentavos: number;
};

describe("permisos de /api/finanzas", () => {
  it("responde 401 sin sesión", async () => {
    expect((await app.request("/api/finanzas/categorias")).status).toBe(401);
    expect((await app.request("/api/finanzas/cuentas")).status).toBe(401);
  });
});

describe("GET /api/finanzas/categorias", () => {
  it("siembra las categorías por defecto la primera vez que se piden", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await app.request("/api/finanzas/categorias", {
      headers: { cookie: cookies },
    });

    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<{ categorias: CategoriaJson[] }>(respuesta);
    // El set por defecto más la categoría especial de las transferencias.
    expect(cuerpo.categorias.map((categoria) => categoria.nombre).sort()).toEqual(
      [...CATEGORIAS_POR_DEFECTO.map((c) => c.nombre), CATEGORIA_DE_TRANSFERENCIA.nombre].sort(),
    );
    // Cada una con el color por defecto que le corresponde, no un valor vacío.
    for (const categoria of cuerpo.categorias) {
      const esperado =
        categoria.nombre === CATEGORIA_DE_TRANSFERENCIA.nombre
          ? CATEGORIA_DE_TRANSFERENCIA.color
          : CATEGORIAS_POR_DEFECTO.find((c) => c.nombre === categoria.nombre)?.color;
      expect(categoria.color).toBe(esperado);
    }
    // Los ids son números.
    expect(cuerpo.categorias.every((categoria) => Number.isInteger(categoria.id))).toBe(true);
  });

  it("no vuelve a sembrar las que se borraron (evita resucitarlas); la especial no se borra", async () => {
    const { cookies } = await entrarComoUsuario();
    await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } });
    const primeras = await leerJson<{ categorias: CategoriaJson[] }>(
      await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
    );

    for (const categoria of primeras.categorias) {
      await app.request(`/api/finanzas/categorias/${categoria.id}`, {
        method: "DELETE",
        headers: { cookie: cookies },
      });
    }

    const segundas = await leerJson<{ categorias: CategoriaJson[] }>(
      await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
    );
    // Solo queda la especial (las demás se borraron y no se vuelven a sembrar).
    expect(segundas.categorias.map((c) => c.sistema)).toEqual(["transferencia"]);
  });

  it("cada usuario tiene las suyas, no las de otro", async () => {
    const primero = await entrarComoUsuario();
    const segundo = await entrarComoUsuario();

    await app.request("/api/finanzas/categorias", {
      method: "POST",
      headers: { cookie: primero.cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Solo del primero" }),
    });

    const cuerpo = await leerJson<{ categorias: CategoriaJson[] }>(
      await app.request("/api/finanzas/categorias", { headers: { cookie: segundo.cookies } }),
    );
    expect(cuerpo.categorias.some((categoria) => categoria.nombre === "Solo del primero")).toBe(
      false,
    );
  });
});

describe("POST /api/finanzas/categorias", () => {
  it("crea una categoría nueva", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await app.request("/api/finanzas/categorias", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Mascotas" }),
    });

    expect(respuesta.status).toBe(201);
    const categoria = await leerJson<CategoriaJson>(respuesta);
    expect(categoria.nombre).toBe("Mascotas");
    expect(categoria.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(Number.isInteger(categoria.id)).toBe(true);
  });

  it("sin color elegido, toma uno bien distinto de los que ya tiene la persona", async () => {
    const { cookies } = await entrarComoUsuario();
    const existentes = await leerJson<{ categorias: CategoriaJson[] }>(
      await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
    );

    const respuesta = await app.request("/api/finanzas/categorias", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Mascotas" }),
    });

    const nueva = await leerJson<CategoriaJson>(respuesta);
    for (const existente of existentes.categorias) {
      expect(distanciaDeColor(nueva.color, existente.color)).toBeGreaterThan(15);
    }
  });

  it("cada categoría nueva toma un color distinto de la anterior", async () => {
    const { cookies } = await entrarComoUsuario();
    const colores: string[] = [];

    for (const nombre of ["Uno", "Dos", "Tres", "Cuatro"]) {
      const nueva = await leerJson<CategoriaJson>(
        await app.request("/api/finanzas/categorias", {
          method: "POST",
          headers: { cookie: cookies, "content-type": "application/json" },
          body: JSON.stringify({ nombre }),
        }),
      );
      colores.push(nueva.color);
    }

    expect(new Set(colores).size).toBe(4);
  });

  it("crea una categoría con el color elegido", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await app.request("/api/finanzas/categorias", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Mascotas", color: "#ff0000" }),
    });

    expect(respuesta.status).toBe(201);
    expect((await leerJson<CategoriaJson>(respuesta)).color).toBe("#ff0000");
  });

  it("rechaza un color inválido", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await app.request("/api/finanzas/categorias", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Mascotas", color: "rojo" }),
    });

    expect(respuesta.status).toBe(400);
  });

  it("rechaza un nombre vacío", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await app.request("/api/finanzas/categorias", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "   " }),
    });

    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("VALIDACION_INVALIDA");
  });

  it("rechaza un nombre repetido (sin distinguir mayúsculas)", async () => {
    const { cookies } = await entrarComoUsuario();
    await app.request("/api/finanzas/categorias", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Mascotas" }),
    });

    const respuesta = await app.request("/api/finanzas/categorias", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "MASCOTAS" }),
    });

    expect(respuesta.status).toBe(409);
  });
});

describe("PATCH y DELETE /api/finanzas/categorias/:id", () => {
  async function crear(cookies: string, nombre: string): Promise<CategoriaJson> {
    return leerJson<CategoriaJson>(
      await app.request("/api/finanzas/categorias", {
        method: "POST",
        headers: { cookie: cookies, "content-type": "application/json" },
        body: JSON.stringify({ nombre }),
      }),
    );
  }

  it("renombra una categoría propia", async () => {
    const { cookies } = await entrarComoUsuario();
    const categoria = await crear(cookies, "Mascotas");

    const respuesta = await app.request(`/api/finanzas/categorias/${categoria.id}`, {
      method: "PATCH",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Veterinaria" }),
    });

    expect(respuesta.status).toBe(200);
    expect((await leerJson<CategoriaJson>(respuesta)).nombre).toBe("Veterinaria");
  });

  it("cambia el color de una categoría propia", async () => {
    const { cookies } = await entrarComoUsuario();
    const categoria = await crear(cookies, "Mascotas");

    const respuesta = await app.request(`/api/finanzas/categorias/${categoria.id}`, {
      method: "PATCH",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Mascotas", color: "#00ff00" }),
    });

    expect(respuesta.status).toBe(200);
    expect((await leerJson<CategoriaJson>(respuesta)).color).toBe("#00ff00");
  });

  it("responde 404 al intentar tocar la categoría de otra persona", async () => {
    const primero = await entrarComoUsuario();
    const segundo = await entrarComoUsuario();
    const categoria = await crear(primero.cookies, "Mascotas");

    const respuestaEditar = await app.request(`/api/finanzas/categorias/${categoria.id}`, {
      method: "PATCH",
      headers: { cookie: segundo.cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Robada" }),
    });
    expect(respuestaEditar.status).toBe(404);

    const respuestaBorrar = await app.request(`/api/finanzas/categorias/${categoria.id}`, {
      method: "DELETE",
      headers: { cookie: segundo.cookies },
    });
    expect(respuestaBorrar.status).toBe(404);
  });

  it("borra lógicamente: desaparece del listado pero no rompe nada al borrarla dos veces", async () => {
    const { cookies } = await entrarComoUsuario();
    const categoria = await crear(cookies, "Mascotas");

    const primerBorrado = await app.request(`/api/finanzas/categorias/${categoria.id}`, {
      method: "DELETE",
      headers: { cookie: cookies },
    });
    expect(primerBorrado.status).toBe(200);

    const segundoBorrado = await app.request(`/api/finanzas/categorias/${categoria.id}`, {
      method: "DELETE",
      headers: { cookie: cookies },
    });
    expect(segundoBorrado.status).toBe(404);

    const cuerpo = await leerJson<{ categorias: CategoriaJson[] }>(
      await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
    );
    expect(cuerpo.categorias.some((c) => c.id === categoria.id)).toBe(false);
  });
});

describe("GET /api/finanzas/cuentas", () => {
  it("siembra las cuentas por defecto la primera vez que se piden", async () => {
    const { cookies } = await entrarComoUsuario();

    const cuerpo = await leerJson<{ cuentas: CuentaJson[] }>(
      await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
    );

    expect(cuerpo.cuentas.map((cuenta) => cuenta.nombre).sort()).toEqual(
      [...CUENTAS_FINANCIERAS_POR_DEFECTO].sort(),
    );
    expect(cuerpo.cuentas.every((cuenta) => cuenta.saldoCentavos === 0)).toBe(true);
  });

  it("el saldo es el inicial más los ingresos menos los gastos de la cuenta", async () => {
    const { cookies, id: userId } = await entrarComoUsuario();
    const cuenta = await leerJson<CuentaJson>(
      await app.request("/api/finanzas/cuentas", {
        method: "POST",
        headers: { cookie: cookies, "content-type": "application/json" },
        body: JSON.stringify({ nombre: "Ahorros", saldoInicial: 100 }),
      }),
    );
    const categorias = await leerJson<{ categorias: CategoriaJson[] }>(
      await app.request("/api/finanzas/categorias", { headers: { cookie: cookies } }),
    );
    const categoriaId = categorias.categorias[0]?.id ?? 0;

    // Se insertan directo en la base (sin pasar por la ruta de movimientos) para
    // probar el cálculo del saldo aislado, incluido un movimiento eliminado.
    const periodo = await abrirPeriodoAmplio(app, cookies);
    await cliente.db.insert(esquema.movimientos).values([
      {
        userId,
        tipo: "ingreso",
        importeCentavos: 5000,
        descripcion: "Sueldo",
        categoriaId,
        cuentaFinancieraId: cuenta.id,
        fecha: new Date("2026-09-01T12:00:00.000Z"),
        periodoId: periodo.id,
      },
      {
        userId,
        tipo: "gasto",
        importeCentavos: 2000,
        descripcion: "Super",
        categoriaId,
        cuentaFinancieraId: cuenta.id,
        fecha: new Date("2026-09-02T12:00:00.000Z"),
        periodoId: periodo.id,
      },
      // Un movimiento eliminado lógicamente no debe contar.
      {
        userId,
        tipo: "gasto",
        importeCentavos: 999_999,
        descripcion: "No cuenta",
        categoriaId,
        cuentaFinancieraId: cuenta.id,
        fecha: new Date("2026-09-02T12:00:00.000Z"),
        periodoId: periodo.id,
        eliminadoEn: new Date(),
      },
    ]);

    const cuerpo = await leerJson<{ cuentas: CuentaJson[] }>(
      await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
    );
    const ahorros = cuerpo.cuentas.find((c) => c.id === cuenta.id);

    // 100 iniciales + 50 de ingreso - 20 de gasto = 130, en centésimos: 13000.
    expect(ahorros?.saldoCentavos).toBe(13_000);
  });
});

describe("POST /api/finanzas/cuentas", () => {
  it("rechaza un nombre repetido", async () => {
    const { cookies } = await entrarComoUsuario();
    await app.request("/api/finanzas/cuentas", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Ahorros" }),
    });

    const respuesta = await app.request("/api/finanzas/cuentas", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "ahorros" }),
    });

    expect(respuesta.status).toBe(409);
  });

  it("acepta un saldo inicial negativo", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await app.request("/api/finanzas/cuentas", {
      method: "POST",
      headers: { cookie: cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Tarjeta", saldoInicial: -500 }),
    });

    expect(respuesta.status).toBe(201);
    const cuenta = await leerJson<CuentaJson>(respuesta);
    expect(cuenta.saldoInicialCentavos).toBe(-50_000);
  });
});

describe("PATCH /api/finanzas/cuentas/:id", () => {
  it("renombra la cuenta y no toca su saldo, aunque se mande un saldo inicial de más", async () => {
    const { cookies } = await entrarComoUsuario();
    const creada = await leerJson<CuentaJson>(
      await app.request("/api/finanzas/cuentas", {
        method: "POST",
        headers: { cookie: cookies, "content-type": "application/json" },
        body: JSON.stringify({ nombre: "Banco", saldoInicial: 100 }),
      }),
    );

    const respuesta = await app.request(`/api/finanzas/cuentas/${creada.id}`, {
      method: "PATCH",
      headers: { cookie: cookies, "content-type": "application/json" },
      // El saldo ya no se edita acá (se carga con "ajustar saldo"): se ignora.
      body: JSON.stringify({ nombre: "Banco Nación", saldoInicial: 5000 }),
    });
    expect(respuesta.status).toBe(200);

    const cuerpo = await leerJson<{ cuentas: CuentaJson[] }>(
      await app.request("/api/finanzas/cuentas", { headers: { cookie: cookies } }),
    );
    const actualizada = cuerpo.cuentas.find((c) => c.id === creada.id);
    expect(actualizada?.nombre).toBe("Banco Nación");
    expect(actualizada?.saldoInicialCentavos).toBe(10_000);
    expect(actualizada?.saldoCentavos).toBe(10_000);
  });

  it("responde 404 al intentar editar la cuenta de otra persona", async () => {
    const primero = await entrarComoUsuario();
    const segundo = await entrarComoUsuario();
    const creada = await leerJson<CuentaJson>(
      await app.request("/api/finanzas/cuentas", {
        method: "POST",
        headers: { cookie: primero.cookies, "content-type": "application/json" },
        body: JSON.stringify({ nombre: "Banco" }),
      }),
    );

    const respuesta = await app.request(`/api/finanzas/cuentas/${creada.id}`, {
      method: "PATCH",
      headers: { cookie: segundo.cookies, "content-type": "application/json" },
      body: JSON.stringify({ nombre: "Robada", saldoInicial: 0 }),
    });

    expect(respuesta.status).toBe(404);
  });
});

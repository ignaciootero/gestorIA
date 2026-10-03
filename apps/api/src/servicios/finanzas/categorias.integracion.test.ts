// Tests de integración de las categorías: la especial de transferencias, nombre
// único, eliminar solo sin movimientos y reemplazar ajustando el histórico.
// Contra la base gestion_test real.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  CATEGORIA_DE_TRANSFERENCIA,
  CATEGORIAS_POR_DEFECTO,
  distanciaDeColor,
  type RespuestaError,
} from "@gestoria/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { abrirPeriodoAmplio } from "../../pruebas/periodos-de-prueba.ts";
import { buscarCuenta } from "../usuarios/cuentas.ts";

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

type CategoriaJson = {
  id: number;
  nombre: string;
  color: string;
  sistema: "transferencia" | null;
  movimientos: number;
};

type Usuario = { cookies: string; id: string };

async function entrarComoUsuario(): Promise<Usuario> {
  const datos = await registrarAprobado(app, cliente);
  const cuenta = await buscarCuenta(cliente, datos.usuario);
  const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);
  return { cookies: cookiesDe(respuesta), id: cuenta?.id ?? "" };
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

async function listar(cookies: string): Promise<CategoriaJson[]> {
  return (
    await leerJson<{ categorias: CategoriaJson[] }>(
      await pedir(cookies, "/api/finanzas/categorias"),
    )
  ).categorias;
}

async function crearCategoria(
  cookies: string,
  nombre: string,
  color?: string,
): Promise<CategoriaJson> {
  return leerJson<CategoriaJson>(
    await pedir(cookies, "/api/finanzas/categorias", "POST", {
      nombre,
      ...(color === undefined ? {} : { color }),
    }),
  );
}

function reemplazar(cookies: string, id: number, cuerpo: unknown) {
  return pedir(cookies, `/api/finanzas/categorias/${id}/reemplazar`, "POST", cuerpo);
}

/** Entra, abre un período amplio y deja una cuenta lista para cargar movimientos. */
async function prepararEntorno(): Promise<{ usuario: Usuario; cuentaId: string }> {
  const usuario = await entrarComoUsuario();
  await abrirPeriodoAmplio(app, usuario.cookies);
  const cuentas = await leerJson<{ cuentas: { id: string }[] }>(
    await pedir(usuario.cookies, "/api/finanzas/cuentas"),
  );
  return { usuario, cuentaId: cuentas.cuentas[0]?.id ?? "" };
}

function cargarMovimiento(
  cookies: string,
  cuentaId: string,
  categoriaId: number,
  datos: { importe?: number; tipo?: "ingreso" | "gasto"; descripcion?: string } = {},
) {
  return pedir(cookies, "/api/finanzas/movimientos", "POST", {
    tipo: "gasto",
    importe: 10,
    descripcion: "Movimiento",
    fecha: "2026-03-10T12:00:00.000Z",
    categoriaId,
    cuentaFinancieraId: cuentaId,
    ...datos,
  });
}

describe("permisos de las rutas de categorías", () => {
  it("responden 401 sin sesión", async () => {
    expect(
      (await app.request("/api/finanzas/categorias/1/reemplazar", { method: "POST" })).status,
    ).toBe(401);
    expect((await app.request("/api/finanzas/categorias/1", { method: "DELETE" })).status).toBe(
      401,
    );
  });
});

describe("ids numéricos y nombre único", () => {
  it("cada categoría tiene un id numérico y distinto", async () => {
    const { cookies } = await entrarComoUsuario();

    const categorias = await listar(cookies);

    expect(categorias.every((c) => Number.isInteger(c.id) && c.id > 0)).toBe(true);
    expect(new Set(categorias.map((c) => c.id)).size).toBe(categorias.length);
  });

  it("un id que no es un número se rechaza", async () => {
    const { cookies } = await entrarComoUsuario();

    for (const metodo of ["PATCH", "DELETE"]) {
      const respuesta = await pedir(cookies, "/api/finanzas/categorias/no-es-un-numero", metodo, {
        nombre: "X",
      });
      expect(respuesta.status).toBeGreaterThanOrEqual(400);
      expect(respuesta.status).toBeLessThan(500);
    }
  });

  it("el nombre es único entre las activas, sin distinguir mayúsculas ni espacios de más", async () => {
    const { cookies } = await entrarComoUsuario();
    await crearCategoria(cookies, "Mascotas");

    const repetida = await pedir(cookies, "/api/finanzas/categorias", "POST", {
      nombre: "  mAsCoTaS ",
    });

    expect(repetida.status).toBe(409);
  });

  it("no se puede renombrar una categoría con el nombre de otra", async () => {
    const { cookies } = await entrarComoUsuario();
    const uno = await crearCategoria(cookies, "Uno");
    await crearCategoria(cookies, "Dos");

    const respuesta = await pedir(cookies, `/api/finanzas/categorias/${uno.id}`, "PATCH", {
      nombre: "dos",
    });

    expect(respuesta.status).toBe(409);
  });

  it("permite cambiar solo las mayúsculas del propio nombre, y conserva el color si no se manda", async () => {
    const { cookies } = await entrarComoUsuario();
    const categoria = await crearCategoria(cookies, "mascotas", "#123456");

    const respuesta = await pedir(cookies, `/api/finanzas/categorias/${categoria.id}`, "PATCH", {
      nombre: "Mascotas",
    });

    expect(respuesta.status).toBe(200);
    expect(await leerJson<CategoriaJson>(respuesta)).toMatchObject({
      nombre: "Mascotas",
      color: "#123456",
    });
  });

  it("dos personas pueden tener una categoría con el mismo nombre", async () => {
    const primero = await entrarComoUsuario();
    const segundo = await entrarComoUsuario();

    expect(
      (await pedir(primero.cookies, "/api/finanzas/categorias", "POST", { nombre: "Mascotas" }))
        .status,
    ).toBe(201);
    expect(
      (await pedir(segundo.cookies, "/api/finanzas/categorias", "POST", { nombre: "Mascotas" }))
        .status,
    ).toBe(201);
  });

  it("un nombre eliminado se puede volver a usar", async () => {
    const { cookies } = await entrarComoUsuario();
    const categoria = await crearCategoria(cookies, "Mascotas");
    await pedir(cookies, `/api/finanzas/categorias/${categoria.id}`, "DELETE");

    expect(
      (await pedir(cookies, "/api/finanzas/categorias", "POST", { nombre: "Mascotas" })).status,
    ).toBe(201);
  });

  it("el nombre con comodines de búsqueda se trata como texto (no como patrón)", async () => {
    const { cookies } = await entrarComoUsuario();
    await crearCategoria(cookies, "Ropa");

    // Con la comparación vieja (ILIKE) "R_pa" coincidía con "Ropa".
    expect(
      (await pedir(cookies, "/api/finanzas/categorias", "POST", { nombre: "R_pa" })).status,
    ).toBe(201);
    expect((await pedir(cookies, "/api/finanzas/categorias", "POST", { nombre: "%" })).status).toBe(
      201,
    );
  });
});

describe("categoría especial de transferencias", () => {
  it("todas las personas la tienen, con su color amarillo y marcada como especial", async () => {
    const { cookies } = await entrarComoUsuario();

    const especial = (await listar(cookies)).find((c) => c.sistema === "transferencia");

    expect(especial).toMatchObject({
      nombre: CATEGORIA_DE_TRANSFERENCIA.nombre,
      color: CATEGORIA_DE_TRANSFERENCIA.color,
    });
  });

  it("también les llega a quienes ya tenían categorías de antes", async () => {
    const usuario = await entrarComoUsuario();
    // Una cuenta "vieja": ya tiene su set por defecto, pero no la especial.
    await cliente.db
      .insert(esquema.categorias)
      .values(
        CATEGORIAS_POR_DEFECTO.map(({ nombre, color }) => ({ userId: usuario.id, nombre, color })),
      );

    const categorias = await listar(usuario.cookies);

    expect(categorias.filter((c) => c.sistema === "transferencia")).toHaveLength(1);
    expect(categorias).toHaveLength(CATEGORIAS_POR_DEFECTO.length + 1);
  });

  it("no se duplica aunque se pidan las categorías muchas veces o a la vez", async () => {
    const { cookies } = await entrarComoUsuario();

    await Promise.all([0, 1, 2, 3, 4].map(() => listar(cookies)));
    const categorias = await listar(cookies);

    expect(categorias.filter((c) => c.sistema === "transferencia")).toHaveLength(1);
    expect(categorias).toHaveLength(CATEGORIAS_POR_DEFECTO.length + 1);
  });

  it("si ya había una categoría común con ese nombre, se le cambia el suyo", async () => {
    const usuario = await entrarComoUsuario();
    await cliente.db
      .insert(esquema.categorias)
      .values({ userId: usuario.id, nombre: "transferencia ENTRE cuentas", color: "#123456" });

    const categorias = await listar(usuario.cookies);

    const especial = categorias.find((c) => c.sistema === "transferencia");
    expect(especial?.nombre).toBe(CATEGORIA_DE_TRANSFERENCIA.nombre);
    // La que ya tenía sigue ahí, con su color, y con otro nombre.
    expect(categorias.find((c) => c.color === "#123456")?.nombre).toBe(
      "transferencia ENTRE cuentas (propia)",
    );
  });

  it("no se puede eliminar", async () => {
    const { cookies } = await entrarComoUsuario();
    const especial = (await listar(cookies)).find((c) => c.sistema === "transferencia");

    const respuesta = await pedir(cookies, `/api/finanzas/categorias/${especial?.id}`, "DELETE");

    expect(respuesta.status).toBe(409);
    expect((await leerJson<RespuestaError>(respuesta)).error.mensaje).toContain("especial");
    expect((await listar(cookies)).some((c) => c.sistema === "transferencia")).toBe(true);
  });

  it("no se puede reemplazar", async () => {
    const { cookies } = await entrarComoUsuario();
    const especial = (await listar(cookies)).find((c) => c.sistema === "transferencia");
    const otra = await crearCategoria(cookies, "Otra");

    const respuesta = await reemplazar(cookies, especial?.id ?? 0, { porCategoriaId: otra.id });

    expect(respuesta.status).toBe(409);
  });

  it("se puede renombrar y recolorear, y sigue siendo la especial", async () => {
    const { cookies } = await entrarComoUsuario();
    const especial = (await listar(cookies)).find((c) => c.sistema === "transferencia");

    const respuesta = await pedir(cookies, `/api/finanzas/categorias/${especial?.id}`, "PATCH", {
      nombre: "Pases de plata",
      color: "#111111",
    });

    expect(respuesta.status).toBe(200);
    expect(await leerJson<CategoriaJson>(respuesta)).toMatchObject({
      id: especial?.id,
      nombre: "Pases de plata",
      color: "#111111",
      sistema: "transferencia",
    });
  });

  it("su nombre cuenta para la unicidad: no se puede crear otra con el mismo", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await pedir(cookies, "/api/finanzas/categorias", "POST", {
      nombre: CATEGORIA_DE_TRANSFERENCIA.nombre.toUpperCase(),
    });

    expect(respuesta.status).toBe(409);
  });

  it("no admite presupuesto (no es un gasto)", async () => {
    const { cookies } = await entrarComoUsuario();
    const especial = (await listar(cookies)).find((c) => c.sistema === "transferencia");

    const respuesta = await pedir(cookies, `/api/finanzas/presupuestos/${especial?.id}`, "PUT", {
      monto: 100,
    });

    expect(respuesta.status).toBe(400);
  });
});

describe("DELETE /api/finanzas/categorias/:id con movimientos", () => {
  it("elimina una categoría sin movimientos", async () => {
    const { cookies } = await entrarComoUsuario();
    const categoria = await crearCategoria(cookies, "Mascotas");

    expect(
      (await pedir(cookies, `/api/finanzas/categorias/${categoria.id}`, "DELETE")).status,
    ).toBe(200);
    expect((await listar(cookies)).some((c) => c.id === categoria.id)).toBe(false);
  });

  it("no elimina una categoría con movimientos: 409 con la sugerencia de reemplazarla", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const categoria = await crearCategoria(usuario.cookies, "Mascotas");
    await cargarMovimiento(usuario.cookies, cuentaId, categoria.id);

    const respuesta = await pedir(
      usuario.cookies,
      `/api/finanzas/categorias/${categoria.id}`,
      "DELETE",
    );

    expect(respuesta.status).toBe(409);
    expect((await leerJson<RespuestaError>(respuesta)).error.mensaje).toContain("reemplazarla");
    const sigue = (await listar(usuario.cookies)).find((c) => c.id === categoria.id);
    expect(sigue?.movimientos).toBe(1);
  });

  it("cuenta los movimientos de cada categoría en el listado, sin los eliminados", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const categoria = await crearCategoria(usuario.cookies, "Mascotas");
    await cargarMovimiento(usuario.cookies, cuentaId, categoria.id);
    await cargarMovimiento(usuario.cookies, cuentaId, categoria.id);
    const borrado = await leerJson<{ id: string }>(
      await cargarMovimiento(usuario.cookies, cuentaId, categoria.id),
    );
    await pedir(usuario.cookies, `/api/finanzas/movimientos/${borrado.id}`, "DELETE");

    expect((await listar(usuario.cookies)).find((c) => c.id === categoria.id)?.movimientos).toBe(2);
  });

  it("los movimientos eliminados no impiden eliminarla", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const categoria = await crearCategoria(usuario.cookies, "Mascotas");
    const creado = await leerJson<{ id: string }>(
      await cargarMovimiento(usuario.cookies, cuentaId, categoria.id),
    );
    await pedir(usuario.cookies, `/api/finanzas/movimientos/${creado.id}`, "DELETE");

    expect(
      (await pedir(usuario.cookies, `/api/finanzas/categorias/${categoria.id}`, "DELETE")).status,
    ).toBe(200);
  });

  it("al eliminar una categoría sin movimientos, su presupuesto desaparece con ella", async () => {
    const { usuario } = await prepararEntorno();
    const categoria = await crearCategoria(usuario.cookies, "Mascotas");
    await pedir(usuario.cookies, `/api/finanzas/presupuestos/${categoria.id}`, "PUT", {
      monto: 50,
    });

    await pedir(usuario.cookies, `/api/finanzas/categorias/${categoria.id}`, "DELETE");

    const filas = await cliente.db
      .select()
      .from(esquema.presupuestos)
      .where(eq(esquema.presupuestos.categoriaId, categoria.id));
    expect(filas).toHaveLength(0);
  });
});

describe("POST /api/finanzas/categorias/:id/reemplazar", () => {
  it("pasa todos los movimientos a la categoría elegida, también los históricos, y elimina la original", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    const nueva = await crearCategoria(usuario.cookies, "Nueva");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id, { descripcion: "Reciente" });
    await pedir(usuario.cookies, "/api/finanzas/movimientos", "POST", {
      tipo: "gasto",
      importe: 5,
      descripcion: "Histórico",
      fecha: "2026-01-02T12:00:00.000Z",
      categoriaId: vieja.id,
      cuentaFinancieraId: cuentaId,
    });
    await cargarMovimiento(usuario.cookies, cuentaId, nueva.id, { descripcion: "Ya estaba" });

    const respuesta = await reemplazar(usuario.cookies, vieja.id, { porCategoriaId: nueva.id });

    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<{ destino: CategoriaJson; movimientosMovidos: number }>(
      respuesta,
    );
    expect(cuerpo.movimientosMovidos).toBe(2);
    expect(cuerpo.destino).toMatchObject({ id: nueva.id, movimientos: 3 });

    const categorias = await listar(usuario.cookies);
    expect(categorias.some((c) => c.id === vieja.id)).toBe(false);
    expect(categorias.find((c) => c.id === nueva.id)?.movimientos).toBe(3);

    const movimientos = await leerJson<{
      movimientos: { descripcion: string; categoria: { id: number } }[];
    }>(await pedir(usuario.cookies, "/api/finanzas/movimientos"));
    expect(movimientos.movimientos.every((m) => m.categoria.id === nueva.id)).toBe(true);
  });

  it("también mueve los movimientos eliminados lógicamente (ninguno queda apuntando a la eliminada)", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    const nueva = await crearCategoria(usuario.cookies, "Nueva");
    const borrado = await leerJson<{ id: string }>(
      await cargarMovimiento(usuario.cookies, cuentaId, vieja.id),
    );
    await pedir(usuario.cookies, `/api/finanzas/movimientos/${borrado.id}`, "DELETE");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id);

    const cuerpo = await leerJson<{ movimientosMovidos: number }>(
      await reemplazar(usuario.cookies, vieja.id, { porCategoriaId: nueva.id }),
    );

    expect(cuerpo.movimientosMovidos).toBe(2);
    const huérfanos = await cliente.db
      .select()
      .from(esquema.movimientos)
      .where(eq(esquema.movimientos.categoriaId, vieja.id));
    expect(huérfanos).toHaveLength(0);
  });

  it("los totales y las estadísticas del histórico reflejan el cambio", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    const nueva = await crearCategoria(usuario.cookies, "Nueva");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id, { importe: 40 });
    await cargarMovimiento(usuario.cookies, cuentaId, nueva.id, { importe: 60 });
    const periodos = await leerJson<{ periodos: { id: number }[] }>(
      await pedir(usuario.cookies, "/api/finanzas/periodos"),
    );
    const periodoId = periodos.periodos[0]?.id;

    await reemplazar(usuario.cookies, vieja.id, { porCategoriaId: nueva.id });

    const estadisticas = await leerJson<{
      gastosPorCategoria: { categoriaId: number; totalCentavos: number }[];
    }>(await pedir(usuario.cookies, `/api/finanzas/estadisticas?periodoId=${periodoId}`));
    // Todo el gasto (40 + 60) queda en la categoría de destino.
    expect(estadisticas.gastosPorCategoria).toEqual([
      expect.objectContaining({ categoriaId: nueva.id, totalCentavos: 10_000 }),
    ]);
  });

  it("el presupuesto de la reemplazada pasa a la de destino si esta no tiene uno", async () => {
    const { usuario } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    const nueva = await crearCategoria(usuario.cookies, "Nueva");
    await pedir(usuario.cookies, `/api/finanzas/presupuestos/${vieja.id}`, "PUT", { monto: 300 });

    await reemplazar(usuario.cookies, vieja.id, { porCategoriaId: nueva.id });

    const filas = await cliente.db.select().from(esquema.presupuestos);
    expect(filas).toEqual([
      expect.objectContaining({ categoriaId: nueva.id, montoCentavos: 30_000 }),
    ]);
  });

  it("si la de destino ya tiene presupuesto, conserva el suyo y descarta el de la reemplazada", async () => {
    const { usuario } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    const nueva = await crearCategoria(usuario.cookies, "Nueva");
    await pedir(usuario.cookies, `/api/finanzas/presupuestos/${vieja.id}`, "PUT", { monto: 300 });
    await pedir(usuario.cookies, `/api/finanzas/presupuestos/${nueva.id}`, "PUT", { monto: 100 });

    await reemplazar(usuario.cookies, vieja.id, { porCategoriaId: nueva.id });

    const filas = await cliente.db.select().from(esquema.presupuestos);
    expect(filas).toEqual([
      expect.objectContaining({ categoriaId: nueva.id, montoCentavos: 10_000 }),
    ]);
  });

  it("puede reemplazarla por una categoría nueva, que se crea en el mismo paso", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id);

    const respuesta = await reemplazar(usuario.cookies, vieja.id, {
      nueva: { nombre: "Recién creada", color: "#abcdef" },
    });

    expect(respuesta.status).toBe(200);
    const { destino, movimientosMovidos } = await leerJson<{
      destino: CategoriaJson;
      movimientosMovidos: number;
    }>(respuesta);
    expect(destino).toMatchObject({ nombre: "Recién creada", color: "#abcdef", movimientos: 1 });
    expect(movimientosMovidos).toBe(1);
    const categorias = await listar(usuario.cookies);
    expect(categorias.some((c) => c.id === vieja.id)).toBe(false);
    expect(categorias.some((c) => c.id === destino.id)).toBe(true);
  });

  it("la categoría nueva, sin color, toma uno bien distinto de los existentes", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id);
    const antes = await listar(usuario.cookies);

    const { destino } = await leerJson<{ destino: CategoriaJson }>(
      await reemplazar(usuario.cookies, vieja.id, { nueva: { nombre: "Recién creada" } }),
    );

    for (const otra of antes.filter((c) => c.id !== vieja.id)) {
      expect(distanciaDeColor(destino.color, otra.color)).toBeGreaterThan(15);
    }
  });

  it("si el nombre de la nueva ya existe, rechaza y no mueve nada", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    await crearCategoria(usuario.cookies, "Existente");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id);

    const respuesta = await reemplazar(usuario.cookies, vieja.id, {
      nueva: { nombre: "existente" },
    });

    expect(respuesta.status).toBe(400);
    expect((await leerJson<RespuestaError>(respuesta)).error.campos?.[0]?.campo).toBe(
      "nueva.nombre",
    );
    const sigue = (await listar(usuario.cookies)).find((c) => c.id === vieja.id);
    expect(sigue?.movimientos).toBe(1);
  });

  it.each([
    ["ninguna de las dos", {}],
    ["las dos a la vez", { porCategoriaId: 1, nueva: { nombre: "X" } }],
    ["un id que no es número", { porCategoriaId: "abc" }],
    ["una nueva sin nombre", { nueva: { nombre: "  " } }],
    ["un color inválido", { nueva: { nombre: "X", color: "rojo" } }],
  ])("rechaza el pedido con %s", async (_caso, cuerpo) => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id);

    const respuesta = await reemplazar(usuario.cookies, vieja.id, cuerpo);

    expect(respuesta.status).toBe(400);
    expect((await listar(usuario.cookies)).find((c) => c.id === vieja.id)?.movimientos).toBe(1);
  });

  it("no deja reemplazarla por sí misma, por la especial, ni por una inexistente, y no mueve nada", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id);
    const especial = (await listar(usuario.cookies)).find((c) => c.sistema === "transferencia");

    for (const porCategoriaId of [vieja.id, especial?.id ?? 0, 999_999]) {
      const respuesta = await reemplazar(usuario.cookies, vieja.id, { porCategoriaId });
      expect(respuesta.status).toBe(400);
    }
    const categorias = await listar(usuario.cookies);
    expect(categorias.find((c) => c.id === vieja.id)?.movimientos).toBe(1);
    expect(categorias.find((c) => c.sistema === "transferencia")?.movimientos).toBe(0);
  });

  it("no deja reemplazarla por una categoría eliminada", async () => {
    const { usuario, cuentaId } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    const eliminada = await crearCategoria(usuario.cookies, "Eliminada");
    await pedir(usuario.cookies, `/api/finanzas/categorias/${eliminada.id}`, "DELETE");
    await cargarMovimiento(usuario.cookies, cuentaId, vieja.id);

    const respuesta = await reemplazar(usuario.cookies, vieja.id, { porCategoriaId: eliminada.id });

    expect(respuesta.status).toBe(400);
  });

  it("responde 404 con una categoría inexistente, eliminada o de otra persona", async () => {
    const dueno = await prepararEntorno();
    const intruso = await entrarComoUsuario();
    const categoria = await crearCategoria(dueno.usuario.cookies, "Mía");
    const otra = await crearCategoria(dueno.usuario.cookies, "Otra");

    expect(
      (await reemplazar(intruso.cookies, categoria.id, { porCategoriaId: otra.id })).status,
    ).toBe(404);
    expect(
      (await reemplazar(dueno.usuario.cookies, 999_999, { porCategoriaId: otra.id })).status,
    ).toBe(404);

    await pedir(dueno.usuario.cookies, `/api/finanzas/categorias/${categoria.id}`, "DELETE");
    expect(
      (await reemplazar(dueno.usuario.cookies, categoria.id, { porCategoriaId: otra.id })).status,
    ).toBe(404);
  });

  it("no se puede reemplazar por una categoría de otra persona, y no toca los movimientos ajenos", async () => {
    const primero = await prepararEntorno();
    const segundo = await prepararEntorno();
    const deUno = await crearCategoria(primero.usuario.cookies, "Compartida");
    const deDos = await crearCategoria(segundo.usuario.cookies, "Compartida");
    await cargarMovimiento(primero.usuario.cookies, primero.cuentaId, deUno.id);
    await cargarMovimiento(segundo.usuario.cookies, segundo.cuentaId, deDos.id);

    const respuesta = await reemplazar(primero.usuario.cookies, deUno.id, {
      porCategoriaId: deDos.id,
    });

    expect(respuesta.status).toBe(400);
    expect(
      (await listar(primero.usuario.cookies)).find((c) => c.id === deUno.id)?.movimientos,
    ).toBe(1);
    expect(
      (await listar(segundo.usuario.cookies)).find((c) => c.id === deDos.id)?.movimientos,
    ).toBe(1);
  });

  it("reemplazar la de una persona no toca los movimientos de otra", async () => {
    const primero = await prepararEntorno();
    const segundo = await prepararEntorno();
    const viejaDeUno = await crearCategoria(primero.usuario.cookies, "Vieja");
    const nuevaDeUno = await crearCategoria(primero.usuario.cookies, "Nueva");
    const deDos = await crearCategoria(segundo.usuario.cookies, "Del segundo");
    await cargarMovimiento(primero.usuario.cookies, primero.cuentaId, viejaDeUno.id);
    await cargarMovimiento(segundo.usuario.cookies, segundo.cuentaId, deDos.id);

    await reemplazar(primero.usuario.cookies, viejaDeUno.id, { porCategoriaId: nuevaDeUno.id });

    const delSegundo = await cliente.db
      .select()
      .from(esquema.movimientos)
      .where(eq(esquema.movimientos.userId, segundo.usuario.id));
    expect(delSegundo.map((m) => m.categoriaId)).toEqual([deDos.id]);
  });

  it("una categoría sin movimientos también se puede reemplazar (equivale a eliminarla)", async () => {
    const { usuario } = await prepararEntorno();
    const vieja = await crearCategoria(usuario.cookies, "Vieja");
    const nueva = await crearCategoria(usuario.cookies, "Nueva");

    const respuesta = await reemplazar(usuario.cookies, vieja.id, { porCategoriaId: nueva.id });

    expect(respuesta.status).toBe(200);
    expect((await leerJson<{ movimientosMovidos: number }>(respuesta)).movimientosMovidos).toBe(0);
    expect((await listar(usuario.cookies)).some((c) => c.id === vieja.id)).toBe(false);
  });
});

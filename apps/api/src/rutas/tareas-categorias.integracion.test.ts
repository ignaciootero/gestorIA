// Tests de integración de las categorías de tareas (/api/tareas/categorias) y de cómo se asignan a
// las tareas y a las tareas repetitivas, contra gestion_test.
//
// Salvo el grupo de "por defecto", las cuentas arrancan sin categorías (ver `entrarComoPersona`),
// para contar solo lo que cada test crea.

import { type ClienteDb, esquema } from "@gestoria/db";
import { CATEGORIAS_DE_TAREA_POR_DEFECTO } from "@gestoria/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../pruebas/auth-de-prueba.ts";
import { entrarComoPersona, type PersonaDePrueba, pedir } from "../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let beto: PersonaDePrueba;

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente);
  beto = await entrarComoPersona(app, cliente, { usuario: "beto" });
});

afterAll(async () => {
  await cliente.cerrar();
});

type CategoriaJson = {
  id: number;
  nombre: string;
  color: string;
  tareas: number;
  repetitivas: number;
};
type TareaJson = {
  id: string;
  titulo: string;
  categoriaId: number | null;
  repetitiva: boolean;
  completada: boolean;
};
type ListaJson = { deHoy: TareaJson[]; hechasHoy: TareaJson[] };
type ErrorJson = {
  error: { codigo: string; mensaje: string; campos?: { campo: string; mensaje: string }[] };
};
type RepetitivaJson = { id: string; categoriaId: number | null };

const RUTA = "/api/tareas/categorias";

async function categoriasDe(persona: PersonaDePrueba): Promise<CategoriaJson[]> {
  const respuesta = await pedir(app, persona.cookies, RUTA);
  expect(respuesta.status).toBe(200);
  return (await leerJson<{ categorias: CategoriaJson[] }>(respuesta)).categorias;
}

async function crearCategoria(
  persona: PersonaDePrueba,
  nombre: string,
  color?: string,
): Promise<CategoriaJson> {
  const respuesta = await pedir(app, persona.cookies, RUTA, "POST", {
    nombre,
    ...(color ? { color } : {}),
  });
  expect(respuesta.status).toBe(201);
  return await leerJson<CategoriaJson>(respuesta);
}

const tarea = (extra: Record<string, unknown> = {}) => ({
  titulo: "Comprar pan",
  notas: "",
  fecha: "",
  hora: "",
  ...extra,
});
const diaria = (extra: Record<string, unknown> = {}) => ({
  titulo: "Regar las plantas",
  notas: "",
  repeticion: "diaria",
  hora: "",
  ...extra,
});

async function crearTarea(persona: PersonaDePrueba, extra: Record<string, unknown> = {}) {
  const respuesta = await pedir(app, persona.cookies, "/api/tareas", "POST", tarea(extra));
  expect(respuesta.status).toBe(201);
  return await leerJson<TareaJson>(respuesta);
}

async function crearRepetitiva(persona: PersonaDePrueba, extra: Record<string, unknown> = {}) {
  const respuesta = await pedir(
    app,
    persona.cookies,
    "/api/tareas/repetitivas",
    "POST",
    diaria(extra),
  );
  expect(respuesta.status).toBe(201);
  return await leerJson<RepetitivaJson>(respuesta);
}

async function listaDeHoy(persona: PersonaDePrueba): Promise<ListaJson> {
  return await leerJson<ListaJson>(await pedir(app, persona.cookies, "/api/tareas"));
}

async function eliminarCategoria(persona: PersonaDePrueba, id: number) {
  return await pedir(app, persona.cookies, `${RUTA}/${id}`, "DELETE");
}

describe("categorías por defecto", () => {
  let nueva: PersonaDePrueba;

  beforeEach(async () => {
    nueva = await entrarComoPersona(app, cliente, {
      usuario: "nueva",
      conCategoriasDeTareaIniciales: true,
    });
  });

  it("una cuenta nueva ya tiene las categorías por defecto, sin tareas", async () => {
    const categorias = await categoriasDe(nueva);
    expect(categorias.map((categoria) => categoria.nombre).sort()).toEqual(
      CATEGORIAS_DE_TAREA_POR_DEFECTO.map((categoria) => categoria.nombre).sort(),
    );
    expect(categorias.every((c) => c.tareas === 0 && c.repetitivas === 0)).toBe(true);
    const colores = categorias.map((categoria) => categoria.color);
    expect(new Set(colores).size).toBe(colores.length);
    for (const color of colores) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("vienen ordenadas por nombre", async () => {
    const nombres = (await categoriasDe(nueva)).map((categoria) => categoria.nombre);
    expect(nombres).toEqual(
      [...nombres].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
  });

  it("se crean una sola vez, aunque varios pedidos lleguen a la vez", async () => {
    const respuestas = await Promise.all(Array.from({ length: 6 }, () => categoriasDe(nueva)));
    for (const categorias of respuestas) {
      expect(categorias).toHaveLength(CATEGORIAS_DE_TAREA_POR_DEFECTO.length);
    }
    const filas = await cliente.db
      .select({ id: esquema.categoriasDeTareas.id })
      .from(esquema.categoriasDeTareas)
      .where(eq(esquema.categoriasDeTareas.userId, nueva.userId));
    expect(filas).toHaveLength(CATEGORIAS_DE_TAREA_POR_DEFECTO.length);
  });

  it("se pueden eliminar todas y no vuelven a aparecer", async () => {
    for (const categoria of await categoriasDe(nueva)) {
      expect((await eliminarCategoria(nueva, categoria.id)).status).toBe(200);
    }
    expect(await categoriasDe(nueva)).toEqual([]);
    expect(await categoriasDe(nueva)).toEqual([]);
  });

  it("se pueden renombrar, recolorear y usar en una tarea como cualquier otra", async () => {
    const casa = (await categoriasDe(nueva)).find((categoria) => categoria.nombre === "Casa");
    const editada = await pedir(app, nueva.cookies, `${RUTA}/${casa?.id}`, "PATCH", {
      nombre: "Hogar",
      color: "#112233",
    });
    expect(editada.status).toBe(200);
    await crearTarea(nueva, { categoriaId: casa?.id });
    const hogar = (await categoriasDe(nueva)).find((categoria) => categoria.nombre === "Hogar");
    expect(hogar).toMatchObject({ color: "#112233", tareas: 1 });
  });

  it("quien ya tenía categorías propias no recibe las de por defecto", async () => {
    const antigua = await entrarComoPersona(app, cliente, {
      usuario: "antigua",
      conCategoriasDeTareaIniciales: true,
    });
    await cliente.db
      .insert(esquema.categoriasDeTareas)
      .values({ userId: antigua.userId, nombre: "Gimnasio", color: "#445566" });
    expect((await categoriasDe(antigua)).map((categoria) => categoria.nombre)).toEqual([
      "Gimnasio",
    ]);
  });

  it("si la persona crea una antes de mirar la lista, las de por defecto igual están", async () => {
    await crearCategoria(nueva, "Vecinos");
    const nombres = (await categoriasDe(nueva)).map((categoria) => categoria.nombre);
    expect(nombres).toHaveLength(CATEGORIAS_DE_TAREA_POR_DEFECTO.length + 1);
    expect(nombres).toContain("Vecinos");
    expect(nombres).toContain("Casa");
  });

  it("cada persona tiene las suyas: borrar las de una no toca las de otra", async () => {
    const otra = await entrarComoPersona(app, cliente, {
      usuario: "otra",
      conCategoriasDeTareaIniciales: true,
    });
    for (const categoria of await categoriasDe(nueva)) await eliminarCategoria(nueva, categoria.id);
    expect(await categoriasDe(nueva)).toEqual([]);
    expect(await categoriasDe(otra)).toHaveLength(CATEGORIAS_DE_TAREA_POR_DEFECTO.length);
  });

  it("el tope de 30 cuenta las de por defecto", async () => {
    await categoriasDe(nueva);
    const faltan = 30 - CATEGORIAS_DE_TAREA_POR_DEFECTO.length;
    for (let numero = 1; numero <= faltan; numero++) await crearCategoria(nueva, `Mía ${numero}`);
    const una = await pedir(app, nueva.cookies, RUTA, "POST", { nombre: "Una más" });
    expect(una.status).toBe(409);
  });
});

describe("crear, editar y listar", () => {
  it("una cuenta sin categorías recibe una lista vacía", async () => {
    expect(await categoriasDe(ana)).toEqual([]);
  });

  it("crea con el color elegido o, sin color, con uno distinto de los que ya hay", async () => {
    const roja = await crearCategoria(ana, "Hobbies", "#FF0000");
    expect(roja).toMatchObject({ nombre: "Hobbies", tareas: 0, repetitivas: 0 });
    expect(roja.color.toLowerCase()).toBe("#ff0000");

    const sinColor = await crearCategoria(ana, "Mascotas");
    expect(sinColor.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(sinColor.color.toLowerCase()).not.toBe("#ff0000");
  });

  it("recorta los espacios del nombre", async () => {
    expect((await crearCategoria(ana, "  Hobbies  ")).nombre).toBe("Hobbies");
  });

  it.each([
    ["sin nombre", { nombre: "" }, "nombre"],
    ["con solo espacios", { nombre: "   " }, "nombre"],
    ["con un nombre larguísimo", { nombre: "a".repeat(31) }, "nombre"],
    ["con un color mal escrito", { nombre: "Hobbies", color: "rojo" }, "color"],
    ["con un color corto", { nombre: "Hobbies", color: "#fff" }, "color"],
  ])("rechaza una categoría %s", async (_nombre, cuerpo, campo) => {
    const respuesta = await pedir(app, ana.cookies, RUTA, "POST", cuerpo);
    expect(respuesta.status).toBe(400);
    expect((await leerJson<ErrorJson>(respuesta)).error.campos?.map((c) => c.campo)).toContain(
      campo,
    );
  });

  it("acepta nombres con tildes y símbolos", async () => {
    expect((await crearCategoria(ana, "Niños & Colegio ✏️")).nombre).toBe("Niños & Colegio ✏️");
  });

  it("no deja repetir un nombre, sin distinguir mayúsculas, pero cada persona puede tener el suyo", async () => {
    await crearCategoria(ana, "Casa");
    for (const nombre of ["casa", "CASA", " Casa "]) {
      const repetida = await pedir(app, ana.cookies, RUTA, "POST", { nombre });
      expect(repetida.status, nombre).toBe(409);
      expect((await leerJson<ErrorJson>(repetida)).error.mensaje).toBe(
        "Ya tenés una categoría con ese nombre.",
      );
    }
    expect((await crearCategoria(beto, "Casa")).nombre).toBe("Casa");
  });

  it("edita el nombre y el color, y sin color conserva el que tenía", async () => {
    const creada = await crearCategoria(ana, "Casa", "#112233");
    const renombrada = await pedir(app, ana.cookies, `${RUTA}/${creada.id}`, "PATCH", {
      nombre: "Hogar",
    });
    expect(renombrada.status).toBe(200);
    expect(await leerJson<CategoriaJson>(renombrada)).toMatchObject({
      nombre: "Hogar",
      color: "#112233",
    });
    const recoloreada = await pedir(app, ana.cookies, `${RUTA}/${creada.id}`, "PATCH", {
      nombre: "Hogar",
      color: "#445566",
    });
    expect((await leerJson<CategoriaJson>(recoloreada)).color).toBe("#445566");
  });

  it("guardar con el mismo nombre (solo cambiando el color o la mayúscula) está permitido", async () => {
    const creada = await crearCategoria(ana, "Casa");
    const mismo = await pedir(app, ana.cookies, `${RUTA}/${creada.id}`, "PATCH", {
      nombre: "CASA",
      color: "#445566",
    });
    expect(mismo.status).toBe(200);
  });

  it("no deja renombrar con el nombre de otra de la persona", async () => {
    await crearCategoria(ana, "Casa");
    const otra = await crearCategoria(ana, "Trabajo");
    const respuesta = await pedir(app, ana.cookies, `${RUTA}/${otra.id}`, "PATCH", {
      nombre: "casa",
    });
    expect(respuesta.status).toBe(409);
  });

  it("devuelve 404 al editar una que no existe o es de otra persona", async () => {
    const deBeto = await crearCategoria(beto, "Secreta");
    for (const id of [999_999, deBeto.id]) {
      const respuesta = await pedir(app, ana.cookies, `${RUTA}/${id}`, "PATCH", {
        nombre: "Mía ahora",
      });
      expect(respuesta.status, String(id)).toBe(404);
    }
    expect((await categoriasDe(beto))[0]?.nombre).toBe("Secreta");
  });

  it("rechaza un id que no es un número", async () => {
    for (const id of ["abc", "0", "-3", "1.5"]) {
      expect((await pedir(app, ana.cookies, `${RUTA}/${id}`, "DELETE")).status, id).toBe(400);
    }
  });

  it("cada persona ve solo las suyas", async () => {
    await crearCategoria(ana, "De Ana");
    expect(await categoriasDe(beto)).toEqual([]);
  });

  it("pide sesión en todas las rutas", async () => {
    for (const [metodo, ruta, cuerpo] of [
      ["GET", RUTA, undefined],
      ["POST", RUTA, { nombre: "X" }],
      ["PATCH", `${RUTA}/1`, { nombre: "X" }],
      ["DELETE", `${RUTA}/1`, undefined],
    ] as const) {
      expect((await pedir(app, null, ruta, metodo, cuerpo)).status, `${metodo} ${ruta}`).toBe(401);
    }
  });
});

describe("asignar una categoría", () => {
  it("una tarea puede no tener categoría", async () => {
    expect((await crearTarea(ana)).categoriaId).toBeNull();
    expect((await crearTarea(ana, { categoriaId: null })).categoriaId).toBeNull();
  });

  it("una tarea puede tener una, y la lista la trae", async () => {
    const casa = await crearCategoria(ana, "Casa");
    const creada = await crearTarea(ana, { categoriaId: casa.id });
    expect(creada.categoriaId).toBe(casa.id);
    expect((await listaDeHoy(ana)).deHoy[0]?.categoriaId).toBe(casa.id);
  });

  it("al editar, cambia, se conserva si no viene y se quita con null", async () => {
    const casa = await crearCategoria(ana, "Casa");
    const trabajo = await crearCategoria(ana, "Trabajo");
    const creada = await crearTarea(ana, { categoriaId: casa.id });
    const editar = async (extra: Record<string, unknown>) =>
      await leerJson<TareaJson>(
        await pedir(app, ana.cookies, `/api/tareas/${creada.id}`, "PUT", tarea(extra)),
      );

    expect((await editar({ categoriaId: trabajo.id })).categoriaId).toBe(trabajo.id);
    expect((await editar({ titulo: "Otro título" })).categoriaId).toBe(trabajo.id);
    expect((await editar({ categoriaId: null })).categoriaId).toBeNull();
  });

  it("rechaza una categoría que no existe o es de otra persona, junto al campo", async () => {
    const deBeto = await crearCategoria(beto, "De Beto");
    for (const categoriaId of [999_999, deBeto.id]) {
      const respuesta = await pedir(
        app,
        ana.cookies,
        "/api/tareas",
        "POST",
        tarea({ categoriaId }),
      );
      expect(respuesta.status, String(categoriaId)).toBe(400);
      const error = await leerJson<ErrorJson>(respuesta);
      expect(error.error.campos?.[0]).toMatchObject({ campo: "categoriaId" });
    }
    const creada = await crearTarea(ana);
    const edicion = await pedir(
      app,
      ana.cookies,
      `/api/tareas/${creada.id}`,
      "PUT",
      tarea({ categoriaId: deBeto.id }),
    );
    expect(edicion.status).toBe(400);
    expect((await listaDeHoy(ana)).deHoy[0]?.categoriaId).toBeNull();
  });

  it("rechaza un id con forma inválida", async () => {
    for (const categoriaId of [0, -2, 1.5, "3"]) {
      const respuesta = await pedir(
        app,
        ana.cookies,
        "/api/tareas",
        "POST",
        tarea({ categoriaId }),
      );
      expect(respuesta.status, String(categoriaId)).toBe(400);
    }
  });

  it("una repetitiva con categoría se la pasa a las tareas que arma", async () => {
    const salud = await crearCategoria(ana, "Salud");
    const repetitiva = await crearRepetitiva(ana, { categoriaId: salud.id });
    expect(repetitiva.categoriaId).toBe(salud.id);

    const [deHoy] = (await listaDeHoy(ana)).deHoy;
    expect(deHoy).toMatchObject({ repetitiva: true, categoriaId: salud.id });
    const listada = await leerJson<{ repetitivas: RepetitivaJson[] }>(
      await pedir(app, ana.cookies, "/api/tareas/repetitivas"),
    );
    expect(listada.repetitivas[0]?.categoriaId).toBe(salud.id);
  });

  it("al cambiar la categoría de una repetitiva, la tarea pendiente de hoy se actualiza", async () => {
    const salud = await crearCategoria(ana, "Salud");
    const casa = await crearCategoria(ana, "Casa");
    const repetitiva = await crearRepetitiva(ana, { categoriaId: salud.id });
    const editar = async (extra: Record<string, unknown>) =>
      await pedir(app, ana.cookies, `/api/tareas/repetitivas/${repetitiva.id}`, "PUT", {
        ...diaria(),
        ...extra,
      });

    expect((await editar({ categoriaId: casa.id })).status).toBe(200);
    expect((await listaDeHoy(ana)).deHoy[0]?.categoriaId).toBe(casa.id);

    // Sin categoriaId se conserva; con null se quita.
    expect((await editar({ titulo: "Regar más" })).status).toBe(200);
    expect((await listaDeHoy(ana)).deHoy[0]?.categoriaId).toBe(casa.id);
    expect((await editar({ categoriaId: null })).status).toBe(200);
    expect((await listaDeHoy(ana)).deHoy[0]?.categoriaId).toBeNull();
  });

  it("rechaza para una repetitiva una categoría ajena o inexistente", async () => {
    const deBeto = await crearCategoria(beto, "De Beto");
    for (const categoriaId of [999_999, deBeto.id]) {
      const respuesta = await pedir(
        app,
        ana.cookies,
        "/api/tareas/repetitivas",
        "POST",
        diaria({ categoriaId }),
      );
      expect(respuesta.status, String(categoriaId)).toBe(400);
    }
    const repetitiva = await crearRepetitiva(ana);
    const edicion = await pedir(
      app,
      ana.cookies,
      `/api/tareas/repetitivas/${repetitiva.id}`,
      "PUT",
      diaria({ categoriaId: deBeto.id }),
    );
    expect(edicion.status).toBe(400);
  });
});

describe("eliminar una categoría", () => {
  it("elimina una que no tiene tareas", async () => {
    const creada = await crearCategoria(ana, "Hobbies");
    expect((await eliminarCategoria(ana, creada.id)).status).toBe(200);
    expect(await categoriasDe(ana)).toEqual([]);
    expect((await eliminarCategoria(ana, creada.id)).status).toBe(404);
  });

  it("devuelve 404 si no existe o es de otra persona, y no la toca", async () => {
    const deBeto = await crearCategoria(beto, "De Beto");
    expect((await eliminarCategoria(ana, 999_999)).status).toBe(404);
    expect((await eliminarCategoria(ana, deBeto.id)).status).toBe(404);
    expect(await categoriasDe(beto)).toHaveLength(1);
  });

  it("no deja eliminar una con tareas pendientes y dice cuántas son", async () => {
    const casa = await crearCategoria(ana, "Casa");
    await crearTarea(ana, { categoriaId: casa.id });
    await crearTarea(ana, { categoriaId: casa.id, titulo: "Otra" });

    const respuesta = await eliminarCategoria(ana, casa.id);
    expect(respuesta.status).toBe(409);
    const error = await leerJson<ErrorJson>(respuesta);
    expect(error.error.codigo).toBe("CONFLICTO");
    expect(error.error.mensaje).toContain("2 tareas pendientes");
    expect(await categoriasDe(ana)).toEqual([expect.objectContaining({ id: casa.id, tareas: 2 })]);
  });

  it("usa el singular con una sola tarea", async () => {
    const casa = await crearCategoria(ana, "Casa");
    await crearTarea(ana, { categoriaId: casa.id });
    const error = await leerJson<ErrorJson>(await eliminarCategoria(ana, casa.id));
    expect(error.error.mensaje).toContain("1 tarea pendiente.");
  });

  it("no deja eliminar una usada por una tarea repetitiva", async () => {
    const salud = await crearCategoria(ana, "Salud");
    const repetitiva = await crearRepetitiva(ana, { categoriaId: salud.id });

    const respuesta = await eliminarCategoria(ana, salud.id);
    expect(respuesta.status).toBe(409);
    expect((await leerJson<ErrorJson>(respuesta)).error.mensaje).toContain("1 tarea repetitiva");
    // La tarea de hoy que armó la repetitiva no se cuenta dos veces.
    expect((await categoriasDe(ana))[0]).toMatchObject({ tareas: 0, repetitivas: 1 });

    // Al eliminar la repetitiva, ya se puede.
    await pedir(app, ana.cookies, `/api/tareas/repetitivas/${repetitiva.id}`, "DELETE");
    expect((await eliminarCategoria(ana, salud.id)).status).toBe(200);
  });

  it("cuenta las tareas pendientes y las repetitivas juntas en el mensaje", async () => {
    const casa = await crearCategoria(ana, "Casa");
    await crearTarea(ana, { categoriaId: casa.id });
    await crearRepetitiva(ana, { categoriaId: casa.id });
    const error = await leerJson<ErrorJson>(await eliminarCategoria(ana, casa.id));
    expect(error.error.mensaje).toContain("1 tarea pendiente y 1 tarea repetitiva");
  });

  it("una tarea ya hecha no la retiene: se elimina y la tarea queda sin categoría", async () => {
    const casa = await crearCategoria(ana, "Casa");
    const creada = await crearTarea(ana, { categoriaId: casa.id });
    await pedir(app, ana.cookies, `/api/tareas/${creada.id}/completada`, "PATCH", {
      completada: true,
    });

    expect((await eliminarCategoria(ana, casa.id)).status).toBe(200);
    const [hecha] = (await listaDeHoy(ana)).hechasHoy;
    expect(hecha).toMatchObject({ id: creada.id, categoriaId: null });
  });

  it("una tarea eliminada tampoco la retiene", async () => {
    const casa = await crearCategoria(ana, "Casa");
    const creada = await crearTarea(ana, { categoriaId: casa.id });
    await pedir(app, ana.cookies, `/api/tareas/${creada.id}`, "DELETE");
    expect((await eliminarCategoria(ana, casa.id)).status).toBe(200);
  });

  it("tildar la tarea pendiente libera la categoría", async () => {
    const casa = await crearCategoria(ana, "Casa");
    const creada = await crearTarea(ana, { categoriaId: casa.id });
    expect((await eliminarCategoria(ana, casa.id)).status).toBe(409);
    await pedir(app, ana.cookies, `/api/tareas/${creada.id}/completada`, "PATCH", {
      completada: true,
    });
    expect((await eliminarCategoria(ana, casa.id)).status).toBe(200);
  });

  it("las tareas de otra persona no cuentan", async () => {
    const casa = await crearCategoria(ana, "Casa");
    await crearTarea(beto, { titulo: "De Beto" });
    expect((await eliminarCategoria(ana, casa.id)).status).toBe(200);
  });
});

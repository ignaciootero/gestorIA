// Tests de integración de las etiquetas de contactos por defecto (Familia, Amigos, Trabajo y
// Servicios), contra gestion_test.
//
// Las cuentas de estos tests se crean "recién registradas" (`conEtiquetasIniciales`), a diferencia
// del resto de los tests de contactos, que arrancan sin etiquetas para contar solo lo que crean.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { ETIQUETAS_POR_DEFECTO } from "@gestoria/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  crearContactoPorApi,
  crearEtiquetaPorApi,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;

type EtiquetaJson = { id: number; nombre: string; color: string; contactos: number };

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente, { conEtiquetasIniciales: true });
});

afterAll(async () => {
  await cliente.cerrar();
});

async function etiquetasDe(persona: PersonaDePrueba): Promise<EtiquetaJson[]> {
  const respuesta = await pedir(app, persona.cookies, "/api/contactos/etiquetas");
  expect(respuesta.status).toBe(200);
  return (await leerJson<{ etiquetas: EtiquetaJson[] }>(respuesta)).etiquetas;
}

async function cuantasHayEnLaBase(userId: string): Promise<number> {
  const filas = await cliente.db
    .select({ id: esquema.etiquetasDeContactos.id })
    .from(esquema.etiquetasDeContactos)
    .where(eq(esquema.etiquetasDeContactos.userId, userId));
  return filas.length;
}

describe("etiquetas por defecto", () => {
  it("una cuenta nueva ya tiene Familia, Amigos, Trabajo y Servicios, sin contactos", async () => {
    const etiquetas = await etiquetasDe(ana);
    expect(etiquetas.map((etiqueta) => etiqueta.nombre).sort()).toEqual([
      "Amigos",
      "Familia",
      "Servicios",
      "Trabajo",
    ]);
    expect(etiquetas.every((etiqueta) => etiqueta.contactos === 0)).toBe(true);
    // Cada una con su color, todos distintos y bien formados.
    const colores = etiquetas.map((etiqueta) => etiqueta.color);
    expect(new Set(colores).size).toBe(4);
    for (const color of colores) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(colores.sort()).toEqual(ETIQUETAS_POR_DEFECTO.map((etiqueta) => etiqueta.color).sort());
  });

  it("se crean una sola vez: no se duplican al mirar de nuevo", async () => {
    await etiquetasDe(ana);
    await etiquetasDe(ana);
    expect(await cuantasHayEnLaBase(ana.userId)).toBe(4);
  });

  it("pedidos a la vez en el primer uso no las duplican y todos las ven completas", async () => {
    const respuestas = await Promise.all(Array.from({ length: 6 }, () => etiquetasDe(ana)));
    for (const etiquetas of respuestas) expect(etiquetas).toHaveLength(4);
    expect(await cuantasHayEnLaBase(ana.userId)).toBe(4);
  });

  it("se pueden eliminar, y no vuelven a aparecer", async () => {
    const etiquetas = await etiquetasDe(ana);
    const familia = etiquetas.find((etiqueta) => etiqueta.nombre === "Familia");
    const borrada = await pedir(
      app,
      ana.cookies,
      `/api/contactos/etiquetas/${familia?.id}`,
      "DELETE",
    );
    expect(borrada.status).toBe(200);
    expect((await etiquetasDe(ana)).map((etiqueta) => etiqueta.nombre).sort()).toEqual([
      "Amigos",
      "Servicios",
      "Trabajo",
    ]);

    // Aun borrándolas todas, no se las vuelve a crear.
    for (const etiqueta of await etiquetasDe(ana)) {
      await pedir(app, ana.cookies, `/api/contactos/etiquetas/${etiqueta.id}`, "DELETE");
    }
    expect(await etiquetasDe(ana)).toEqual([]);
    expect(await etiquetasDe(ana)).toEqual([]);
  });

  it("se pueden renombrar, recolorear y usar en un contacto como cualquier otra", async () => {
    const primera = (await etiquetasDe(ana)).find((etiqueta) => etiqueta.nombre === "Familia");
    const editada = await pedir(
      app,
      ana.cookies,
      `/api/contactos/etiquetas/${primera?.id}`,
      "PATCH",
      {
        nombre: "Parientes",
        color: "#112233",
      },
    );
    expect(editada.status).toBe(200);

    const amigos = (await etiquetasDe(ana)).find((etiqueta) => etiqueta.nombre === "Amigos");
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Beto", etiquetaIds: [amigos?.id ?? 0] }),
    );
    const despues = await etiquetasDe(ana);
    expect(despues.find((etiqueta) => etiqueta.nombre === "Parientes")?.color).toBe("#112233");
    expect(despues.find((etiqueta) => etiqueta.nombre === "Amigos")?.contactos).toBe(1);
  });

  it("quien ya tenía etiquetas propias no recibe las de por defecto", async () => {
    const antigua = await entrarComoPersona(app, cliente, { conEtiquetasIniciales: true });
    // Una cuenta de antes: tiene una etiqueta suya y todavía no se le marcó nada.
    await cliente.db.insert(esquema.etiquetasDeContactos).values({
      userId: antigua.userId,
      nombre: "Gimnasio",
      color: "#445566",
    });
    expect((await etiquetasDe(antigua)).map((etiqueta) => etiqueta.nombre)).toEqual(["Gimnasio"]);
    expect(await cuantasHayEnLaBase(antigua.userId)).toBe(1);
  });

  it("si la persona crea una etiqueta antes de mirar la lista, las de por defecto igual están", async () => {
    const recibida = await crearEtiquetaPorApi(app, ana.cookies, "Vecinos");
    expect(recibida).toBeGreaterThan(0);
    expect((await etiquetasDe(ana)).map((etiqueta) => etiqueta.nombre).sort()).toEqual([
      "Amigos",
      "Familia",
      "Servicios",
      "Trabajo",
      "Vecinos",
    ]);
  });

  it("ya no se puede crear una con el nombre de una de las de por defecto (el nombre es único)", async () => {
    await etiquetasDe(ana);
    const repetida = await pedir(app, ana.cookies, "/api/contactos/etiquetas", "POST", {
      nombre: "familia",
    });
    expect(repetida.status).toBe(409);
  });

  it("cada persona tiene las suyas: borrar las de una no toca las de otra", async () => {
    const beto = await entrarComoPersona(app, cliente, { conEtiquetasIniciales: true });
    for (const etiqueta of await etiquetasDe(ana)) {
      await pedir(app, ana.cookies, `/api/contactos/etiquetas/${etiqueta.id}`, "DELETE");
    }
    expect(await etiquetasDe(ana)).toEqual([]);
    expect(await etiquetasDe(beto)).toHaveLength(4);
  });

  it("dejan lugar para las propias: el tope de 50 cuenta las de por defecto", async () => {
    await etiquetasDe(ana);
    for (let numero = 1; numero <= 46; numero++) {
      await crearEtiquetaPorApi(app, ana.cookies, `Mía ${numero}`);
    }
    expect(await cuantasHayEnLaBase(ana.userId)).toBe(50);
    const una = await pedir(app, ana.cookies, "/api/contactos/etiquetas", "POST", {
      nombre: "Una más",
    });
    expect(una.status).toBe(409);
  });
});

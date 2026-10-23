// Tests de integración de las tareas importantes, contra gestion_test: se marcan al crear y al editar,
// no cambian el orden de las listas (siempre por hora), las repetitivas se la pasan a las tareas que arman y el
// historial la conserva.

import type { ClienteDb } from "@gestoria/db";
import type { DatosDeTareaRepetitiva } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { crearTareaRepetitiva, editarTareaRepetitiva } from "./repetitivas.ts";
import {
  completarTarea,
  crearTarea,
  editarTarea,
  listarHistorial,
  listarTareasDeHoy,
} from "./tareas.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;

/** 12:00 en Montevideo (UTC-3) del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");
const MS_POR_DIA = 86_400_000;

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente);
});

afterAll(async () => {
  await cliente.cerrar();
});

const suelta = (
  titulo: string,
  extra: { fecha?: string; hora?: string; importante?: boolean } = {},
) => ({
  titulo,
  notas: "",
  fecha: extra.fecha ?? "",
  hora: extra.hora ?? "",
  ...(extra.importante === undefined ? {} : { importante: extra.importante }),
});

const diaria = (titulo: string, importante?: boolean): DatosDeTareaRepetitiva => ({
  titulo,
  notas: "",
  repeticion: "diaria",
  hora: "",
  ...(importante === undefined ? {} : { importante }),
});

describe("marcar una tarea como importante", () => {
  it("por defecto no lo es; se marca al crear y al editar, y editar sin el campo lo conserva", async () => {
    const comun = await crearTarea(cliente, ana.userId, suelta("Común"), AHORA);
    expect(comun.importante).toBe(false);

    const importante = await crearTarea(
      cliente,
      ana.userId,
      suelta("Importante", { importante: true }),
      AHORA,
    );
    expect(importante.importante).toBe(true);

    // Editar sin decir nada conserva lo que tenía.
    const igual = await editarTarea(cliente, ana.userId, importante.id, suelta("Cambiada"), AHORA);
    expect(igual).toMatchObject({ titulo: "Cambiada", importante: true });

    // Y se puede sacar y poner.
    const quitada = await editarTarea(
      cliente,
      ana.userId,
      importante.id,
      suelta("Cambiada", { importante: false }),
      AHORA,
    );
    expect(quitada?.importante).toBe(false);
    const puesta = await editarTarea(
      cliente,
      ana.userId,
      comun.id,
      suelta("Común", { importante: true }),
      AHORA,
    );
    expect(puesta?.importante).toBe(true);
  });

  it("lo importante no cambia el orden: cada lista sigue por día y hora", async () => {
    const ayer = new Date(AHORA.getTime() - MS_POR_DIA);
    // Hoy: dos comunes (una con hora temprana) y una importante tardía.
    await crearTarea(cliente, ana.userId, suelta("Común temprana", { hora: "07:00" }), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Común"), AHORA);
    await crearTarea(
      cliente,
      ana.userId,
      suelta("Importante tarde", { hora: "20:00", importante: true }),
      AHORA,
    );
    // Atrasadas: una más vieja común y una más nueva importante.
    await crearTarea(
      cliente,
      ana.userId,
      suelta("Vieja común"),
      new Date(AHORA.getTime() - 4 * MS_POR_DIA),
    );
    await crearTarea(
      cliente,
      ana.userId,
      suelta("Reciente importante", { importante: true }),
      ayer,
    );
    // Más adelante: una cercana común y una lejana importante.
    await crearTarea(cliente, ana.userId, suelta("Cerca", { fecha: "2026-10-22" }), AHORA);
    await crearTarea(
      cliente,
      ana.userId,
      suelta("Lejos importante", { fecha: "2026-10-30", importante: true }),
      AHORA,
    );

    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    // Lo de todo el día primero y después por hora, sea importante o no.
    expect(lista.deHoy.map((t) => t.titulo)).toEqual([
      "Común",
      "Común temprana",
      "Importante tarde",
    ]);
    // Las atrasadas, de la más vieja a la más nueva; las que vienen, de la más cercana a la más lejana.
    expect(lista.atrasadas.map((t) => t.titulo)).toEqual(["Vieja común", "Reciente importante"]);
    expect(lista.masAdelante.map((t) => t.titulo)).toEqual(["Cerca", "Lejos importante"]);
    // Pero la marca viaja con cada tarea.
    expect(lista.deHoy.map((t) => t.importante)).toEqual([false, false, true]);
  });

  it("completarla o dejarla atrasada no le quita lo importante", async () => {
    const tarea = await crearTarea(
      cliente,
      ana.userId,
      suelta("Importante", { importante: true }),
      AHORA,
    );
    const hecha = await completarTarea(cliente, ana.userId, tarea.id, true, AHORA);
    expect(hecha?.importante).toBe(true);
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.hechasHoy[0]?.importante).toBe(true);
    // Y sigue en el historial.
    const manana = new Date(AHORA.getTime() + MS_POR_DIA);
    const historial = await listarHistorial(cliente, ana.userId, { ahora: manana });
    expect(historial.dias[0]?.tareas[0]?.importante).toBe(true);
  });
});

describe("tareas repetitivas importantes", () => {
  it("las tareas que arma heredan lo importante, y cambiar la regla lo cambia desde hoy", async () => {
    const regla = await crearTareaRepetitiva(cliente, ana.userId, diaria("Rutina", true), AHORA);
    expect(regla.importante).toBe(true);
    const antes = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(antes.deHoy.map((t) => [t.titulo, t.importante])).toEqual([["Rutina", true]]);

    // Quitarle lo importante a la regla: la de hoy (pendiente) se vuelve a armar sin la marca.
    const editada = await editarTareaRepetitiva(
      cliente,
      ana.userId,
      regla.id,
      diaria("Rutina", false),
      AHORA,
    );
    expect(editada?.importante).toBe(false);
    const despues = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(despues.deHoy.map((t) => [t.titulo, t.importante])).toEqual([["Rutina", false]]);

    // Editar sin el campo la deja como estaba.
    const conservada = await editarTareaRepetitiva(
      cliente,
      ana.userId,
      regla.id,
      diaria("Rutina"),
      AHORA,
    );
    expect(conservada?.importante).toBe(false);
  });

  it("una repetitiva importante no se adelanta a las demás tareas de hoy", async () => {
    await crearTarea(cliente, ana.userId, suelta("Suelta"), AHORA);
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Rutina importante", true), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.deHoy.map((t) => [t.titulo, t.importante])).toEqual([
      ["Suelta", false],
      ["Rutina importante", true],
    ]);
  });
});

describe("por la API", () => {
  type TareaJson = { id: string; importante: boolean };

  it("acepta importante verdadero o falso y rechaza otro tipo de valor", async () => {
    const base = { titulo: "Comprar pan", notas: "", fecha: "", hora: "" };
    const importante = await pedir(app, ana.cookies, "/api/tareas", "POST", {
      ...base,
      importante: true,
    });
    expect(importante.status).toBe(201);
    expect((await leerJson<TareaJson>(importante)).importante).toBe(true);

    const sin = await pedir(app, ana.cookies, "/api/tareas", "POST", base);
    expect((await leerJson<TareaJson>(sin)).importante).toBe(false);

    for (const valor of ["si", 1, null]) {
      const respuesta = await pedir(app, ana.cookies, "/api/tareas", "POST", {
        ...base,
        importante: valor,
      });
      expect(respuesta.status, JSON.stringify(valor)).toBe(400);
    }
  });

  it("la lista de hoy trae la marca de importante, en el orden de siempre", async () => {
    const base = { notas: "", fecha: "", hora: "" };
    await pedir(app, ana.cookies, "/api/tareas", "POST", { ...base, titulo: "Común" });
    await pedir(app, ana.cookies, "/api/tareas", "POST", {
      ...base,
      titulo: "Importante",
      importante: true,
    });
    const lista = await leerJson<{ deHoy: (TareaJson & { titulo: string })[] }>(
      await pedir(app, ana.cookies, "/api/tareas"),
    );
    expect(lista.deHoy.map((t) => [t.titulo, t.importante])).toEqual([
      ["Común", false],
      ["Importante", true],
    ]);
  });
});

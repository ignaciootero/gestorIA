// La carga de datos de ejemplo tiene que mostrar lo nuevo de Tareas y de Contactos: se corre contra
// gestion_test y se mira que los widgets (que leen esos datos) tengan algo para decir.

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../pruebas/auth-de-prueba.ts";
import { entrarComoPersona, type PersonaDePrueba } from "../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba } from "../pruebas/entorno-de-prueba.ts";
import { listarHistorial } from "../servicios/contactos/historial-de-recordatorios.ts";
import { listarRecordatorios } from "../servicios/contactos/recordatorios.ts";
import { listarTareasDeHoy } from "../servicios/tareas/tareas.ts";
import { obtenerWidgetsDeTareas } from "../servicios/tareas/widgets.ts";
import { sembrarContactosDe } from "./sembrar-contactos.ts";
import { sembrarTareasDe } from "./sembrar-tareas.ts";

let cliente: ClienteDb;
let ana: PersonaDePrueba;

/** 12:00 en Montevideo del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");

beforeAll(() => {
  cliente = clienteDePrueba();
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(appDePrueba(cliente), cliente);
});

afterAll(async () => {
  await cliente.cerrar();
});

describe("la carga de datos de ejemplo", () => {
  it("siembra tareas con lo nuevo: cada varios días, fallan solas, fallidas, por fallar y lo hecho hoy", async () => {
    await sembrarTareasDe({ cliente, userId: ana.userId, ahora: AHORA });

    const widgets = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(widgets.fallidas.total).toBeGreaterThanOrEqual(3);
    // Cuentan también las rutinas que quedaron sin hacer hace casi una semana.
    expect(widgets.porFallar.total).toBeGreaterThanOrEqual(1);
    expect(widgets.porFallar.primera?.dias).toBeGreaterThanOrEqual(1);
    expect(widgets.porFallar.primera?.dias).toBeLessThanOrEqual(3);
    expect(widgets.hechasHoyPorOrigen).toMatchObject({ atrasadas: 1, adelantadas: 1 });
    expect(widgets.hechasHoyPorOrigen.deHoy).toBeGreaterThanOrEqual(1);
    expect(widgets.periodicidades.find((p) => p.repeticion === "intervalo")?.total).toBe(2);
    expect(widgets.fallanSolas).toBe(1);
    expect(widgets.cadaVariosDias.map((r) => r.titulo).sort()).toEqual([
      "Fertilizar las plantas",
      "Lavar la ropa",
    ]);

    // La lista de hoy muestra "Fallidas hoy" y las tres procedencias de lo hecho.
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.falladasHoy.map((t) => t.titulo)).toEqual(["Arreglar la persiana"]);
    expect(lista.hechasHoy.some((t) => t.dia < lista.hoy)).toBe(true);
    expect(lista.hechasHoy.some((t) => t.dia > lista.hoy)).toBe(true);
    expect(lista.atrasadas.some((t) => t.titulo === "Escanear los documentos")).toBe(true);
    // Hay tareas importantes y comunes mezcladas.
    expect(
      lista.atrasadas.some((t) => t.titulo === "Devolver el libro a la biblioteca" && t.importante),
    ).toBe(true);
    expect(lista.deHoy.some((t) => t.importante)).toBe(true);
    expect(lista.deHoy.some((t) => !t.importante)).toBe(true);
  });

  it("siembra contactos con cumpleaños automáticos e historial de recordatorios", async () => {
    const resumen = await sembrarContactosDe({ cliente, userId: ana.userId, ahora: AHORA });
    // Cuatro anuales que cayeron hace poco y tres de una sola vez que ya pasaron.
    expect(resumen.historial).toBe(7);

    const historial = await listarHistorial(cliente, ana.userId, { ahora: AHORA, limit: 500 });
    expect(historial.total).toBe(resumen.historial);
    // Hay recordatorios vigentes de más de una repetición.
    const vigentes = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA, limit: 500 });
    expect(new Set(vigentes.recordatorios.map((r) => r.repeticion)).size).toBeGreaterThan(1);

    // Valentina pidió el recordatorio de su cumpleaños; Tomás no.
    const deValentina = await listarRecordatorios(cliente, ana.userId, {
      ahora: AHORA,
      busqueda: "Valentina",
    });
    expect(deValentina.recordatorios.map((r) => [r.titulo, r.repeticion])).toEqual([
      ["Cumpleaños", "anual"],
    ]);
    const deTomas = await listarRecordatorios(cliente, ana.userId, {
      ahora: AHORA,
      busqueda: "Tomás",
    });
    expect(deTomas.total).toBe(0);

    // Los recordatorios son fechas puntuales: anuales (cumpleaños, aniversarios) o de una sola vez. Lo
    // que se repite seguido va en Tareas.
    const todos = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA });
    expect(new Set(todos.recordatorios.map((r) => r.repeticion))).toEqual(
      new Set(["unica", "anual"]),
    );
    const { entradas } = await listarHistorial(cliente, ana.userId, { ahora: AHORA, limit: 500 });
    const repeticiones = new Set(entradas.map((entrada) => entrada.repeticion));
    expect(repeticiones).toEqual(new Set(["unica", "anual"]));
    expect(entradas.some((entrada) => entrada.titulo === "Entregar los papeles del seguro")).toBe(
      true,
    );
    // Lo importante queda marcado en el historial.
    expect(entradas.filter((entrada) => entrada.importante).length).toBeGreaterThan(0);
    expect(entradas.some((entrada) => !entrada.importante)).toBe(true);
  });
});

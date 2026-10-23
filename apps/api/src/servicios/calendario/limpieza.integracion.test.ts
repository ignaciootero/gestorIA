// Tests de la limpieza de eventos del calendario, contra gestion_test.

import { type ClienteDb, esquema } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import { entrarComoPersona } from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba } from "../../pruebas/entorno-de-prueba.ts";
import { DIAS_ANTES_DE_BORRAR } from "../contactos/limpieza.ts";
import { limpiarCalendario } from "./limpieza.ts";

let cliente: ClienteDb;
let userId: string;

const AHORA = new Date("2026-10-22T12:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);

beforeAll(() => {
  cliente = clienteDePrueba();
});

beforeEach(async () => {
  await limpiarBase(cliente);
  userId = (await entrarComoPersona(appDePrueba(cliente), cliente)).userId;
});

afterAll(async () => {
  await cliente.cerrar();
});

describe("limpiarCalendario", () => {
  it("borra en definitivo lo eliminado hace más del plazo y deja el resto", async () => {
    await cliente.db.insert(esquema.eventosDeCalendario).values([
      {
        userId,
        titulo: "Eliminado hace mucho",
        dia: "2026-01-10",
        eliminadoEn: hace(DIAS_ANTES_DE_BORRAR + 1),
      },
      { userId, titulo: "Eliminado hace poco", dia: "2026-01-10", eliminadoEn: hace(1) },
      { userId, titulo: "Vigente y viejo", dia: "2020-01-10" },
      { userId, titulo: "Vigente", dia: "2026-12-10" },
    ]);

    expect(await limpiarCalendario(cliente, AHORA)).toEqual({ eventosBorrados: 1 });

    const quedan = await cliente.db.select().from(esquema.eventosDeCalendario);
    expect(quedan.map((e) => e.titulo).sort()).toEqual([
      "Eliminado hace poco",
      "Vigente",
      "Vigente y viejo",
    ]);
  });

  it("es idempotente: volver a correrla no cambia nada", async () => {
    await cliente.db.insert(esquema.eventosDeCalendario).values({
      userId,
      titulo: "x",
      dia: "2026-01-10",
      eliminadoEn: hace(DIAS_ANTES_DE_BORRAR + 5),
    });
    expect((await limpiarCalendario(cliente, AHORA)).eventosBorrados).toBe(1);
    expect((await limpiarCalendario(cliente, AHORA)).eventosBorrados).toBe(0);
  });

  it("sin nada para borrar devuelve cero", async () => {
    expect(await limpiarCalendario(cliente, AHORA)).toEqual({ eventosBorrados: 0 });
  });
});

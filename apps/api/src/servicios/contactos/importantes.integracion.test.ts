// Tests de integración de los recordatorios importantes, contra gestion_test: se marcan al crear y al
// editar, editar sin decir nada los conserva y el historial guarda si lo eran cuando cayeron.

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  cadaAnio,
  crearContactoPorApi,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
  unaVez,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { obtenerContacto } from "./contactos.ts";
import { listarHistorial } from "./historial-de-recordatorios.ts";
import { crearRecordatorio, editarRecordatorio, listarRecordatorios } from "./recordatorios.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let contactoId: string;

const MS_POR_DIA = 86_400_000;
/** 12:00 en Montevideo del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente);
  contactoId = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Beto" }));
});

afterAll(async () => {
  await cliente.cerrar();
});

const nuevo = (datos: Parameters<typeof crearRecordatorio>[3], cuando = AHORA) =>
  crearRecordatorio(cliente, ana.userId, contactoId, datos, cuando);

describe("marcar un recordatorio como importante", () => {
  it("por defecto no lo es; se marca al crear y al editar, y editar sin el campo lo conserva", async () => {
    const comun = await nuevo(unaVez("Común", "2999-01-01"));
    expect(comun?.importante).toBe(false);

    const importante = await nuevo({ ...unaVez("Importante", "2999-01-01"), importante: true });
    expect(importante?.importante).toBe(true);

    const cambiar = (id: string | undefined, datos: Parameters<typeof editarRecordatorio>[4]) =>
      editarRecordatorio(cliente, ana.userId, contactoId, id ?? "", datos, AHORA);

    // Sin el campo, se conserva.
    expect((await cambiar(importante?.id, unaVez("Cambiado", "2999-01-02")))?.importante).toBe(
      true,
    );
    // Con el campo, se cambia.
    expect(
      (await cambiar(importante?.id, { ...unaVez("Cambiado", "2999-01-02"), importante: false }))
        ?.importante,
    ).toBe(false);
    expect(
      (await cambiar(comun?.id, { ...unaVez("Común", "2999-01-01"), importante: true }))
        ?.importante,
    ).toBe(true);
  });

  it("aparece en la lista general y en la ficha del contacto", async () => {
    await nuevo(unaVez("Común", "2999-01-01"));
    await nuevo({ ...cadaAnio("Importante", 2, 11), importante: true });

    const { recordatorios } = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA });
    expect(new Map(recordatorios.map((r) => [r.titulo, r.importante]))).toEqual(
      new Map([
        ["Común", false],
        ["Importante", true],
      ]),
    );
    const ficha = await obtenerContacto(cliente, ana.userId, contactoId, AHORA);
    expect(ficha?.recordatorios.find((r) => r.titulo === "Importante")?.importante).toBe(true);
  });

  it("el historial guarda si lo era cuando cayó", async () => {
    const hace10 = new Date(AHORA.getTime() - 10 * MS_POR_DIA);
    await nuevo({ ...unaVez("Cita importante", "2026-10-15"), importante: true }, hace10);
    await nuevo(unaVez("Cita común", "2026-10-16"), hace10);
    await nuevo({ ...cadaAnio("Aniversario", 12, 10), importante: true }, hace10);

    const { entradas } = await listarHistorial(cliente, ana.userId, { ahora: AHORA });
    expect(new Map(entradas.map((e) => [e.titulo, e.importante]))).toEqual(
      new Map([
        ["Cita importante", true],
        ["Cita común", false],
        ["Aniversario", true],
      ]),
    );
  });
});

describe("por la API", () => {
  it("acepta importante verdadero o falso y rechaza otro tipo de valor", async () => {
    const ruta = `/api/contactos/${contactoId}/recordatorios`;
    const base = unaVez("Llamarle", "2999-01-01");
    const respuesta = await pedir(app, ana.cookies, ruta, "POST", { ...base, importante: true });
    expect(respuesta.status).toBe(201);
    expect((await leerJson<{ importante: boolean }>(respuesta)).importante).toBe(true);

    expect(
      (await leerJson<{ importante: boolean }>(await pedir(app, ana.cookies, ruta, "POST", base)))
        .importante,
    ).toBe(false);

    for (const valor of ["si", 1, null]) {
      const mala = await pedir(app, ana.cookies, ruta, "POST", { ...base, importante: valor });
      expect(mala.status, JSON.stringify(valor)).toBe(400);
    }
  });
});

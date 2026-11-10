// Tests de integración de las tareas progresivas ("tomar 2 litros de agua"), contra gestion_test: la meta
// se define al crear y al editar (sueltas y repetitivas), el progreso se suma o se corrige, llegar a la meta
// las completa y bajar de la meta las vuelve a pendiente, no se tildan a mano y fallan como cualquier otra.

import { type ClienteDb, esquema } from "@gestoria/db";
import type { DatosDeTareaRepetitiva } from "@gestoria/shared";
import { eq } from "drizzle-orm";
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
  fallarTarea,
  listarTareasDeHoy,
  registrarProgreso,
  TareaFallida,
  TareaFutura,
  TareaNoProgresiva,
  TareaProgresiva,
} from "./tareas.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let beto: PersonaDePrueba;

/** 12:00 en Montevideo (UTC-3) del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");
const MS_POR_DIA = 86_400_000;
const enDias = (dias: number) => new Date(AHORA.getTime() + dias * MS_POR_DIA);

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

const agua = (extra: { meta?: number | null; unidad?: string; fecha?: string } = {}) => ({
  titulo: "Tomar agua",
  notas: "",
  fecha: extra.fecha ?? "",
  hora: "",
  meta: extra.meta === undefined ? 2 : extra.meta,
  ...(extra.unidad === undefined ? { unidad: "litros" } : { unidad: extra.unidad }),
});

const aguaDiaria = (extra: Partial<DatosDeTareaRepetitiva> = {}): DatosDeTareaRepetitiva => ({
  titulo: "Tomar agua",
  notas: "",
  repeticion: "diaria",
  hora: "",
  meta: 2,
  unidad: "litros",
  ...extra,
} as DatosDeTareaRepetitiva);

describe("la meta", () => {
  it("una tarea con meta es progresiva y arranca en 0", async () => {
    const tarea = await crearTarea(cliente, ana.userId, agua(), AHORA);
    expect(tarea).toMatchObject({ meta: 2, unidad: "litros", progreso: 0, completada: false });
  });

  it("sin meta es una tarea común, sin unidad aunque se mande", async () => {
    const tarea = await crearTarea(cliente, ana.userId, agua({ meta: null }), AHORA);
    expect(tarea).toMatchObject({ meta: null, unidad: null, progreso: 0 });
  });

  it("la unidad es opcional: en blanco queda sin unidad", async () => {
    const tarea = await crearTarea(cliente, ana.userId, agua({ unidad: "  " }), AHORA);
    expect(tarea).toMatchObject({ meta: 2, unidad: null });
  });

  it("una repetitiva progresiva le pasa la meta y la unidad a cada tarea que arma", async () => {
    const repetitiva = await crearTareaRepetitiva(cliente, ana.userId, aguaDiaria(), AHORA);
    expect(repetitiva).toMatchObject({ meta: 2, unidad: "litros" });
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.deHoy[0]).toMatchObject({ meta: 2, unidad: "litros", progreso: 0 });
  });
});

describe("el progreso", () => {
  it("se suma de a poco y al llegar a la meta se completa", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    expect(await registrarProgreso(cliente, ana.userId, id, { sumar: 0.5 }, AHORA)).toMatchObject({
      progreso: 0.5,
      completada: false,
    });
    await registrarProgreso(cliente, ana.userId, id, { sumar: 0.75 }, AHORA);
    const llega = await registrarProgreso(cliente, ana.userId, id, { sumar: 0.75 }, AHORA);
    expect(llega).toMatchObject({ progreso: 2, completada: true });

    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.hechasHoy.map((tarea) => tarea.id)).toEqual([id]);
  });

  it("suma sin errores de redondeo (0,1 + 0,2 = 0,3)", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua({ meta: 1 }), AHORA);
    await registrarProgreso(cliente, ana.userId, id, { sumar: 0.1 }, AHORA);
    const tarea = await registrarProgreso(cliente, ana.userId, id, { sumar: 0.2 }, AHORA);
    expect(tarea?.progreso).toBe(0.3);
  });

  it("se puede pasar de la meta, y seguir sumando no cambia cuándo se completó", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    const completa = await registrarProgreso(cliente, ana.userId, id, { sumar: 2 }, AHORA);
    const despues = new Date(AHORA.getTime() + 60_000);
    const mas = await registrarProgreso(cliente, ana.userId, id, { sumar: 1 }, despues);
    expect(mas).toMatchObject({ progreso: 3, completada: true });
    expect(mas?.completadaEn).toEqual(completa?.completadaEn);
  });

  it("corregir el total por debajo de la meta la vuelve a pendiente", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    await registrarProgreso(cliente, ana.userId, id, { sumar: 2 }, AHORA);
    const corregida = await registrarProgreso(cliente, ana.userId, id, { total: 1.5 }, AHORA);
    expect(corregida).toMatchObject({ progreso: 1.5, completada: false });
    expect(await registrarProgreso(cliente, ana.userId, id, { total: 0 }, AHORA)).toMatchObject({
      progreso: 0,
    });
  });

  it("restar descuenta lo anotado de más, sin bajar de 0, y puede volverla a pendiente", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    await registrarProgreso(cliente, ana.userId, id, { sumar: 2.5 }, AHORA);
    expect(await registrarProgreso(cliente, ana.userId, id, { restar: 1 }, AHORA)).toMatchObject({
      progreso: 1.5,
      completada: false,
    });
    expect(await registrarProgreso(cliente, ana.userId, id, { restar: 5 }, AHORA)).toMatchObject({
      progreso: 0,
    });
  });

  it("dos sumas a la vez no se pisan", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua({ meta: 5 }), AHORA);
    await Promise.all(
      [1, 1, 1].map(() => registrarProgreso(cliente, ana.userId, id, { sumar: 1 }, AHORA)),
    );
    const [fila] = await cliente.db
      .select({ progreso: esquema.tareas.progresoCentesimos })
      .from(esquema.tareas)
      .where(eq(esquema.tareas.id, id));
    expect(fila?.progreso).toBe(300);
  });

  it("se puede anotar en una atrasada, pero no en una de un día futuro ni en una fallida", async () => {
    // Una progresiva falla sola al terminar el día; devuelta a pendiente, queda atrasada y ya no falla sola.
    const atrasada = await crearTarea(cliente, ana.userId, agua(), AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    await fallarTarea(cliente, ana.userId, atrasada.id, false, enDias(1));
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(lista.atrasadas.map((tarea) => tarea.id)).toEqual([atrasada.id]);
    expect(
      await registrarProgreso(cliente, ana.userId, atrasada.id, { sumar: 1 }, enDias(1)),
    ).toMatchObject({ progreso: 1 });

    const futura = await crearTarea(cliente, ana.userId, agua({ fecha: "2026-10-25" }), AHORA);
    await expect(
      registrarProgreso(cliente, ana.userId, futura.id, { sumar: 1 }, AHORA),
    ).rejects.toBeInstanceOf(TareaFutura);

    const fallida = await crearTarea(cliente, ana.userId, agua(), AHORA);
    await fallarTarea(cliente, ana.userId, fallida.id, true, AHORA);
    await expect(
      registrarProgreso(cliente, ana.userId, fallida.id, { sumar: 1 }, AHORA),
    ).rejects.toBeInstanceOf(TareaFallida);
  });

  it("una tarea común no tiene progreso, y una progresiva no se tilda a mano", async () => {
    const comun = await crearTarea(cliente, ana.userId, agua({ meta: null }), AHORA);
    await expect(
      registrarProgreso(cliente, ana.userId, comun.id, { sumar: 1 }, AHORA),
    ).rejects.toBeInstanceOf(TareaNoProgresiva);

    const progresiva = await crearTarea(cliente, ana.userId, agua(), AHORA);
    await expect(
      completarTarea(cliente, ana.userId, progresiva.id, true, AHORA),
    ).rejects.toBeInstanceOf(TareaProgresiva);
  });

  it("la tarea de otra persona no existe", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    expect(await registrarProgreso(cliente, beto.userId, id, { sumar: 1 }, AHORA)).toBeNull();
  });
});

describe("cambiar la meta", () => {
  it("bajarla hasta lo anotado la completa; subirla por encima la vuelve a pendiente", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    await registrarProgreso(cliente, ana.userId, id, { sumar: 1.5 }, AHORA);
    expect(await editarTarea(cliente, ana.userId, id, agua({ meta: 1.5 }), AHORA)).toMatchObject({
      completada: true,
    });
    expect(await editarTarea(cliente, ana.userId, id, agua({ meta: 3 }), AHORA)).toMatchObject({
      completada: false,
      progreso: 1.5,
    });
  });

  it("quitarle la meta la vuelve común y borra lo anotado", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    await registrarProgreso(cliente, ana.userId, id, { sumar: 1 }, AHORA);
    expect(await editarTarea(cliente, ana.userId, id, agua({ meta: null }), AHORA)).toMatchObject({
      meta: null,
      unidad: null,
      progreso: 0,
    });
  });

  it("editar sin mandar la meta la conserva", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    const { meta: _meta, unidad: _unidad, ...sinMeta } = agua();
    expect(await editarTarea(cliente, ana.userId, id, sinMeta, AHORA)).toMatchObject({
      meta: 2,
      unidad: "litros",
    });
  });

  it("editar la repetitiva conserva lo anotado hoy", async () => {
    const repetitiva = await crearTareaRepetitiva(cliente, ana.userId, aguaDiaria(), AHORA);
    const [deHoy] = (await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy;
    await registrarProgreso(cliente, ana.userId, deHoy?.id ?? "", { sumar: 1.5 }, AHORA);

    await editarTareaRepetitiva(
      cliente,
      ana.userId,
      repetitiva.id,
      aguaDiaria({ titulo: "Tomar agua (vasos)", meta: 1.5 }),
      AHORA,
    );
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    // Con la meta nueva ya llega: queda hecha, con lo que llevaba.
    expect(lista.hechasHoy[0]).toMatchObject({ titulo: "Tomar agua (vasos)", progreso: 1.5 });
  });
});

describe("si no llega a la meta", () => {
  it("una repetitiva progresiva falla sola al terminar el día, aunque no se pida, con lo que llevaba", async () => {
    const repetitiva = await crearTareaRepetitiva(
      cliente,
      ana.userId,
      aguaDiaria({ fallaSola: false }),
      AHORA,
    );
    expect(repetitiva.fallaSola).toBe(true);
    const [deHoy] = (await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy;
    await registrarProgreso(cliente, ana.userId, deHoy?.id ?? "", { sumar: 1 }, AHORA);

    const manana = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(manana.atrasadas.map((tarea) => tarea.id)).not.toContain(deHoy?.id);
    const [fila] = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.id, deHoy?.id ?? ""));
    expect(fila?.falladaEn).not.toBeNull();
    expect(fila?.progresoCentesimos).toBe(100);
  });

  it("una suelta progresiva también falla sola al terminar el día", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    const manana = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(manana.atrasadas).toEqual([]);
    const [fila] = await cliente.db.select().from(esquema.tareas).where(eq(esquema.tareas.id, id));
    expect(fila?.falladaEn).not.toBeNull();
  });

  it("si llegó a la meta, no falla", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua(), AHORA);
    await registrarProgreso(cliente, ana.userId, id, { sumar: 2 }, AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    const [fila] = await cliente.db.select().from(esquema.tareas).where(eq(esquema.tareas.id, id));
    expect(fila?.falladaEn).toBeNull();
    expect(fila?.completadaEn).not.toBeNull();
  });

  it("una tarea común que se vuelve progresiva pasa a fallar sola", async () => {
    const { id } = await crearTarea(cliente, ana.userId, agua({ meta: null }), AHORA);
    await editarTarea(cliente, ana.userId, id, agua(), AHORA);
    const manana = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(manana.atrasadas).toEqual([]);
  });
});

describe("por la API", () => {
  it("PUT /api/tareas/:id/progreso suma, corrige y valida", async () => {
    const creada = await leerJson<{ id: string }>(
      await pedir(app, ana.cookies, "/api/tareas", "POST", agua()),
    );
    const url = `/api/tareas/${creada.id}/progreso`;
    const sumar = await pedir(app, ana.cookies, url, "PUT", { sumar: 0.5 });
    expect(sumar.status).toBe(200);
    expect(await leerJson(sumar)).toMatchObject({ progreso: 0.5 });

    expect((await pedir(app, ana.cookies, url, "PUT", { total: 2 })).status).toBe(200);
    for (const malo of [{ sumar: 0 }, { sumar: -1 }, { total: 1.234 }, {}]) {
      expect((await pedir(app, ana.cookies, url, "PUT", malo)).status).toBe(400);
    }
    expect((await pedir(app, beto.cookies, url, "PUT", { sumar: 1 })).status).toBe(404);
    expect((await pedir(app, null, url, "PUT", { sumar: 1 })).status).toBe(401);
  });

  it("tildar a mano una progresiva responde 409", async () => {
    const creada = await leerJson<{ id: string }>(
      await pedir(app, ana.cookies, "/api/tareas", "POST", agua()),
    );
    const respuesta = await pedir(app, ana.cookies, `/api/tareas/${creada.id}/completada`, "PATCH", {
      completada: true,
    });
    expect(respuesta.status).toBe(409);
  });
});

// Tests de integración de los widgets de tareas, contra gestion_test. Se llaman con un `ahora` fijo
// (martes 20 de octubre de 2026, mediodía en Montevideo) para que los días sean siempre los mismos.

import { type ClienteDb, esquema } from "@gestoria/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { crearTareaRepetitiva } from "./repetitivas.ts";
import { completarTarea, crearTarea } from "./tareas.ts";
import { obtenerWidgetsDeTareas, type WidgetsDeTareas } from "./widgets.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let beto: PersonaDePrueba;

const AHORA = new Date("2026-10-20T15:00:00.000Z");
const HOY = "2026-10-20";
/** Cuándo se tildaron las tareas de los días pasados: antes de hoy, para que no cuenten como hechas hoy. */
const ANTES = new Date("2026-10-01T12:00:00.000Z");

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

/** El día `atras` días antes de hoy. */
function hace(atras: number): string {
  return new Date(Date.parse(`${HOY}T00:00:00Z`) - atras * 86_400_000).toISOString().slice(0, 10);
}

const suelta = (titulo: string, fecha = "", hora = "") => ({ titulo, notas: "", fecha, hora });

async function insertar(
  userId: string,
  fila: Partial<typeof esquema.tareas.$inferInsert> & { dia: string },
) {
  await cliente.db.insert(esquema.tareas).values({ userId, titulo: "Tarea", ...fila });
}

describe("widgets de tareas", () => {
  it("sin ninguna tarea, todo en cero", async () => {
    const datos = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(datos).toMatchObject({
      hoy: HOY,
      hoyHechas: 0,
      hoyPendientes: 0,
      atrasadas: { total: 0, primeras: [] },
      proximas: [],
      masAdelante: { total: 0, primera: null, primeras: [] },
      racha: 0,
      rutinas: [],
      repetitivas: 0,
    });
    expect(datos.ultimosDias).toHaveLength(7);
    expect(datos.ultimosDias.at(-1)?.dia).toBe(HOY);
    expect(datos.ultimosDias[0]?.dia).toBe(hace(6));
    expect(datos.ultimosDias.every((dia) => dia.total === 0 && dia.hechas === 0)).toBe(true);
  });

  it("cuenta lo hecho y lo que falta hoy, con lo que sigue en orden de hora", async () => {
    await crearTarea(cliente, ana.userId, suelta("Tarde", "", "18:00"), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Todo el día"), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Temprano", "", "07:00"), AHORA);
    const hecha = await crearTarea(cliente, ana.userId, suelta("Hecha"), AHORA);
    await completarTarea(cliente, ana.userId, hecha.id, true, AHORA);

    const datos = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(datos).toMatchObject({ hoyHechas: 1, hoyPendientes: 3 });
    expect(datos.proximas).toEqual([
      { titulo: "Todo el día", hora: null },
      { titulo: "Temprano", hora: "07:00" },
      { titulo: "Tarde", hora: "18:00" },
    ]);
    expect(datos.ultimosDias.at(-1)).toMatchObject({ dia: HOY, total: 4, hechas: 1 });
  });

  it("las atrasadas se nombran las más viejas primero y no cuentan como lo que falta hoy", async () => {
    await insertar(ana.userId, { dia: hace(5), titulo: "Vieja" });
    await insertar(ana.userId, { dia: hace(2), titulo: "Reciente" });
    const datos = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(datos.atrasadas).toEqual({
      total: 2,
      primeras: [
        { titulo: "Vieja", dia: hace(5) },
        { titulo: "Reciente", dia: hace(2) },
      ],
    });
    // Lo de hoy es solo lo de hoy: las atrasadas tienen su propio dato.
    expect(datos.hoyPendientes).toBe(0);
    expect(datos.hoyHechas).toBe(0);
  });

  it("hacer una atrasada no suma al avance de hoy; hacer una de hoy sí", async () => {
    await insertar(ana.userId, { dia: hace(3), titulo: "Vieja" });
    const deHoy = await crearTarea(cliente, ana.userId, suelta("De hoy"), AHORA);
    const [filaVieja] = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.titulo, "Vieja"));
    await completarTarea(cliente, ana.userId, filaVieja?.id ?? "", true, AHORA);
    let datos = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(datos).toMatchObject({ hoyHechas: 0, hoyPendientes: 1 });
    await completarTarea(cliente, ana.userId, deHoy.id, true, AHORA);
    datos = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(datos).toMatchObject({ hoyHechas: 1, hoyPendientes: 0 });
  });

  it("lo próximo es la tarea con día futuro que cae antes", async () => {
    await crearTarea(cliente, ana.userId, suelta("Lejana", "2026-11-30"), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Cercana", "2026-10-23", "10:00"), AHORA);
    const datos = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    const cercana = { titulo: "Cercana", dia: "2026-10-23", hora: "10:00", dias: 3 };
    expect(datos.masAdelante).toEqual({
      total: 2,
      primera: cercana,
      // Las que siguen, de la más cercana a la más lejana (la página de inicio las lista).
      primeras: [cercana, { titulo: "Lejana", dia: "2026-11-30", hora: null, dias: 41 }],
    });
  });

  it("la racha cuenta los días seguidos en que se hizo todo, sin cortarse por días sin tareas", async () => {
    const hechas = (dia: string) => insertar(ana.userId, { dia, completadaEn: ANTES });
    await hechas(hace(1));
    await hechas(hace(2));
    // hace(3): sin tareas, no corta.
    await hechas(hace(4));
    await insertar(ana.userId, { dia: hace(5), completadaEn: ANTES });
    // Una repetitiva que se dejó fallida (si estuviera pendiente sería una atrasada de hoy): corta acá.
    const [rutina] = await cliente.db
      .insert(esquema.tareasRepetitivas)
      .values({
        userId: ana.userId,
        titulo: "Rutina",
        repeticion: "diaria",
        desde: hace(10),
        generadaHasta: HOY,
      })
      .returning();
    await insertar(ana.userId, {
      dia: hace(5),
      repetitivaId: rutina?.id ?? null,
      falladaEn: ANTES,
    });
    await hechas(hace(6));

    expect((await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA)).racha).toBe(3);

    // Si hoy ya está todo hecho, suma.
    const hoy = await crearTarea(cliente, ana.userId, suelta("De hoy"), AHORA);
    expect((await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA)).racha).toBe(3);
    await completarTarea(cliente, ana.userId, hoy.id, true, AHORA);
    expect((await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA)).racha).toBe(4);
  });

  it("una repetitiva que quedó sin hacer corta la racha", async () => {
    const [repetitiva] = await cliente.db
      .insert(esquema.tareasRepetitivas)
      .values({
        userId: ana.userId,
        titulo: "Rutina",
        repeticion: "diaria",
        desde: hace(10),
        generadaHasta: HOY,
      })
      .returning();
    await insertar(ana.userId, { dia: hace(1), repetitivaId: repetitiva?.id ?? null });
    await insertar(ana.userId, { dia: hace(2), completadaEn: ANTES });
    expect((await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA)).racha).toBe(0);
  });

  it("los últimos 7 días traen lo hecho y el total de cada día, y no incluyen días más viejos", async () => {
    await insertar(ana.userId, { dia: hace(1), completadaEn: ANTES });
    await insertar(ana.userId, { dia: hace(1), completadaEn: ANTES });
    await insertar(ana.userId, { dia: hace(3), completadaEn: ANTES });
    await insertar(ana.userId, { dia: hace(8), completadaEn: ANTES });
    const { ultimosDias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    const deAyer = ultimosDias.find((dia) => dia.dia === hace(1));
    expect(deAyer).toMatchObject({ total: 2, hechas: 2 });
    expect(ultimosDias.find((dia) => dia.dia === hace(3))).toMatchObject({ total: 1, hechas: 1 });
    expect(ultimosDias.some((dia) => dia.dia === hace(8))).toBe(false);
  });

  it("las rutinas se ordenan por cuánto se cumplieron y exigen al menos tres días", async () => {
    const crear = async (titulo: string) => {
      const [fila] = await cliente.db
        .insert(esquema.tareasRepetitivas)
        .values({
          userId: ana.userId,
          titulo,
          repeticion: "diaria",
          desde: hace(20),
          generadaHasta: HOY,
        })
        .returning();
      return fila?.id ?? null;
    };
    const constante = await crear("Constante");
    const irregular = await crear("Irregular");
    const nueva = await crear("Nueva");
    for (let atras = 1; atras <= 5; atras++) {
      await insertar(ana.userId, {
        dia: hace(atras),
        repetitivaId: constante,
        completadaEn: ANTES,
      });
      await insertar(ana.userId, {
        dia: hace(atras),
        repetitivaId: irregular,
        ...(atras % 2 === 0 ? { completadaEn: ANTES } : {}),
      });
    }
    await insertar(ana.userId, { dia: hace(1), repetitivaId: nueva, completadaEn: ANTES });

    const { rutinas } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(rutinas).toEqual([
      { titulo: "Constante", hechas: 5, total: 5 },
      { titulo: "Irregular", hechas: 2, total: 5 },
    ]);
  });

  it("cuenta las repetitivas vigentes", async () => {
    await crearTareaRepetitiva(
      cliente,
      ana.userId,
      { titulo: "Una", notas: "", repeticion: "diaria", hora: "" },
      AHORA,
    );
    expect((await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA)).repetitivas).toBe(1);
  });

  it("cada persona ve solo lo suyo", async () => {
    await crearTarea(cliente, ana.userId, suelta("De Ana"), AHORA);
    await insertar(ana.userId, { dia: hace(1), completadaEn: ANTES });
    const deBeto = await obtenerWidgetsDeTareas(cliente, beto.userId, AHORA);
    expect(deBeto).toMatchObject({ hoyHechas: 0, hoyPendientes: 0, racha: 0 });
    expect(deBeto.ultimosDias.every((dia) => dia.total === 0)).toBe(true);
  });
});

describe("GET /api/tareas/widgets", () => {
  it("pide sesión", async () => {
    expect((await pedir(app, null, "/api/tareas/widgets")).status).toBe(401);
  });

  it("devuelve los datos de la persona de la sesión", async () => {
    await crearTarea(cliente, ana.userId, suelta("De Ana"));
    const respuesta = await pedir(app, ana.cookies, "/api/tareas/widgets");
    expect(respuesta.status).toBe(200);
    expect(await leerJson<WidgetsDeTareas>(respuesta)).toMatchObject({ hoyPendientes: 1 });
    const deBeto = await pedir(app, beto.cookies, "/api/tareas/widgets");
    expect(await leerJson<WidgetsDeTareas>(deBeto)).toMatchObject({ hoyPendientes: 0 });
  });
});

async function categoria(userId: string, nombre: string, color = "#112233"): Promise<number> {
  const [fila] = await cliente.db
    .insert(esquema.categoriasDeTareas)
    .values({ userId, nombre, color })
    .returning({ id: esquema.categoriasDeTareas.id });
  if (!fila) throw new Error("No se pudo crear la categoría de prueba.");
  return fila.id;
}

describe("widgets de tareas por categoría", () => {
  it("sin categorías, todo en cero", async () => {
    await crearTarea(cliente, ana.userId, suelta("Una"), AHORA);
    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.cantidad).toBe(0);
    expect(categorias.sinCategoria).toBe(1);
    expect(categorias.pendientes).toEqual([{ id: null, nombre: null, color: null, total: 1 }]);
    expect(categorias.atrasadas).toEqual([]);
    expect(categorias.hechas).toEqual([]);
    expect(categorias.cumplimiento).toEqual([]);
  });

  it("cuenta lo que falta por categoría: atrasadas, de hoy y con día futuro", async () => {
    const casa = await categoria(ana.userId, "Casa", "#cf5417");
    const trabajo = await categoria(ana.userId, "Trabajo", "#1717cf");
    await insertar(ana.userId, { dia: hace(3), categoriaId: casa }); // atrasada
    await crearTarea(cliente, ana.userId, { ...suelta("Hoy 1"), categoriaId: casa }, AHORA);
    await crearTarea(cliente, ana.userId, { ...suelta("Hoy 2"), categoriaId: trabajo }, AHORA);
    await crearTarea(
      cliente,
      ana.userId,
      { ...suelta("Futura", "2026-11-30"), categoriaId: casa },
      AHORA,
    );
    await crearTarea(cliente, ana.userId, suelta("Sin categoría"), AHORA);

    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.cantidad).toBe(2);
    expect(categorias.sinCategoria).toBe(1);
    expect(categorias.pendientes).toEqual([
      { id: casa, nombre: "Casa", color: "#cf5417", total: 3 },
      { id: trabajo, nombre: "Trabajo", color: "#1717cf", total: 1 },
      { id: null, nombre: null, color: null, total: 1 },
    ]);
  });

  it("a igual cantidad, desempata por nombre y deja las sin categoría al final", async () => {
    const zeta = await categoria(ana.userId, "Zeta");
    const alfa = await categoria(ana.userId, "Alfa");
    await crearTarea(cliente, ana.userId, { ...suelta("1"), categoriaId: zeta }, AHORA);
    await crearTarea(cliente, ana.userId, { ...suelta("2"), categoriaId: alfa }, AHORA);
    await crearTarea(cliente, ana.userId, suelta("3"), AHORA);
    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.pendientes.map((fila) => fila.nombre)).toEqual(["Alfa", "Zeta", null]);
  });

  it("no cuenta lo hecho, lo eliminado ni lo fallido", async () => {
    const casa = await categoria(ana.userId, "Casa");
    const hecha = await crearTarea(
      cliente,
      ana.userId,
      { ...suelta("Hecha"), categoriaId: casa },
      AHORA,
    );
    await completarTarea(cliente, ana.userId, hecha.id, true, AHORA);
    await insertar(ana.userId, { dia: HOY, categoriaId: casa, eliminadoEn: ANTES });
    const [regla] = await cliente.db
      .insert(esquema.tareasRepetitivas)
      .values({
        userId: ana.userId,
        titulo: "R",
        repeticion: "diaria",
        desde: hace(10),
        generadaHasta: HOY,
      })
      .returning();
    await insertar(ana.userId, {
      dia: hace(2),
      categoriaId: casa,
      repetitivaId: regla?.id ?? null,
      falladaEn: ANTES,
    });

    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.pendientes).toEqual([]);
    expect(categorias.atrasadas).toEqual([]);
  });

  it("las atrasadas se cuentan aparte, por categoría", async () => {
    const casa = await categoria(ana.userId, "Casa");
    const salud = await categoria(ana.userId, "Salud");
    await insertar(ana.userId, { dia: hace(5), categoriaId: salud });
    await insertar(ana.userId, { dia: hace(2), categoriaId: salud });
    await insertar(ana.userId, { dia: hace(1), categoriaId: casa });
    await crearTarea(cliente, ana.userId, { ...suelta("Hoy"), categoriaId: casa }, AHORA);

    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.atrasadas.map((fila) => [fila.nombre, fila.total])).toEqual([
      ["Salud", 2],
      ["Casa", 1],
    ]);
  });

  it("lo hecho cuenta los últimos 30 días, hoy incluido, y no lo anterior ni lo pendiente", async () => {
    const casa = await categoria(ana.userId, "Casa");
    const estudio = await categoria(ana.userId, "Estudio");
    await insertar(ana.userId, { dia: hace(29), categoriaId: casa, completadaEn: ANTES });
    await insertar(ana.userId, { dia: hace(10), categoriaId: casa, completadaEn: ANTES });
    await insertar(ana.userId, { dia: hace(5), categoriaId: estudio, completadaEn: ANTES });
    await insertar(ana.userId, { dia: hace(30), categoriaId: estudio, completadaEn: ANTES }); // fuera
    await insertar(ana.userId, { dia: hace(4), categoriaId: estudio }); // sin hacer
    await insertar(ana.userId, { dia: hace(3), completadaEn: ANTES }); // sin categoría
    const deHoy = await crearTarea(
      cliente,
      ana.userId,
      { ...suelta("Hoy"), categoriaId: estudio },
      AHORA,
    );
    await completarTarea(cliente, ana.userId, deHoy.id, true, AHORA);

    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.hechas.map((fila) => [fila.nombre, fila.total])).toEqual([
      ["Casa", 2],
      ["Estudio", 2],
      [null, 1],
    ]);
  });

  it("el cumplimiento mira los últimos 14 días sin hoy y pide al menos 3 tareas por categoría", async () => {
    const casa = await categoria(ana.userId, "Casa");
    const salud = await categoria(ana.userId, "Salud");
    const poca = await categoria(ana.userId, "Poca");
    // Casa: 3 de 4 (una sin hacer).
    for (const atras of [1, 2, 3]) {
      await insertar(ana.userId, { dia: hace(atras), categoriaId: casa, completadaEn: ANTES });
    }
    await insertar(ana.userId, { dia: hace(4), categoriaId: casa });
    // Salud: 3 de 3, con una tarea de hoy y otra de hace 15 días que no cuentan.
    for (const atras of [5, 6, 7]) {
      await insertar(ana.userId, { dia: hace(atras), categoriaId: salud, completadaEn: ANTES });
    }
    await insertar(ana.userId, { dia: HOY, categoriaId: salud });
    await insertar(ana.userId, { dia: hace(15), categoriaId: salud });
    // Poca: solo 2 tareas.
    await insertar(ana.userId, { dia: hace(1), categoriaId: poca, completadaEn: ANTES });
    await insertar(ana.userId, { dia: hace(2), categoriaId: poca, completadaEn: ANTES });

    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.cumplimiento.map((fila) => [fila.nombre, fila.hechas, fila.total])).toEqual([
      ["Salud", 3, 3],
      ["Casa", 3, 4],
    ]);
  });

  it("cada ranking muestra como mucho 5 categorías", async () => {
    for (let numero = 1; numero <= 7; numero++) {
      const id = await categoria(ana.userId, `Categoría ${numero}`);
      await crearTarea(cliente, ana.userId, { ...suelta(`T${numero}`), categoriaId: id }, AHORA);
    }
    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.cantidad).toBe(7);
    expect(categorias.pendientes).toHaveLength(5);
    await crearTarea(cliente, ana.userId, suelta("Sin categoría"), AHORA);
    // La cantidad de sin categoría no depende de que entren en el ranking.
    expect((await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA)).categorias.sinCategoria).toBe(
      1,
    );
  });

  it("cada persona ve solo sus categorías", async () => {
    const deAna = await categoria(ana.userId, "De Ana");
    await crearTarea(cliente, ana.userId, { ...suelta("De Ana"), categoriaId: deAna }, AHORA);
    await categoria(beto.userId, "De Beto");
    const { categorias } = await obtenerWidgetsDeTareas(cliente, beto.userId, AHORA);
    expect(categorias).toMatchObject({ cantidad: 1, pendientes: [], hechas: [], cumplimiento: [] });
  });

  it("al eliminar una categoría, lo hecho pasa a sin categoría", async () => {
    const casa = await categoria(ana.userId, "Casa");
    await insertar(ana.userId, { dia: hace(2), categoriaId: casa, completadaEn: ANTES });
    await cliente.db
      .delete(esquema.categoriasDeTareas)
      .where(eq(esquema.categoriasDeTareas.id, casa));
    const { categorias } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(categorias.hechas).toEqual([{ id: null, nombre: null, color: null, total: 1 }]);
  });
});

describe("widgets de lo nuevo en tareas", () => {
  it("sin nada de esto, todo vacío", async () => {
    const datos = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(datos.fallidas).toEqual({ total: 0, ultimas: [] });
    expect(datos.porFallar).toEqual({ total: 0, primera: null });
    expect(datos.hechasHoyPorOrigen).toEqual({ deHoy: 0, atrasadas: 0, adelantadas: 0 });
    expect(datos.periodicidades).toEqual([]);
    expect(datos.fallanSolas).toBe(0);
    expect(datos.cadaVariosDias).toEqual([]);
  });

  it("cuenta las fallidas de las últimas dos semanas, las más recientes primero", async () => {
    const falla = (dia: string, titulo: string) =>
      insertar(ana.userId, { dia, titulo, falladaEn: ANTES });
    await falla(hace(1), "Ayer");
    await falla(hace(3), "Antes de ayer");
    await falla(hace(5), "Más atrás");
    await falla(hace(5), "A la par");
    await falla(hace(20), "Muy vieja");
    // Una hecha no es fallida.
    await insertar(ana.userId, { dia: hace(2), titulo: "Hecha", completadaEn: ANTES });

    const { fallidas } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(fallidas.total).toBe(4);
    expect(fallidas.ultimas).toEqual([
      { titulo: "Ayer", dia: hace(1) },
      { titulo: "Antes de ayer", dia: hace(3) },
      { titulo: "A la par", dia: hace(5) },
    ]);
  });

  it("avisa las atrasadas que llevan 5 días o más y cuántos faltan para que fallen solas", async () => {
    await insertar(ana.userId, { dia: hace(4), titulo: "Todavía no avisa" });
    await insertar(ana.userId, { dia: hace(5), titulo: "Avisa" });
    await insertar(ana.userId, { dia: hace(7), titulo: "La más vieja" });

    const { porFallar } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(porFallar.total).toBe(2);
    // Con 7 días de atraso se da por fallida mañana (cuando pase de una semana).
    expect(porFallar.primera).toEqual({ titulo: "La más vieja", dia: hace(7), dias: 1 });
  });

  it("separa lo hecho hoy según de qué día era la tarea", async () => {
    const hoyMismo = new Date("2026-10-20T14:00:00.000Z");
    await insertar(ana.userId, { dia: HOY, titulo: "De hoy", completadaEn: hoyMismo });
    await insertar(ana.userId, { dia: HOY, titulo: "De hoy 2", completadaEn: hoyMismo });
    await insertar(ana.userId, { dia: hace(2), titulo: "Atrasada", completadaEn: hoyMismo });
    await insertar(ana.userId, { dia: "2026-10-23", titulo: "Adelantada", completadaEn: hoyMismo });
    // Hecha otro día: no cuenta.
    await insertar(ana.userId, { dia: hace(1), titulo: "De ayer", completadaEn: ANTES });

    const { hechasHoyPorOrigen } = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(hechasHoyPorOrigen).toEqual({ deHoy: 2, atrasadas: 1, adelantadas: 1 });
  });

  it("cuenta las repetitivas por periodicidad, las que fallan solas y nombra las de cada varios días", async () => {
    const base = { titulo: "", notas: "", hora: "" } as const;
    await crearTareaRepetitiva(
      cliente,
      ana.userId,
      { ...base, titulo: "Diaria A", repeticion: "diaria" },
      AHORA,
    );
    await crearTareaRepetitiva(
      cliente,
      ana.userId,
      { ...base, titulo: "Diaria B", repeticion: "diaria", fallaSola: true },
      AHORA,
    );
    await crearTareaRepetitiva(
      cliente,
      ana.userId,
      { ...base, titulo: "Lavar la ropa", repeticion: "intervalo", cadaDias: 2, fechaInicio: HOY },
      AHORA,
    );
    await crearTareaRepetitiva(
      cliente,
      ana.userId,
      {
        ...base,
        titulo: "Fertilizar",
        repeticion: "intervalo",
        cadaDias: 5,
        fechaInicio: "2026-10-22",
      },
      AHORA,
    );

    const datos = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(datos.periodicidades).toEqual(
      expect.arrayContaining([
        { repeticion: "diaria", total: 2 },
        { repeticion: "intervalo", total: 2 },
      ]),
    );
    expect(datos.periodicidades).toHaveLength(2);
    expect(datos.fallanSolas).toBe(1);
    // La que le toca antes primero: la de hoy y después la que empieza en dos días.
    expect(datos.cadaVariosDias).toEqual([
      { titulo: "Lavar la ropa", cadaDias: 2, diasRestantes: 0 },
      { titulo: "Fertilizar", cadaDias: 5, diasRestantes: 2 },
    ]);
  });

  it("una tarea de hoy dada por fallida cuenta en el total del día como no hecha y corta la racha de hoy", async () => {
    const hoyMismo = new Date("2026-10-20T14:00:00.000Z");
    await insertar(ana.userId, { dia: HOY, titulo: "Hecha", completadaEn: hoyMismo });
    // Ayer se hizo todo: la racha solo falta que hoy esté completo.
    await insertar(ana.userId, { dia: hace(1), titulo: "De ayer", completadaEn: ANTES });

    const sinFallar = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(sinFallar).toMatchObject({ hoyHechas: 1, hoyPendientes: 0, hoyFallidas: 0, racha: 2 });

    await insertar(ana.userId, { dia: HOY, titulo: "No llego", falladaEn: hoyMismo });
    const conFallida = await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA);
    expect(conFallida).toMatchObject({ hoyHechas: 1, hoyPendientes: 0, hoyFallidas: 1, racha: 1 });
    // El día de hoy suma la fallida al total (como no hecha).
    expect(conFallida.ultimosDias.at(-1)).toMatchObject({ dia: HOY, total: 2, hechas: 1 });
    // Una fallida de otro día no cuenta como fallida de hoy.
    await insertar(ana.userId, { dia: hace(2), titulo: "Vieja", falladaEn: hoyMismo });
    expect((await obtenerWidgetsDeTareas(cliente, ana.userId, AHORA)).hoyFallidas).toBe(1);
  });

  it("no mezcla las de una persona con las de otra", async () => {
    await insertar(ana.userId, { dia: hace(2), titulo: "Suya", falladaEn: ANTES });
    const { fallidas } = await obtenerWidgetsDeTareas(cliente, beto.userId, AHORA);
    expect(fallidas.total).toBe(0);
  });
});

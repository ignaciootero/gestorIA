// Tests de integración del módulo de tareas (la lista de to-do), contra gestion_test.
//
// La lógica de días se prueba llamando a los servicios con un `ahora` fijo (así "hoy", "mañana" y
// "dentro de una semana" son siempre los mismos); los permisos y las validaciones, por la API en
// rutas/tareas.integracion.test.ts.

import { type ClienteDb, esquema } from "@gestoria/db";
import { type DatosDeTareaRepetitiva, MAXIMO_DE_TAREAS_EN_EL_HISTORIAL } from "@gestoria/shared";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import { entrarComoPersona, type PersonaDePrueba } from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba } from "../../pruebas/entorno-de-prueba.ts";
import { limpiarTareas } from "./limpieza.ts";
import {
  crearTareaRepetitiva,
  editarTareaRepetitiva,
  eliminarTareaRepetitiva,
  InicioEnElPasado,
  LimiteDeTareasRepetitivas,
  listarTareasRepetitivas,
} from "./repetitivas.ts";
import {
  completarTarea,
  crearTarea,
  editarTarea,
  eliminarTarea,
  fallarTarea,
  LimiteDeTareas,
  listarHistorial,
  listarTareasDeHoy,
  TareaEnElPasado,
  TareaFutura,
} from "./tareas.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let beto: PersonaDePrueba;

/** 12:00 en Montevideo (UTC-3) del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");
const HOY = "2026-10-20";
const MS_POR_DIA = 86_400_000;

/** El mismo momento, pero `dias` días después (o antes). */
function enDias(dias: number): Date {
  return new Date(AHORA.getTime() + dias * MS_POR_DIA);
}

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

const suelta = (titulo: string, extra: { fecha?: string; hora?: string; notas?: string } = {}) => ({
  titulo,
  notas: extra.notas ?? "",
  fecha: extra.fecha ?? "",
  hora: extra.hora ?? "",
});

const diaria = (titulo: string, hora = ""): DatosDeTareaRepetitiva => ({
  titulo,
  notas: "",
  repeticion: "diaria",
  hora,
});
const semanal = (titulo: string, ...diasSemana: number[]): DatosDeTareaRepetitiva => ({
  titulo,
  notas: "",
  repeticion: "semanal",
  diasSemana,
  hora: "",
});
const mensual = (titulo: string, diaDelMes: number): DatosDeTareaRepetitiva => ({
  titulo,
  notas: "",
  repeticion: "mensual",
  diaDelMes,
  hora: "",
});
const anual = (titulo: string, diaDelMes: number, mes: number): DatosDeTareaRepetitiva => ({
  titulo,
  notas: "",
  repeticion: "anual",
  diaDelMes,
  mes,
  hora: "",
});

const titulos = (lista: { titulo: string }[]) => lista.map((tarea) => tarea.titulo);

/** Inserta una tarea directo en la base, para armar historiales sin esperar días de verdad. */
async function insertar(
  userId: string,
  fila: Partial<typeof esquema.tareas.$inferInsert> & { dia: string },
) {
  const [creada] = await cliente.db
    .insert(esquema.tareas)
    .values({ userId, titulo: "Tarea", ...fila })
    .returning();
  if (!creada) throw new Error("No se insertó la tarea.");
  return creada;
}

describe("tareas sueltas (de uso único)", () => {
  it("sin día, la tarea es para hoy", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("Comprar pan"), AHORA);
    expect(tarea).toMatchObject({
      titulo: "Comprar pan",
      dia: HOY,
      hora: null,
      notas: null,
      completada: false,
      repetitiva: false,
    });
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.hoy).toBe(HOY);
    expect(titulos(lista.deHoy)).toEqual(["Comprar pan"]);
  });

  it("guarda las notas y la hora", async () => {
    const tarea = await crearTarea(
      cliente,
      ana.userId,
      suelta("Llamar al médico", { hora: "09:30", notas: "Pedir turno" }),
      AHORA,
    );
    expect(tarea).toMatchObject({
      titulo: "Llamar al médico",
      hora: "09:30",
      notas: "Pedir turno",
    });
  });

  it("una tarea de un día futuro no está en hoy: aparece en 'más adelante'", async () => {
    await crearTarea(cliente, ana.userId, suelta("Sacar turno", { fecha: "2026-10-25" }), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.deHoy).toEqual([]);
    expect(titulos(lista.masAdelante)).toEqual(["Sacar turno"]);

    // Ese día pasa a estar en la lista de hoy.
    const ese = await listarTareasDeHoy(cliente, ana.userId, enDias(5));
    expect(titulos(ese.deHoy)).toEqual(["Sacar turno"]);
    expect(ese.masAdelante).toEqual([]);
  });

  it("no se puede crear para un día que ya pasó, pero sí para hoy", async () => {
    await expect(
      crearTarea(cliente, ana.userId, suelta("Ayer", { fecha: "2026-10-19" }), AHORA),
    ).rejects.toBeInstanceOf(TareaEnElPasado);
    await expect(
      crearTarea(cliente, ana.userId, suelta("Hoy", { fecha: HOY }), AHORA),
    ).resolves.toMatchObject({ dia: HOY });
  });

  it("'hoy' es el de la zona horaria de la persona, no el de UTC", async () => {
    // A las 02:00 UTC del 21 todavía es el 20 en Montevideo...
    const casiMedianoche = new Date("2026-10-21T02:00:00.000Z");
    const tarea = await crearTarea(cliente, ana.userId, suelta("Madrugada"), casiMedianoche);
    expect(tarea.dia).toBe("2026-10-20");

    // ...y para alguien en Tokio (UTC+9) ya es el 21.
    await cliente.db
      .update(esquema.usuarios)
      .set({ zonaHoraria: "Asia/Tokyo" })
      .where(eq(esquema.usuarios.id, beto.userId));
    const enTokio = await crearTarea(
      cliente,
      beto.userId,
      suelta("Mañana temprano"),
      casiMedianoche,
    );
    expect(enTokio.dia).toBe("2026-10-21");
  });

  it("ordena por hora, con las de todo el día primero", async () => {
    await crearTarea(cliente, ana.userId, suelta("Tarde", { hora: "18:00" }), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Todo el día"), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Temprano", { hora: "07:15" }), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.deHoy)).toEqual(["Todo el día", "Temprano", "Tarde"]);
  });

  it("a igual hora, mantiene el orden en que se agregaron", async () => {
    for (const titulo of ["Primera", "Segunda", "Tercera"]) {
      await crearTarea(cliente, ana.userId, suelta(titulo), AHORA);
    }
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.deHoy)).toEqual(["Primera", "Segunda", "Tercera"]);
  });

  it("limita cuántas tareas sueltas pendientes se pueden juntar", async () => {
    await cliente.db
      .insert(esquema.tareas)
      .values(
        Array.from({ length: 500 }, (_, i) => ({ userId: ana.userId, titulo: `T${i}`, dia: HOY })),
      );
    await expect(crearTarea(cliente, ana.userId, suelta("Una más"), AHORA)).rejects.toBeInstanceOf(
      LimiteDeTareas,
    );
    // Las completadas no cuentan: al hacer una se libera lugar.
    const [una] = await cliente.db.select().from(esquema.tareas).limit(1);
    await completarTarea(cliente, ana.userId, una?.id ?? "", true, AHORA);
    await expect(crearTarea(cliente, ana.userId, suelta("Ahora sí"), AHORA)).resolves.toBeTruthy();
  });
});

describe("completar", () => {
  it("al tildarla sale de la lista de hoy y pasa a 'hechas hoy'; al destildarla vuelve", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("Lavar los platos"), AHORA);

    const hecha = await completarTarea(cliente, ana.userId, tarea.id, true, AHORA);
    expect(hecha).toMatchObject({ completada: true });
    expect(hecha?.completadaEn).toEqual(AHORA);
    let lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.deHoy).toEqual([]);
    expect(titulos(lista.hechasHoy)).toEqual(["Lavar los platos"]);

    const deshecha = await completarTarea(cliente, ana.userId, tarea.id, false, AHORA);
    expect(deshecha).toMatchObject({ completada: false, completadaEn: null });
    lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.deHoy)).toEqual(["Lavar los platos"]);
    expect(lista.hechasHoy).toEqual([]);
  });

  it("tildar algo ya tildado no cambia cuándo se hizo", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("Pagar"), AHORA);
    await completarTarea(cliente, ana.userId, tarea.id, true, AHORA);
    const otra = await completarTarea(cliente, ana.userId, tarea.id, true, enDias(1));
    expect(otra?.completadaEn).toEqual(AHORA);
  });

  it("una tarea hecha ayer ya no figura entre las hechas de hoy", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("Ayer"), AHORA);
    await completarTarea(cliente, ana.userId, tarea.id, true, AHORA);
    const manana = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(manana.hechasHoy).toEqual([]);
  });

  it("'hoy' para las hechas también se mide en la zona de la persona", async () => {
    const a = await crearTarea(cliente, ana.userId, suelta("A"), AHORA);
    const b = await crearTarea(cliente, ana.userId, suelta("B"), AHORA);
    // 02:00 UTC del 21 son las 23:00 del 20 en Montevideo: todavía es hoy.
    await completarTarea(cliente, ana.userId, a.id, true, new Date("2026-10-21T02:00:00.000Z"));
    // 03:00 UTC del 21 es la medianoche local: ya es otro día.
    await completarTarea(cliente, ana.userId, b.id, true, new Date("2026-10-21T03:00:00.000Z"));
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.hechasHoy)).toEqual(["A"]);
  });

  it("las más recientes van primero entre las hechas", async () => {
    const a = await crearTarea(cliente, ana.userId, suelta("Primera"), AHORA);
    const b = await crearTarea(cliente, ana.userId, suelta("Segunda"), AHORA);
    await completarTarea(cliente, ana.userId, a.id, true, new Date("2026-10-20T14:00:00.000Z"));
    await completarTarea(cliente, ana.userId, b.id, true, new Date("2026-10-20T15:30:00.000Z"));
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.hechasHoy)).toEqual(["Segunda", "Primera"]);
  });

  it("devuelve null con una tarea que no existe", async () => {
    expect(
      await completarTarea(
        cliente,
        ana.userId,
        "00000000-0000-4000-8000-000000000000",
        true,
        AHORA,
      ),
    ).toBeNull();
  });
});

describe("tareas atrasadas", () => {
  it("una tarea suelta que no se hizo se arrastra a los días siguientes hasta completarla", async () => {
    await crearTarea(cliente, ana.userId, suelta("Renovar la cédula"), AHORA);

    const tresDiasDespues = await listarTareasDeHoy(cliente, ana.userId, enDias(3));
    expect(titulos(tresDiasDespues.atrasadas)).toEqual(["Renovar la cédula"]);
    expect(tresDiasDespues.deHoy).toEqual([]);

    const tarea = tresDiasDespues.atrasadas[0];
    await completarTarea(cliente, ana.userId, tarea?.id ?? "", true, enDias(3));
    const despues = await listarTareasDeHoy(cliente, ana.userId, enDias(3));
    expect(despues.atrasadas).toEqual([]);
    // Hecha hoy, aunque fuera de un día anterior.
    expect(titulos(despues.hechasHoy)).toEqual(["Renovar la cédula"]);
    // Y ya no vuelve nunca más.
    const unaSemanaDespues = await listarTareasDeHoy(cliente, ana.userId, enDias(10));
    expect(unaSemanaDespues.atrasadas).toEqual([]);
  });

  it("las atrasadas van antes que las de hoy, la más vieja primero", async () => {
    await crearTarea(cliente, ana.userId, suelta("Vieja"), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Del 22", { fecha: "2026-10-22" }), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Del 23", { fecha: "2026-10-23" }), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(4)); // 24 de octubre
    expect(titulos(lista.atrasadas)).toEqual(["Vieja", "Del 22", "Del 23"]);
  });

  it("una tarea repetitiva que quedó sin hacer también se arrastra como atrasada", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Tomar la vitamina"), AHORA);
    const manana = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(titulos(manana.atrasadas)).toEqual(["Tomar la vitamina"]);
    expect(manana.atrasadas[0]).toMatchObject({ dia: HOY, repetitiva: true, fallida: false });
    // La de hoy es una nueva.
    expect(titulos(manana.deHoy)).toEqual(["Tomar la vitamina"]);
    expect(manana.deHoy[0]?.dia).toBe("2026-10-21");
  });

  it("las atrasadas de varios días se ordenan por día: las más viejas primero", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Rutina"), AHORA);
    await crearTarea(cliente, ana.userId, suelta("Suelta"), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(2));
    expect(lista.atrasadas.map((tarea) => [tarea.titulo, tarea.dia])).toEqual([
      ["Rutina", "2026-10-20"],
      ["Suelta", "2026-10-20"],
      ["Rutina", "2026-10-21"],
    ]);
  });
});

describe("repetitivas cada tantos días", () => {
  const cada = (
    titulo: string,
    cadaDias: number,
    fechaInicio = "",
    hora = "",
  ): DatosDeTareaRepetitiva => ({
    titulo,
    notas: "",
    repeticion: "intervalo",
    cadaDias,
    fechaInicio,
    hora,
  });

  it("sin inicio, empieza hoy: aparece hoy y la próxima vez es hoy", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, cada("Día por medio", 2), AHORA);
    expect(creada).toMatchObject({
      repeticion: "intervalo",
      cadaDias: 2,
      fechaInicio: HOY,
      proximaFecha: HOY,
      diasRestantes: 0,
    });
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.deHoy)).toEqual(["Día por medio"]);
  });

  it("con un inicio futuro no aparece antes: dice cuándo le toca y aparece ese día", async () => {
    const creada = await crearTareaRepetitiva(
      cliente,
      ana.userId,
      cada("Más tarde", 3, "2026-10-23"),
      AHORA,
    );
    expect(creada).toMatchObject({ fechaInicio: "2026-10-23", diasRestantes: 3 });
    expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toEqual([]);
    expect((await listarTareasDeHoy(cliente, ana.userId, enDias(2))).deHoy).toEqual([]);
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, enDias(3))).deHoy)).toEqual([
      "Más tarde",
    ]);
  });

  it("día por medio: arma solo un día sí y uno no", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, cada("Alterna", 2), AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(6));
    const dias = (await cliente.db.select().from(esquema.tareas)).map((fila) => fila.dia).sort();
    expect(dias).toEqual(["2026-10-20", "2026-10-22", "2026-10-24", "2026-10-26"]);
  });

  it("cada 3 días, y con hora", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, cada("Cada tres", 3, "", "08:30"), AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(7));
    const filas = await cliente.db.select().from(esquema.tareas);
    expect(filas.map((fila) => fila.dia).sort()).toEqual([
      "2026-10-20",
      "2026-10-23",
      "2026-10-26",
    ]);
    expect(filas.every((fila) => fila.hora === "08:30:00")).toBe(true);
  });

  it("al volver tras varios días, las que faltaron quedan atrasadas (solo los días que le tocaban)", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, cada("Alterna", 2), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(5));
    // Tocaba el 20, 22 y 24; hoy es el 25 y no le toca.
    expect(lista.atrasadas.map((tarea) => tarea.dia)).toEqual([
      "2026-10-20",
      "2026-10-22",
      "2026-10-24",
    ]);
    expect(lista.deHoy).toEqual([]);
  });

  it("no puede empezar en un día que ya pasó", async () => {
    await expect(
      crearTareaRepetitiva(cliente, ana.userId, cada("Vieja", 2, "2026-10-19"), AHORA),
    ).rejects.toBeInstanceOf(InicioEnElPasado);
    expect(await cliente.db.select().from(esquema.tareasRepetitivas)).toEqual([]);
  });

  it("al editar, cambia cada cuántos días y conserva el inicio (aunque ya haya pasado)", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, cada("Alterna", 2), AHORA);
    const editada = await editarTareaRepetitiva(
      cliente,
      ana.userId,
      creada.id,
      cada("Alterna", 3, HOY),
      enDias(1),
    );
    expect(editada).toMatchObject({ cadaDias: 3, fechaInicio: HOY });
    // Cambiar a otro inicio pasado sí se rechaza.
    await expect(
      editarTareaRepetitiva(
        cliente,
        ana.userId,
        creada.id,
        cada("Alterna", 3, "2026-10-10"),
        enDias(1),
      ),
    ).rejects.toBeInstanceOf(InicioEnElPasado);
  });

  it("al editar rige desde hoy y respeta el nuevo inicio: lo pendiente de hoy se vuelve a armar", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, cada("Alterna", 2), AHORA);
    await editarTareaRepetitiva(
      cliente,
      ana.userId,
      creada.id,
      cada("Alterna", 2, "2026-10-22"),
      AHORA,
    );
    expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toEqual([]);
    expect(await cliente.db.select().from(esquema.tareas)).toEqual([]);
  });

  it("cambiar de tipo limpia los campos del intervalo", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, cada("Cambia", 4), AHORA);
    const ahora = await editarTareaRepetitiva(
      cliente,
      ana.userId,
      creada.id,
      diaria("Cambia"),
      AHORA,
    );
    expect(ahora).toMatchObject({ repeticion: "diaria", cadaDias: null, fechaInicio: null });
  });

  it("la base no admite un intervalo incompleto o fuera de rango", async () => {
    for (const valores of [
      { repeticion: "intervalo" },
      { repeticion: "intervalo", cadaDias: 1, fechaInicio: HOY },
      { repeticion: "intervalo", cadaDias: 366, fechaInicio: HOY },
      { repeticion: "diaria", cadaDias: 2, fechaInicio: HOY },
    ]) {
      await expect(
        cliente.db
          .insert(esquema.tareasRepetitivas)
          .values({ userId: ana.userId, titulo: "X", desde: HOY, ...valores }),
      ).rejects.toThrow();
    }
  });

  it("puede fallar sola igual que las demás", async () => {
    await crearTareaRepetitiva(
      cliente,
      ana.userId,
      { ...cada("Alterna", 2), fallaSola: true },
      AHORA,
    );
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(3));
    expect(lista.atrasadas).toEqual([]);
    const filas = await cliente.db.select().from(esquema.tareas);
    expect(
      filas
        .filter((fila) => fila.falladaEn !== null)
        .map((fila) => fila.dia)
        .sort(),
    ).toEqual(["2026-10-20", "2026-10-22"]);
  });
});

describe("repetitivas que se dan por fallidas solas", () => {
  const sola = (titulo: string): DatosDeTareaRepetitiva => ({ ...diaria(titulo), fallaSola: true });

  it("por defecto no: queda como atrasada", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, diaria("Normal"), AHORA);
    expect(creada.fallaSola).toBe(false);
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(2));
    expect(lista.atrasadas).toHaveLength(2);
    expect(lista.falladasHoy).toEqual([]);
  });

  it("al pasar el día sin completarse, la tarea queda fallida y no atrasada", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    expect(creada.fallaSola).toBe(true);
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(2));
    expect(lista.atrasadas).toEqual([]);
    // Las de los días anteriores fallaron al terminar su día: no son de "hoy".
    expect(lista.falladasHoy).toEqual([]);
    expect(titulos(lista.deHoy)).toEqual(["Regar"]);
    expect(lista.deHoy[0]?.dia).toBe("2026-10-22");
    const filas = await cliente.db.select().from(esquema.tareas);
    const viejas = filas.filter((fila) => fila.dia < "2026-10-22");
    expect(viejas).toHaveLength(2);
    expect(viejas.every((fila) => fila.falladaEn !== null && fila.completadaEn === null)).toBe(
      true,
    );
  });

  it("falla al final de su propio día (en la zona de la persona), no al leer", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    const [vieja] = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.dia, HOY));
    // 23:59:59 del 20 de octubre en Montevideo (UTC-3) = 02:59:59 UTC del 21.
    expect(vieja?.falladaEn).toEqual(new Date("2026-10-21T02:59:59.000Z"));
  });

  it("lo que ya se completó no se toca", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    const [hoy] = await cliente.db.select().from(esquema.tareas);
    await completarTarea(cliente, ana.userId, hoy?.id ?? "", true, AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    const despues = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.dia, HOY));
    expect(despues[0]).toMatchObject({ falladaEn: null });
    expect(despues[0]?.completadaEn).not.toBeNull();
  });

  it("la de hoy no falla hasta que pase el día", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.deHoy)).toEqual(["Regar"]);
    expect(lista.falladasHoy).toEqual([]);
  });

  it("el historial las muestra como fallidas, en el día que les tocaba", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    const historial = await listarHistorial(cliente, ana.userId, { ahora: enDias(2) });
    expect(historial.dias.map((dia) => [dia.dia, dia.hechas, dia.falladas])).toEqual([
      ["2026-10-21", 0, 1],
      ["2026-10-20", 0, 1],
    ]);
  });

  it("si la persona deshace una fallida automática, no vuelve a fallar sola", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    const [vieja] = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.dia, HOY));
    await fallarTarea(cliente, ana.userId, vieja?.id ?? "", false, enDias(1));
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(titulos(lista.atrasadas)).toEqual(["Regar"]);
    // Y al leer de nuevo sigue atrasada.
    expect((await listarTareasDeHoy(cliente, ana.userId, enDias(1))).atrasadas).toHaveLength(1);
  });

  it("si se destilda una ya completada, queda pendiente y no falla sola", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    const [hoy] = await cliente.db.select().from(esquema.tareas);
    await completarTarea(cliente, ana.userId, hoy?.id ?? "", true, AHORA);
    await completarTarea(cliente, ana.userId, hoy?.id ?? "", false, enDias(1));
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(titulos(lista.atrasadas)).toEqual(["Regar"]);
  });

  it("solo afecta a las tareas que copiaron la opción: cambiar la regla rige desde hoy", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    // Se apaga: lo ya armado (hoy) se vuelve a armar sin la opción.
    await editarTareaRepetitiva(
      cliente,
      ana.userId,
      creada.id,
      { ...diaria("Regar"), fallaSola: false },
      AHORA,
    );
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(2));
    expect(titulos(lista.atrasadas)).toEqual(["Regar", "Regar"]);
  });

  it("al editar sin indicar la opción, se conserva", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, sola("Regar"), AHORA);
    const editada = await editarTareaRepetitiva(
      cliente,
      ana.userId,
      creada.id,
      diaria("Regar 2"),
      AHORA,
    );
    expect(editada?.fallaSola).toBe(true);
  });

  it("las tareas de otra persona no se tocan", async () => {
    await crearTareaRepetitiva(cliente, beto.userId, sola("De Beto"), AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(3));
    const filas = await cliente.db.select().from(esquema.tareas);
    expect(filas.every((fila) => fila.falladaEn === null)).toBe(true);
  });
});

describe("atrasadas de más de una semana", () => {
  // Hoy es el 20 de octubre: una tarea del 13 lleva 7 días atrasada (todavía no), una del 12, más de una semana.
  it("pasada una semana como atrasada, se da por fallida sola; antes no", async () => {
    await insertar(ana.userId, { dia: "2026-10-13", titulo: "Todavía atrasada" });
    await insertar(ana.userId, { dia: "2026-10-12", titulo: "Ya venció" });
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.atrasadas)).toEqual(["Todavía atrasada"]);
    // Falló al final del día en que se cumplió la semana (el 19), así no es una fallida "de hoy".
    expect(lista.falladasHoy).toEqual([]);
    const [vencida] = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.titulo, "Ya venció"));
    expect(vencida?.falladaEn).toEqual(new Date("2026-10-20T02:59:59.000Z"));
  });

  it("también las de una repetitiva", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Rutina"), AHORA);
    // Doce días después, las de los primeros días ya llevan más de una semana atrasadas.
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(12));
    const dias = lista.atrasadas.map((tarea) => tarea.dia);
    expect(dias[0]).toBe("2026-10-25");
    const filas = await cliente.db.select().from(esquema.tareas);
    const falladas = filas.filter((fila) => fila.falladaEn !== null).map((fila) => fila.dia);
    expect(falladas.sort()).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
    ]);
  });

  it("no toca lo completado, lo de hoy ni lo eliminado, y es idempotente", async () => {
    await insertar(ana.userId, { dia: "2026-10-01", titulo: "Hecha", completadaEn: AHORA });
    await insertar(ana.userId, { dia: "2026-10-01", titulo: "Eliminada", eliminadoEn: AHORA });
    await insertar(ana.userId, { dia: HOY, titulo: "De hoy" });
    await listarTareasDeHoy(cliente, ana.userId, AHORA);
    const filas = await cliente.db.select().from(esquema.tareas);
    expect(filas.every((fila) => fila.falladaEn === null)).toBe(true);

    await insertar(ana.userId, { dia: "2026-10-05", titulo: "Vieja" });
    await listarTareasDeHoy(cliente, ana.userId, AHORA);
    const [primera] = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.titulo, "Vieja"));
    await listarTareasDeHoy(cliente, ana.userId, enDias(3));
    const [segunda] = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.titulo, "Vieja"));
    expect(segunda?.falladaEn).toEqual(primera?.falladaEn);
  });

  it("al deshacer la fallida automática arranca otra semana: no vuelve a fallar enseguida", async () => {
    const vieja = await insertar(ana.userId, { dia: "2026-10-05", titulo: "Vieja" });
    await listarTareasDeHoy(cliente, ana.userId, AHORA);
    const revivida = await fallarTarea(cliente, ana.userId, vieja.id, false, AHORA);
    expect(revivida).toMatchObject({ fallida: false });
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, AHORA)).atrasadas)).toEqual([
      "Vieja",
    ]);
    // Una semana después sigue atrasada (todavía no pasó más de una semana desde que la revivió)...
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, enDias(7))).atrasadas)).toEqual([
      "Vieja",
    ]);
    // ...y al día siguiente ya falla, al final del día en que se cumplió la semana.
    const despues = await listarTareasDeHoy(cliente, ana.userId, enDias(8));
    expect(despues.atrasadas).toEqual([]);
    const [fila] = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.titulo, "Vieja"));
    expect(fila?.falladaEn).toEqual(new Date("2026-10-28T02:59:59.000Z"));
  });

  it("destildar una completada vieja también arranca otra semana", async () => {
    const vieja = await insertar(ana.userId, {
      dia: "2026-10-01",
      titulo: "Vieja",
      completadaEn: AHORA,
    });
    await completarTarea(cliente, ana.userId, vieja.id, false, AHORA);
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, AHORA)).atrasadas)).toEqual([
      "Vieja",
    ]);
  });

  it("devolver a pendiente algo que ya lo estaba no reinicia la cuenta", async () => {
    const vieja = await insertar(ana.userId, { dia: "2026-10-15", titulo: "Vieja" });
    await completarTarea(cliente, ana.userId, vieja.id, false, AHORA);
    const [fila] = await cliente.db.select().from(esquema.tareas);
    expect(fila?.reactivadaEn).toBeNull();
  });

  it("las tareas de otra persona no se tocan", async () => {
    await insertar(beto.userId, { dia: "2026-10-01", titulo: "De Beto" });
    await listarTareasDeHoy(cliente, ana.userId, AHORA);
    const [fila] = await cliente.db.select().from(esquema.tareas);
    expect(fila?.falladaEn).toBeNull();
  });
});

describe("tareas fallidas", () => {
  it("una atrasada se puede marcar como fallida y sale de las atrasadas", async () => {
    const vieja = await insertar(ana.userId, { dia: "2026-10-15", titulo: "Vieja" });
    const fallida = await fallarTarea(cliente, ana.userId, vieja.id, true, AHORA);
    expect(fallida).toMatchObject({ fallida: true, completada: false, completadaEn: null });
    expect(fallida?.falladaEn).toEqual(AHORA);

    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.atrasadas).toEqual([]);
    expect(titulos(lista.falladasHoy)).toEqual(["Vieja"]);
    expect(lista.hechasHoy).toEqual([]);
  });

  it("también una atrasada de repetitiva", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Regar"), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    const ayer = lista.atrasadas[0];
    expect(ayer).toBeDefined();
    await fallarTarea(cliente, ana.userId, ayer?.id ?? "", true, enDias(1));
    const despues = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
    expect(despues.atrasadas).toEqual([]);
    expect(titulos(despues.falladasHoy)).toEqual(["Regar"]);
    // La de hoy sigue pendiente.
    expect(titulos(despues.deHoy)).toEqual(["Regar"]);
  });

  it("se puede deshacer: vuelve a ser una atrasada", async () => {
    const vieja = await insertar(ana.userId, { dia: "2026-10-15" });
    await fallarTarea(cliente, ana.userId, vieja.id, true, AHORA);
    const vuelta = await fallarTarea(cliente, ana.userId, vieja.id, false, AHORA);
    expect(vuelta).toMatchObject({ fallida: false, falladaEn: null });
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.atrasadas).toHaveLength(1);
    expect(lista.falladasHoy).toEqual([]);
  });

  it("una tarea de un día futuro todavía no puede fallar", async () => {
    const futura = await crearTarea(
      cliente,
      ana.userId,
      suelta("Luego", { fecha: "2026-10-25" }),
      AHORA,
    );
    await expect(fallarTarea(cliente, ana.userId, futura.id, true, AHORA)).rejects.toBeInstanceOf(
      TareaFutura,
    );
    // Y no quedó marcada.
    const filas = await cliente.db.select().from(esquema.tareas);
    expect(filas.every((fila) => fila.falladaEn === null)).toBe(true);
  });

  it("una tarea de hoy puede fallar: sale de 'Para hoy', queda en 'Fallidas hoy' y se puede deshacer", async () => {
    const deHoy = await crearTarea(cliente, ana.userId, suelta("Hoy"), AHORA);
    const fallada = await fallarTarea(cliente, ana.userId, deHoy.id, true, AHORA);
    expect(fallada).toMatchObject({ fallida: true, completada: false });

    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.deHoy).toEqual([]);
    expect(lista.falladasHoy.map((t) => [t.titulo, t.dia])).toEqual([["Hoy", "2026-10-20"]]);

    // Deshacerla la devuelve a "Para hoy".
    await fallarTarea(cliente, ana.userId, deHoy.id, false, AHORA);
    const vuelta = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(vuelta.deHoy.map((t) => t.titulo)).toEqual(["Hoy"]);
    expect(vuelta.falladasHoy).toEqual([]);
  });

  it("al día siguiente, una de hoy que se dio por fallida ya no aparece en 'Fallidas hoy' y cuenta en el historial", async () => {
    const deHoy = await crearTarea(cliente, ana.userId, suelta("Hoy"), AHORA);
    await fallarTarea(cliente, ana.userId, deHoy.id, true, AHORA);
    const manana = enDias(1);
    const lista = await listarTareasDeHoy(cliente, ana.userId, manana);
    expect(lista.falladasHoy).toEqual([]);
    expect(lista.atrasadas).toEqual([]);
    const historial = await listarHistorial(cliente, ana.userId, { ahora: manana });
    expect(historial.dias[0]).toMatchObject({ dia: "2026-10-20", falladas: 1 });
  });

  it("una de hoy que pasó a ser de ayer sí puede fallar", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("De ayer"), AHORA);
    expect((await fallarTarea(cliente, ana.userId, tarea.id, true, enDias(1)))?.fallida).toBe(true);
  });

  it("marcar como fallida algo ya fallido no cambia cuándo se marcó", async () => {
    const vieja = await insertar(ana.userId, { dia: "2026-10-15" });
    await fallarTarea(cliente, ana.userId, vieja.id, true, AHORA);
    const otra = await fallarTarea(cliente, ana.userId, vieja.id, true, enDias(1));
    expect(otra?.falladaEn).toEqual(AHORA);
  });

  it("marcar como fallida una completada la deja solo fallida", async () => {
    const vieja = await insertar(ana.userId, { dia: "2026-10-15", completadaEn: AHORA });
    const fallida = await fallarTarea(cliente, ana.userId, vieja.id, true, AHORA);
    expect(fallida).toMatchObject({ fallida: true, completada: false, completadaEn: null });
  });

  it("completar una fallida la pasa a completada y deja de ser fallida", async () => {
    const vieja = await insertar(ana.userId, { dia: "2026-10-15", titulo: "Vieja" });
    await fallarTarea(cliente, ana.userId, vieja.id, true, AHORA);
    const hecha = await completarTarea(cliente, ana.userId, vieja.id, true, AHORA);
    expect(hecha).toMatchObject({ completada: true, fallida: false, falladaEn: null });
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.hechasHoy)).toEqual(["Vieja"]);
    expect(lista.falladasHoy).toEqual([]);
  });

  it("la base no admite una tarea completada y fallida a la vez", async () => {
    await expect(
      insertar(ana.userId, { dia: "2026-10-15", completadaEn: AHORA, falladaEn: AHORA }),
    ).rejects.toThrow();
  });

  it("falladasHoy son las marcadas hoy, no las de otros días", async () => {
    await insertar(ana.userId, { dia: "2026-10-10", titulo: "De ayer", falladaEn: enDias(-1) });
    await insertar(ana.userId, { dia: "2026-10-10", titulo: "De hoy", falladaEn: AHORA });
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.falladasHoy)).toEqual(["De hoy"]);
  });

  it("no existe, es de otra persona o está eliminada: devuelve null", async () => {
    const ajena = await insertar(beto.userId, { dia: "2026-10-15" });
    expect(await fallarTarea(cliente, ana.userId, ajena.id, true, AHORA)).toBeNull();
    const eliminada = await insertar(ana.userId, { dia: "2026-10-15", eliminadoEn: AHORA });
    expect(await fallarTarea(cliente, ana.userId, eliminada.id, true, AHORA)).toBeNull();
    expect(
      await fallarTarea(cliente, ana.userId, "00000000-0000-4000-8000-000000000000", true, AHORA),
    ).toBeNull();
  });

  it("una fallida no cuenta para el límite de tareas pendientes", async () => {
    const vieja = await insertar(ana.userId, { dia: "2026-10-15" });
    await fallarTarea(cliente, ana.userId, vieja.id, true, AHORA);
    const pendientes = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(and(eq(esquema.tareas.userId, ana.userId), isNull(esquema.tareas.falladaEn)));
    expect(pendientes).toEqual([]);
  });

  it("el historial muestra lo fallido, lo hecho y lo pendiente de cada día, y cuenta cada cosa", async () => {
    await insertar(ana.userId, { dia: "2026-10-15", titulo: "Fallida", falladaEn: AHORA });
    await insertar(ana.userId, { dia: "2026-10-15", titulo: "Hecha", completadaEn: AHORA });
    await insertar(ana.userId, { dia: "2026-10-15", titulo: "Pendiente" });
    const historial = await listarHistorial(cliente, ana.userId, { ahora: AHORA });
    expect(historial.dias[0]).toMatchObject({ dia: "2026-10-15", hechas: 1, falladas: 1 });
    expect(titulos(historial.dias[0]?.tareas ?? []).sort()).toEqual([
      "Fallida",
      "Hecha",
      "Pendiente",
    ]);
    const porTitulo = Object.fromEntries(
      (historial.dias[0]?.tareas ?? []).map((tarea) => [tarea.titulo, tarea]),
    );
    expect(porTitulo["Fallida"]).toMatchObject({ fallida: true, completada: false });
    expect(porTitulo["Pendiente"]).toMatchObject({ fallida: false, completada: false });
  });

  it("la limpieza borra lo fallido más viejo que el historial, y no lo reciente", async () => {
    await insertar(ana.userId, { dia: "2025-01-01", titulo: "Muy vieja", falladaEn: AHORA });
    await insertar(ana.userId, { dia: "2026-10-10", titulo: "Reciente", falladaEn: AHORA });
    await limpiarTareas(cliente, AHORA);
    const quedan = await cliente.db.select().from(esquema.tareas);
    expect(titulos(quedan)).toEqual(["Reciente"]);
  });
});

describe("editar", () => {
  it("cambia título, notas, hora y día de una tarea suelta", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("Original"), AHORA);
    const editada = await editarTarea(
      cliente,
      ana.userId,
      tarea.id,
      suelta("Cambiada", { fecha: "2026-10-30", hora: "10:00", notas: "Con notas" }),
      AHORA,
    );
    expect(editada).toMatchObject({
      titulo: "Cambiada",
      dia: "2026-10-30",
      hora: "10:00",
      notas: "Con notas",
    });
  });

  it("sin día conserva el que tenía, y se pueden borrar la hora y las notas", async () => {
    const tarea = await crearTarea(
      cliente,
      ana.userId,
      suelta("Con todo", { fecha: "2026-10-28", hora: "08:00", notas: "algo" }),
      AHORA,
    );
    const editada = await editarTarea(cliente, ana.userId, tarea.id, suelta("Con todo"), AHORA);
    expect(editada).toMatchObject({ dia: "2026-10-28", hora: null, notas: null });
  });

  it("no se puede mover a un día pasado, pero una atrasada conserva su día", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("Se atrasó"), AHORA);
    await expect(
      editarTarea(cliente, ana.userId, tarea.id, suelta("X", { fecha: "2026-10-01" }), enDias(3)),
    ).rejects.toBeInstanceOf(TareaEnElPasado);
    // Editar solo el título, con el mismo día (ya pasado) que tenía, está permitido.
    const editada = await editarTarea(
      cliente,
      ana.userId,
      tarea.id,
      suelta("Se atrasó mucho", { fecha: HOY }),
      enDias(3),
    );
    expect(editada).toMatchObject({ titulo: "Se atrasó mucho", dia: HOY });
  });

  it("una tarea que salió de una repetitiva conserva su día aunque se mande otro", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Estirar"), AHORA);
    const [hoy] = (await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy;
    const editada = await editarTarea(
      cliente,
      ana.userId,
      hoy?.id ?? "",
      suelta("Estirar mucho", { fecha: "2026-11-30" }),
      AHORA,
    );
    expect(editada).toMatchObject({ titulo: "Estirar mucho", dia: HOY, repetitiva: true });
  });

  it("devuelve null con una tarea que no existe o eliminada", async () => {
    expect(
      await editarTarea(
        cliente,
        ana.userId,
        "00000000-0000-4000-8000-000000000000",
        suelta("X"),
        AHORA,
      ),
    ).toBeNull();
    const tarea = await crearTarea(cliente, ana.userId, suelta("Se va"), AHORA);
    await eliminarTarea(cliente, ana.userId, tarea.id, AHORA);
    expect(await editarTarea(cliente, ana.userId, tarea.id, suelta("X"), AHORA)).toBeNull();
  });
});

describe("eliminar", () => {
  it("es un borrado lógico: deja de verse, pero la fila sigue con su fecha de eliminación", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("Descartada"), AHORA);
    expect(await eliminarTarea(cliente, ana.userId, tarea.id, AHORA)).toBe(true);
    expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toEqual([]);
    const fila = await cliente.db.query.tareas.findFirst({
      where: (tabla, { eq: igual }) => igual(tabla.id, tarea.id),
    });
    expect(fila?.eliminadoEn).toEqual(AHORA);
  });

  it("eliminar dos veces o algo que no existe da false", async () => {
    const tarea = await crearTarea(cliente, ana.userId, suelta("Una vez"), AHORA);
    expect(await eliminarTarea(cliente, ana.userId, tarea.id, AHORA)).toBe(true);
    expect(await eliminarTarea(cliente, ana.userId, tarea.id, AHORA)).toBe(false);
    expect(
      await eliminarTarea(cliente, ana.userId, "00000000-0000-4000-8000-000000000000", AHORA),
    ).toBe(false);
  });

  it("una tarea repetitiva eliminada por hoy no se vuelve a armar", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Regar"), AHORA);
    const [hoy] = (await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy;
    await eliminarTarea(cliente, ana.userId, hoy?.id ?? "", AHORA);
    expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toEqual([]);
    // Mañana sí hay una nueva: la regla sigue vigente.
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, enDias(1))).deHoy)).toEqual([
      "Regar",
    ]);
  });
});

describe("privacidad entre personas", () => {
  it("cada persona ve solo lo suyo y no puede tocar lo de otra", async () => {
    const deAna = await crearTarea(cliente, ana.userId, suelta("Secreto de Ana"), AHORA);
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Rutina de Ana"), AHORA);

    const listaDeBeto = await listarTareasDeHoy(cliente, beto.userId, AHORA);
    expect(listaDeBeto.deHoy).toEqual([]);
    expect(await listarTareasRepetitivas(cliente, beto.userId, AHORA)).toEqual([]);
    expect((await listarHistorial(cliente, beto.userId, { ahora: enDias(3) })).dias).toEqual([]);

    expect(await completarTarea(cliente, beto.userId, deAna.id, true, AHORA)).toBeNull();
    expect(await editarTarea(cliente, beto.userId, deAna.id, suelta("Hackeada"), AHORA)).toBeNull();
    expect(await eliminarTarea(cliente, beto.userId, deAna.id, AHORA)).toBe(false);

    const [repetitiva] = await listarTareasRepetitivas(cliente, ana.userId, AHORA);
    expect(
      await editarTareaRepetitiva(cliente, beto.userId, repetitiva?.id ?? "", diaria("X"), AHORA),
    ).toBeNull();
    expect(await eliminarTareaRepetitiva(cliente, beto.userId, repetitiva?.id ?? "", AHORA)).toBe(
      false,
    );

    // Y lo de Ana sigue intacto.
    const intacta = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(intacta.deHoy)).toEqual(["Secreto de Ana", "Rutina de Ana"]);
  });
});

describe("tareas repetitivas", () => {
  it("una diaria aparece hoy enseguida, sin inventar el pasado ni el futuro", async () => {
    const repetitiva = await crearTareaRepetitiva(cliente, ana.userId, diaria("Tomar agua"), AHORA);
    expect(repetitiva).toMatchObject({ repeticion: "diaria", proximaFecha: HOY, diasRestantes: 0 });

    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.deHoy).toMatchObject([{ titulo: "Tomar agua", repetitiva: true, dia: HOY }]);
    expect(lista.masAdelante).toEqual([]);
    const filas = await cliente.db.select().from(esquema.tareas);
    expect(filas).toHaveLength(1); // nada de días pasados ni futuros
  });

  it("cada día arma la suya, y las de días anteriores quedan como historial", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Caminar"), AHORA);
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, enDias(1))).deHoy)).toEqual([
      "Caminar",
    ]);
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, enDias(2))).deHoy)).toEqual([
      "Caminar",
    ]);
    expect(await cliente.db.select().from(esquema.tareas)).toHaveLength(3);
  });

  it("listar muchas veces no duplica las tareas", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Una por día"), AHORA);
    for (let i = 0; i < 3; i++) await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(await cliente.db.select().from(esquema.tareas)).toHaveLength(1);
  });

  it("dos pedidos a la vez tampoco duplican", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Carrera"), AHORA);
    await Promise.all(
      Array.from({ length: 8 }, () => listarTareasDeHoy(cliente, ana.userId, enDias(2))),
    );
    // Hoy, mañana y pasado: una por día.
    expect(await cliente.db.select().from(esquema.tareas)).toHaveLength(3);
  });

  it("una semanal solo aparece el día de la semana elegido", async () => {
    // El 20 de octubre de 2026 es martes (2): una del miércoles (3) no está hoy.
    await crearTareaRepetitiva(cliente, ana.userId, semanal("Feria", 3), AHORA);
    expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toEqual([]);
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, enDias(1))).deHoy)).toEqual([
      "Feria",
    ]);
    expect((await listarTareasDeHoy(cliente, ana.userId, enDias(2))).deHoy).toEqual([]);
    expect(titulos((await listarTareasDeHoy(cliente, ana.userId, enDias(8))).deHoy)).toEqual([
      "Feria",
    ]);
  });

  it("dice cuándo le toca la próxima vez", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, semanal("Feria", 3), AHORA);
    await crearTareaRepetitiva(cliente, ana.userId, mensual("Alquiler", 5), AHORA);
    await crearTareaRepetitiva(cliente, ana.userId, anual("Seguro", 15, 12), AHORA);
    const lista = await listarTareasRepetitivas(cliente, ana.userId, AHORA);
    expect(lista.map((r) => [r.titulo, r.proximaFecha, r.diasRestantes])).toEqual([
      ["Feria", "2026-10-21", 1],
      ["Alquiler", "2026-11-05", 16],
      ["Seguro", "2026-12-15", 56],
    ]);
  });

  it("una mensual del 31 cae el último día de los meses más cortos", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, mensual("Cierre", 31), AHORA);
    // Noviembre tiene 30 días.
    expect((await listarTareasDeHoy(cliente, ana.userId, enDias(9))).deHoy).toEqual([]); // todavía no es fin de mes
    const dia30 = await listarTareasDeHoy(cliente, ana.userId, new Date("2026-11-30T15:00:00Z"));
    expect(titulos(dia30.deHoy)).toEqual(["Cierre"]);
  });

  it("una anual del 29 de febrero cae el 28 en los años comunes", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, anual("Bisiesto", 29, 2), AHORA);
    const el28 = await listarTareasDeHoy(cliente, ana.userId, new Date("2027-02-28T15:00:00Z"));
    expect(titulos(el28.deHoy)).toEqual(["Bisiesto"]);
  });

  it("al volver tras varios días, arma los que faltaron: hoy queda una y las anteriores, atrasadas", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Tomar la vitamina"), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(5));
    expect(lista.deHoy).toHaveLength(1);
    expect(lista.atrasadas).toHaveLength(5); // del 20 al 24
    const filas = await cliente.db.select().from(esquema.tareas);
    expect(filas).toHaveLength(6); // del 20 al 25
    expect(filas.every((fila) => fila.completadaEn === null)).toBe(true);
  });

  it("si pasó más de un mes, no arma más que los últimos 31 días", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Larga ausencia"), AHORA);
    await listarTareasDeHoy(cliente, ana.userId, enDias(90));
    const filas = await cliente.db.select().from(esquema.tareas);
    // La del día en que se creó, más los últimos 31 días (hoy incluido).
    expect(filas).toHaveLength(1 + 31);
    expect(filas.filter((fila) => fila.dia > HOY)).toHaveLength(31);
  });

  it("una repetitiva con hora arma la tarea con esa hora", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Pastilla", "21:30"), AHORA);
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(lista.deHoy[0]).toMatchObject({ hora: "21:30" });
  });

  it("guarda solo los campos de cada repetición y deja el resto en nulo", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("D"), AHORA);
    await crearTareaRepetitiva(cliente, ana.userId, semanal("S", 6), AHORA);
    await crearTareaRepetitiva(cliente, ana.userId, mensual("M", 12), AHORA);
    await crearTareaRepetitiva(cliente, ana.userId, anual("A", 3, 8), AHORA);
    const filas = await cliente.db.select().from(esquema.tareasRepetitivas);
    const porTitulo = new Map(filas.map((fila) => [fila.titulo, fila]));
    expect(porTitulo.get("D")).toMatchObject({ diasSemana: null, diaDelMes: null, mes: null });
    expect(porTitulo.get("S")).toMatchObject({ diasSemana: [6], diaDelMes: null, mes: null });
    expect(porTitulo.get("M")).toMatchObject({ diasSemana: null, diaDelMes: 12, mes: null });
    expect(porTitulo.get("A")).toMatchObject({ diasSemana: null, diaDelMes: 3, mes: 8 });
  });

  it("una semanal de varios días guarda los días ordenados y sin repetir", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, semanal("S", 5, 1, 3, 1), AHORA);
    const [fila] = await cliente.db.select().from(esquema.tareasRepetitivas);
    expect(fila?.diasSemana).toEqual([1, 3, 5]);
  });

  it("una semanal de varios días arma una tarea en cada uno de sus días y en ningún otro", async () => {
    // Hoy es martes 20 de octubre; lunes, miércoles y viernes de las dos últimas semanas.
    const [regla] = await cliente.db
      .insert(esquema.tareasRepetitivas)
      .values({
        userId: ana.userId,
        titulo: "Gimnasio",
        repeticion: "semanal",
        diasSemana: [1, 3, 5],
        desde: "2026-10-07",
      })
      .returning();
    await listarTareasDeHoy(cliente, ana.userId, AHORA);

    const filas = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(eq(esquema.tareas.repetitivaId, regla?.id ?? ""));
    expect(filas.map((fila) => fila.dia).sort()).toEqual([
      "2026-10-07", // miércoles
      "2026-10-09", // viernes
      "2026-10-12", // lunes
      "2026-10-14", // miércoles
      "2026-10-16", // viernes
      "2026-10-19", // lunes
    ]);
  });

  it("la próxima vez de una semanal de varios días es la del día más cercano", async () => {
    // Hoy es martes: de lunes, miércoles y viernes, el que sigue es el miércoles.
    await crearTareaRepetitiva(cliente, ana.userId, semanal("S", 1, 3, 5), AHORA);
    await crearTareaRepetitiva(cliente, ana.userId, semanal("Solo martes", 2), AHORA);
    const repetitivas = await listarTareasRepetitivas(cliente, ana.userId, AHORA);
    const porTitulo = new Map(repetitivas.map((repetitiva) => [repetitiva.titulo, repetitiva]));
    expect(porTitulo.get("S")).toMatchObject({
      diasSemana: [1, 3, 5],
      proximaFecha: "2026-10-21",
      diasRestantes: 1,
    });
    // Y si hoy es uno de sus días, es hoy y ya tiene su tarea.
    expect(porTitulo.get("Solo martes")).toMatchObject({ proximaFecha: HOY, diasRestantes: 0 });
    expect(
      (await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy.map((t) => t.titulo),
    ).toEqual(["Solo martes"]);
  });

  it("al cambiar los días de la semana, la tarea de hoy se arma de nuevo con la regla nueva", async () => {
    const creada = await crearTareaRepetitiva(cliente, ana.userId, semanal("S", 2), AHORA);
    expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toHaveLength(1);

    // Pasa a miércoles y jueves: hoy (martes) ya no le toca.
    await editarTareaRepetitiva(cliente, ana.userId, creada.id, semanal("S", 4, 3), AHORA);
    expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toEqual([]);

    // Y si vuelve a incluir el martes, vuelve a aparecer.
    await editarTareaRepetitiva(cliente, ana.userId, creada.id, semanal("S", 2, 6), AHORA);
    expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toHaveLength(1);
  });

  it("limita cuántas repetitivas puede tener una persona", async () => {
    await cliente.db.insert(esquema.tareasRepetitivas).values(
      Array.from({ length: 100 }, (_, i) => ({
        userId: ana.userId,
        titulo: `R${i}`,
        repeticion: "diaria",
        desde: HOY,
      })),
    );
    await expect(
      crearTareaRepetitiva(cliente, ana.userId, diaria("Una más"), AHORA),
    ).rejects.toBeInstanceOf(LimiteDeTareasRepetitivas);
    // Las eliminadas no cuentan.
    const [una] = await listarTareasRepetitivas(cliente, ana.userId, AHORA);
    await eliminarTareaRepetitiva(cliente, ana.userId, una?.id ?? "", AHORA);
    await expect(
      crearTareaRepetitiva(cliente, ana.userId, diaria("Ahora sí"), AHORA),
    ).resolves.toBeTruthy();
  });

  describe("editar la regla", () => {
    it("cambiar el título cambia la tarea de hoy, sin duplicarla", async () => {
      const r = await crearTareaRepetitiva(cliente, ana.userId, diaria("Viejo"), AHORA);
      await editarTareaRepetitiva(cliente, ana.userId, r.id, diaria("Nuevo", "08:00"), AHORA);
      const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
      expect(lista.deHoy).toMatchObject([{ titulo: "Nuevo", hora: "08:00" }]);
      expect(await cliente.db.select().from(esquema.tareas)).toHaveLength(1);
    });

    it("lo ya hecho y los días pasados conservan su título original", async () => {
      const r = await crearTareaRepetitiva(cliente, ana.userId, diaria("Original"), AHORA);
      // Ayer (simulado: hoy es el día siguiente) y hoy.
      await listarTareasDeHoy(cliente, ana.userId, enDias(1));
      const ayer = (await cliente.db.select().from(esquema.tareas)).find((t) => t.dia === HOY);
      await completarTarea(cliente, ana.userId, ayer?.id ?? "", true, AHORA);
      const hoyDeEllas = (await listarTareasDeHoy(cliente, ana.userId, enDias(1))).deHoy[0];
      await completarTarea(cliente, ana.userId, hoyDeEllas?.id ?? "", true, enDias(1));

      await editarTareaRepetitiva(cliente, ana.userId, r.id, diaria("Renombrada"), enDias(1));

      const filas = await cliente.db.select().from(esquema.tareas);
      expect(filas.map((f) => [f.dia, f.titulo]).sort()).toEqual([
        ["2026-10-20", "Original"],
        ["2026-10-21", "Original"], // la de hoy ya estaba hecha: no se toca ni se duplica
      ]);
      // Mañana sí sale con el título nuevo.
      const manana = await listarTareasDeHoy(cliente, ana.userId, enDias(2));
      expect(titulos(manana.deHoy)).toEqual(["Renombrada"]);
    });

    it("cambiar el día de la semana saca la de hoy si ya no corresponde, y no inventa un pasado", async () => {
      const r = await crearTareaRepetitiva(cliente, ana.userId, diaria("Se vuelve semanal"), AHORA);
      await editarTareaRepetitiva(
        cliente,
        ana.userId,
        r.id,
        semanal("Se vuelve semanal", 5),
        AHORA,
      );
      expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toEqual([]);
      expect(await cliente.db.select().from(esquema.tareas)).toHaveLength(0);
      // El viernes (3 días después) aparece.
      expect(titulos((await listarTareasDeHoy(cliente, ana.userId, enDias(3))).deHoy)).toEqual([
        "Se vuelve semanal",
      ]);
    });

    it("cambiar la regla para que caiga hoy la arma hoy", async () => {
      const r = await crearTareaRepetitiva(cliente, ana.userId, semanal("Martes", 4), AHORA);
      expect((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy).toEqual([]);
      await editarTareaRepetitiva(cliente, ana.userId, r.id, semanal("Martes", 2), AHORA);
      expect(titulos((await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy)).toEqual([
        "Martes",
      ]);
    });

    it("devuelve null si no existe o está eliminada", async () => {
      expect(
        await editarTareaRepetitiva(
          cliente,
          ana.userId,
          "00000000-0000-4000-8000-000000000000",
          diaria("X"),
          AHORA,
        ),
      ).toBeNull();
      const r = await crearTareaRepetitiva(cliente, ana.userId, diaria("Se va"), AHORA);
      await eliminarTareaRepetitiva(cliente, ana.userId, r.id, AHORA);
      expect(await editarTareaRepetitiva(cliente, ana.userId, r.id, diaria("X"), AHORA)).toBeNull();
    });
  });

  describe("eliminar la regla", () => {
    it("saca lo pendiente de hoy, deja el historial y no arma más", async () => {
      const r = await crearTareaRepetitiva(cliente, ana.userId, diaria("Temporal"), AHORA);
      // Ayer quedó sin hacer; hoy hay una pendiente.
      await listarTareasDeHoy(cliente, ana.userId, enDias(1));
      expect(await eliminarTareaRepetitiva(cliente, ana.userId, r.id, enDias(1))).toBe(true);

      const lista = await listarTareasDeHoy(cliente, ana.userId, enDias(1));
      expect(lista.deHoy).toEqual([]);
      expect(await listarTareasRepetitivas(cliente, ana.userId, enDias(1))).toEqual([]);
      const historial = await listarHistorial(cliente, ana.userId, { ahora: enDias(1) });
      expect(titulos(historial.dias[0]?.tareas ?? [])).toEqual(["Temporal"]);
      // Pasan los días y no aparece nada nuevo.
      expect((await listarTareasDeHoy(cliente, ana.userId, enDias(5))).deHoy).toEqual([]);
    });

    it("lo que ya se hizo hoy queda hecho", async () => {
      const r = await crearTareaRepetitiva(cliente, ana.userId, diaria("Hecha y borrada"), AHORA);
      const [hoy] = (await listarTareasDeHoy(cliente, ana.userId, AHORA)).deHoy;
      await completarTarea(cliente, ana.userId, hoy?.id ?? "", true, AHORA);
      await eliminarTareaRepetitiva(cliente, ana.userId, r.id, AHORA);
      expect(titulos((await listarTareasDeHoy(cliente, ana.userId, AHORA)).hechasHoy)).toEqual([
        "Hecha y borrada",
      ]);
    });

    it("eliminar dos veces da false", async () => {
      const r = await crearTareaRepetitiva(cliente, ana.userId, diaria("Una vez"), AHORA);
      expect(await eliminarTareaRepetitiva(cliente, ana.userId, r.id, AHORA)).toBe(true);
      expect(await eliminarTareaRepetitiva(cliente, ana.userId, r.id, AHORA)).toBe(false);
    });
  });
});

describe("historial", () => {
  it("sin días anteriores con tareas, está vacío", async () => {
    await crearTarea(cliente, ana.userId, suelta("Solo hoy"), AHORA);
    // Sin filtros: los 7 días anteriores a hoy (hoy no cuenta).
    expect(await listarHistorial(cliente, ana.userId, { ahora: AHORA })).toEqual({
      desde: "2026-10-13",
      hasta: "2026-10-19",
      dias: [],
      hayMas: false,
    });
  });

  it("muestra los días anteriores con lo hecho y lo no hecho, el más reciente primero", async () => {
    await insertar(ana.userId, { dia: "2026-10-18", titulo: "Hecha", completadaEn: AHORA });
    await insertar(ana.userId, { dia: "2026-10-18", titulo: "Hecha 2", completadaEn: AHORA });
    await insertar(ana.userId, { dia: "2026-10-19", titulo: "Hecha ayer", completadaEn: AHORA });
    const repetitiva = await cliente.db
      .insert(esquema.tareasRepetitivas)
      .values({
        userId: ana.userId,
        titulo: "Rutina",
        repeticion: "diaria",
        desde: "2026-10-01",
        // Ya armada hasta hoy: el test controla qué días existen.
        generadaHasta: HOY,
      })
      .returning();
    await insertar(ana.userId, {
      dia: "2026-10-19",
      titulo: "Rutina",
      repetitivaId: repetitiva[0]?.id ?? null,
    });

    const historial = await listarHistorial(cliente, ana.userId, { ahora: AHORA });
    expect(historial.dias.map((d) => [d.dia, d.hechas, d.tareas.length])).toEqual([
      ["2026-10-19", 1, 2],
      ["2026-10-18", 2, 2],
    ]);
  });

  it("incluye también las pendientes viejas, que además siguen en atrasadas", async () => {
    await insertar(ana.userId, { dia: "2026-10-15", titulo: "Pendiente vieja" });
    await insertar(ana.userId, { dia: "2026-10-15", titulo: "Hecha vieja", completadaEn: AHORA });
    const historial = await listarHistorial(cliente, ana.userId, { ahora: AHORA });
    expect(titulos(historial.dias[0]?.tareas ?? []).sort()).toEqual([
      "Hecha vieja",
      "Pendiente vieja",
    ]);
    expect(historial.dias[0]).toMatchObject({ hechas: 1, falladas: 0 });
    const lista = await listarTareasDeHoy(cliente, ana.userId, AHORA);
    expect(titulos(lista.atrasadas)).toEqual(["Pendiente vieja"]);
  });

  it("no incluye hoy, el futuro ni lo eliminado", async () => {
    await insertar(ana.userId, { dia: HOY, titulo: "Hoy hecha", completadaEn: AHORA });
    await insertar(ana.userId, { dia: "2026-10-25", titulo: "Futura hecha", completadaEn: AHORA });
    await insertar(ana.userId, {
      dia: "2026-10-18",
      titulo: "Eliminada",
      completadaEn: AHORA,
      eliminadoEn: AHORA,
    });
    expect((await listarHistorial(cliente, ana.userId, { ahora: AHORA })).dias).toEqual([]);
  });

  it("por defecto muestra solo los 7 días anteriores a hoy", async () => {
    // Del 12 al 19 de octubre, una hecha por día.
    for (let dia = 12; dia <= 19; dia++) {
      await insertar(ana.userId, { dia: `2026-10-${dia}`, titulo: `D${dia}`, completadaEn: AHORA });
    }
    const historial = await listarHistorial(cliente, ana.userId, { ahora: AHORA });
    expect(historial).toMatchObject({ desde: "2026-10-13", hasta: "2026-10-19", hayMas: false });
    expect(historial.dias.map((d) => d.dia)).toEqual([
      "2026-10-19",
      "2026-10-18",
      "2026-10-17",
      "2026-10-16",
      "2026-10-15",
      "2026-10-14",
      "2026-10-13",
    ]);
  });

  describe("filtros", () => {
    const dias = (h: { dias: { dia: string }[] }) => h.dias.map((d) => d.dia);

    it("por fechas: el rango pedido, con ambos extremos incluidos", async () => {
      for (const dia of ["2026-09-01", "2026-09-10", "2026-09-20", "2026-10-05"]) {
        await insertar(ana.userId, { dia, completadaEn: AHORA });
      }
      const h = await listarHistorial(cliente, ana.userId, {
        desde: "2026-09-10",
        hasta: "2026-09-20",
        ahora: AHORA,
      });
      expect(dias(h)).toEqual(["2026-09-20", "2026-09-10"]);
      expect(h).toMatchObject({ desde: "2026-09-10", hasta: "2026-09-20" });
    });

    it("solo 'desde': llega hasta ayer; solo 'hasta': son 7 días que terminan ahí", async () => {
      await insertar(ana.userId, { dia: "2026-09-01", completadaEn: AHORA });
      await insertar(ana.userId, { dia: "2026-09-28", completadaEn: AHORA });
      await insertar(ana.userId, { dia: "2026-10-19", completadaEn: AHORA });
      expect(
        dias(await listarHistorial(cliente, ana.userId, { desde: "2026-09-02", ahora: AHORA })),
      ).toEqual(["2026-10-19", "2026-09-28"]);
      const hasta = await listarHistorial(cliente, ana.userId, {
        hasta: "2026-09-30",
        ahora: AHORA,
      });
      expect(hasta).toMatchObject({ desde: "2026-09-24", hasta: "2026-09-30" });
      expect(dias(hasta)).toEqual(["2026-09-28"]);
    });

    it("un 'hasta' de hoy o del futuro se recorta a ayer", async () => {
      await insertar(ana.userId, { dia: HOY, completadaEn: AHORA });
      await insertar(ana.userId, { dia: "2026-10-19", completadaEn: AHORA });
      const h = await listarHistorial(cliente, ana.userId, { hasta: "2030-01-01", ahora: AHORA });
      expect(h.hasta).toBe("2026-10-19");
      expect(dias(h)).toEqual(["2026-10-19"]);
    });

    it("no muestra más que un año hacia atrás, aunque se pida", async () => {
      await insertar(ana.userId, { dia: "2025-10-01", titulo: "Muy vieja", completadaEn: AHORA });
      await insertar(ana.userId, { dia: "2026-01-01", titulo: "Vieja", completadaEn: AHORA });
      const historial = await listarHistorial(cliente, ana.userId, {
        desde: "2020-01-01",
        ahora: AHORA,
      });
      expect(historial.desde).toBe("2025-10-20");
      expect(historial.dias.map((d) => d.dia)).toEqual(["2026-01-01"]);
    });

    it("un rango al revés no devuelve nada", async () => {
      await insertar(ana.userId, { dia: "2026-10-15", completadaEn: AHORA });
      const h = await listarHistorial(cliente, ana.userId, {
        desde: "2026-10-18",
        hasta: "2026-10-10",
        ahora: AHORA,
      });
      expect(h.dias).toEqual([]);
    });

    it("por estado: pendientes, completadas o fallidas", async () => {
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "P" });
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "C", completadaEn: AHORA });
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "F", falladaEn: AHORA });
      const titulosCon = async (estado: "pendiente" | "completada" | "fallida") =>
        titulos(
          (await listarHistorial(cliente, ana.userId, { estado, ahora: AHORA })).dias.flatMap(
            (d) => d.tareas,
          ),
        );
      expect(await titulosCon("pendiente")).toEqual(["P"]);
      expect(await titulosCon("completada")).toEqual(["C"]);
      expect(await titulosCon("fallida")).toEqual(["F"]);
    });

    it("por categoría, incluida 'sin categoría'", async () => {
      const [casa] = await cliente.db
        .insert(esquema.categoriasDeTareas)
        .values({ userId: ana.userId, nombre: "Casa", color: "#112233" })
        .returning();
      await insertar(ana.userId, {
        dia: "2026-10-15",
        titulo: "De casa",
        categoriaId: casa?.id ?? null,
      });
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "Sin" });
      const con = async (categoriaId: number | "sin") =>
        titulos(
          (await listarHistorial(cliente, ana.userId, { categoriaId, ahora: AHORA })).dias.flatMap(
            (d) => d.tareas,
          ),
        );
      expect(await con(casa?.id ?? 0)).toEqual(["De casa"]);
      expect(await con("sin")).toEqual(["Sin"]);
    });

    it("por periodicidad: sueltas y cada tipo de repetitiva", async () => {
      const regla = async (valores: Partial<typeof esquema.tareasRepetitivas.$inferInsert>) => {
        const [fila] = await cliente.db
          .insert(esquema.tareasRepetitivas)
          .values({
            userId: ana.userId,
            titulo: "R",
            repeticion: "diaria",
            desde: "2026-10-01",
            generadaHasta: HOY,
            ...valores,
          })
          .returning();
        return fila?.id ?? null;
      };
      const diariaId = await regla({});
      const cadaId = await regla({
        repeticion: "intervalo",
        cadaDias: 2,
        fechaInicio: "2026-10-01",
      });
      const semanalId = await regla({ repeticion: "semanal", diasSemana: [1] });
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "suelta" });
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "diaria", repetitivaId: diariaId });
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "cada", repetitivaId: cadaId });
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "semanal", repetitivaId: semanalId });
      const con = async (repeticion: "unica" | "diaria" | "intervalo" | "semanal" | "mensual") =>
        titulos(
          (await listarHistorial(cliente, ana.userId, { repeticion, ahora: AHORA })).dias.flatMap(
            (d) => d.tareas,
          ),
        );
      expect(await con("unica")).toEqual(["suelta"]);
      expect(await con("diaria")).toEqual(["diaria"]);
      expect(await con("intervalo")).toEqual(["cada"]);
      expect(await con("semanal")).toEqual(["semanal"]);
      expect(await con("mensual")).toEqual([]);
    });

    it("los filtros se combinan y los totales del día son de lo filtrado", async () => {
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "A", completadaEn: AHORA });
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "B", falladaEn: AHORA });
      await insertar(ana.userId, { dia: "2026-10-14", titulo: "C", completadaEn: AHORA });
      const h = await listarHistorial(cliente, ana.userId, {
        estado: "completada",
        desde: "2026-10-15",
        hasta: "2026-10-15",
        ahora: AHORA,
      });
      expect(h.dias).toMatchObject([{ dia: "2026-10-15", hechas: 1, falladas: 0 }]);
      expect(h.dias[0]?.tareas).toHaveLength(1);
    });

    it("avisa si había más tareas que el tope de una consulta", async () => {
      await cliente.db.insert(esquema.tareas).values(
        Array.from({ length: MAXIMO_DE_TAREAS_EN_EL_HISTORIAL + 1 }, (_, i) => ({
          userId: ana.userId,
          titulo: `T${i}`,
          dia: "2026-10-15",
          completadaEn: AHORA,
        })),
      );
      const h = await listarHistorial(cliente, ana.userId, { ahora: AHORA });
      expect(h.hayMas).toBe(true);
      expect(h.dias.flatMap((d) => d.tareas)).toHaveLength(MAXIMO_DE_TAREAS_EN_EL_HISTORIAL);
    });

    it("solo trae las tareas de la persona", async () => {
      await insertar(ana.userId, { dia: "2026-10-15", titulo: "Mía" });
      await insertar(beto.userId, { dia: "2026-10-15", titulo: "De Beto" });
      const h = await listarHistorial(cliente, ana.userId, { ahora: AHORA });
      expect(titulos(h.dias.flatMap((d) => d.tareas))).toEqual(["Mía"]);
    });
  });

  it("se puede tildar una tarea del historial (por si se olvidó) y suma a 'hechas'", async () => {
    await crearTareaRepetitiva(cliente, ana.userId, diaria("Olvidada"), AHORA);
    const historial = await listarHistorial(cliente, ana.userId, { ahora: enDias(1) });
    const tarea = historial.dias[0]?.tareas[0];
    await completarTarea(cliente, ana.userId, tarea?.id ?? "", true, enDias(1));
    const despues = await listarHistorial(cliente, ana.userId, { ahora: enDias(1) });
    expect(despues.dias[0]).toMatchObject({ dia: HOY, hechas: 1 });
  });
});

describe("limpieza", () => {
  it("borra en definitivo lo eliminado hace más de 30 días y deja lo reciente", async () => {
    await insertar(ana.userId, { dia: HOY, titulo: "Vieja", eliminadoEn: enDias(-31) });
    await insertar(ana.userId, { dia: HOY, titulo: "Reciente", eliminadoEn: enDias(-5) });
    await cliente.db.insert(esquema.tareasRepetitivas).values([
      {
        userId: ana.userId,
        titulo: "R vieja",
        repeticion: "diaria",
        desde: HOY,
        eliminadoEn: enDias(-40),
      },
      {
        userId: ana.userId,
        titulo: "R reciente",
        repeticion: "diaria",
        desde: HOY,
        eliminadoEn: enDias(-2),
      },
    ]);
    const resultado = await limpiarTareas(cliente, AHORA);
    expect(resultado).toMatchObject({ tareasBorradas: 1, repetitivasBorradas: 1 });
    expect((await cliente.db.select().from(esquema.tareas)).map((t) => t.titulo)).toEqual([
      "Reciente",
    ]);
    expect(
      (await cliente.db.select().from(esquema.tareasRepetitivas)).map((r) => r.titulo),
    ).toEqual(["R reciente"]);
  });

  it("borra el historial de más de un año, pero nunca una suelta que sigue pendiente", async () => {
    await insertar(ana.userId, { dia: "2025-01-01", titulo: "Hecha antigua", completadaEn: AHORA });
    await insertar(ana.userId, { dia: "2025-01-01", titulo: "Pendiente antigua" });
    await insertar(ana.userId, {
      dia: "2026-06-01",
      titulo: "Hecha reciente",
      completadaEn: AHORA,
    });
    const resultado = await limpiarTareas(cliente, AHORA);
    expect(resultado.historialBorrado).toBe(1);
    const quedan = await cliente.db
      .select()
      .from(esquema.tareas)
      .where(and(eq(esquema.tareas.userId, ana.userId), isNull(esquema.tareas.eliminadoEn)));
    expect(quedan.map((t) => t.titulo).sort()).toEqual(["Hecha reciente", "Pendiente antigua"]);
  });

  it("borrar una repetitiva no se lleva las tareas que armó (quedan como historial)", async () => {
    const [r] = await cliente.db
      .insert(esquema.tareasRepetitivas)
      .values({
        userId: ana.userId,
        titulo: "R",
        repeticion: "diaria",
        desde: HOY,
        eliminadoEn: enDias(-40),
      })
      .returning();
    await insertar(ana.userId, {
      dia: "2026-10-18",
      titulo: "Armada",
      repetitivaId: r?.id ?? null,
      completadaEn: AHORA,
    });
    await limpiarTareas(cliente, AHORA);
    const [armada] = await cliente.db.select().from(esquema.tareas);
    expect(armada).toMatchObject({ titulo: "Armada", repetitivaId: null });
  });
});

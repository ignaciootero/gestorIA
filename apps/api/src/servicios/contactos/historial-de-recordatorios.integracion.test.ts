// Tests de integración del histórico de recordatorios, contra gestion_test.
//
// El tiempo se controla con un `ahora` fijo: los recordatorios se crean "en el pasado" (con un `ahora`
// anterior) y el histórico se lee "hoy", así se prueba qué días cayeron entremedio.

import { type ClienteDb, esquema } from "@gestoria/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  cadaAnio,
  cadaMes,
  cadaSemana,
  crearContactoPorApi,
  empresaValida,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
  todosLosDias,
  unaVez,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import {
  DIAS_DE_HISTORIAL_A_RECUPERAR,
  eliminarDelHistorial,
  generarHistorial,
  listarHistorial,
  vaciarHistorial,
} from "./historial-de-recordatorios.ts";
import { crearRecordatorio, listarRecordatorios } from "./recordatorios.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let contactoId: string;

const MS_POR_DIA = 86_400_000;
/** 12:00 en Montevideo del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");
/** Diez días antes: sábado 10 de octubre. */
const HACE_DIEZ_DIAS = new Date(AHORA.getTime() - 10 * MS_POR_DIA);

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

type Datos = Parameters<typeof crearRecordatorio>[3];

/** Crea un recordatorio como si fuera `cuando` (por defecto, hace diez días). */
function crear(datos: Datos, cuando = HACE_DIEZ_DIAS, contacto = contactoId) {
  return crearRecordatorio(cliente, ana.userId, contacto, datos, cuando);
}

type Opciones = NonNullable<Parameters<typeof listarHistorial>[2]>;
const historial = (opciones: Opciones = {}) =>
  listarHistorial(cliente, ana.userId, { ahora: AHORA, ...opciones });
const dias = async (opciones: Opciones = {}) =>
  (await historial(opciones)).entradas.map((e) => [e.titulo, e.dia]);

describe("generar el histórico", () => {
  it("un recordatorio que se repite deja una entrada por cada vez que cayó, y sigue vivo", async () => {
    await crear(todosLosDias("Pastilla", "08:00"));
    await crear(cadaSemana("Lunes", 1));
    await crear(cadaMes("Mensual", 15));
    await crear(cadaAnio("Cumpleaños", 12, 10));

    const { entradas, total } = await historial();
    // Pastilla: del 10 al 19 (10 días). Lunes: 12 y 19. Mensual: 15. Cumpleaños: 12.
    expect(total).toBe(10 + 2 + 1 + 1);
    expect(entradas.filter((e) => e.titulo === "Pastilla")).toHaveLength(10);
    expect(entradas.filter((e) => e.titulo === "Lunes").map((e) => e.dia)).toEqual([
      "2026-10-19",
      "2026-10-12",
    ]);
    expect(entradas.find((e) => e.titulo === "Mensual")?.dia).toBe("2026-10-15");
    expect(entradas.find((e) => e.titulo === "Cumpleaños")?.dia).toBe("2026-10-12");

    // Los principales siguen vivos, con su próxima vez.
    const vivos = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA });
    expect(vivos.recordatorios.map((r) => r.titulo).sort()).toEqual([
      "Cumpleaños",
      "Lunes",
      "Mensual",
      "Pastilla",
    ]);
  });

  it("uno de una sola vez deja su única entrada y deja de ser un recordatorio vigente", async () => {
    await crear(unaVez("Cita médica", "2026-10-15", "10:30"));
    await crear(unaVez("Mañana", "2026-10-21"));

    const { entradas } = await historial();
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({
      titulo: "Cita médica",
      repeticion: "unica",
      dia: "2026-10-15",
      hora: "10:30",
      diasAtras: 5,
    });
    expect(entradas[0]?.contacto).toMatchObject({ id: contactoId, nombre: "Beto" });

    const vivos = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA });
    expect(vivos.recordatorios.map((r) => r.titulo)).toEqual(["Mañana"]);
    const fila = await cliente.db.query.recordatoriosDeContactos.findFirst({
      where: (tabla, { eq: igual }) => igual(tabla.titulo, "Cita médica"),
    });
    expect(fila?.eliminadoEn).toBeInstanceOf(Date);
  });

  it("uno que cae hoy todavía no está: entra cuando termina su día", async () => {
    await crear(unaVez("De hoy", "2026-10-20"));
    await crear(cadaAnio("Cumple de hoy", 20, 10));
    expect((await historial()).total).toBe(0);
    // Al día siguiente ya pasó.
    const manana = new Date(AHORA.getTime() + MS_POR_DIA);
    expect((await historial({ ahora: manana })).total).toBe(2);
  });

  it("uno recién creado no inventa historia: solo cuenta desde que existe", async () => {
    await crear(todosLosDias("Pastilla", "08:00"), AHORA);
    expect((await historial()).total).toBe(0);
    const en3Dias = new Date(AHORA.getTime() + 3 * MS_POR_DIA);
    expect((await historial({ ahora: en3Dias })).total).toBe(3);
  });

  it("es idempotente: generar de nuevo no duplica", async () => {
    await crear(todosLosDias("Pastilla", "08:00"));
    expect(await generarHistorial(cliente, ana.userId, AHORA)).toBe(10);
    expect(await generarHistorial(cliente, ana.userId, AHORA)).toBe(0);
    expect((await historial()).total).toBe(10);
  });

  it("si pasó mucho tiempo, recupera solo los últimos días", async () => {
    const hace200 = new Date(AHORA.getTime() - 200 * MS_POR_DIA);
    await crear(todosLosDias("Pastilla", "08:00"), hace200);
    const { total, entradas } = await historial({ limit: 500 });
    expect(total).toBe(DIAS_DE_HISTORIAL_A_RECUPERAR);
    expect(entradas.at(-1)?.dia).toBe("2026-07-22");
    expect(entradas[0]?.dia).toBe("2026-10-19");
  });

  it("mide el día en la zona horaria de la persona", async () => {
    // 01:00 UTC del 21/10: en Montevideo todavía es el 20; en Tokio ya es el 21.
    const madrugada = new Date("2026-10-21T01:00:00.000Z");
    const antes = new Date(madrugada.getTime() - 2 * MS_POR_DIA);
    const japon = await entrarComoPersona(app, cliente, { zonaHoraria: "Asia/Tokyo" });
    const suyo = await crearContactoPorApi(app, japon.cookies, personaValida());

    await crear(unaVez("Del 20", "2026-10-20"), antes);
    await crearRecordatorio(cliente, japon.userId, suyo, unaVez("Del 20", "2026-10-20"), antes);

    expect((await listarHistorial(cliente, ana.userId, { ahora: madrugada })).total).toBe(0);
    expect((await listarHistorial(cliente, japon.userId, { ahora: madrugada })).total).toBe(1);
  });

  it("no genera para contactos eliminados y los oculta del histórico", async () => {
    const otro = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Otro" }));
    await crear(unaVez("De otro", "2026-10-15"), HACE_DIEZ_DIAS, otro);
    await crear(unaVez("De Beto", "2026-10-15"));
    expect(await dias()).toHaveLength(2);

    await pedir(app, ana.cookies, `/api/contactos/${otro}`, "DELETE");
    expect(await dias()).toEqual([["De Beto", "2026-10-15"]]);
  });
});

describe("leer el histórico", () => {
  it("lo más reciente primero; el mismo día, con hora de más tarde a más temprano y el de todo el día al final", async () => {
    await crear(unaVez("Viejo", "2026-10-11"));
    await crear(unaVez("Temprano", "2026-10-18", "08:00"));
    await crear(unaVez("Tarde", "2026-10-18", "18:00"));
    await crear(unaVez("Todo el día", "2026-10-18"));
    await crear(unaVez("Ayer", "2026-10-19"));

    expect((await dias()).map(([titulo]) => titulo)).toEqual([
      "Ayer",
      "Tarde",
      "Temprano",
      "Todo el día",
      "Viejo",
    ]);
  });

  it("filtra por texto (título o contacto), por repetición y por contacto, y el total sigue a los filtros", async () => {
    const empresa = await crearContactoPorApi(
      app,
      ana.cookies,
      empresaValida({ nombre: "Seguros Sur" }),
    );
    await crear(unaVez("Renovar seguro", "2026-10-12"), HACE_DIEZ_DIAS, empresa);
    await crear(unaVez("Llamar al plomero", "2026-10-13"));
    await crear(cadaAnio("Cumpleaños", 14, 10));

    expect((await dias({ busqueda: "PLOMERO" })).map(([t]) => t)).toEqual(["Llamar al plomero"]);
    expect((await dias({ busqueda: "seguros" })).map(([t]) => t)).toEqual(["Renovar seguro"]);
    expect(await dias({ busqueda: "%" })).toEqual([]);
    expect((await dias({ repeticion: "anual" })).map(([t]) => t)).toEqual(["Cumpleaños"]);
    expect((await dias({ repeticion: "unica" })).map(([t]) => t)).toEqual([
      "Llamar al plomero",
      "Renovar seguro",
    ]);
    expect((await dias({ contactoId: empresa })).map(([t]) => t)).toEqual(["Renovar seguro"]);

    const filtrado = await historial({ contactoId, limit: 1 });
    expect(filtrado.entradas).toHaveLength(1);
    expect(filtrado.total).toBe(2);
  });

  it("trae las etiquetas del contacto para pintar el avatar", async () => {
    await crear(unaVez("Algo", "2026-10-12"));
    const { entradas } = await historial();
    expect(entradas[0]?.contacto.etiquetas).toEqual([]);
  });

  it("la entrada es una copia: sigue igual si el principal se edita o se elimina", async () => {
    const principal = await crear(cadaAnio("Cumpleaños", 12, 10));
    expect(await dias()).toEqual([["Cumpleaños", "2026-10-12"]]);

    await cliente.db
      .update(esquema.recordatoriosDeContactos)
      .set({ titulo: "Otro nombre", eliminadoEn: new Date() })
      .where(eq(esquema.recordatoriosDeContactos.id, principal?.id ?? ""));
    expect(await dias()).toEqual([["Cumpleaños", "2026-10-12"]]);
  });
});

describe("eliminar del histórico", () => {
  it("una entrada suelta se elimina y no vuelve; el principal sigue vivo", async () => {
    await crear(todosLosDias("Pastilla", "08:00"));
    const { entradas } = await historial();
    expect(entradas).toHaveLength(10);

    expect(await eliminarDelHistorial(cliente, ana.userId, entradas[0]?.id ?? "")).toBe(true);
    expect(await eliminarDelHistorial(cliente, ana.userId, entradas[0]?.id ?? "")).toBe(false);

    // Al volver a leer (y generar) no reaparece.
    expect((await historial()).total).toBe(9);
    expect((await listarRecordatorios(cliente, ana.userId, { ahora: AHORA })).total).toBe(1);
  });

  it("vaciar borra todo el histórico sin tocar los recordatorios, y lo borrado no reaparece", async () => {
    await crear(todosLosDias("Pastilla", "08:00"));
    await crear(unaVez("Cita", "2026-10-15"));
    await crear(unaVez("Futuro", "2026-10-25"));
    // Todavía no se había leído: vaciar también pasa lo pendiente y lo borra.
    expect(await vaciarHistorial(cliente, ana.userId, AHORA)).toBe(11);
    expect((await historial()).total).toBe(0);

    const vivos = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA });
    expect(vivos.recordatorios.map((r) => r.titulo).sort()).toEqual(["Futuro", "Pastilla"]);

    // Al día siguiente solo suma lo nuevo (el día 20).
    const manana = new Date(AHORA.getTime() + MS_POR_DIA);
    expect((await historial({ ahora: manana })).total).toBe(1);
  });

  it("vaciar un histórico vacío no falla", async () => {
    expect(await vaciarHistorial(cliente, ana.userId, AHORA)).toBe(0);
  });
});

describe("por la API", () => {
  type EntradaJson = { id: string; titulo: string; dia: string; diasAtras: number };
  type ListaJson = { entradas: EntradaJson[]; total: number };

  const lista = async (consulta = "", quien = ana) =>
    await pedir(app, quien.cookies, `/api/contactos/recordatorios/historial${consulta}`);

  it("exige sesión", async () => {
    for (const [metodo, ruta] of [
      ["GET", "/api/contactos/recordatorios/historial"],
      ["DELETE", "/api/contactos/recordatorios/historial"],
      ["DELETE", "/api/contactos/recordatorios/historial/00000000-0000-4000-8000-000000000000"],
    ] as const) {
      expect((await pedir(app, null, ruta, metodo)).status).toBe(401);
    }
  });

  it("lista, valida los parámetros y no mezcla personas", async () => {
    await crear(unaVez("Mío", "2026-10-15"));
    const otra = await entrarComoPersona(app, cliente);
    const deOtra = await crearContactoPorApi(app, otra.cookies, personaValida());
    await crearRecordatorio(
      cliente,
      otra.userId,
      deOtra,
      unaVez("Suyo", "2026-10-15"),
      HACE_DIEZ_DIAS,
    );

    // La API usa la hora real: los de 2026-10-15 ya pasaron (o no, según el reloj); se fuerza por la base.
    await generarHistorial(cliente, ana.userId, AHORA);
    await generarHistorial(cliente, otra.userId, AHORA);

    expect((await lista("?repeticion=cada-tanto")).status).toBe(400);
    expect((await lista("?contactoId=hola")).status).toBe(400);
    expect((await lista("?limit=0")).status).toBe(400);
    expect((await lista(`?busqueda=${"a".repeat(101)}`)).status).toBe(400);

    const mios = await leerJson<ListaJson>(await lista());
    expect(mios.entradas.map((e) => e.titulo)).toEqual(["Mío"]);
    const ajenos = await leerJson<ListaJson>(await lista(`?contactoId=${deOtra}`));
    expect(ajenos.total).toBe(0);
  });

  it("elimina una entrada (404 si es de otra persona) y vacía todo", async () => {
    await crear(unaVez("Uno", "2026-10-15"));
    await crear(unaVez("Dos", "2026-10-16"));
    await generarHistorial(cliente, ana.userId, AHORA);
    const otra = await entrarComoPersona(app, cliente);

    const { entradas } = await leerJson<ListaJson>(await lista());
    const id = entradas[0]?.id ?? "";
    const ruta = `/api/contactos/recordatorios/historial/${id}`;
    expect((await pedir(app, otra.cookies, ruta, "DELETE")).status).toBe(404);
    expect((await pedir(app, ana.cookies, ruta, "DELETE")).status).toBe(200);
    expect((await pedir(app, ana.cookies, ruta, "DELETE")).status).toBe(404);
    expect(
      (await pedir(app, ana.cookies, "/api/contactos/recordatorios/historial/hola", "DELETE"))
        .status,
    ).toBe(400);

    const vaciado = await pedir(
      app,
      ana.cookies,
      "/api/contactos/recordatorios/historial",
      "DELETE",
    );
    expect(vaciado.status).toBe(200);
    expect((await leerJson<{ eliminadas: number }>(vaciado)).eliminadas).toBe(1);
    expect((await leerJson<ListaJson>(await lista())).total).toBe(0);
  });

  it("vaciar el de una persona no toca el de otra", async () => {
    await crear(unaVez("Mío", "2026-10-15"));
    const otra = await entrarComoPersona(app, cliente);
    const deOtra = await crearContactoPorApi(app, otra.cookies, personaValida());
    await crearRecordatorio(
      cliente,
      otra.userId,
      deOtra,
      unaVez("Suyo", "2026-10-15"),
      HACE_DIEZ_DIAS,
    );
    await generarHistorial(cliente, ana.userId, AHORA);
    await generarHistorial(cliente, otra.userId, AHORA);

    await pedir(app, ana.cookies, "/api/contactos/recordatorios/historial", "DELETE");
    expect((await listarHistorial(cliente, otra.userId, { ahora: AHORA })).total).toBe(1);
  });
});

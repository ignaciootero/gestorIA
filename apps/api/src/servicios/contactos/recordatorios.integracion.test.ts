// Tests de integración de los recordatorios de contactos, contra gestion_test.
//
// El cálculo de "hoy" y de la próxima vez se prueba llamando al servicio con un `ahora`
// fijo; las rutas, con la API real (validaciones, permisos, aislamiento entre personas).
// Cada repetición guarda solo los campos que le corresponden (día, hora, día de la semana,
// día del mes, mes): esos casos se prueban mirando la fila de la base.

import { type ClienteDb, esquema } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  cadaAnio,
  cadaMes,
  cadaSemana,
  crearContactoPorApi,
  crearEtiquetaPorApi,
  empresaValida,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
  todosLosDias,
  unaVez,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { obtenerContacto } from "./contactos.ts";
import { crearRecordatorio, listarRecordatorios } from "./recordatorios.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let contactoId: string;

/** 12:00 en Montevideo (UTC-3) del martes 20 de octubre de 2026. */
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

type RecordatorioJson = {
  id: string;
  titulo: string;
  repeticion: string;
  fecha: string | null;
  hora: string | null;
  diaSemana: number | null;
  diaDelMes: number | null;
  mes: number | null;
  proximaFecha: string;
  diasRestantes: number;
};

type Datos = Parameters<typeof crearRecordatorio>[3];

function crear(cuerpo: unknown, cookies = ana.cookies, contacto = contactoId) {
  return pedir(app, cookies, `/api/contactos/${contacto}/recordatorios`, "POST", cuerpo);
}

function nuevo(datos: Datos) {
  return crearRecordatorio(cliente, ana.userId, contactoId, datos, AHORA);
}

async function filaDe(id: string) {
  const fila = await cliente.db.query.recordatoriosDeContactos.findFirst({
    where: (tabla, { eq }) => eq(tabla.id, id),
  });
  if (!fila) throw new Error("No está el recordatorio en la base");
  return fila;
}

describe("crear", () => {
  it("crea uno de una sola vez para una fecha futura y dice cuántos días faltan", async () => {
    const respuesta = await crear(unaVez("Llamarle", "2999-01-01"));
    expect(respuesta.status).toBe(201);
    const recordatorio = await leerJson<RecordatorioJson>(respuesta);
    expect(recordatorio).toMatchObject({
      titulo: "Llamarle",
      repeticion: "unica",
      fecha: "2999-01-01",
      hora: null,
      proximaFecha: "2999-01-01",
    });
    expect(recordatorio.diasRestantes).toBeGreaterThan(0);
  });

  it("un recordatorio de una sola vez puede ser para hoy, pero no para ayer", async () => {
    expect(await nuevo(unaVez("Hoy", "2026-10-20"))).toMatchObject({
      proximaFecha: "2026-10-20",
      diasRestantes: 0,
    });
    await expect(nuevo(unaVez("Ayer", "2026-10-19"))).rejects.toThrow();
  });

  it("por la API, un recordatorio de una sola vez en el pasado es un error de validación en 'fecha'", async () => {
    const respuesta = await crear(unaVez("Llamarle", "2000-01-01"));
    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<{ error: { campos: { campo: string }[] } }>(respuesta);
    expect(cuerpo.error.campos[0]?.campo).toBe("fecha");
  });

  it("guarda solo los campos de cada repetición y deja el resto en nulo", async () => {
    const casos = [
      {
        datos: unaVez("Única", "2999-01-01", "18:30"),
        esperado: {
          fecha: "2999-01-01",
          hora: "18:30:00",
          diaSemana: null,
          diaDelMes: null,
          mes: null,
        },
      },
      {
        datos: todosLosDias("Diaria", "08:00"),
        esperado: { fecha: null, hora: "08:00:00", diaSemana: null, diaDelMes: null, mes: null },
      },
      {
        datos: cadaSemana("Semanal", 3),
        esperado: { fecha: null, hora: null, diaSemana: 3, diaDelMes: null, mes: null },
      },
      {
        datos: cadaMes("Mensual", 15, "10:00"),
        esperado: { fecha: null, hora: "10:00:00", diaSemana: null, diaDelMes: 15, mes: null },
      },
      {
        datos: cadaAnio("Anual", 12, 5),
        esperado: { fecha: null, hora: null, diaSemana: null, diaDelMes: 12, mes: 5 },
      },
    ];

    for (const { datos, esperado } of casos) {
      const respuesta = await crear(datos);
      expect(respuesta.status, datos.titulo).toBe(201);
      const creado = await leerJson<RecordatorioJson>(respuesta);
      expect(await filaDe(creado.id), datos.titulo).toMatchObject(esperado);
    }
  });

  it("devuelve la hora como HH:MM, sin segundos", async () => {
    const creado = await leerJson<RecordatorioJson>(await crear(todosLosDias("Pastilla", "08:05")));
    expect(creado.hora).toBe("08:05");
  });

  it("uno diario necesita la hora; los demás, no", async () => {
    const sinHora = await crear({ titulo: "Pastilla", repeticion: "diaria", hora: "" });
    expect(sinHora.status).toBe(400);
    const cuerpo = await leerJson<{ error: { campos: { campo: string; mensaje: string }[] } }>(
      sinHora,
    );
    expect(cuerpo.error.campos[0]).toMatchObject({ campo: "hora", mensaje: "Elegí a qué hora." });

    expect((await crear(cadaSemana("Regar", 2))).status).toBe(201);
    expect((await crear(cadaMes("Pagar", 10))).status).toBe(201);
  });

  it("uno que se repite no tiene que ver con el pasado: un cumpleaños avisa el año que viene", async () => {
    expect(await nuevo(cadaAnio("Cumpleaños", 12, 5))).toMatchObject({
      proximaFecha: "2027-05-12",
      diasRestantes: 204,
    });
  });

  it("valida el título, los campos de cada repetición y la hora", async () => {
    for (const cuerpo of [
      unaVez(" ", "2999-01-01"),
      unaVez("a".repeat(81), "2999-01-01"),
      unaVez("x", "2999-02-30"),
      unaVez("x", "mañana"),
      { titulo: "x", repeticion: "unica", hora: "" },
      { titulo: "x", repeticion: "cada tanto" },
      { titulo: "x" },
      cadaSemana("x", 0),
      cadaSemana("x", 8),
      { titulo: "x", repeticion: "semanal", hora: "" },
      cadaMes("x", 0),
      cadaMes("x", 32),
      cadaAnio("x", 30, 2),
      cadaAnio("x", 31, 4),
      cadaAnio("x", 1, 13),
      todosLosDias("x", "25:00"),
      unaVez("x", "2999-01-01", "9:00"),
    ]) {
      expect((await crear(cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
    }
  });

  it("acepta el 29 de febrero y el 31 en uno mensual (cae el último día de cada mes)", async () => {
    expect((await crear(cadaAnio("Bisiesto", 29, 2))).status).toBe(201);
    expect((await crear(cadaMes("Fin de mes", 31))).status).toBe(201);
  });

  it("limita cuántos recordatorios puede tener un contacto", async () => {
    for (let numero = 1; numero <= 30; numero += 1) {
      expect((await crear(cadaAnio(`Aviso ${numero}`, 1, 1))).status).toBe(201);
    }
    expect((await crear(cadaAnio("Uno más", 1, 1))).status).toBe(409);
  });

  it("devuelve 404 si el contacto no existe o está eliminado", async () => {
    expect(
      (await crear(unaVez("x", "2999-01-01"), ana.cookies, "00000000-0000-4000-8000-000000000000"))
        .status,
    ).toBe(404);

    await pedir(app, ana.cookies, `/api/contactos/${contactoId}`, "DELETE");
    expect((await crear(unaVez("x", "2999-01-01"))).status).toBe(404);
  });
});

describe("la ficha del contacto", () => {
  it("lista sus recordatorios con el que cae antes primero, y no los de uno que ya pasó", async () => {
    await nuevo(unaVez("Lejano", "2026-12-25"));
    await nuevo(unaVez("Cercano", "2026-10-22"));
    await nuevo(cadaAnio("Anual", 21, 10));
    // Uno de una sola vez que quedó en el pasado sin que el job lo haya limpiado todavía.
    await cliente.db.insert(esquema.recordatoriosDeContactos).values({
      userId: ana.userId,
      contactoId,
      titulo: "Ya pasó",
      fecha: "2026-10-01",
      repeticion: "unica",
    });

    const contacto = await obtenerContacto(cliente, ana.userId, contactoId, AHORA);
    expect(
      contacto?.recordatorios.map((recordatorio) => [
        recordatorio.titulo,
        recordatorio.diasRestantes,
      ]),
    ).toEqual([
      ["Anual", 1],
      ["Cercano", 2],
      ["Lejano", 66],
    ]);
  });

  it("cada repetición cae donde le toca: semanal el día de la semana, mensual el día del mes", async () => {
    // Hoy es martes 20: un recordatorio de los martes cae hoy; uno de los viernes, en 3 días.
    expect(await nuevo(cadaSemana("Martes", 2))).toMatchObject({
      proximaFecha: "2026-10-20",
      diasRestantes: 0,
    });
    expect(await nuevo(cadaSemana("Viernes", 5))).toMatchObject({
      proximaFecha: "2026-10-23",
      diasRestantes: 3,
    });
    expect(await nuevo(cadaSemana("Lunes", 1))).toMatchObject({
      proximaFecha: "2026-10-26",
      diasRestantes: 6,
    });
    // Día 20 del mes: hoy. Día 5: el mes que viene. Día 31: a fin de este mes.
    expect(await nuevo(cadaMes("Veinte", 20))).toMatchObject({ proximaFecha: "2026-10-20" });
    expect(await nuevo(cadaMes("Cinco", 5))).toMatchObject({ proximaFecha: "2026-11-05" });
    expect(await nuevo(cadaMes("Treinta y uno", 31))).toMatchObject({
      proximaFecha: "2026-10-31",
    });
    // Uno diario cae siempre hoy.
    expect(await nuevo(todosLosDias("Pastilla", "08:00"))).toMatchObject({
      proximaFecha: "2026-10-20",
      diasRestantes: 0,
    });
  });

  it("el mismo día, primero lo que dura todo el día y después por hora", async () => {
    await nuevo(unaVez("B tarde", "2026-10-20", "18:00"));
    await nuevo(unaVez("A mañana", "2026-10-20", "09:00"));
    await nuevo(unaVez("C todo el día", "2026-10-20"));

    const contacto = await obtenerContacto(cliente, ana.userId, contactoId, AHORA);
    expect(contacto?.recordatorios.map((recordatorio) => recordatorio.titulo)).toEqual([
      "C todo el día",
      "A mañana",
      "B tarde",
    ]);
  });
});

describe("el día de hoy depende de la zona horaria de la persona", () => {
  // 01:00 UTC del 21/10 es todavía el 20/10 en Montevideo (22:00) y ya el 21/10 en Tokio (10:00).
  const MADRUGADA_UTC = new Date("2026-10-21T01:00:00.000Z");

  it("en Montevideo, un recordatorio 'de hoy' sigue vivo aunque en UTC ya sea mañana", async () => {
    const recordatorio = await crearRecordatorio(
      cliente,
      ana.userId,
      contactoId,
      unaVez("Hoy", "2026-10-20"),
      MADRUGADA_UTC,
    );
    expect(recordatorio).toMatchObject({ proximaFecha: "2026-10-20", diasRestantes: 0 });
  });

  it("en Tokio, el mismo instante ya es el día siguiente: el de ayer no se puede crear y el de hoy es otro", async () => {
    const japon = await entrarComoPersona(app, cliente, { zonaHoraria: "Asia/Tokyo" });
    const suyo = await crearContactoPorApi(app, japon.cookies, personaValida());

    await expect(
      crearRecordatorio(
        cliente,
        japon.userId,
        suyo,
        unaVez("Ayer para ella", "2026-10-20"),
        MADRUGADA_UTC,
      ),
    ).rejects.toThrow();

    const hoy = await crearRecordatorio(
      cliente,
      japon.userId,
      suyo,
      unaVez("Hoy para ella", "2026-10-21"),
      MADRUGADA_UTC,
    );
    expect(hoy?.diasRestantes).toBe(0);
  });

  it("uno semanal cae el día de la semana de la persona, no el de UTC", async () => {
    // En UTC es miércoles 21, pero en Montevideo todavía es martes 20.
    const recordatorio = await crearRecordatorio(
      cliente,
      ana.userId,
      contactoId,
      cadaSemana("Martes", 2),
      MADRUGADA_UTC,
    );
    expect(recordatorio).toMatchObject({ proximaFecha: "2026-10-20", diasRestantes: 0 });
  });
});

describe("la lista de recordatorios de todos los contactos", () => {
  it("los junta, con su contacto, ordenados por cuándo caen, y respeta la ventana de días", async () => {
    const empresa = await crearContactoPorApi(
      app,
      ana.cookies,
      empresaValida({ nombre: "Seguros Sur" }),
    );
    await nuevo(cadaAnio("Cumpleaños", 2, 11));
    await crearRecordatorio(
      cliente,
      ana.userId,
      empresa,
      unaVez("Renovar seguro", "2026-10-25"),
      AHORA,
    );
    await crearRecordatorio(cliente, ana.userId, empresa, cadaMes("Pagar", 20), AHORA);

    const todos = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA });
    expect(todos.total).toBe(3);
    expect(todos.recordatorios.map((r) => [r.titulo, r.contacto.nombre, r.diasRestantes])).toEqual([
      ["Pagar", "Seguros Sur", 0],
      ["Renovar seguro", "Seguros Sur", 5],
      ["Cumpleaños", "Beto", 13],
    ]);

    const proximaSemana = await listarRecordatorios(cliente, ana.userId, {
      ahora: AHORA,
      dias: 7,
    });
    expect(proximaSemana.recordatorios.map((r) => r.titulo)).toEqual(["Pagar", "Renovar seguro"]);
    expect(proximaSemana.total).toBe(2);

    const soloUno = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA, limit: 1 });
    expect(soloUno.recordatorios).toHaveLength(1);
    expect(soloUno.total).toBe(3);
  });

  it("trae las etiquetas de cada contacto, por nombre, para pintar el avatar como en el listado", async () => {
    const familia = await crearEtiquetaPorApi(app, ana.cookies, "Familia", "#cf1754");
    const amigos = await crearEtiquetaPorApi(app, ana.cookies, "Amigos", "#17b0cf");
    const conEtiquetas = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Con etiquetas", etiquetaIds: [familia, amigos] }),
    );
    await crearRecordatorio(cliente, ana.userId, conEtiquetas, unaVez("Uno", "2026-10-21"), AHORA);
    await crearRecordatorio(cliente, ana.userId, conEtiquetas, unaVez("Dos", "2026-10-22"), AHORA);
    await nuevo(unaVez("Sin etiquetas", "2026-10-23"));

    const { recordatorios } = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA });
    const porTitulo = new Map(recordatorios.map((r) => [r.titulo, r.contacto.etiquetas]));
    const esperadas = [
      { id: amigos, nombre: "Amigos", color: "#17b0cf" },
      { id: familia, nombre: "Familia", color: "#cf1754" },
    ];
    // Cada recordatorio del mismo contacto trae sus etiquetas (no solo el primero).
    expect(porTitulo.get("Uno")).toEqual(esperadas);
    expect(porTitulo.get("Dos")).toEqual(esperadas);
    expect(porTitulo.get("Sin etiquetas")).toEqual([]);
  });

  it("trae las etiquetas por la API, y quitarle una al contacto se refleja", async () => {
    const familia = await crearEtiquetaPorApi(app, ana.cookies, "Familia", "#cf1754");
    const conEtiqueta = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Ana", etiquetaIds: [familia] }),
    );
    await crearRecordatorio(
      cliente,
      ana.userId,
      conEtiqueta,
      unaVez("Llamarla", "2999-01-01"),
      AHORA,
    );

    const lista = async () =>
      (
        await leerJson<{
          recordatorios: { contacto: { etiquetas: { nombre: string; color: string }[] } }[];
        }>(await pedir(app, ana.cookies, "/api/contactos/recordatorios"))
      ).recordatorios[0]?.contacto.etiquetas;
    expect(await lista()).toEqual([
      expect.objectContaining({ nombre: "Familia", color: "#cf1754" }),
    ]);

    await pedir(app, ana.cookies, `/api/contactos/etiquetas/${familia}`, "DELETE");
    expect(await lista()).toEqual([]);
  });

  it("solo trae las etiquetas de la persona, aunque el contacto de otra tenga las suyas", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const deOtra = await crearEtiquetaPorApi(app, otra.cookies, "Secreta", "#112233");
    const contactoDeOtra = await crearContactoPorApi(
      app,
      otra.cookies,
      personaValida({ nombre: "De otra", etiquetaIds: [deOtra] }),
    );
    await crearRecordatorio(
      cliente,
      otra.userId,
      contactoDeOtra,
      unaVez("Suyo", "2999-01-01"),
      AHORA,
    );
    await nuevo(unaVez("Mío", "2999-01-01"));

    const mios = await listarRecordatorios(cliente, ana.userId, { ahora: AHORA });
    expect(mios.recordatorios.map((r) => r.titulo)).toEqual(["Mío"]);
    expect(JSON.stringify(mios)).not.toContain("Secreta");
  });

  it("no incluye los de contactos eliminados ni los eliminados", async () => {
    const otro = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Otro" }));
    await crearRecordatorio(cliente, ana.userId, otro, unaVez("De otro", "2999-01-01"), AHORA);
    const propio = await nuevo(unaVez("Propio", "2999-01-01"));

    await pedir(app, ana.cookies, `/api/contactos/${otro}`, "DELETE");
    expect(
      (await listarRecordatorios(cliente, ana.userId, { ahora: AHORA })).recordatorios.map(
        (r) => r.titulo,
      ),
    ).toEqual(["Propio"]);

    await pedir(
      app,
      ana.cookies,
      `/api/contactos/${contactoId}/recordatorios/${propio?.id}`,
      "DELETE",
    );
    expect((await listarRecordatorios(cliente, ana.userId, { ahora: AHORA })).total).toBe(0);
  });

  it("por la API valida los parámetros y no mezcla personas", async () => {
    const otra = await entrarComoPersona(app, cliente);
    await crear(unaVez("x", "2999-01-01"));

    expect((await pedir(app, ana.cookies, "/api/contactos/recordatorios?dias=-1")).status).toBe(
      400,
    );
    expect((await pedir(app, ana.cookies, "/api/contactos/recordatorios?dias=999")).status).toBe(
      400,
    );
    expect((await pedir(app, ana.cookies, "/api/contactos/recordatorios?limit=0")).status).toBe(
      400,
    );

    const suyos = await leerJson<{ total: number }>(
      await pedir(app, ana.cookies, "/api/contactos/recordatorios"),
    );
    const ajenos = await leerJson<{ total: number }>(
      await pedir(app, otra.cookies, "/api/contactos/recordatorios"),
    );
    expect(suyos.total).toBe(1);
    expect(ajenos.total).toBe(0);
  });
});

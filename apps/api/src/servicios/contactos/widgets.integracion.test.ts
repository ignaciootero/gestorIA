// Tests de integración de los widgets de contactos, contra gestion_test.
// El cálculo se prueba con el servicio y un `ahora` fijo; la ruta, aparte.

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  crearContactoPorApi,
  empresaValida,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { crearRecordatorio } from "./recordatorios.ts";
import { obtenerWidgetsDeContactos, type WidgetsDeContactos } from "./widgets.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;

/** 12:00 en Montevideo del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");

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

function widgets(persona = ana): Promise<WidgetsDeContactos> {
  return obtenerWidgetsDeContactos(cliente, persona.userId, AHORA);
}

/** Un recordatorio de una sola vez para ese día, con hora si se pasa. */
function recordar(contactoId: string, titulo: string, fecha: string, hora = "") {
  return crearRecordatorio(
    cliente,
    ana.userId,
    contactoId,
    { titulo, repeticion: "unica", fecha, hora },
    AHORA,
  );
}

describe("sin contactos", () => {
  it("devuelve todo en cero, sin cumpleaños ni deudas", async () => {
    const sinDeudas = { totales: [], contactos: 0, mayores: [] };
    expect(await widgets()).toEqual({
      hoy: "2026-10-20",
      totales: { personas: 0, empresas: 0, sinDatosDeContacto: 0 },
      recordatorios: {
        hoy: 0,
        proximos7: 0,
        proximos30: 0,
        porSemana: [0, 0, 0, 0],
        proximos: [],
      },
      semanaPasada: [],
      proximoCumpleanos: null,
      cumpleanosPorMes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      deudas: { teDeben: sinDeudas, debes: sinDeudas, proximoVencimiento: null },
    });
  });
});

describe("totales", () => {
  it("cuenta personas, empresas y contactos sin forma de comunicarse", async () => {
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({
        nombre: "Con teléfono",
        telefonos: [{ numero: "099 123 456", tipo: "celular" }],
      }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Con correo", correos: ["a@ejemplo.com"], favorito: true }),
    );
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Sin nada" }));
    await crearContactoPorApi(
      app,
      ana.cookies,
      empresaValida({ nombre: "Taller", favorito: true }),
    );

    const { totales } = await widgets();
    expect(totales).toEqual({ personas: 3, empresas: 1, sinDatosDeContacto: 2 });
  });

  it("no cuenta los contactos eliminados", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida({ favorito: true }));
    await pedir(app, ana.cookies, `/api/contactos/${id}`, "DELETE");
    expect((await widgets()).totales).toEqual({
      personas: 0,
      empresas: 0,
      sinDatosDeContacto: 0,
    });
  });
});

describe("cumpleaños por mes", () => {
  it("cuenta los cumpleaños de cada mes, de enero a diciembre", async () => {
    for (const [nombre, fecha] of [
      ["Enero", "1990-01-31"],
      ["Octubre 1", "1985-10-01"],
      ["Octubre 2", "2001-10-23"],
      ["Diciembre", "1970-12-25"],
      ["Bisiesto", "2000-02-29"],
    ] as const) {
      await crearContactoPorApi(
        app,
        ana.cookies,
        personaValida({ nombre, fechaNacimiento: fecha }),
      );
    }
    expect((await widgets()).cumpleanosPorMes).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1]);
  });

  it("no cuenta empresas, personas sin fecha ni contactos eliminados", async () => {
    await crearContactoPorApi(app, ana.cookies, empresaValida());
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Sin fecha" }));
    const borrado = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Borrado", fechaNacimiento: "1990-05-05" }),
    );
    await pedir(app, ana.cookies, `/api/contactos/${borrado}`, "DELETE");
    expect((await widgets()).cumpleanosPorMes).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("próximo cumpleaños", () => {
  it("elige el más cercano, y uno que ya pasó este año cuenta para el año que viene", async () => {
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Lejano", apellido: "", fechaNacimiento: "1990-12-25" }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Cercano", apellido: "Gómez", fechaNacimiento: "1985-10-23" }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Pasado", fechaNacimiento: "2000-01-05" }),
    );

    expect((await widgets()).proximoCumpleanos).toEqual({
      nombre: "Cercano",
      apellido: "Gómez",
      fecha: "2026-10-23",
      dias: 3,
      nacimiento: "1985-10-23",
    });
  });

  it("un cumpleaños de hoy es 'en 0 días'", async () => {
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Hoy", fechaNacimiento: "1990-10-20" }),
    );
    expect((await widgets()).proximoCumpleanos).toMatchObject({
      nombre: "Hoy",
      dias: 0,
      fecha: "2026-10-20",
    });
  });

  it("el 29 de febrero se festeja el 28 en un año común", async () => {
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Bisiesto", fechaNacimiento: "2000-02-29" }),
    );
    expect((await widgets()).proximoCumpleanos).toMatchObject({ fecha: "2027-02-28" });
  });

  it("las empresas y las personas sin fecha no cuentan", async () => {
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Sin fecha" }));
    await crearContactoPorApi(app, ana.cookies, empresaValida());
    expect((await widgets()).proximoCumpleanos).toBeNull();
  });
});

describe("recordatorios", () => {
  it("cuenta los de hoy, de la semana y del mes, y los reparte por semana", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Beto" }));
    await recordar(id, "Hoy", "2026-10-20");
    await recordar(id, "En 6 días", "2026-10-26");
    await recordar(id, "En 7 días", "2026-10-27");
    await recordar(id, "En 20 días", "2026-11-09");
    await recordar(id, "En 29 días", "2026-11-18");
    await recordar(id, "En 30 días", "2026-11-19");
    await recordar(id, "Lejano", "2027-03-01");

    const { recordatorios } = await widgets();
    expect(recordatorios.hoy).toBe(1);
    expect(recordatorios.proximos7).toBe(2);
    expect(recordatorios.proximos30).toBe(5);
    // Los de 29 y 30 días caen en la quinta semana: el gráfico solo muestra cuatro.
    expect(recordatorios.porSemana).toEqual([2, 1, 1, 0]);
  });

  it("lista los cinco más cercanos con su contacto", async () => {
    const id = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Beto", apellido: "Ruiz" }),
    );
    for (let dia = 21; dia <= 28; dia += 1) await recordar(id, `Día ${dia}`, `2026-10-${dia}`);

    const { proximos } = (await widgets()).recordatorios;
    expect(proximos.map((recordatorio) => recordatorio.titulo)).toEqual([
      "Día 21",
      "Día 22",
      "Día 23",
      "Día 24",
      "Día 25",
    ]);
    expect(proximos[0]).toMatchObject({
      dias: 1,
      fecha: "2026-10-21",
      contacto: { nombre: "Beto", apellido: "Ruiz", tipo: "persona" },
    });
  });

  it("trae la hora de los recordatorios que la tienen", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Beto" }));
    await recordar(id, "Con hora", "2026-10-21", "18:30");
    await recordar(id, "Sin hora", "2026-10-22");

    const { proximos } = (await widgets()).recordatorios;
    expect(proximos.map((recordatorio) => [recordatorio.titulo, recordatorio.hora])).toEqual([
      ["Con hora", "18:30"],
      ["Sin hora", null],
    ]);
  });

  it("un recordatorio diario aparece hoy y se cuenta una sola vez", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida());
    await crearRecordatorio(
      cliente,
      ana.userId,
      id,
      { titulo: "Tomar la pastilla", repeticion: "diaria", hora: "08:00" },
      AHORA,
    );
    const { recordatorios } = await widgets();
    expect(recordatorios.hoy).toBe(1);
    expect(recordatorios.proximos30).toBe(1);
  });

  it("no cuenta los de contactos eliminados", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida());
    await recordar(id, "Hoy", "2026-10-20");
    await pedir(app, ana.cookies, `/api/contactos/${id}`, "DELETE");
    expect((await widgets()).recordatorios.hoy).toBe(0);
  });
});

describe("la ruta", () => {
  it("responde con los datos de quien tiene la sesión y con la forma esperada", async () => {
    const otra = await entrarComoPersona(app, cliente);
    await crearContactoPorApi(app, ana.cookies, personaValida());
    await crearContactoPorApi(app, otra.cookies, empresaValida());

    const respuesta = await pedir(app, ana.cookies, "/api/contactos/widgets");
    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<WidgetsDeContactos>(respuesta);
    expect(cuerpo.totales).toEqual({ personas: 1, empresas: 0, sinDatosDeContacto: 1 });
    expect(Object.keys(cuerpo).sort()).toEqual([
      "cumpleanosPorMes",
      "deudas",
      "hoy",
      "proximoCumpleanos",
      "recordatorios",
      "semanaPasada",
      "totales",
    ]);
  });

  it("pide sesión", async () => {
    expect((await pedir(app, null, "/api/contactos/widgets")).status).toBe(401);
  });
});

describe("la semana pasada", () => {
  const MS_POR_DIA = 86_400_000;
  const hace10 = new Date(AHORA.getTime() - 10 * MS_POR_DIA);

  it("lista lo que cayó en los últimos 7 días, el más reciente primero, hasta ocho", async () => {
    const contacto = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Beto", apellido: "Ruiz" }),
    );
    // Uno diario creado hace 10 días: una entrada por día, del 10 al 19 (ayer).
    await crearRecordatorio(
      cliente,
      ana.userId,
      contacto,
      { titulo: "Pastilla", repeticion: "diaria", hora: "08:00" },
      hace10,
    );
    // Dos de una sola vez que cayeron hace 3 y 4 días.
    for (const [titulo, fecha] of [
      ["Cita", "2026-10-17"],
      ["Llamar", "2026-10-16"],
    ] as const) {
      await crearRecordatorio(
        cliente,
        ana.userId,
        contacto,
        { titulo, repeticion: "unica", fecha, hora: "" },
        hace10,
      );
    }

    const { semanaPasada } = await widgets();
    // En los últimos 7 días hay nueve (siete de la pastilla y las dos citas): se listan ocho.
    expect(semanaPasada).toHaveLength(8);
    expect(semanaPasada[0]).toMatchObject({
      titulo: "Pastilla",
      dia: "2026-10-19",
      hora: "08:00",
      diasAtras: 1,
      contacto: { tipo: "persona", nombre: "Beto", apellido: "Ruiz" },
    });
    expect(semanaPasada.every((entrada) => entrada.diasAtras >= 1 && entrada.diasAtras <= 7)).toBe(
      true,
    );
    expect(semanaPasada.map((entrada) => entrada.titulo)).toContain("Cita");
  });

  it("no muestra lo de otra persona", async () => {
    const contacto = await crearContactoPorApi(app, ana.cookies, personaValida());
    await crearRecordatorio(
      cliente,
      ana.userId,
      contacto,
      { titulo: "Mío", repeticion: "unica", fecha: "2026-10-15", hora: "" },
      hace10,
    );
    const otra = await entrarComoPersona(app, cliente);
    expect((await obtenerWidgetsDeContactos(cliente, otra.userId, AHORA)).semanaPasada).toEqual([]);
    expect((await widgets()).semanaPasada).toHaveLength(1);
  });
});

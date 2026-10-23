// Tests de integración de los widgets de contactos, contra gestion_test.
// El cálculo se prueba con el servicio y un `ahora` fijo; la ruta, aparte.

import type { ClienteDb } from "@gestoria/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  cadaAnio,
  cadaMes,
  crearContactoPorApi,
  crearEtiquetaPorApi,
  empresaValida,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
  unaVez,
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
  it("devuelve todo en cero y sin cumpleaños", async () => {
    expect(await widgets()).toEqual({
      totales: { personas: 0, empresas: 0, favoritos: 0, sinDatosDeContacto: 0 },
      etiquetas: [],
      rubros: [],
      favoritos: [],
      recordatorios: { hoy: 0, proximos7: 0, proximos30: 0, porSemana: [0, 0, 0, 0], proximos: [] },
      porRepeticion: [],
      historial: { total: 0, ultimos7: 0, porDia: [0, 0, 0, 0, 0, 0, 0], ultimas: [] },
      masGastado: [],
      monedaBase: "UYU",
      proximoCumpleanos: null,
    });
  });
});

describe("totales", () => {
  it("cuenta personas, empresas, favoritos y contactos sin forma de comunicarse", async () => {
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

    const { totales, favoritos } = await widgets();
    expect(totales).toEqual({ personas: 3, empresas: 1, favoritos: 2, sinDatosDeContacto: 2 });
    expect(favoritos.map((favorito) => favorito.nombre).sort()).toEqual(["Con correo", "Taller"]);
  });

  it("no cuenta los contactos eliminados", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida({ favorito: true }));
    await pedir(app, ana.cookies, `/api/contactos/${id}`, "DELETE");
    expect((await widgets()).totales).toEqual({
      personas: 0,
      empresas: 0,
      favoritos: 0,
      sinDatosDeContacto: 0,
    });
  });

  it("muestra a lo sumo tres favoritos", async () => {
    for (const nombre of ["A", "B", "C", "D"]) {
      await crearContactoPorApi(app, ana.cookies, personaValida({ nombre, favorito: true }));
    }
    const resultado = await widgets();
    expect(resultado.totales.favoritos).toBe(4);
    expect(resultado.favoritos).toHaveLength(3);
  });
});

describe("etiquetas y rubros", () => {
  it("ordena las etiquetas por cantidad de contactos, ignora las vacías y se queda con tres", async () => {
    const [a, b, c, d] = [
      await crearEtiquetaPorApi(app, ana.cookies, "Familia"),
      await crearEtiquetaPorApi(app, ana.cookies, "Trabajo"),
      await crearEtiquetaPorApi(app, ana.cookies, "Amigos"),
      await crearEtiquetaPorApi(app, ana.cookies, "Médicos"),
    ];
    await crearEtiquetaPorApi(app, ana.cookies, "Vacía");
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "1", etiquetaIds: [a, b] }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "2", etiquetaIds: [a, c] }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "3", etiquetaIds: [a, d] }),
    );
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "4", etiquetaIds: [b] }));

    const { etiquetas } = await widgets();
    expect(etiquetas.map((etiqueta) => [etiqueta.nombre, etiqueta.contactos])).toEqual([
      ["Familia", 3],
      ["Trabajo", 2],
      ["Amigos", 1],
    ]);
    expect(etiquetas[0]?.color).toMatch(/^#/);
  });

  it("agrupa los rubros sin distinguir mayúsculas y salta las empresas sin rubro", async () => {
    await crearContactoPorApi(
      app,
      ana.cookies,
      empresaValida({ nombre: "E1", rubro: "Electricista" }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      empresaValida({ nombre: "E2", rubro: "electricista " }),
    );
    await crearContactoPorApi(app, ana.cookies, empresaValida({ nombre: "E3", rubro: "Banco" }));
    await crearContactoPorApi(app, ana.cookies, empresaValida({ nombre: "E4", rubro: "" }));

    expect((await widgets()).rubros).toEqual([
      { rubro: "Electricista", empresas: 2 },
      { rubro: "Banco", empresas: 1 },
    ]);
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
    await crearContactoPorApi(app, ana.cookies, personaValida({ favorito: true }));
    await crearContactoPorApi(app, otra.cookies, empresaValida());

    const respuesta = await pedir(app, ana.cookies, "/api/contactos/widgets");
    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<WidgetsDeContactos>(respuesta);
    expect(cuerpo.totales).toEqual({
      personas: 1,
      empresas: 0,
      favoritos: 1,
      sinDatosDeContacto: 1,
    });
    expect(Object.keys(cuerpo).sort()).toEqual([
      "etiquetas",
      "favoritos",
      "historial",
      "masGastado",
      "monedaBase",
      "porRepeticion",
      "proximoCumpleanos",
      "recordatorios",
      "rubros",
      "totales",
    ]);
  });

  it("pide sesión", async () => {
    expect((await pedir(app, null, "/api/contactos/widgets")).status).toBe(401);
  });
});

describe("el historial de recordatorios", () => {
  const MS_POR_DIA = 86_400_000;

  it("cuenta lo que cayó en los últimos 7 días (ayer es el último), con las tres más recientes", async () => {
    const contacto = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Beto" }));
    const hace10 = new Date(AHORA.getTime() - 10 * MS_POR_DIA);
    // Uno diario creado hace 10 días: una entrada por día, del 10 al 19.
    await crearRecordatorio(
      cliente,
      ana.userId,
      contacto,
      { titulo: "Pastilla", repeticion: "diaria", hora: "08:00" },
      hace10,
    );
    // Uno de una sola vez que cayó hace 3 días.
    await crearRecordatorio(
      cliente,
      ana.userId,
      contacto,
      { titulo: "Cita", repeticion: "unica", fecha: "2026-10-17", hora: "" },
      hace10,
    );

    const { historial, porRepeticion } = await widgets();
    expect(historial.total).toBe(11);
    // Los últimos 7 días: del 13 al 19; la pastilla cae todos y la cita el 17.
    expect(historial.ultimos7).toBe(8);
    expect(historial.porDia).toEqual([1, 1, 1, 1, 2, 1, 1]);
    expect(historial.ultimas).toHaveLength(3);
    expect(historial.ultimas[0]).toMatchObject({ titulo: "Pastilla", diasAtras: 1 });
    expect(historial.ultimas[0]?.contacto).toMatchObject({ nombre: "Beto", tipo: "persona" });
    // Solo queda vigente el diario (la cita se dio de baja al pasar al historial).
    expect(porRepeticion).toEqual([{ repeticion: "diaria", total: 1 }]);
  });

  it("los recordatorios vigentes se reparten por repetición, de más a menos", async () => {
    const contacto = await crearContactoPorApi(app, ana.cookies, personaValida());
    for (const datos of [
      cadaAnio("Cumple A", 2, 11),
      cadaAnio("Cumple B", 3, 11),
      cadaMes("Mensual", 15),
      unaVez("Una vez", "2026-10-25"),
    ]) {
      await crearRecordatorio(cliente, ana.userId, contacto, datos, AHORA);
    }
    const { porRepeticion, historial } = await widgets();
    expect(porRepeticion).toEqual([
      { repeticion: "anual", total: 2 },
      { repeticion: "unica", total: 1 },
      { repeticion: "mensual", total: 1 },
    ]);
    // Recién creados: todavía no pasó nada.
    expect(historial.total).toBe(0);
  });

  it("no mezcla el historial de una persona con el de otra", async () => {
    const contacto = await crearContactoPorApi(app, ana.cookies, personaValida());
    await crearRecordatorio(
      cliente,
      ana.userId,
      contacto,
      { titulo: "Mío", repeticion: "unica", fecha: "2026-10-15", hora: "" },
      new Date(AHORA.getTime() - 10 * MS_POR_DIA),
    );
    const otra = await entrarComoPersona(app, cliente);
    const { historial } = await obtenerWidgetsDeContactos(cliente, otra.userId, AHORA);
    expect(historial.total).toBe(0);
    expect((await widgets()).historial.total).toBe(1);
  });
});

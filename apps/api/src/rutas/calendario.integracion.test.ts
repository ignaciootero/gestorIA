// Tests de integración del calendario (/api/calendario), contra gestion_test.
//
// Cubren lo que pasa por HTTP: sesión, validación del rango y de los eventos manuales, el flujo
// de crear/editar/eliminar un evento, qué trae cada módulo (deudas de Finanzas, recordatorios de
// Contactos y tareas de Tareas), el orden por hora y que cada persona vea solo lo suyo.
//
// Los días se calculan a partir de "hoy" de la persona (zona de Montevideo), así los tests valen
// cualquier día del año.

import { type ClienteDb, esquema } from "@gestoria/db";
import {
  diaDeHoy,
  diaIsoDeLaSemana,
  type EventoDeCalendario,
  MAXIMO_DE_EVENTOS_DE_CALENDARIO,
  sumarDias,
} from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../pruebas/auth-de-prueba.ts";
import {
  crearContactoPorApi,
  crearDeudaPorApi,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
} from "../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";
import { generarHistorial } from "../servicios/contactos/historial-de-recordatorios.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let beto: PersonaDePrueba;

const ZONA = "America/Montevideo";
const ID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

type ErrorJson = { error: { codigo: string; campos?: { campo: string; mensaje: string }[] } };

/** El día de hoy para las personas de prueba, y el que está `dias` días de distancia. */
const hoy = () => diaDeHoy(ZONA);
const en = (dias: number) => sumarDias(hoy(), dias);

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente, { zonaHoraria: ZONA });
  beto = await entrarComoPersona(app, cliente, { usuario: "beto", zonaHoraria: ZONA });
});

afterAll(async () => {
  await cliente.cerrar();
});

async function eventos(
  persona: PersonaDePrueba,
  desde: string,
  hasta: string,
): Promise<EventoDeCalendario[]> {
  const respuesta = await pedir(
    app,
    persona.cookies,
    `/api/calendario/eventos?desde=${desde}&hasta=${hasta}`,
  );
  expect(respuesta.status).toBe(200);
  return (await leerJson<{ eventos: EventoDeCalendario[] }>(respuesta)).eventos;
}

const manual = (extra: Record<string, unknown> = {}) => ({
  titulo: "Dentista",
  notas: "",
  fecha: en(2),
  hora: "",
  ...extra,
});

async function crearManual(
  persona: PersonaDePrueba,
  cuerpo: unknown = manual(),
): Promise<EventoDeCalendario> {
  const respuesta = await pedir(app, persona.cookies, "/api/calendario/eventos", "POST", cuerpo);
  expect(respuesta.status).toBe(201);
  return await leerJson<EventoDeCalendario>(respuesta);
}

describe("sin sesión", () => {
  const rutas: [string, string][] = [
    ["GET", "/api/calendario/eventos?desde=2026-10-01&hasta=2026-10-31"],
    ["POST", "/api/calendario/eventos"],
    ["PUT", `/api/calendario/eventos/${ID_INEXISTENTE}`],
    ["DELETE", `/api/calendario/eventos/${ID_INEXISTENTE}`],
  ];

  it.each(rutas)("rechaza %s %s con 401", async (metodo, ruta) => {
    const respuesta = await pedir(app, null, ruta, metodo, metodo === "GET" ? undefined : {});
    expect(respuesta.status).toBe(401);
  });
});

describe("el rango que se pide", () => {
  it("exige las dos fechas", async () => {
    for (const consulta of ["", "?desde=2026-10-01", "?hasta=2026-10-31"]) {
      const respuesta = await pedir(app, ana.cookies, `/api/calendario/eventos${consulta}`);
      expect(respuesta.status, consulta).toBe(400);
    }
  });

  it("rechaza fechas que no existen y un final anterior al comienzo", async () => {
    for (const consulta of [
      "?desde=2026-02-30&hasta=2026-03-10",
      "?desde=ayer&hasta=hoy",
      "?desde=2026-10-20&hasta=2026-10-19",
    ]) {
      const respuesta = await pedir(app, ana.cookies, `/api/calendario/eventos${consulta}`);
      expect(respuesta.status, consulta).toBe(400);
      expect((await leerJson<ErrorJson>(respuesta)).error.codigo).toBe("VALIDACION_INVALIDA");
    }
  });

  it("rechaza pedir más de 70 días de una vez y acepta justo 70", async () => {
    const largo = await pedir(
      app,
      ana.cookies,
      `/api/calendario/eventos?desde=${en(0)}&hasta=${en(70)}`,
    );
    expect(largo.status).toBe(400);
    expect((await leerJson<ErrorJson>(largo)).error.campos?.[0]?.campo).toBe("hasta");

    const justo = await pedir(
      app,
      ana.cookies,
      `/api/calendario/eventos?desde=${en(0)}&hasta=${en(69)}`,
    );
    expect(justo.status).toBe(200);
  });

  it("sin nada cargado devuelve una lista vacía", async () => {
    expect(await eventos(ana, en(-10), en(10))).toEqual([]);
  });
});

describe("los eventos que se anotan a mano", () => {
  it("se crea, aparece en su día con sus datos, se edita y se elimina", async () => {
    const creado = await crearManual(
      ana,
      manual({ titulo: "Dentista", notas: "Llevar la ficha", hora: "09:30", fecha: en(3) }),
    );
    expect(creado).toMatchObject({
      origen: "manual",
      titulo: "Dentista",
      detalle: "Llevar la ficha",
      dia: en(3),
      hora: "09:30",
    });

    expect(await eventos(ana, en(0), en(10))).toEqual([creado]);

    const editar = await pedir(app, ana.cookies, `/api/calendario/eventos/${creado.id}`, "PUT", {
      titulo: "Dentista (cambiado)",
      notas: "",
      fecha: en(5),
      hora: "",
    });
    expect(editar.status).toBe(200);
    expect(await leerJson<EventoDeCalendario>(editar)).toMatchObject({
      id: creado.id,
      titulo: "Dentista (cambiado)",
      detalle: null,
      dia: en(5),
      hora: null,
    });
    expect(await eventos(ana, en(0), en(4))).toEqual([]);
    expect(await eventos(ana, en(5), en(5))).toHaveLength(1);

    const borrar = await pedir(app, ana.cookies, `/api/calendario/eventos/${creado.id}`, "DELETE");
    expect(borrar.status).toBe(200);
    expect(await eventos(ana, en(0), en(10))).toEqual([]);
  });

  it("el borrado es lógico: la fila queda con su fecha de eliminación", async () => {
    const creado = await crearManual(ana);
    await pedir(app, ana.cookies, `/api/calendario/eventos/${creado.id}`, "DELETE");
    const filas = await cliente.db.select().from(esquema.eventosDeCalendario);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.eliminadoEn).not.toBeNull();
  });

  it("eliminar o editar uno ya eliminado responde 404", async () => {
    const creado = await crearManual(ana);
    await pedir(app, ana.cookies, `/api/calendario/eventos/${creado.id}`, "DELETE");
    expect(
      (await pedir(app, ana.cookies, `/api/calendario/eventos/${creado.id}`, "DELETE")).status,
    ).toBe(404);
    expect(
      (await pedir(app, ana.cookies, `/api/calendario/eventos/${creado.id}`, "PUT", manual()))
        .status,
    ).toBe(404);
  });

  it("acepta un día pasado: el calendario también es un registro", async () => {
    const creado = await crearManual(ana, manual({ fecha: en(-30), titulo: "Mudanza" }));
    expect(await eventos(ana, en(-31), en(-29))).toEqual([creado]);
  });

  it("incluye los dos extremos del rango", async () => {
    const primero = await crearManual(ana, manual({ fecha: en(1), titulo: "Primero" }));
    const ultimo = await crearManual(ana, manual({ fecha: en(5), titulo: "Último" }));
    await crearManual(ana, manual({ fecha: en(6), titulo: "Fuera" }));
    await crearManual(ana, manual({ fecha: en(0), titulo: "Antes" }));
    expect(await eventos(ana, en(1), en(5))).toEqual([primero, ultimo]);
  });

  it("recorta el título y guarda las notas vacías como ausentes", async () => {
    const creado = await crearManual(ana, manual({ titulo: "  Reunión  ", notas: "   " }));
    expect(creado.titulo).toBe("Reunión");
    expect(creado.detalle).toBeNull();
  });

  it("explica por campo lo que está mal", async () => {
    const respuesta = await pedir(app, ana.cookies, "/api/calendario/eventos", "POST", {
      titulo: "   ",
      notas: "a".repeat(501),
      fecha: "2026-02-30",
      hora: "25:00",
    });
    expect(respuesta.status).toBe(400);
    const campos = (await leerJson<ErrorJson>(respuesta)).error.campos?.map((c) => c.campo);
    expect(campos).toEqual(expect.arrayContaining(["titulo", "notas", "fecha", "hora"]));
  });

  it("rechaza años fuera del calendario", async () => {
    for (const fecha of ["1899-12-31", "2201-01-01"]) {
      const respuesta = await pedir(
        app,
        ana.cookies,
        "/api/calendario/eventos",
        "POST",
        manual({ fecha }),
      );
      expect(respuesta.status, fecha).toBe(400);
    }
  });

  it("rechaza un id que no es un identificador", async () => {
    const respuesta = await pedir(
      app,
      ana.cookies,
      "/api/calendario/eventos/no-es-un-id",
      "DELETE",
    );
    expect(respuesta.status).toBe(400);
  });

  it("no deja pasar del máximo de eventos y avisa con un conflicto", async () => {
    const dias = Array.from({ length: MAXIMO_DE_EVENTOS_DE_CALENDARIO }, () => ({
      userId: ana.userId,
      titulo: "Relleno",
      dia: en(1),
    }));
    await cliente.db.insert(esquema.eventosDeCalendario).values(dias);

    const respuesta = await pedir(app, ana.cookies, "/api/calendario/eventos", "POST", manual());
    expect(respuesta.status).toBe(409);
    // Otra persona no se ve afectada por el tope de la primera.
    expect(
      (await pedir(app, beto.cookies, "/api/calendario/eventos", "POST", manual())).status,
    ).toBe(201);
  });

  it("los eliminados no cuentan para el máximo", async () => {
    const filas = Array.from({ length: MAXIMO_DE_EVENTOS_DE_CALENDARIO }, () => ({
      userId: ana.userId,
      titulo: "Relleno",
      dia: en(1),
      eliminadoEn: new Date(),
    }));
    await cliente.db.insert(esquema.eventosDeCalendario).values(filas);
    expect(
      (await pedir(app, ana.cookies, "/api/calendario/eventos", "POST", manual())).status,
    ).toBe(201);
  });
});

describe("las deudas de Finanzas", () => {
  it("el límite de una deuda pendiente aparece ese día, con lo que falta y con quién", async () => {
    const taller = await crearContactoPorApi(app, ana.cookies, {
      tipo: "persona",
      nombre: "Ana",
      apellido: "Pérez",
      fechaNacimiento: "",
      telefonos: [],
      correos: [],
      direccion: "",
      notas: "",
      favorito: false,
      etiquetaIds: [],
    });
    await crearDeudaPorApi(app, ana.cookies, {
      contactoId: taller,
      sentido: "me_deben",
      concepto: "Préstamo de la moto",
      monto: 1200.5,
      fechaLimite: en(4),
    });
    await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "El almacén",
      sentido: "debo",
      concepto: "Cuenta del mes",
      monto: 800,
      fechaLimite: en(6),
    });

    const lista = await eventos(ana, en(0), en(10));
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({
      origen: "finanzas",
      titulo: "Vence: Préstamo de la moto",
      dia: en(4),
      hora: null,
    });
    expect(lista[0]?.detalle).toContain("Ana Pérez te debe");
    expect(lista[0]?.detalle).toContain("1.200,50");
    expect(lista[1]).toMatchObject({ titulo: "Vence: Cuenta del mes", dia: en(6) });
    expect(lista[1]?.detalle).toContain("Le debés");
    expect(lista[1]?.detalle).toContain("El almacén");
  });

  it("muestra lo que falta pagar, no el monto original", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      concepto: "Cena",
      monto: 1000,
      fechaLimite: en(2),
    });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}/pagos`, "POST", {
      monto: 400,
      fecha: "2026-10-05",
    });
    const [evento] = await eventos(ana, en(0), en(5));
    expect(evento?.detalle).toContain("600,00");
  });

  it("una deuda saldada aparece completada, con el total que se pagó", async () => {
    const saldada = await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      sentido: "debo",
      concepto: "Saldada",
      monto: 100,
      fechaLimite: en(2),
    });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${saldada}/pagos`, "POST", {
      monto: 100,
      fecha: "2026-10-05",
    });
    await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      concepto: "Pendiente",
      monto: 50,
      fechaLimite: en(2),
    });

    const lista = await eventos(ana, en(0), en(10));
    expect(lista).toHaveLength(2);
    const pagada = lista.find((evento) => evento.titulo === "Vence: Saldada");
    expect(pagada).toMatchObject({ completado: true, dia: en(2) });
    expect(pagada?.detalle).toContain("Le pagaste");
    expect(pagada?.detalle).toContain("100,00");
    const pendiente = lista.find((evento) => evento.titulo === "Vence: Pendiente");
    expect(pendiente).toMatchObject({ completado: false });
  });

  it("una deuda sin fecha límite, eliminada o de otro día no aparece", async () => {
    await crearDeudaPorApi(app, ana.cookies, { nombreLibre: "Juan", concepto: "Sin límite" });
    const eliminada = await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      concepto: "Eliminada",
      fechaLimite: en(2),
    });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${eliminada}`, "DELETE");
    await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      concepto: "Otro mes",
      fechaLimite: en(40),
    });

    expect(await eventos(ana, en(0), en(10))).toEqual([]);
  });

  it("una deuda vencida (límite pasado) aparece en el día que venció", async () => {
    await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      concepto: "Vencida",
      fecha: en(-20),
      fechaLimite: en(-5),
    });
    const lista = await eventos(ana, en(-6), en(-4));
    expect(lista).toMatchObject([{ titulo: "Vence: Vencida", dia: en(-5) }]);
  });
});

describe("los recordatorios de Contactos", () => {
  async function contacto(persona: PersonaDePrueba, nombre = "Ana", apellido = "Pérez") {
    return await crearContactoPorApi(app, persona.cookies, {
      tipo: "persona",
      nombre,
      apellido,
      fechaNacimiento: "",
      telefonos: [],
      correos: [],
      direccion: "",
      notas: "",
      favorito: false,
      etiquetaIds: [],
    });
  }

  async function recordatorio(persona: PersonaDePrueba, contactoId: string, cuerpo: unknown) {
    const respuesta = await pedir(
      app,
      persona.cookies,
      `/api/contactos/${contactoId}/recordatorios`,
      "POST",
      cuerpo,
    );
    expect(respuesta.status).toBe(201);
    return await leerJson<{ id: string }>(respuesta);
  }

  it("uno de una sola vez aparece en su día, con su hora y el nombre del contacto", async () => {
    const id = await contacto(ana);
    await recordatorio(ana, id, {
      titulo: "Llamar por el cumpleaños",
      repeticion: "unica",
      fecha: en(3),
      hora: "18:45",
    });
    expect(await eventos(ana, en(0), en(10))).toMatchObject([
      {
        origen: "contactos",
        titulo: "Llamar por el cumpleaños",
        detalle: "Ana Pérez",
        dia: en(3),
        hora: "18:45",
      },
    ]);
    expect(await eventos(ana, en(4), en(10))).toEqual([]);
  });

  it("uno semanal aparece en cada semana del rango", async () => {
    const id = await contacto(ana);
    const dia = diaIsoDeLaSemana(en(3));
    await recordatorio(ana, id, {
      titulo: "Clase de guitarra",
      repeticion: "semanal",
      diaSemana: dia,
      hora: "",
    });
    const lista = await eventos(ana, en(0), en(20));
    expect(lista.map((e) => e.dia)).toEqual([en(3), en(10), en(17)]);
    // Cada aparición tiene su propio id, para que se puedan distinguir en la lista.
    expect(new Set(lista.map((e) => e.id)).size).toBe(3);
  });

  it("un recordatorio está completado cuando su día ya pasó; el de hoy y los que vienen, no", async () => {
    const id = await contacto(ana);
    await recordatorio(ana, id, { titulo: "Pastilla", repeticion: "diaria", hora: "08:00" });
    const lista = await eventos(ana, en(-2), en(2));
    expect(lista.map((e) => [e.dia, e.completado])).toEqual([
      [en(-2), true],
      [en(-1), true],
      [en(0), false],
      [en(1), false],
      [en(2), false],
    ]);
  });

  it("uno de una sola vez ya pasado viene completado", async () => {
    const id = await contacto(ana);
    // La API no deja crear uno en el pasado: se inserta directo, como el que quedó de hace unos días.
    await cliente.db.insert(esquema.recordatoriosDeContactos).values({
      userId: ana.userId,
      contactoId: id,
      titulo: "Ya fue",
      repeticion: "unica",
      fecha: en(-3),
    });
    await recordatorio(ana, id, { titulo: "Falta", repeticion: "unica", fecha: en(3), hora: "" });
    const lista = await eventos(ana, en(-5), en(5));
    expect(lista.map((e) => [e.titulo, e.completado])).toEqual([
      ["Ya fue", true],
      ["Falta", false],
    ]);
  });

  it("uno de una sola vez que pasó al histórico se sigue viendo en su día, completado", async () => {
    const id = await contacto(ana);
    await cliente.db.insert(esquema.recordatoriosDeContactos).values({
      userId: ana.userId,
      contactoId: id,
      titulo: "Ya fue",
      repeticion: "unica",
      fecha: en(-3),
    });
    // Al pasar al histórico el principal se da de baja: el evento sale de la entrada del histórico, una sola vez.
    await generarHistorial(cliente, ana.userId);
    const lista = await eventos(ana, en(-5), en(5));
    expect(lista.map((e) => [e.titulo, e.dia, e.completado])).toEqual([["Ya fue", en(-3), true]]);
  });

  it("uno diario aparece todos los días del rango, también los pasados", async () => {
    const id = await contacto(ana);
    await recordatorio(ana, id, { titulo: "Pastilla", repeticion: "diaria", hora: "08:00" });
    const lista = await eventos(ana, en(-2), en(2));
    expect(lista.map((e) => e.dia)).toEqual([en(-2), en(-1), en(0), en(1), en(2)]);
    expect(lista.every((e) => e.hora === "08:00")).toBe(true);
  });

  it("uno mensual del 31 cae el último día de los meses más cortos", async () => {
    const id = await contacto(ana);
    await recordatorio(ana, id, {
      titulo: "Pagar",
      repeticion: "mensual",
      diaDelMes: 31,
      hora: "",
    });
    const lista = await eventos(ana, "2027-02-01", "2027-04-10");
    expect(lista.map((e) => e.dia)).toEqual(["2027-02-28", "2027-03-31"]);
  });

  it("uno anual cae una vez por año", async () => {
    const id = await contacto(ana);
    await recordatorio(ana, id, {
      titulo: "Cumpleaños",
      repeticion: "anual",
      diaDelMes: 15,
      mes: 3,
      hora: "",
    });
    expect((await eventos(ana, "2027-03-01", "2027-03-31")).map((e) => e.dia)).toEqual([
      "2027-03-15",
    ]);
    expect(await eventos(ana, "2027-04-01", "2027-04-30")).toEqual([]);
  });

  it("no aparecen los de un contacto eliminado ni los recordatorios eliminados", async () => {
    const eliminado = await contacto(ana, "Beto", "Gómez");
    await recordatorio(ana, eliminado, {
      titulo: "De un contacto eliminado",
      repeticion: "unica",
      fecha: en(2),
      hora: "",
    });
    await pedir(app, ana.cookies, `/api/contactos/${eliminado}`, "DELETE");

    const activo = await contacto(ana);
    const quitado = await recordatorio(ana, activo, {
      titulo: "Quitado",
      repeticion: "unica",
      fecha: en(2),
      hora: "",
    });
    await pedir(app, ana.cookies, `/api/contactos/${activo}/recordatorios/${quitado.id}`, "DELETE");
    await recordatorio(ana, activo, {
      titulo: "Vigente",
      repeticion: "unica",
      fecha: en(2),
      hora: "",
    });

    expect((await eventos(ana, en(0), en(5))).map((e) => e.titulo)).toEqual(["Vigente"]);
  });

  it("un recordatorio de una sola vez fuera del rango no aparece", async () => {
    const id = await contacto(ana);
    await recordatorio(ana, id, {
      titulo: "Lejano",
      repeticion: "unica",
      fecha: en(60),
      hora: "",
    });
    expect(await eventos(ana, en(0), en(10))).toEqual([]);
    expect(await eventos(ana, en(55), en(65))).toHaveLength(1);
  });
});

describe("las tareas de Tareas", () => {
  async function tareaSuelta(persona: PersonaDePrueba, extra: Record<string, unknown> = {}) {
    const respuesta = await pedir(app, persona.cookies, "/api/tareas", "POST", {
      titulo: "Comprar pan",
      notas: "",
      fecha: en(2),
      hora: "",
      ...extra,
    });
    expect(respuesta.status).toBe(201);
    return await leerJson<{ id: string }>(respuesta);
  }

  async function repetitiva(persona: PersonaDePrueba, cuerpo: Record<string, unknown>) {
    const respuesta = await pedir(app, persona.cookies, "/api/tareas/repetitivas", "POST", {
      titulo: "Regar las plantas",
      notas: "",
      hora: "",
      ...cuerpo,
    });
    expect(respuesta.status).toBe(201);
    return await leerJson<{ id: string }>(respuesta);
  }

  it("una tarea pendiente aparece en su día, con su hora y su categoría", async () => {
    const categoria = await leerJson<{ id: number }>(
      await pedir(app, ana.cookies, "/api/tareas/categorias", "POST", { nombre: "Casa" }),
    );
    const { id } = await tareaSuelta(ana, { hora: "17:00", categoriaId: categoria.id });
    expect(await eventos(ana, en(0), en(5))).toEqual([
      {
        id: `tarea:${id}`,
        origen: "tareas",
        titulo: "Comprar pan",
        detalle: "Casa",
        dia: en(2),
        hora: "17:00",
        repeticion: "unica",
        completado: false,
        fallido: false,
      },
    ]);
  });

  it("una tarea tildada viene marcada como completada, y vuelve a pendiente si se destilda", async () => {
    const { id } = await tareaSuelta(ana);
    await pedir(app, ana.cookies, `/api/tareas/${id}/completada`, "PATCH", { completada: true });
    expect(await eventos(ana, en(0), en(5))).toMatchObject([
      { id: `tarea:${id}`, completado: true },
    ]);

    await pedir(app, ana.cookies, `/api/tareas/${id}/completada`, "PATCH", { completada: false });
    expect(await eventos(ana, en(0), en(5))).toMatchObject([{ completado: false }]);
  });

  it("una tarea eliminada no aparece, esté o no completada", async () => {
    const pendiente = await tareaSuelta(ana, { titulo: "Pendiente" });
    const hecha = await tareaSuelta(ana, { titulo: "Hecha" });
    await pedir(app, ana.cookies, `/api/tareas/${hecha.id}/completada`, "PATCH", {
      completada: true,
    });
    await pedir(app, ana.cookies, `/api/tareas/${pendiente.id}`, "DELETE");
    await pedir(app, ana.cookies, `/api/tareas/${hecha.id}`, "DELETE");
    expect(await eventos(ana, en(0), en(5))).toEqual([]);
  });

  it("una tarea vieja ya completada viene marcada como completada, y la pendiente no", async () => {
    await cliente.db.insert(esquema.tareas).values([
      { userId: ana.userId, titulo: "Hecha", dia: en(-4), completadaEn: new Date() },
      { userId: ana.userId, titulo: "Sin hacer", dia: en(-4) },
    ]);
    const lista = await eventos(ana, en(-5), en(-3));
    expect(lista.map((e) => [e.titulo, e.completado]).sort()).toEqual([
      ["Hecha", true],
      ["Sin hacer", false],
    ]);
  });

  it("los vencimientos de Finanzas y los eventos manuales nunca vienen completados", async () => {
    await crearManual(ana, manual({ titulo: "Manual", fecha: en(1) }));
    const lista = await eventos(ana, en(0), en(5));
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((e) => e.completado === false)).toBe(true);
  });

  it("una tarea atrasada sigue en el día en que había que hacerla", async () => {
    await cliente.db.insert(esquema.tareas).values({
      userId: ana.userId,
      titulo: "Vieja",
      dia: en(-4),
    });
    expect(await eventos(ana, en(-5), en(-3))).toMatchObject([{ titulo: "Vieja", dia: en(-4) }]);
    // No se mueve a hoy: en hoy no hay nada.
    expect(await eventos(ana, en(0), en(0))).toEqual([]);
  });

  it("una repetitiva aparece hoy (ya armada) y en cada día que viene", async () => {
    await repetitiva(ana, { repeticion: "diaria" });
    const lista = await eventos(ana, en(-3), en(3));
    // No antes de haberse creado, y sí desde hoy en adelante.
    expect(lista.map((e) => e.dia)).toEqual([en(0), en(1), en(2), en(3)]);
    expect(lista.every((e) => e.origen === "tareas" && e.detalle === "Se repite")).toBe(true);
    expect(new Set(lista.map((e) => e.id)).size).toBe(4);
  });

  it("tildar la de hoy no saca las de los días que vienen", async () => {
    await repetitiva(ana, { repeticion: "diaria" });
    const [deHoy] = await eventos(ana, en(0), en(0));
    expect(deHoy?.id.startsWith("tarea:")).toBe(true);
    const id = deHoy?.id.replace("tarea:", "");
    await pedir(app, ana.cookies, `/api/tareas/${id}/completada`, "PATCH", { completada: true });

    // La de hoy sigue, marcada como completada; las de los días que vienen siguen pendientes.
    const lista = await eventos(ana, en(0), en(2));
    expect(lista.map((e) => [e.dia, e.completado])).toEqual([
      [en(0), true],
      [en(1), false],
      [en(2), false],
    ]);
  });

  it("una cada tantos días aparece solo en los días que le tocan y se dice 'intervalo'", async () => {
    await repetitiva(ana, { repeticion: "intervalo", cadaDias: 2, fechaInicio: "" });
    const lista = await eventos(ana, en(0), en(7));
    expect(lista.map((e) => e.dia)).toEqual([en(0), en(2), en(4), en(6)]);
    expect(lista.every((e) => e.repeticion === "intervalo")).toBe(true);
  });

  it("una cada tantos días con inicio futuro no aparece antes de su inicio", async () => {
    await repetitiva(ana, { repeticion: "intervalo", cadaDias: 3, fechaInicio: en(4) });
    const lista = await eventos(ana, en(0), en(12));
    expect(lista.map((e) => e.dia)).toEqual([en(4), en(7), en(10)]);
  });

  it("una semanal de varios días aparece en todos ellos", async () => {
    const dias = [diaIsoDeLaSemana(en(2)), diaIsoDeLaSemana(en(4))];
    await repetitiva(ana, { repeticion: "semanal", diasSemana: dias });
    const lista = await eventos(ana, en(1), en(15));
    expect(lista.map((e) => e.dia)).toEqual([en(2), en(4), en(9), en(11)]);
  });

  it("una repetitiva eliminada deja de aparecer en los días que vienen", async () => {
    const { id } = await repetitiva(ana, { repeticion: "diaria" });
    await pedir(app, ana.cookies, `/api/tareas/repetitivas/${id}`, "DELETE");
    expect((await eventos(ana, en(1), en(5))).length).toBe(0);
  });

  it("con la hora de la repetitiva y su categoría", async () => {
    const categoria = await leerJson<{ id: number }>(
      await pedir(app, ana.cookies, "/api/tareas/categorias", "POST", { nombre: "Salud" }),
    );
    await repetitiva(ana, { repeticion: "diaria", hora: "07:15", categoriaId: categoria.id });
    const [evento] = await eventos(ana, en(1), en(1));
    expect(evento).toMatchObject({ hora: "07:15", detalle: "Salud · Se repite" });
  });
});

describe("cada cuánto se repite lo que origina cada evento", () => {
  async function contactoDe(persona: PersonaDePrueba) {
    return await crearContactoPorApi(app, persona.cookies, {
      tipo: "persona",
      nombre: "Ana",
      apellido: "",
      fechaNacimiento: "",
      telefonos: [],
      correos: [],
      direccion: "",
      notas: "",
      favorito: false,
      etiquetaIds: [],
    });
  }

  async function repetitiva(cuerpo: Record<string, unknown>) {
    const respuesta = await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", {
      titulo: "Rutina",
      notas: "",
      hora: "",
      ...cuerpo,
    });
    expect(respuesta.status).toBe(201);
  }

  it("una tarea suelta es 'unica' y las repetitivas dicen su repetición, también en los días que vienen", async () => {
    await pedir(app, ana.cookies, "/api/tareas", "POST", {
      titulo: "Suelta",
      notas: "",
      fecha: en(3),
      hora: "",
    });
    await repetitiva({ titulo: "Diaria", repeticion: "diaria" });
    await repetitiva({
      titulo: "Semanal",
      repeticion: "semanal",
      diasSemana: [diaIsoDeLaSemana(en(3))],
    });
    await repetitiva({
      titulo: "Mensual",
      repeticion: "mensual",
      diaDelMes: Number(en(3).slice(8, 10)),
    });
    await repetitiva({
      titulo: "Anual",
      repeticion: "anual",
      diaDelMes: Number(en(3).slice(8, 10)),
      mes: Number(en(3).slice(5, 7)),
    });

    const delDia = await eventos(ana, en(3), en(3));
    const porTitulo = Object.fromEntries(delDia.map((e) => [e.titulo, e.repeticion]));
    expect(porTitulo).toEqual({
      Suelta: "unica",
      Diaria: "diaria",
      Semanal: "semanal",
      Mensual: "mensual",
      Anual: "anual",
    });
  });

  it("la tarea de hoy, ya armada por una repetitiva, conserva la repetición de su regla", async () => {
    await repetitiva({
      titulo: "Semanal de hoy",
      repeticion: "semanal",
      diasSemana: [diaIsoDeLaSemana(en(0))],
    });
    const [deHoy] = await eventos(ana, en(0), en(0));
    // Es una fila real (id "tarea:..."), no una por venir, y aun así sabe que es semanal.
    expect(deHoy?.id.startsWith("tarea:")).toBe(true);
    expect(deHoy?.repeticion).toBe("semanal");
  });

  it("una tarea hecha de un día pasado de una repetitiva que después se eliminó sigue diciendo cómo se repetía", async () => {
    await repetitiva({ titulo: "Diaria que se va", repeticion: "diaria" });
    const [regla] = await cliente.db.select().from(esquema.tareasRepetitivas);
    await cliente.db.insert(esquema.tareas).values({
      userId: ana.userId,
      repetitivaId: regla?.id ?? "",
      titulo: "Diaria que se va",
      dia: en(-3),
      completadaEn: new Date(),
    });
    await pedir(app, ana.cookies, `/api/tareas/repetitivas/${regla?.id}`, "DELETE");
    const [pasada] = await eventos(ana, en(-3), en(-3));
    expect(pasada).toMatchObject({ repeticion: "diaria", completado: true });
  });

  describe("lo que quedó sin hacer en días pasados (igual que en Tareas)", () => {
    async function conUnaRepetitiva() {
      await repetitiva({ titulo: "Regar", repeticion: "diaria" });
      const [regla] = await cliente.db.select().from(esquema.tareasRepetitivas);
      return regla?.id ?? "";
    }

    it("una atrasada marcada como fallida viene como fallida y no como pendiente", async () => {
      await cliente.db.insert(esquema.tareas).values({
        userId: ana.userId,
        titulo: "Vieja fallida",
        dia: en(-3),
        falladaEn: new Date(),
      });
      const lista = await eventos(ana, en(-3), en(-3));
      expect(lista).toMatchObject([{ titulo: "Vieja fallida", completado: false, fallido: true }]);
    });

    it("una de repetitiva de un día pasado sin hacer aparece como pendiente: en Tareas es una atrasada", async () => {
      const repetitivaId = await conUnaRepetitiva();
      await cliente.db.insert(esquema.tareas).values([
        { userId: ana.userId, repetitivaId, titulo: "Regar", dia: en(-3) },
        {
          userId: ana.userId,
          repetitivaId,
          titulo: "Regar",
          dia: en(-2),
          completadaEn: new Date(),
        },
      ]);
      const lista = await eventos(ana, en(-3), en(-1));
      expect(lista.map((e) => [e.dia, e.completado, e.fallido])).toEqual([
        [en(-3), false, false],
        [en(-2), true, false],
      ]);
    });

    it("una suelta atrasada sí aparece, porque Tareas la arrastra como atrasada", async () => {
      await cliente.db.insert(esquema.tareas).values({
        userId: ana.userId,
        titulo: "Llamar",
        dia: en(-3),
      });
      expect(await eventos(ana, en(-3), en(-3))).toMatchObject([
        { titulo: "Llamar", completado: false },
      ]);
    });

    it("la de hoy sin hacer sí aparece", async () => {
      await conUnaRepetitiva();
      expect(await eventos(ana, en(0), en(0))).toMatchObject([
        { titulo: "Regar", completado: false },
      ]);
    });

    it("todo lo que muestra el calendario como pendiente también está en la lista de Tareas", async () => {
      const repetitivaId = await conUnaRepetitiva();
      await cliente.db.insert(esquema.tareas).values([
        { userId: ana.userId, repetitivaId, titulo: "Rutina vieja", dia: en(-4) },
        { userId: ana.userId, titulo: "Suelta vieja", dia: en(-4) },
      ]);
      const respuesta = await pedir(app, ana.cookies, "/api/tareas", "GET");
      const lista = await leerJson<{
        atrasadas: { titulo: string }[];
        deHoy: { titulo: string }[];
        masAdelante: { titulo: string }[];
      }>(respuesta);
      const enTareas = new Set(
        [...lista.atrasadas, ...lista.deHoy, ...lista.masAdelante].map((t) => t.titulo),
      );
      const pendientes = (await eventos(ana, en(-6), en(0))).filter((e) => !e.completado);
      expect(pendientes.length).toBeGreaterThan(0);
      for (const evento of pendientes) expect(enTareas.has(evento.titulo)).toBe(true);
    });
  });

  it("los recordatorios de contactos dicen su repetición", async () => {
    const id = await contactoDe(ana);
    const dia = diaIsoDeLaSemana(en(3));
    const casos: [string, Record<string, unknown>][] = [
      ["unica", { titulo: "A", repeticion: "unica", fecha: en(3), hora: "" }],
      ["diaria", { titulo: "B", repeticion: "diaria", hora: "08:00" }],
      ["semanal", { titulo: "C", repeticion: "semanal", diaSemana: dia, hora: "" }],
      [
        "mensual",
        { titulo: "D", repeticion: "mensual", diaDelMes: Number(en(3).slice(8, 10)), hora: "" },
      ],
      [
        "anual",
        {
          titulo: "E",
          repeticion: "anual",
          diaDelMes: Number(en(3).slice(8, 10)),
          mes: Number(en(3).slice(5, 7)),
          hora: "",
        },
      ],
    ];
    for (const [, cuerpo] of casos) {
      const respuesta = await pedir(
        app,
        ana.cookies,
        `/api/contactos/${id}/recordatorios`,
        "POST",
        cuerpo,
      );
      expect(respuesta.status).toBe(201);
    }
    const porTitulo = Object.fromEntries(
      (await eventos(ana, en(3), en(3))).map((e) => [e.titulo, e.repeticion]),
    );
    expect(porTitulo).toEqual({
      A: "unica",
      B: "diaria",
      C: "semanal",
      D: "mensual",
      E: "anual",
    });
  });

  it("los vencimientos de Finanzas y los eventos manuales no tienen repetición", async () => {
    await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      concepto: "Deuda",
      fechaLimite: en(2),
    });
    await crearManual(ana, manual({ fecha: en(2) }));
    const lista = await eventos(ana, en(2), en(2));
    expect(lista).toHaveLength(2);
    expect(lista.every((e) => e.repeticion === null)).toBe(true);
  });
});

describe("todo junto", () => {
  it("se ordena por hora: lo de todo el día primero y después de la más temprana a la más tardía", async () => {
    const dia = en(2);
    await crearManual(ana, manual({ titulo: "Manual 10", hora: "10:00", fecha: dia }));
    await crearManual(ana, manual({ titulo: "Manual todo el día", hora: "", fecha: dia }));
    await pedir(app, ana.cookies, "/api/tareas", "POST", {
      titulo: "Tarea 08",
      notas: "",
      fecha: dia,
      hora: "08:00",
    });
    await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      concepto: "Deuda",
      fechaLimite: dia,
    });
    const contactoId = await crearContactoPorApi(app, ana.cookies, {
      tipo: "persona",
      nombre: "Ana",
      apellido: "",
      fechaNacimiento: "",
      telefonos: [],
      correos: [],
      direccion: "",
      notas: "",
      favorito: false,
      etiquetaIds: [],
    });
    await pedir(app, ana.cookies, `/api/contactos/${contactoId}/recordatorios`, "POST", {
      titulo: "Recordatorio 18",
      repeticion: "unica",
      fecha: dia,
      hora: "18:30",
    });

    const lista = await eventos(ana, dia, dia);
    expect(lista.map((e) => `${e.hora ?? "todo el día"} ${e.origen}`)).toEqual([
      "todo el día finanzas",
      "todo el día manual",
      "08:00 tareas",
      "10:00 manual",
      "18:30 contactos",
    ]);
  });

  it("ordena por día y devuelve los días en el orden del calendario", async () => {
    await crearManual(ana, manual({ titulo: "C", fecha: en(3) }));
    await crearManual(ana, manual({ titulo: "A", fecha: en(1) }));
    await crearManual(ana, manual({ titulo: "B", fecha: en(2) }));
    expect((await eventos(ana, en(0), en(5))).map((e) => e.titulo)).toEqual(["A", "B", "C"]);
  });
});

describe("cada persona ve solo lo suyo", () => {
  it("no ve los eventos, deudas, recordatorios ni tareas de otra", async () => {
    await crearManual(ana);
    await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Juan",
      concepto: "Deuda de Ana",
      fechaLimite: en(2),
    });
    const contactoId = await crearContactoPorApi(app, ana.cookies, {
      tipo: "persona",
      nombre: "Ana",
      apellido: "",
      fechaNacimiento: "",
      telefonos: [],
      correos: [],
      direccion: "",
      notas: "",
      favorito: false,
      etiquetaIds: [],
    });
    await pedir(app, ana.cookies, `/api/contactos/${contactoId}/recordatorios`, "POST", {
      titulo: "Recordatorio de Ana",
      repeticion: "unica",
      fecha: en(2),
      hora: "",
    });
    await pedir(app, ana.cookies, "/api/tareas", "POST", {
      titulo: "Tarea de Ana",
      notas: "",
      fecha: en(2),
      hora: "",
    });
    await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", {
      titulo: "Repetitiva de Ana",
      notas: "",
      repeticion: "diaria",
      hora: "",
    });

    expect((await eventos(ana, en(0), en(5))).length).toBeGreaterThanOrEqual(4);
    expect(await eventos(beto, en(0), en(5))).toEqual([]);
  });

  it("no puede editar ni eliminar el evento de otra persona: responde 404", async () => {
    const delOtro = await crearManual(ana);
    expect(
      (await pedir(app, beto.cookies, `/api/calendario/eventos/${delOtro.id}`, "PUT", manual()))
        .status,
    ).toBe(404);
    expect(
      (await pedir(app, beto.cookies, `/api/calendario/eventos/${delOtro.id}`, "DELETE")).status,
    ).toBe(404);
    // Sigue intacto para su dueña.
    expect(await eventos(ana, en(0), en(5))).toEqual([delOtro]);
  });

  it("el id de usuario del cuerpo se ignora: el evento es de quien tiene la sesión", async () => {
    const respuesta = await pedir(
      app,
      beto.cookies,
      "/api/calendario/eventos",
      "POST",
      manual({ userId: ana.userId }),
    );
    expect(respuesta.status).toBe(201);
    expect(await eventos(ana, en(0), en(5))).toEqual([]);
    expect(await eventos(beto, en(0), en(5))).toHaveLength(1);
  });
});

// Tests de integración de las rutas de tareas (/api/tareas), contra gestion_test.
//
// Cubren lo que pasa por HTTP: sesión, validaciones con mensajes por campo, el flujo completo
// de una tarea y el aislamiento entre personas. La lógica de días (repetir, arrastrar, historial)
// se prueba en servicios/tareas/tareas.integracion.test.ts con un reloj fijo.

import { type ClienteDb, esquema } from "@gestoria/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase, ponerDebeCambiarPassword } from "../pruebas/auth-de-prueba.ts";
import { entrarComoPersona, type PersonaDePrueba, pedir } from "../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let beto: PersonaDePrueba;

const ID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

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

type TareaJson = {
  id: string;
  titulo: string;
  notas: string | null;
  dia: string;
  hora: string | null;
  completada: boolean;
  completadaEn: string | null;
  fallida: boolean;
  falladaEn: string | null;
  repetitiva: boolean;
};
type ListaJson = {
  hoy: string;
  atrasadas: TareaJson[];
  deHoy: TareaJson[];
  hechasHoy: TareaJson[];
  falladasHoy: TareaJson[];
  masAdelante: TareaJson[];
};
type ErrorJson = { error: { codigo: string; campos?: { campo: string; mensaje: string }[] } };

const tarea = (extra: Record<string, unknown> = {}) => ({
  titulo: "Comprar pan",
  notas: "",
  fecha: "",
  hora: "",
  ...extra,
});
const diaria = (extra: Record<string, unknown> = {}) => ({
  titulo: "Regar las plantas",
  notas: "",
  repeticion: "diaria",
  hora: "",
  ...extra,
});

async function crear(persona: PersonaDePrueba, cuerpo: unknown = tarea()): Promise<TareaJson> {
  const respuesta = await pedir(app, persona.cookies, "/api/tareas", "POST", cuerpo);
  expect(respuesta.status).toBe(201);
  return await leerJson<TareaJson>(respuesta);
}

async function lista(persona: PersonaDePrueba): Promise<ListaJson> {
  const respuesta = await pedir(app, persona.cookies, "/api/tareas");
  expect(respuesta.status).toBe(200);
  return await leerJson<ListaJson>(respuesta);
}

describe("sin sesión o sin poder usar la cuenta todavía", () => {
  const rutas: [string, string][] = [
    ["GET", "/api/tareas"],
    ["POST", "/api/tareas"],
    ["PUT", `/api/tareas/${ID_INEXISTENTE}`],
    ["PATCH", `/api/tareas/${ID_INEXISTENTE}/completada`],
    ["PATCH", `/api/tareas/${ID_INEXISTENTE}/fallida`],
    ["DELETE", `/api/tareas/${ID_INEXISTENTE}`],
    ["GET", "/api/tareas/historial"],
    ["GET", "/api/tareas/repetitivas"],
    ["POST", "/api/tareas/repetitivas"],
    ["PUT", `/api/tareas/repetitivas/${ID_INEXISTENTE}`],
    ["DELETE", `/api/tareas/repetitivas/${ID_INEXISTENTE}`],
  ];

  it.each(rutas)("rechaza %s %s sin sesión con 401", async (metodo, ruta) => {
    const respuesta = await pedir(app, null, ruta, metodo, metodo === "GET" ? undefined : {});
    expect(respuesta.status).toBe(401);
  });

  it("rechaza a quien tiene que cambiar la contraseña antes de seguir", async () => {
    await ponerDebeCambiarPassword(
      cliente,
      (await cliente.db.query.usuarios.findFirst({ columns: { email: true } }))?.email ?? "",
    );
    const respuesta = await pedir(app, ana.cookies, "/api/tareas");
    expect(respuesta.status).toBe(403);
  });
});

describe("el flujo de una tarea de uso único", () => {
  it("se crea, aparece en hoy, se tilda, se destilda y se elimina", async () => {
    const creada = await crear(
      ana,
      tarea({ titulo: "Llamar a mamá", hora: "18:00", notas: "Su cumple" }),
    );
    expect(creada).toMatchObject({
      titulo: "Llamar a mamá",
      hora: "18:00",
      notas: "Su cumple",
      completada: false,
      repetitiva: false,
    });

    let hoy = await lista(ana);
    expect(hoy.deHoy.map((t) => t.id)).toEqual([creada.id]);
    expect(hoy.deHoy[0]?.dia).toBe(hoy.hoy);

    const tildada = await pedir(app, ana.cookies, `/api/tareas/${creada.id}/completada`, "PATCH", {
      completada: true,
    });
    expect(tildada.status).toBe(200);
    expect(await leerJson<TareaJson>(tildada)).toMatchObject({ completada: true });
    hoy = await lista(ana);
    expect(hoy.deHoy).toEqual([]);
    expect(hoy.hechasHoy.map((t) => t.id)).toEqual([creada.id]);

    const destildada = await pedir(
      app,
      ana.cookies,
      `/api/tareas/${creada.id}/completada`,
      "PATCH",
      {
        completada: false,
      },
    );
    expect(await leerJson<TareaJson>(destildada)).toMatchObject({ completada: false });
    expect((await lista(ana)).deHoy).toHaveLength(1);

    const eliminada = await pedir(app, ana.cookies, `/api/tareas/${creada.id}`, "DELETE");
    expect(eliminada.status).toBe(200);
    expect((await lista(ana)).deHoy).toEqual([]);
    expect((await pedir(app, ana.cookies, `/api/tareas/${creada.id}`, "DELETE")).status).toBe(404);
  });

  it("se edita", async () => {
    const creada = await crear(ana);
    const respuesta = await pedir(
      app,
      ana.cookies,
      `/api/tareas/${creada.id}`,
      "PUT",
      tarea({
        titulo: "Comprar pan y leche",
        fecha: "2999-01-01",
        hora: "07:30",
      }),
    );
    expect(respuesta.status).toBe(200);
    expect(await leerJson<TareaJson>(respuesta)).toMatchObject({
      titulo: "Comprar pan y leche",
      dia: "2999-01-01",
      hora: "07:30",
    });
    // Con un día futuro, ya no está en hoy sino en "más adelante".
    const hoy = await lista(ana);
    expect(hoy.deHoy).toEqual([]);
    expect(hoy.masAdelante).toHaveLength(1);
  });

  it("recorta los espacios del título y guarda el resto tal cual", async () => {
    const creada = await crear(ana, tarea({ titulo: "   Con espacios   ", notas: "  una nota  " }));
    expect(creada).toMatchObject({ titulo: "Con espacios", notas: "una nota" });
  });

  it("acepta caracteres especiales y emojis", async () => {
    const titulo = "Comprar <b>pan</b> & 'leche' — ñandú 🍞";
    expect((await crear(ana, tarea({ titulo }))).titulo).toBe(titulo);
  });
});

describe("validaciones", () => {
  it.each([
    ["sin título", tarea({ titulo: "" }), "titulo"],
    ["con título solo de espacios", tarea({ titulo: "    " }), "titulo"],
    ["con un título larguísimo", tarea({ titulo: "a".repeat(121) }), "titulo"],
    ["con notas larguísimas", tarea({ notas: "a".repeat(501) }), "notas"],
    ["con un día que no existe", tarea({ fecha: "2026-02-30" }), "fecha"],
    ["con un día mal escrito", tarea({ fecha: "mañana" }), "fecha"],
    ["con una hora inválida", tarea({ hora: "25:61" }), "hora"],
  ])("rechaza una tarea %s", async (_nombre, cuerpo, campo) => {
    const respuesta = await pedir(app, ana.cookies, "/api/tareas", "POST", cuerpo);
    expect(respuesta.status).toBe(400);
    const error = await leerJson<ErrorJson>(respuesta);
    expect(error.error.campos?.map((c) => c.campo)).toContain(campo);
  });

  it("explica que un día pasado no sirve, junto al campo 'fecha'", async () => {
    const respuesta = await pedir(
      app,
      ana.cookies,
      "/api/tareas",
      "POST",
      tarea({ fecha: "2000-01-01" }),
    );
    expect(respuesta.status).toBe(400);
    const error = await leerJson<ErrorJson>(respuesta);
    expect(error.error.campos?.[0]).toMatchObject({ campo: "fecha" });
    expect(error.error.campos?.[0]?.mensaje).toMatch(/ya pasó/);
  });

  it("rechaza un cuerpo que no es lo esperado", async () => {
    for (const cuerpo of [{}, { titulo: 5 }, [], null]) {
      const respuesta = await pedir(app, ana.cookies, "/api/tareas", "POST", cuerpo);
      expect(respuesta.status, JSON.stringify(cuerpo)).toBe(400);
    }
  });

  it("rechaza un id que no es un uuid", async () => {
    for (const [metodo, ruta, cuerpo] of [
      ["PUT", "/api/tareas/abc", tarea()],
      ["PATCH", "/api/tareas/abc/completada", { completada: true }],
      ["PATCH", "/api/tareas/abc/fallida", { fallida: true }],
      ["DELETE", "/api/tareas/abc", undefined],
      ["PUT", "/api/tareas/repetitivas/abc", diaria()],
      ["DELETE", "/api/tareas/repetitivas/abc", undefined],
    ] as const) {
      const respuesta = await pedir(app, ana.cookies, ruta, metodo, cuerpo);
      expect(respuesta.status, `${metodo} ${ruta}`).toBe(400);
    }
  });

  it("rechaza tildar con un valor que no es verdadero o falso", async () => {
    const creada = await crear(ana);
    for (const cuerpo of [{}, { completada: "si" }, { completada: 1 }]) {
      const respuesta = await pedir(
        app,
        ana.cookies,
        `/api/tareas/${creada.id}/completada`,
        "PATCH",
        cuerpo,
      );
      expect(respuesta.status, JSON.stringify(cuerpo)).toBe(400);
    }
  });

  it("una atrasada y una de hoy se marcan como fallidas y se pueden deshacer; una futura no", async () => {
    // De hace unos días (más de una semana ya se daría por fallida sola).
    const haceTresDias = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const [vieja] = await cliente.db
      .insert(esquema.tareas)
      .values({ userId: ana.userId, titulo: "Vieja", dia: haceTresDias })
      .returning();
    const deHoy = await crear(ana);
    expect((await lista(ana)).atrasadas.map((t) => t.titulo)).toEqual(["Vieja"]);

    const fallada = await pedir(app, ana.cookies, `/api/tareas/${vieja?.id}/fallida`, "PATCH", {
      fallida: true,
    });
    expect(fallada.status).toBe(200);
    expect(await leerJson<TareaJson>(fallada)).toMatchObject({
      fallida: true,
      completada: false,
      falladaEn: expect.any(String),
    });
    const despues = await lista(ana);
    expect(despues.atrasadas).toEqual([]);
    expect(despues.falladasHoy.map((t) => t.titulo)).toEqual(["Vieja"]);

    const deshecha = await pedir(app, ana.cookies, `/api/tareas/${vieja?.id}/fallida`, "PATCH", {
      fallida: false,
    });
    expect(await leerJson<TareaJson>(deshecha)).toMatchObject({ fallida: false, falladaEn: null });
    expect((await lista(ana)).atrasadas.map((t) => t.titulo)).toEqual(["Vieja"]);

    // Una de un día futuro todavía no le toca: no se puede dar por fallida.
    const futura = await crear(ana, tarea({ titulo: "Para después", fecha: "2999-01-01" }));
    const rechazada = await pedir(app, ana.cookies, `/api/tareas/${futura.id}/fallida`, "PATCH", {
      fallida: true,
    });
    expect(rechazada.status).toBe(409);
    expect((await lista(ana)).masAdelante.map((t) => t.titulo)).toEqual(["Para después"]);

    // Una de hoy sí: ya se sabe que no se va a hacer. Queda en Fallidas hoy y se puede deshacer.
    const deHoyFallada = await pedir(app, ana.cookies, `/api/tareas/${deHoy.id}/fallida`, "PATCH", {
      fallida: true,
    });
    expect(deHoyFallada.status).toBe(200);
    const conLaDeHoyFallada = await lista(ana);
    expect(conLaDeHoyFallada.deHoy).toEqual([]);
    expect(conLaDeHoyFallada.falladasHoy.map((t) => t.titulo)).toEqual(["Comprar pan"]);
    await pedir(app, ana.cookies, `/api/tareas/${deHoy.id}/fallida`, "PATCH", { fallida: false });
    expect((await lista(ana)).deHoy.map((t) => t.titulo)).toEqual(["Comprar pan"]);
  });

  it("rechaza marcar como fallida con un valor que no es verdadero o falso", async () => {
    const creada = await crear(ana);
    for (const cuerpo of [{}, { fallida: "si" }, { fallida: 1 }, { completada: true }]) {
      const respuesta = await pedir(
        app,
        ana.cookies,
        `/api/tareas/${creada.id}/fallida`,
        "PATCH",
        cuerpo,
      );
      expect(respuesta.status, JSON.stringify(cuerpo)).toBe(400);
    }
  });

  it("el historial rechaza un 'antes' que no es un día", async () => {
    const respuesta = await pedir(app, ana.cookies, "/api/tareas/historial?desde=ayer");
    expect(respuesta.status).toBe(400);
  });

  it("responde 404 si la tarea no existe", async () => {
    expect(
      (await pedir(app, ana.cookies, `/api/tareas/${ID_INEXISTENTE}`, "PUT", tarea())).status,
    ).toBe(404);
    expect(
      (
        await pedir(app, ana.cookies, `/api/tareas/${ID_INEXISTENTE}/completada`, "PATCH", {
          completada: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await pedir(app, ana.cookies, `/api/tareas/${ID_INEXISTENTE}/fallida`, "PATCH", {
          fallida: true,
        })
      ).status,
    ).toBe(404);
    expect((await pedir(app, ana.cookies, `/api/tareas/${ID_INEXISTENTE}`, "DELETE")).status).toBe(
      404,
    );
  });

  it("al llegar al tope de tareas pendientes avisa con un conflicto claro", async () => {
    await cliente.db.insert(esquema.tareas).values(
      Array.from({ length: 500 }, (_, i) => ({
        userId: ana.userId,
        titulo: `T${i}`,
        dia: "2999-01-01",
      })),
    );
    const respuesta = await pedir(app, ana.cookies, "/api/tareas", "POST", tarea());
    expect(respuesta.status).toBe(409);
    expect((await leerJson<ErrorJson>(respuesta)).error.codigo).toBe("CONFLICTO");
  });
});

describe("repetitivas cada tantos días, por la API", () => {
  const cadaDias = (extra: Record<string, unknown> = {}) =>
    diaria({ repeticion: "intervalo", cadaDias: 2, fechaInicio: "", ...extra });

  it("se crea, se ve con su ciclo y la tarea de hoy sale sola", async () => {
    const creada = await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", cadaDias());
    expect(creada.status).toBe(201);
    expect(await leerJson<Record<string, unknown>>(creada)).toMatchObject({
      repeticion: "intervalo",
      cadaDias: 2,
      diasRestantes: 0,
    });
    expect((await lista(ana)).deHoy.map((t) => t.titulo)).toEqual(["Regar las plantas"]);
  });

  it.each([
    ["sin la cantidad de días", cadaDias({ cadaDias: undefined })],
    ["cada 1 día", cadaDias({ cadaDias: 1 })],
    ["cada 366 días", cadaDias({ cadaDias: 366 })],
    ["con decimales", cadaDias({ cadaDias: 2.5 })],
    ["con texto", cadaDias({ cadaDias: "dos" })],
    ["sin inicio", cadaDias({ fechaInicio: undefined })],
    ["con un inicio que no existe", cadaDias({ fechaInicio: "2026-02-30" })],
  ])("rechaza %s", async (_nombre, cuerpo) => {
    const respuesta = await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", cuerpo);
    expect(respuesta.status).toBe(400);
  });

  it("rechaza un inicio que ya pasó, con el mensaje junto al campo", async () => {
    const respuesta = await pedir(
      app,
      ana.cookies,
      "/api/tareas/repetitivas",
      "POST",
      cadaDias({ fechaInicio: "2020-01-01" }),
    );
    expect(respuesta.status).toBe(400);
    expect((await leerJson<ErrorJson>(respuesta)).error.campos?.[0]?.campo).toBe("fechaInicio");
  });

  it("un inicio futuro no aparece hoy y la lista de repetitivas dice cuándo le toca", async () => {
    await pedir(
      app,
      ana.cookies,
      "/api/tareas/repetitivas",
      "POST",
      cadaDias({ fechaInicio: "2999-01-01" }),
    );
    expect((await lista(ana)).deHoy).toEqual([]);
    const listado = await pedir(app, ana.cookies, "/api/tareas/repetitivas");
    const { repetitivas } = await leerJson<{
      repetitivas: { proximaFecha: string; fechaInicio: string }[];
    }>(listado);
    expect(repetitivas[0]).toMatchObject({ proximaFecha: "2999-01-01", fechaInicio: "2999-01-01" });
  });

  it("se edita (cada cuántos días) sin perder el inicio", async () => {
    const creada = await leerJson<{ id: string; fechaInicio: string }>(
      await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", cadaDias()),
    );
    const editada = await pedir(
      app,
      ana.cookies,
      `/api/tareas/repetitivas/${creada.id}`,
      "PUT",
      cadaDias({ cadaDias: 5, fechaInicio: creada.fechaInicio }),
    );
    expect(editada.status).toBe(200);
    expect(await leerJson<Record<string, unknown>>(editada)).toMatchObject({
      cadaDias: 5,
      fechaInicio: creada.fechaInicio,
    });
  });
});

describe("repetitivas que se dan por fallidas solas, por la API", () => {
  it("se crean con la opción prendida, que se ve al listar y se puede apagar al editar", async () => {
    const creada = await pedir(
      app,
      ana.cookies,
      "/api/tareas/repetitivas",
      "POST",
      diaria({ fallaSola: true }),
    );
    expect(creada.status).toBe(201);
    const repetitiva = await leerJson<{ id: string; fallaSola: boolean }>(creada);
    expect(repetitiva.fallaSola).toBe(true);

    const editada = await pedir(
      app,
      ana.cookies,
      `/api/tareas/repetitivas/${repetitiva.id}`,
      "PUT",
      diaria({ fallaSola: false }),
    );
    expect((await leerJson<{ fallaSola: boolean }>(editada)).fallaSola).toBe(false);
  });

  it("sin indicarla, es que no", async () => {
    const creada = await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", diaria());
    expect((await leerJson<{ fallaSola: boolean }>(creada)).fallaSola).toBe(false);
  });

  it("rechaza un valor que no es verdadero o falso", async () => {
    for (const fallaSola of ["si", 1, null]) {
      const respuesta = await pedir(
        app,
        ana.cookies,
        "/api/tareas/repetitivas",
        "POST",
        diaria({ fallaSola }),
      );
      expect(respuesta.status, JSON.stringify(fallaSola)).toBe(400);
    }
  });
});

describe("tareas repetitivas por la API", () => {
  it("se crean, se listan con su próxima vez, se editan y se eliminan", async () => {
    const creada = await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", diaria());
    expect(creada.status).toBe(201);
    const repetitiva = await leerJson<{ id: string; repeticion: string; diasRestantes: number }>(
      creada,
    );
    expect(repetitiva).toMatchObject({ repeticion: "diaria", diasRestantes: 0 });

    // La tarea de hoy sale sola.
    const hoy = await lista(ana);
    expect(hoy.deHoy).toMatchObject([{ titulo: "Regar las plantas", repetitiva: true }]);

    const listado = await pedir(app, ana.cookies, "/api/tareas/repetitivas");
    expect((await leerJson<{ repetitivas: unknown[] }>(listado)).repetitivas).toHaveLength(1);

    const editada = await pedir(
      app,
      ana.cookies,
      `/api/tareas/repetitivas/${repetitiva.id}`,
      "PUT",
      {
        titulo: "Regar los helechos",
        notas: "",
        repeticion: "semanal",
        diasSemana: [6, 7],
        hora: "09:00",
      },
    );
    expect(editada.status).toBe(200);
    expect(await leerJson(editada)).toMatchObject({
      titulo: "Regar los helechos",
      repeticion: "semanal",
      diasSemana: [6, 7],
      hora: "09:00",
    });

    const eliminada = await pedir(
      app,
      ana.cookies,
      `/api/tareas/repetitivas/${repetitiva.id}`,
      "DELETE",
    );
    expect(eliminada.status).toBe(200);
    expect(
      (await pedir(app, ana.cookies, `/api/tareas/repetitivas/${repetitiva.id}`, "DELETE")).status,
    ).toBe(404);
    expect((await lista(ana)).deHoy).toEqual([]);
  });

  it.each([
    ["de una sola vez", diaria({ repeticion: "unica" })],
    ["semanal sin día de la semana", diaria({ repeticion: "semanal" })],
    ["semanal con el día 8", diaria({ repeticion: "semanal", diasSemana: [8] })],
    ["semanal con una lista vacía de días", diaria({ repeticion: "semanal", diasSemana: [] })],
    ["semanal con un día repetido", diaria({ repeticion: "semanal", diasSemana: [1, 1] })],
    [
      "semanal con un solo día suelto (el campo viejo)",
      diaria({ repeticion: "semanal", diaSemana: 3 }),
    ],
    ["mensual sin día", diaria({ repeticion: "mensual" })],
    ["anual con el 31 de abril", diaria({ repeticion: "anual", diaDelMes: 31, mes: 4 })],
    ["sin título", diaria({ titulo: "" })],
    ["con hora inválida", diaria({ hora: "7" })],
  ])("rechaza una repetitiva %s", async (_nombre, cuerpo) => {
    const respuesta = await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", cuerpo);
    expect(respuesta.status).toBe(400);
  });

  it("al llegar al tope avisa con un conflicto", async () => {
    await cliente.db.insert(esquema.tareasRepetitivas).values(
      Array.from({ length: 100 }, (_, i) => ({
        userId: ana.userId,
        titulo: `R${i}`,
        repeticion: "diaria",
        desde: "2026-01-01",
      })),
    );
    const respuesta = await pedir(app, ana.cookies, "/api/tareas/repetitivas", "POST", diaria());
    expect(respuesta.status).toBe(409);
  });

  it("el historial responde con la forma esperada", async () => {
    const respuesta = await pedir(app, ana.cookies, "/api/tareas/historial");
    expect(respuesta.status).toBe(200);
    expect(await leerJson(respuesta)).toMatchObject({ dias: [], hayMas: false });
  });

  it("el historial acepta filtros y los campos en blanco como si no estuvieran", async () => {
    const respuesta = await pedir(
      app,
      ana.cookies,
      "/api/tareas/historial?desde=&hasta=&estado=&categoriaId=sin&repeticion=intervalo",
    );
    expect(respuesta.status).toBe(200);
  });

  it.each([
    "desde=ayer",
    "hasta=2026-02-30",
    "estado=otra",
    "categoriaId=abc",
    "categoriaId=-3",
    "repeticion=quincenal",
    "desde=2026-10-10&hasta=2026-10-01",
  ])("el historial rechaza el filtro %s", async (consulta) => {
    const respuesta = await pedir(app, ana.cookies, `/api/tareas/historial?${consulta}`);
    expect(respuesta.status).toBe(400);
  });
});

describe("privacidad entre personas", () => {
  it("una persona no ve, no edita, no tilda ni elimina lo de otra: responde 404 como si no existiera", async () => {
    const deAna = await crear(ana, tarea({ titulo: "Secreto" }));
    const pedido = await pedir(
      app,
      ana.cookies,
      "/api/tareas/repetitivas",
      "POST",
      diaria({ titulo: "Rutina secreta" }),
    );
    const repetitivaDeAna = await leerJson<{ id: string }>(pedido);

    expect((await lista(beto)).deHoy).toEqual([]);
    const reps = await pedir(app, beto.cookies, "/api/tareas/repetitivas");
    expect((await leerJson<{ repetitivas: unknown[] }>(reps)).repetitivas).toEqual([]);

    const intentos: [string, string, unknown][] = [
      ["PUT", `/api/tareas/${deAna.id}`, tarea({ titulo: "Hackeada" })],
      ["PATCH", `/api/tareas/${deAna.id}/completada`, { completada: true }],
      ["PATCH", `/api/tareas/${deAna.id}/fallida`, { fallida: true }],
      ["DELETE", `/api/tareas/${deAna.id}`, undefined],
      ["PUT", `/api/tareas/repetitivas/${repetitivaDeAna.id}`, diaria({ titulo: "Hackeada" })],
      ["DELETE", `/api/tareas/repetitivas/${repetitivaDeAna.id}`, undefined],
    ];
    for (const [metodo, ruta, cuerpo] of intentos) {
      const respuesta = await pedir(app, beto.cookies, ruta, metodo, cuerpo);
      expect(respuesta.status, `${metodo} ${ruta}`).toBe(404);
    }

    // Lo de Ana quedó intacto.
    const intacta = await lista(ana);
    expect(intacta.deHoy.map((t) => t.titulo)).toEqual(["Secreto", "Rutina secreta"]);
  });

  it("el admin tampoco ve las tareas de otras personas", async () => {
    await crear(ana, tarea({ titulo: "Privada" }));
    await cliente.db
      .update(esquema.usuarios)
      .set({ role: "admin" })
      .where(eq(esquema.usuarios.id, beto.userId));
    expect((await lista(beto)).deHoy).toEqual([]);
    const historial = await pedir(app, beto.cookies, "/api/tareas/historial");
    expect(await leerJson(historial)).toMatchObject({ dias: [], hayMas: false });
  });

  it("el id del usuario sale de la sesión: un 'userId' en el cuerpo no cambia de quién es la tarea", async () => {
    const creada = await crear(ana, { ...tarea({ titulo: "Mía" }), userId: beto.userId });
    expect(creada.titulo).toBe("Mía");
    expect((await lista(beto)).deHoy).toEqual([]);
    expect((await lista(ana)).deHoy).toHaveLength(1);
  });
});

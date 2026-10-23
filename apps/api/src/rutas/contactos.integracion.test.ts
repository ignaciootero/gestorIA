// Tests de integración de las rutas de contactos, etiquetas y favoritos, contra gestion_test.
// Los recordatorios, los widgets y la limpieza tienen sus propios archivos en
// servicios/contactos/.

import type { ClienteDb } from "@gestoria/db";
import type { DatosDeContacto } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase, ponerDebeCambiarPassword } from "../pruebas/auth-de-prueba.ts";
import {
  crearContactoPorApi,
  crearEtiquetaPorApi,
  empresaValida,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
} from "../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;

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

type ContactoJson = {
  id: string;
  tipo: string;
  nombre: string;
  apellido: string | null;
  rubro: string | null;
  favorito: boolean;
  fechaNacimiento: string | null;
  sitioWeb: string | null;
  direccion: string | null;
  notas: string | null;
  telefonos: { id: string; numero: string; tipo: string }[];
  correos: string[];
  etiquetas: { id: number; nombre: string; color: string }[];
  recordatorios: unknown[];
};

type ListadoJson = { contactos: ContactoJson[]; total: number };

async function listar(persona: PersonaDePrueba, consulta = ""): Promise<ListadoJson> {
  const respuesta = await pedir(app, persona.cookies, `/api/contactos${consulta}`);
  expect(respuesta.status).toBe(200);
  return await leerJson<ListadoJson>(respuesta);
}

describe("sin sesión o sin poder usar la cuenta todavía", () => {
  const rutas: [string, string][] = [
    ["GET", "/api/contactos"],
    ["POST", "/api/contactos"],
    ["GET", "/api/contactos/etiquetas"],
    ["GET", "/api/contactos/recordatorios"],
    ["GET", "/api/contactos/widgets"],
    ["GET", "/api/contactos/00000000-0000-4000-8000-000000000000"],
    ["DELETE", "/api/contactos/00000000-0000-4000-8000-000000000000"],
  ];

  it.each(rutas)("rechaza %s %s sin sesión con 401", async (metodo, ruta) => {
    const respuesta = await pedir(app, null, ruta, metodo, metodo === "POST" ? {} : undefined);
    expect(respuesta.status).toBe(401);
  });

  it("rechaza a quien tiene que cambiar la contraseña antes de seguir", async () => {
    await ponerDebeCambiarPassword(
      cliente,
      (await cliente.db.query.usuarios.findFirst({ columns: { email: true } }))?.email ?? "",
    );
    const respuesta = await pedir(app, ana.cookies, "/api/contactos");
    expect(respuesta.status).toBe(403);
  });
});

describe("crear y leer un contacto", () => {
  it("crea una persona con todos sus datos y la devuelve completa", async () => {
    const etiqueta = await crearEtiquetaPorApi(app, ana.cookies, "Familia");

    const respuesta = await pedir(
      app,
      ana.cookies,
      "/api/contactos",
      "POST",
      personaValida({
        nombre: "María",
        apellido: "Gómez",
        fechaNacimiento: "1990-05-12",
        telefonos: [
          { numero: "099 123 456", tipo: "celular" },
          { numero: "2900 0000", tipo: "fijo" },
        ],
        correos: ["maria@ejemplo.com"],
        direccion: "18 de Julio 1234",
        notas: "Le gusta el mate.",
        favorito: true,
        etiquetaIds: [etiqueta],
      }),
    );
    expect(respuesta.status).toBe(201);

    const contacto = await leerJson<ContactoJson>(respuesta);
    expect(contacto).toMatchObject({
      tipo: "persona",
      nombre: "María",
      apellido: "Gómez",
      fechaNacimiento: "1990-05-12",
      correos: ["maria@ejemplo.com"],
      direccion: "18 de Julio 1234",
      notas: "Le gusta el mate.",
      favorito: true,
      etiquetas: [{ id: etiqueta, nombre: "Familia" }],
      recordatorios: [],
    });
    // Los teléfonos conservan el orden en que se cargaron.
    expect(contacto.telefonos.map((telefono) => [telefono.numero, telefono.tipo])).toEqual([
      ["099 123 456", "celular"],
      ["2900 0000", "fijo"],
    ]);

    const leido = await pedir(app, ana.cookies, `/api/contactos/${contacto.id}`);
    expect(leido.status).toBe(200);
    expect((await leerJson<ContactoJson>(leido)).nombre).toBe("María");
  });

  it("crea una empresa con sus datos propios", async () => {
    const respuesta = await pedir(
      app,
      ana.cookies,
      "/api/contactos",
      "POST",
      empresaValida({
        nombre: "Ferretería Central",
        rubro: "Ferretería",
        sitioWeb: "www.ferreteria.com.uy",
        horario: "Lunes a viernes de 9 a 18",
        documento: "21 234567 0012",
        personaDeContacto: "Don Pedro",
        telefonos: [{ numero: "2411 1111", tipo: "fijo" }],
      }),
    );
    expect(respuesta.status).toBe(201);

    expect(await leerJson<ContactoJson>(respuesta)).toMatchObject({
      tipo: "empresa",
      nombre: "Ferretería Central",
      apellido: null,
      fechaNacimiento: null,
      rubro: "Ferretería",
      sitioWeb: "www.ferreteria.com.uy",
    });
  });

  describe("recordatorio de cumpleaños al dar de alta", () => {
    async function crearYLeer(datos: DatosDeContacto): Promise<ContactoJson> {
      const id = await crearContactoPorApi(app, ana.cookies, datos);
      return await leerJson<ContactoJson>(await pedir(app, ana.cookies, `/api/contactos/${id}`));
    }

    it("crea el recordatorio anual con el día y el mes de la fecha de nacimiento", async () => {
      const contacto = await crearYLeer(
        personaValida({ fechaNacimiento: "1990-05-12", recordarCumpleanos: true }),
      );
      expect(contacto.recordatorios).toHaveLength(1);
      expect(contacto.recordatorios[0]).toMatchObject({
        titulo: "Cumpleaños",
        repeticion: "anual",
        diaDelMes: 12,
        mes: 5,
        fecha: null,
        diaSemana: null,
        hora: null,
      });
    });

    it("no crea nada si no se pide, si no hay fecha o si es una empresa", async () => {
      const sinPedir = await crearYLeer(personaValida({ fechaNacimiento: "1990-05-12" }));
      const noQuiere = await crearYLeer(
        personaValida({ fechaNacimiento: "1990-05-12", recordarCumpleanos: false }),
      );
      const sinFecha = await crearYLeer(personaValida({ recordarCumpleanos: true }));
      // La empresa no tiene cumpleaños: el campo se descarta.
      const datosDeEmpresa = { ...empresaValida(), recordarCumpleanos: true };
      const empresa = await crearYLeer(datosDeEmpresa);
      for (const contacto of [sinPedir, noQuiere, sinFecha, empresa]) {
        expect(contacto.recordatorios).toEqual([]);
      }
    });

    it("al editar se ignora: no agrega recordatorios", async () => {
      const id = await crearContactoPorApi(app, ana.cookies, personaValida());
      const respuesta = await pedir(
        app,
        ana.cookies,
        `/api/contactos/${id}`,
        "PUT",
        personaValida({ fechaNacimiento: "1990-05-12", recordarCumpleanos: true }),
      );
      expect(respuesta.status).toBe(200);
      expect((await leerJson<ContactoJson>(respuesta)).recordatorios).toEqual([]);
    });

    it("no deja a medias la alta si falla: sin contacto no hay recordatorio", async () => {
      const respuesta = await pedir(
        app,
        ana.cookies,
        "/api/contactos",
        "POST",
        personaValida({ fechaNacimiento: "2999-01-01", recordarCumpleanos: true }),
      );
      expect(respuesta.status).toBe(400);
      expect((await listar(ana)).total).toBe(0);
      expect(await cliente.db.query.recordatoriosDeContactos.findMany()).toEqual([]);
    });
  });

  it("guarda como 'sin dato' los campos que llegan en blanco", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida({ apellido: "   " }));
    const contacto = await leerJson<ContactoJson>(
      await pedir(app, ana.cookies, `/api/contactos/${id}`),
    );
    expect(contacto.apellido).toBeNull();
    expect(contacto.direccion).toBeNull();
    expect(contacto.notas).toBeNull();
    expect(contacto.fechaNacimiento).toBeNull();
  });

  it("acepta caracteres especiales y textos largos tal cual", async () => {
    const nombre = "Zoë O'Brien-Ñandú 😀";
    const notas = "Línea 1\nLínea 2 <b>no es HTML</b> & más; '--".repeat(10);
    const id = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre, notas }));
    const contacto = await leerJson<ContactoJson>(
      await pedir(app, ana.cookies, `/api/contactos/${id}`),
    );
    expect(contacto.nombre).toBe(nombre);
    expect(contacto.notas).toBe(notas.trim());
  });

  it("ignora un correo repetido", async () => {
    const id = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ correos: ["a@ejemplo.com", "A@Ejemplo.com", "b@ejemplo.com"] }),
    );
    const contacto = await leerJson<ContactoJson>(
      await pedir(app, ana.cookies, `/api/contactos/${id}`),
    );
    expect(contacto.correos).toEqual(["a@ejemplo.com", "b@ejemplo.com"]);
  });

  it("lee un contacto que no existe como 404", async () => {
    const respuesta = await pedir(
      app,
      ana.cookies,
      "/api/contactos/00000000-0000-4000-8000-000000000000",
    );
    expect(respuesta.status).toBe(404);
  });

  it("rechaza un id que no es un identificador", async () => {
    const respuesta = await pedir(app, ana.cookies, "/api/contactos/hola");
    expect(respuesta.status).toBe(400);
  });
});

describe("validaciones al crear", () => {
  async function rechazada(cuerpo: unknown) {
    const respuesta = await pedir(app, ana.cookies, "/api/contactos", "POST", cuerpo);
    expect(respuesta.status).toBe(400);
    const cuerpoError = await leerJson<{
      error: { codigo: string; campos?: { campo: string; mensaje: string }[] };
    }>(respuesta);
    expect(cuerpoError.error.codigo).toBe("VALIDACION_INVALIDA");
    return cuerpoError.error.campos ?? [];
  }

  it("pide un nombre", async () => {
    const campos = await rechazada(personaValida({ nombre: "  " }));
    expect(campos.map((campo) => campo.campo)).toContain("nombre");
  });

  it("rechaza un tipo desconocido o faltante", async () => {
    await rechazada({ ...personaValida(), tipo: "robot" });
    await rechazada({ nombre: "Ana" });
  });

  it("rechaza un teléfono inválido y dice cuál", async () => {
    const campos = await rechazada(
      personaValida({ telefonos: [{ numero: "no es un número", tipo: "celular" }] }),
    );
    expect(campos[0]?.campo).toBe("telefonos.0.numero");
  });

  it("rechaza un correo inválido", async () => {
    await rechazada(personaValida({ correos: ["sin-arroba"] }));
  });

  it("rechaza demasiados teléfonos", async () => {
    await rechazada(
      personaValida({
        telefonos: Array.from({ length: 6 }, () => ({
          numero: "099 123 456",
          tipo: "celular" as const,
        })),
      }),
    );
  });

  it("rechaza una fecha de nacimiento que no existe", async () => {
    await rechazada(personaValida({ fechaNacimiento: "2001-02-29" }));
  });

  it("rechaza una fecha de nacimiento futura", async () => {
    const campos = await rechazada(personaValida({ fechaNacimiento: "2999-01-01" }));
    expect(campos[0]?.campo).toBe("fechaNacimiento");
  });

  it("rechaza un sitio web con un esquema peligroso", async () => {
    await rechazada(empresaValida({ sitioWeb: "javascript:alert(1)" }));
  });

  it("rechaza etiquetas que no existen o son de otra persona", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const ajena = await crearEtiquetaPorApi(app, otra.cookies, "De otra");

    const campos = await rechazada(personaValida({ etiquetaIds: [ajena] }));
    expect(campos[0]?.campo).toBe("etiquetaIds");
    await rechazada(personaValida({ etiquetaIds: [999_999] }));
    expect(await listar(ana)).toMatchObject({ total: 0 });
  });

  it("no deja a medias lo que falló: si las etiquetas son inválidas, el contacto no se crea", async () => {
    await rechazada(personaValida({ nombre: "Fantasma", etiquetaIds: [999_999] }));
    expect((await listar(ana)).contactos).toEqual([]);
  });
});

describe("editar", () => {
  it("reemplaza los datos, los teléfonos, los correos y las etiquetas", async () => {
    const familia = await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    const trabajo = await crearEtiquetaPorApi(app, ana.cookies, "Trabajo");
    const id = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({
        telefonos: [{ numero: "099 111 111", tipo: "celular" }],
        correos: ["viejo@ejemplo.com"],
        etiquetaIds: [familia],
      }),
    );

    const respuesta = await pedir(
      app,
      ana.cookies,
      `/api/contactos/${id}`,
      "PUT",
      personaValida({
        nombre: "Ana María",
        telefonos: [{ numero: "2900 0000", tipo: "fijo" }],
        correos: ["nuevo@ejemplo.com"],
        etiquetaIds: [trabajo],
        favorito: true,
      }),
    );
    expect(respuesta.status).toBe(200);

    const contacto = await leerJson<ContactoJson>(respuesta);
    expect(contacto.nombre).toBe("Ana María");
    expect(contacto.favorito).toBe(true);
    expect(contacto.telefonos.map((telefono) => telefono.numero)).toEqual(["2900 0000"]);
    expect(contacto.correos).toEqual(["nuevo@ejemplo.com"]);
    expect(contacto.etiquetas.map((etiqueta) => etiqueta.nombre)).toEqual(["Trabajo"]);
  });

  it("borrar un dato opcional lo deja sin dato", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida({ notas: "algo" }));
    const respuesta = await pedir(
      app,
      ana.cookies,
      `/api/contactos/${id}`,
      "PUT",
      personaValida({ notas: "" }),
    );
    expect((await leerJson<ContactoJson>(respuesta)).notas).toBeNull();
  });

  it("no permite cambiar una persona por una empresa", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida());
    const respuesta = await pedir(app, ana.cookies, `/api/contactos/${id}`, "PUT", empresaValida());
    expect(respuesta.status).toBe(409);
  });

  it("devuelve 404 para un contacto que no existe", async () => {
    const respuesta = await pedir(
      app,
      ana.cookies,
      "/api/contactos/00000000-0000-4000-8000-000000000000",
      "PUT",
      personaValida(),
    );
    expect(respuesta.status).toBe(404);
  });

  it("si la edición es inválida, no cambia nada", async () => {
    const id = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Original" }));
    const respuesta = await pedir(
      app,
      ana.cookies,
      `/api/contactos/${id}`,
      "PUT",
      personaValida({ nombre: "Cambiado", etiquetaIds: [999_999] }),
    );
    expect(respuesta.status).toBe(400);
    const contacto = await leerJson<ContactoJson>(
      await pedir(app, ana.cookies, `/api/contactos/${id}`),
    );
    expect(contacto.nombre).toBe("Original");
  });
});

describe("favoritos", () => {
  it("marca y desmarca sin tocar el resto, y los favoritos salen primero", async () => {
    const primero = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Abel" }));
    const segundo = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Zulema" }),
    );

    const marcar = await pedir(app, ana.cookies, `/api/contactos/${segundo}/favorito`, "PATCH", {
      favorito: true,
    });
    expect(marcar.status).toBe(200);
    expect((await listar(ana)).contactos.map((contacto) => contacto.nombre)).toEqual([
      "Zulema",
      "Abel",
    ]);

    await pedir(app, ana.cookies, `/api/contactos/${segundo}/favorito`, "PATCH", {
      favorito: false,
    });
    expect((await listar(ana)).contactos.map((contacto) => contacto.nombre)).toEqual([
      "Abel",
      "Zulema",
    ]);
    expect(primero).toBeTruthy();
  });

  it("rechaza un valor que no es verdadero o falso y un contacto inexistente", async () => {
    const id = await crearContactoPorApi(app, ana.cookies);
    expect(
      (await pedir(app, ana.cookies, `/api/contactos/${id}/favorito`, "PATCH", { favorito: "si" }))
        .status,
    ).toBe(400);
    expect(
      (
        await pedir(
          app,
          ana.cookies,
          "/api/contactos/00000000-0000-4000-8000-000000000000/favorito",
          "PATCH",
          { favorito: true },
        )
      ).status,
    ).toBe(404);
  });
});

describe("listar, buscar y filtrar", () => {
  it("con la lista vacía devuelve un listado vacío", async () => {
    expect(await listar(ana)).toEqual({ contactos: [], total: 0 });
  });

  it("ordena por nombre sin distinguir mayúsculas ni importar el orden de carga", async () => {
    for (const nombre of ["carlos", "Beatriz", "ana", "Abel"]) {
      await crearContactoPorApi(app, ana.cookies, personaValida({ nombre, apellido: "" }));
    }
    const nombres = (await listar(ana)).contactos.map((contacto) => contacto.nombre);
    expect(nombres).toEqual(["Abel", "ana", "Beatriz", "carlos"]);
  });

  it("busca por nombre, apellido, nombre completo, rubro, persona de contacto y correo", async () => {
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Juan", apellido: "Rodríguez", correos: ["juan.r@correo.com"] }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      empresaValida({
        nombre: "Electricidad Sur",
        rubro: "Electricista",
        personaDeContacto: "Marta",
      }),
    );

    const nombres = async (busqueda: string) =>
      (await listar(ana, `?busqueda=${encodeURIComponent(busqueda)}`)).contactos.map(
        (contacto) => contacto.nombre,
      );

    expect(await nombres("juan")).toEqual(["Juan"]);
    expect(await nombres("RODR")).toEqual(["Juan"]);
    expect(await nombres("juan rodr")).toEqual(["Juan"]);
    expect(await nombres("electricista")).toEqual(["Electricidad Sur"]);
    expect(await nombres("marta")).toEqual(["Electricidad Sur"]);
    expect(await nombres("juan.r@")).toEqual(["Juan"]);
    expect(await nombres("nadie")).toEqual([]);
  });

  it("busca un teléfono por sus cifras, sin importar cómo se escribió", async () => {
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({
        nombre: "Con teléfono",
        telefonos: [{ numero: "+598 99 123-456", tipo: "celular" }],
      }),
    );
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Otro" }));

    const nombres = async (busqueda: string) =>
      (await listar(ana, `?busqueda=${encodeURIComponent(busqueda)}`)).contactos.map(
        (contacto) => contacto.nombre,
      );
    expect(await nombres("99123456")).toEqual(["Con teléfono"]);
    expect(await nombres("99 123")).toEqual(["Con teléfono"]);
    expect(await nombres("(598) 99")).toEqual(["Con teléfono"]);
  });

  it("trata % y _ como texto común, no como comodines", async () => {
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "100% seguro" }));
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Otro nombre" }));

    const buscar = async (busqueda: string) =>
      (await listar(ana, `?busqueda=${encodeURIComponent(busqueda)}`)).contactos.map(
        (contacto) => contacto.nombre,
      );
    expect(await buscar("%")).toEqual(["100% seguro"]);
    expect(await buscar("_")).toEqual([]);
    expect(await buscar("a%o")).toEqual([]);
  });

  it("no es vulnerable a inyección de SQL en la búsqueda", async () => {
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Ana" }));
    const respuesta = await pedir(
      app,
      ana.cookies,
      `/api/contactos?busqueda=${encodeURIComponent("'; drop table contactos; --")}`,
    );
    expect(respuesta.status).toBe(200);
    expect((await listar(ana)).total).toBe(1);
  });

  it("filtra por tipo, por favoritos y por etiqueta, y los filtros se combinan", async () => {
    const familia = await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Ana", favorito: true, etiquetaIds: [familia] }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Beto", etiquetaIds: [familia] }),
    );
    await crearContactoPorApi(
      app,
      ana.cookies,
      empresaValida({ nombre: "Taller", favorito: true }),
    );

    const nombres = async (consulta: string) =>
      (await listar(ana, consulta)).contactos.map((contacto) => contacto.nombre);

    expect(await nombres("?tipo=empresa")).toEqual(["Taller"]);
    expect(await nombres("?tipo=persona")).toEqual(["Ana", "Beto"]);
    expect(await nombres("?favoritos=true")).toEqual(["Ana", "Taller"]);
    expect(await nombres(`?etiquetaId=${familia}`)).toEqual(["Ana", "Beto"]);
    expect(await nombres(`?etiquetaId=${familia}&favoritos=true`)).toEqual(["Ana"]);
    expect(await nombres(`?tipo=empresa&etiquetaId=${familia}`)).toEqual([]);
  });

  it("pagina, y el total cuenta todos los que cumplen", async () => {
    for (const letra of "ABCDE") {
      await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: letra }));
    }
    const pagina = await listar(ana, "?limit=2&offset=2");
    expect(pagina.total).toBe(5);
    expect(pagina.contactos.map((contacto) => contacto.nombre)).toEqual(["C", "D"]);
    expect((await listar(ana, "?limit=2&offset=10")).contactos).toEqual([]);
  });

  it("rechaza filtros inválidos", async () => {
    for (const consulta of [
      "?tipo=robot",
      "?limit=0",
      "?limit=1000",
      "?offset=-1",
      "?etiquetaId=x",
      "?favoritos=quizas",
    ]) {
      expect((await pedir(app, ana.cookies, `/api/contactos${consulta}`)).status, consulta).toBe(
        400,
      );
    }
  });

  it("el listado trae teléfonos, correos y etiquetas de cada contacto", async () => {
    const familia = await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({
        telefonos: [{ numero: "099 123 456", tipo: "celular" }],
        correos: ["a@ejemplo.com"],
        etiquetaIds: [familia],
      }),
    );
    const [contacto] = (await listar(ana)).contactos;
    expect(contacto?.telefonos).toHaveLength(1);
    expect(contacto?.correos).toEqual(["a@ejemplo.com"]);
    expect(contacto?.etiquetas.map((etiqueta) => etiqueta.nombre)).toEqual(["Familia"]);
  });
});

describe("eliminar", () => {
  it("el contacto eliminado desaparece de la lista, de la ficha y de las cuentas, pero queda en la base", async () => {
    const etiqueta = await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    const id = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ etiquetaIds: [etiqueta] }),
    );

    const respuesta = await pedir(app, ana.cookies, `/api/contactos/${id}`, "DELETE");
    expect(respuesta.status).toBe(200);

    expect((await listar(ana)).total).toBe(0);
    expect((await pedir(app, ana.cookies, `/api/contactos/${id}`)).status).toBe(404);
    expect((await pedir(app, ana.cookies, `/api/contactos/${id}`, "DELETE")).status).toBe(404);

    const etiquetas = await leerJson<{ etiquetas: { contactos: number }[] }>(
      await pedir(app, ana.cookies, "/api/contactos/etiquetas"),
    );
    expect(etiquetas.etiquetas[0]?.contactos).toBe(0);

    const fila = await cliente.db.query.contactos.findFirst({ where: (t, { eq }) => eq(t.id, id) });
    expect(fila?.eliminadoEn).not.toBeNull();
  });
});

describe("etiquetas", () => {
  it("crea con color elegido o con uno distinto de los que ya hay", async () => {
    const respuesta = await pedir(app, ana.cookies, "/api/contactos/etiquetas", "POST", {
      nombre: "Familia",
      color: "#ff0000",
    });
    expect(respuesta.status).toBe(201);
    expect(await leerJson(respuesta)).toMatchObject({
      nombre: "Familia",
      color: "#ff0000",
      contactos: 0,
    });

    const sinColor = await leerJson<{ color: string }>(
      await pedir(app, ana.cookies, "/api/contactos/etiquetas", "POST", { nombre: "Trabajo" }),
    );
    expect(sinColor.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(sinColor.color).not.toBe("#ff0000");
  });

  it("no repite el nombre, sin distinguir mayúsculas", async () => {
    await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    const respuesta = await pedir(app, ana.cookies, "/api/contactos/etiquetas", "POST", {
      nombre: "  FAMILIA ",
    });
    expect(respuesta.status).toBe(409);
  });

  it("dos personas pueden tener una etiqueta con el mismo nombre", async () => {
    const otra = await entrarComoPersona(app, cliente);
    await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    await crearEtiquetaPorApi(app, otra.cookies, "Familia");
  });

  it("valida el nombre y el color", async () => {
    for (const cuerpo of [
      { nombre: " " },
      { nombre: "a".repeat(31) },
      { nombre: "x", color: "rojo" },
    ]) {
      expect(
        (await pedir(app, ana.cookies, "/api/contactos/etiquetas", "POST", cuerpo)).status,
      ).toBe(400);
    }
  });

  it("limita cuántas etiquetas puede crear una persona", async () => {
    for (let numero = 1; numero <= 50; numero += 1) {
      await crearEtiquetaPorApi(app, ana.cookies, `Etiqueta ${numero}`);
    }
    const respuesta = await pedir(app, ana.cookies, "/api/contactos/etiquetas", "POST", {
      nombre: "Una de más",
    });
    expect(respuesta.status).toBe(409);
  });

  it("renombra y recolorea, pero no a un nombre que ya existe", async () => {
    const familia = await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    await crearEtiquetaPorApi(app, ana.cookies, "Trabajo");

    const ok = await pedir(app, ana.cookies, `/api/contactos/etiquetas/${familia}`, "PATCH", {
      nombre: "Mi familia",
      color: "#00ff00",
    });
    expect(ok.status).toBe(200);
    expect(await leerJson(ok)).toMatchObject({ nombre: "Mi familia", color: "#00ff00" });

    const repetida = await pedir(app, ana.cookies, `/api/contactos/etiquetas/${familia}`, "PATCH", {
      nombre: "trabajo",
    });
    expect(repetida.status).toBe(409);

    // Quedarse con su propio nombre (cambiando solo el color) no es un choque.
    const mismoNombre = await pedir(
      app,
      ana.cookies,
      `/api/contactos/etiquetas/${familia}`,
      "PATCH",
      {
        nombre: "Mi familia",
        color: "#0000ff",
      },
    );
    expect(mismoNombre.status).toBe(200);
  });

  it("cuenta cuántos contactos usa cada etiqueta", async () => {
    const familia = await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    await crearContactoPorApi(app, ana.cookies, personaValida({ etiquetaIds: [familia] }));
    await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Otro", etiquetaIds: [familia] }),
    );

    const { etiquetas } = await leerJson<{ etiquetas: { nombre: string; contactos: number }[] }>(
      await pedir(app, ana.cookies, "/api/contactos/etiquetas"),
    );
    expect(etiquetas).toMatchObject([{ nombre: "Familia", contactos: 2 }]);
  });

  it("al eliminar una etiqueta se la quita a los contactos, que siguen existiendo", async () => {
    const familia = await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    const id = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ etiquetaIds: [familia] }),
    );

    expect(
      (await pedir(app, ana.cookies, `/api/contactos/etiquetas/${familia}`, "DELETE")).status,
    ).toBe(200);

    const contacto = await leerJson<ContactoJson>(
      await pedir(app, ana.cookies, `/api/contactos/${id}`),
    );
    expect(contacto.etiquetas).toEqual([]);
    expect(
      (await pedir(app, ana.cookies, `/api/contactos/etiquetas/${familia}`, "DELETE")).status,
    ).toBe(404);
  });
});

describe("privacidad entre personas", () => {
  it("una persona no ve, edita, marca ni elimina los contactos de otra", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const idDeAna = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Secreto" }),
    );

    expect((await listar(otra)).contactos).toEqual([]);
    expect((await listar(otra, "?busqueda=secreto")).total).toBe(0);
    expect((await pedir(app, otra.cookies, `/api/contactos/${idDeAna}`)).status).toBe(404);
    expect(
      (
        await pedir(
          app,
          otra.cookies,
          `/api/contactos/${idDeAna}`,
          "PUT",
          personaValida({ nombre: "Robado" }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await pedir(app, otra.cookies, `/api/contactos/${idDeAna}/favorito`, "PATCH", {
          favorito: true,
        })
      ).status,
    ).toBe(404);
    expect((await pedir(app, otra.cookies, `/api/contactos/${idDeAna}`, "DELETE")).status).toBe(
      404,
    );

    const intacto = await leerJson<ContactoJson>(
      await pedir(app, ana.cookies, `/api/contactos/${idDeAna}`),
    );
    expect(intacto).toMatchObject({ nombre: "Secreto", favorito: false });
  });

  it("no se puede usar la etiqueta de otra persona ni modificarla", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const deOtra = await crearEtiquetaPorApi(app, otra.cookies, "Privada");

    expect(
      (
        await pedir(app, ana.cookies, `/api/contactos/etiquetas/${deOtra}`, "PATCH", {
          nombre: "Mía",
        })
      ).status,
    ).toBe(404);
    expect(
      (await pedir(app, ana.cookies, `/api/contactos/etiquetas/${deOtra}`, "DELETE")).status,
    ).toBe(404);

    const lista = await leerJson<{ etiquetas: unknown[] }>(
      await pedir(app, ana.cookies, "/api/contactos/etiquetas"),
    );
    expect(lista.etiquetas).toEqual([]);
    expect(
      (
        await leerJson<{ etiquetas: unknown[] }>(
          await pedir(app, otra.cookies, "/api/contactos/etiquetas"),
        )
      ).etiquetas,
    ).toHaveLength(1);
  });

  it("el admin tampoco ve los contactos de otra persona", async () => {
    const admin = await entrarComoPersona(app, cliente);
    const { esquema } = await import("@gestoria/db");
    const { eq } = await import("drizzle-orm");
    await cliente.db
      .update(esquema.usuarios)
      .set({ role: "admin" })
      .where(eq(esquema.usuarios.id, admin.userId));

    const id = await crearContactoPorApi(app, ana.cookies, personaValida());
    expect((await listar(admin)).contactos).toEqual([]);
    expect((await pedir(app, admin.cookies, `/api/contactos/${id}`)).status).toBe(404);
  });
});

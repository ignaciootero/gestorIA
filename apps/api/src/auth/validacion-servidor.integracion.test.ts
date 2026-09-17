// Tests de la validacion del registro en el SERVIDOR.
//
// El formulario de la web valida con los mismos esquemas Zod, pero esa
// validacion es comodidad: cualquiera puede llamar al endpoint directamente.
// Estos tests mandan cuerpos crudos, sin pasar por el formulario, para
// comprobar que la API rechaza lo que tiene que rechazar
// (docs/guias/seguridad-y-datos.md: nunca confiar en validaciones del cliente).

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { LARGO_MAXIMO_CAMPO, type RespuestaError } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";
import { RUTA_BASE_AUTH } from "./opciones.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
});

afterAll(async () => {
  await cliente.cerrar();
});

const BASE = {
  email: "persona@ejemplo.test",
  password: "clave-de-prueba",
  name: "Ana Pérez",
  username: "ana.perez",
  nombre: "Ana",
  apellido: "Pérez",
};

/** Manda un registro crudo al endpoint, sin pasar por el formulario. */
async function registrarCrudo(cambios: Record<string, unknown>): Promise<Response> {
  return await app.request(`${RUTA_BASE_AUTH}/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...BASE, ...cambios }),
  });
}

async function cantidadDeCuentas(): Promise<number> {
  return (await cliente.db.select().from(esquema.usuarios)).length;
}

describe("largo máximo de los campos cortos", () => {
  const demasiadoLargo = "a".repeat(LARGO_MAXIMO_CAMPO + 1);
  const enElLimite = "a".repeat(LARGO_MAXIMO_CAMPO);

  it("acepta nombre y apellido de exactamente 20 caracteres", async () => {
    const respuesta = await registrarCrudo({
      nombre: enElLimite,
      apellido: enElLimite,
      name: `${enElLimite} ${enElLimite}`,
    });

    expect(respuesta.status).toBe(200);
  });

  it("rechaza un nombre de más de 24 caracteres", async () => {
    const respuesta = await registrarCrudo({ nombre: demasiadoLargo });

    expect(respuesta.status).toBe(400);
    expect(await cantidadDeCuentas()).toBe(0);
  });

  it("rechaza un apellido de más de 24 caracteres", async () => {
    const respuesta = await registrarCrudo({ apellido: demasiadoLargo });

    expect(respuesta.status).toBe(400);
    expect(await cantidadDeCuentas()).toBe(0);
  });

  it("rechaza un usuario de más de 24 caracteres", async () => {
    const respuesta = await registrarCrudo({ username: "a".repeat(25) });

    expect(respuesta.status).toBe(400);
    expect(await cantidadDeCuentas()).toBe(0);
  });

  it("rechaza una contraseña de más de 24 caracteres", async () => {
    const respuesta = await registrarCrudo({ password: "a".repeat(25) });

    expect(respuesta.status).toBe(400);
    expect(await cantidadDeCuentas()).toBe(0);
  });

  it("rechaza un nombre enorme, que antes se guardaba entero", async () => {
    // Este caso existía de verdad: sin validación en el servidor se podían
    // guardar 5000 caracteres en la base pasando por encima del formulario.
    const respuesta = await registrarCrudo({ nombre: "A".repeat(5000) });

    expect(respuesta.status).toBe(400);
    expect(await cantidadDeCuentas()).toBe(0);
  });
});

describe("campos obligatorios", () => {
  it("rechaza un nombre vacío", async () => {
    const respuesta = await registrarCrudo({ nombre: "" });

    expect(respuesta.status).toBe(400);
    expect(await cantidadDeCuentas()).toBe(0);
  });

  it("rechaza un nombre que son solo espacios", async () => {
    const respuesta = await registrarCrudo({ nombre: "   " });

    expect(respuesta.status).toBe(400);
  });

  it("rechaza si falta el apellido", async () => {
    const { apellido: _sin, ...sinApellido } = BASE;
    const respuesta = await app.request(`${RUTA_BASE_AUTH}/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sinApellido),
    });

    expect(respuesta.status).toBe(400);
  });
});

describe("correo", () => {
  it("rechaza un correo de más de 254 caracteres", async () => {
    const respuesta = await registrarCrudo({ email: `${"d".repeat(300)}@ejemplo.test` });

    expect(respuesta.status).toBe(400);
    expect(await cantidadDeCuentas()).toBe(0);
  });

  it("rechaza un correo mal formado", async () => {
    const respuesta = await registrarCrudo({ email: "no-es-un-correo" });

    expect(respuesta.status).toBe(400);
  });
});

describe("respuesta de los errores de validación", () => {
  it("dice qué campo está mal, con el nombre que usa el formulario", async () => {
    const respuesta = await registrarCrudo({ nombre: "a".repeat(50) });
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(cuerpo.error.codigo).toBe("VALIDACION_INVALIDA");
    expect(cuerpo.error.campos?.map((campo) => campo.campo)).toContain("nombre");
  });

  it("traduce el nombre interno del usuario al del formulario", async () => {
    // En Better Auth el campo se llama `username`; en el formulario, `usuario`.
    const respuesta = await registrarCrudo({ username: "MAYUSCULAS Y ESPACIOS" });
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(cuerpo.error.campos?.map((campo) => campo.campo)).toContain("usuario");
  });

  it("informa todos los campos con problema, no solo el primero", async () => {
    const respuesta = await registrarCrudo({ nombre: "", apellido: "", email: "mal" });
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    const campos = cuerpo.error.campos?.map((campo) => campo.campo) ?? [];
    expect(campos).toContain("nombre");
    expect(campos).toContain("apellido");
    expect(campos).toContain("email");
  });

  it("los mensajes están en español y sirven para mostrar", async () => {
    const respuesta = await registrarCrudo({ nombre: "" });
    const cuerpo = await leerJson<RespuestaError>(respuesta);

    expect(cuerpo.error.campos?.[0]?.mensaje).toMatch(/completá/i);
  });

  it("no filtra detalles técnicos de la validación", async () => {
    const respuesta = await registrarCrudo({ nombre: "" });
    const texto = await respuesta.text();

    expect(texto).not.toMatch(/zod|issue|invalid_type|too_small/i);
    expect(texto).not.toMatch(/stack|node_modules/i);
  });
});

describe("campos que no existen", () => {
  it("ignora un campo desconocido en vez de fallar", async () => {
    // Zod descarta lo que no está en el esquema. Un cliente viejo que mande un
    // campo de más no tiene por qué romperse.
    const respuesta = await registrarCrudo({ inventado: "algo" });

    expect(respuesta.status).toBe(200);
  });

  it("ya no acepta el campo de mensaje, que se quitó del registro", async () => {
    const respuesta = await registrarCrudo({ mensajeRegistro: "hola" });

    expect(respuesta.status).toBe(200);

    const fila = await cliente.db.query.usuarios.findFirst();
    expect(fila).not.toHaveProperty("mensajeRegistro");
  });
});

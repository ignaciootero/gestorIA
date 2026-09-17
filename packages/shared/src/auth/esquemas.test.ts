// Tests unitarios de los esquemas de autenticacion.
//
// Son los mismos que usan el formulario de la web y la API, asi que lo que se
// verifica aca vale para los dos lados.

import { describe, expect, it } from "vitest";
import {
  esquemaCambioPassword,
  esquemaLogin,
  esquemaRegistro,
  esquemaUsuario,
  pareceEmail,
} from "./esquemas.ts";

const REGISTRO_VALIDO = {
  usuario: "iotero",
  nombre: "Ignacio",
  apellido: "Otero",
  email: "nacho@ejemplo.test",
  password: "clave-de-prueba",
};

describe("esquemaUsuario", () => {
  it("acepta letras, números, puntos, guiones y guiones bajos", () => {
    for (const valido of ["iotero", "ignacio.otero", "nacho_99", "a-b-c"]) {
      expect(esquemaUsuario.safeParse(valido).success).toBe(true);
    }
  });

  it("normaliza a minúsculas y recorta espacios", () => {
    expect(esquemaUsuario.parse("  IOtero  ")).toBe("iotero");
  });

  it("rechaza espacios, tildes y ñ", () => {
    for (const invalido of ["con espacio", "añejo", "josé", "hola!"]) {
      expect(esquemaUsuario.safeParse(invalido).success).toBe(false);
    }
  });

  it("rechaza por debajo de 3 y por encima de 24 caracteres", () => {
    expect(esquemaUsuario.safeParse("ab").success).toBe(false);
    expect(esquemaUsuario.safeParse("a".repeat(24)).success).toBe(true);
    expect(esquemaUsuario.safeParse("a".repeat(25)).success).toBe(false);
  });
});

describe("esquemaRegistro", () => {
  it("acepta un registro completo", () => {
    expect(esquemaRegistro.safeParse(REGISTRO_VALIDO).success).toBe(true);
  });

  it("normaliza el correo a minúsculas", () => {
    const resultado = esquemaRegistro.parse({
      ...REGISTRO_VALIDO,
      email: "  NACHO@Ejemplo.TEST ",
    });
    expect(resultado.email).toBe("nacho@ejemplo.test");
  });

  it("rechaza una contraseña de menos de 8 caracteres", () => {
    const resultado = esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, password: "1234567" });
    expect(resultado.success).toBe(false);
  });

  it("acepta una contraseña de exactamente 8 caracteres", () => {
    const resultado = esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, password: "12345678" });
    expect(resultado.success).toBe(true);
  });

  it("acepta una contraseña de exactamente 20 caracteres", () => {
    const resultado = esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, password: "a".repeat(24) });
    expect(resultado.success).toBe(true);
  });

  it("rechaza una contraseña de más de 24 caracteres", () => {
    const resultado = esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, password: "a".repeat(25) });
    expect(resultado.success).toBe(false);
  });

  it("acepta nombre y apellido de exactamente 20 caracteres", () => {
    const resultado = esquemaRegistro.safeParse({
      ...REGISTRO_VALIDO,
      nombre: "a".repeat(24),
      apellido: "b".repeat(24),
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza nombre o apellido de más de 24 caracteres", () => {
    expect(esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, nombre: "a".repeat(25) }).success).toBe(
      false,
    );
    expect(
      esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, apellido: "a".repeat(25) }).success,
    ).toBe(false);
  });

  it("ya no acepta el campo de mensaje: se quitó del registro", () => {
    const resultado = esquemaRegistro.parse({
      ...REGISTRO_VALIDO,
      mensajeRegistro: "algo",
    } as never);
    expect(resultado).not.toHaveProperty("mensajeRegistro");
  });

  it("rechaza nombre o apellido vacíos, o que sean solo espacios", () => {
    expect(esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, nombre: "" }).success).toBe(false);
    expect(esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, apellido: "   " }).success).toBe(false);
  });

  it("rechaza un correo mal formado", () => {
    for (const invalido of ["sin-arroba", "@sin-nombre.test", "espacio @ejemplo.test"]) {
      expect(esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, email: invalido }).success).toBe(
        false,
      );
    }
  });

  it("rechaza el registro si el honeypot viene con contenido", () => {
    const resultado = esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, honeypot: "soy-un-bot" });
    expect(resultado.success).toBe(false);
  });

  it("acepta el honeypot vacío, que es lo que manda el navegador", () => {
    const resultado = esquemaRegistro.safeParse({ ...REGISTRO_VALIDO, honeypot: "" });
    expect(resultado.success).toBe(true);
  });

  it("da un mensaje por cada campo con problema", () => {
    const resultado = esquemaRegistro.safeParse({
      ...REGISTRO_VALIDO,
      email: "mal",
      password: "corta",
    });

    expect(resultado.success).toBe(false);
    const campos = resultado.error?.issues.map((problema) => problema.path[0]) ?? [];
    expect(campos).toContain("email");
    expect(campos).toContain("password");
  });
});

describe("esquemaLogin", () => {
  it("acepta un usuario como identificador", () => {
    expect(esquemaLogin.safeParse({ identificador: "iotero", password: "x" }).success).toBe(true);
  });

  it("acepta un correo como identificador", () => {
    const resultado = esquemaLogin.safeParse({
      identificador: "nacho@ejemplo.test",
      password: "x",
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza identificador o contraseña vacíos", () => {
    expect(esquemaLogin.safeParse({ identificador: "", password: "x" }).success).toBe(false);
    expect(esquemaLogin.safeParse({ identificador: "iotero", password: "" }).success).toBe(false);
  });

  it("no exige largo mínimo de contraseña al entrar", () => {
    // Si lo exigiera, quien tiene una contraseña vieja más corta no podría ni
    // intentar entrar para después cambiarla.
    expect(esquemaLogin.safeParse({ identificador: "iotero", password: "1" }).success).toBe(true);
  });
});

describe("pareceEmail", () => {
  it("distingue un correo de un usuario", () => {
    expect(pareceEmail("nacho@ejemplo.test")).toBe(true);
    expect(pareceEmail("iotero")).toBe(false);
    expect(pareceEmail("ignacio.otero")).toBe(false);
  });
});

describe("esquemaCambioPassword", () => {
  const BASE = {
    passwordActual: "la-vieja-123",
    passwordNueva: "la-nueva-456",
    passwordNuevaRepetida: "la-nueva-456",
  };

  it("acepta un cambio válido", () => {
    expect(esquemaCambioPassword.safeParse(BASE).success).toBe(true);
  });

  it("rechaza si las dos contraseñas nuevas no coinciden", () => {
    const resultado = esquemaCambioPassword.safeParse({
      ...BASE,
      passwordNuevaRepetida: "otra-cosa-789",
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.path).toEqual(["passwordNuevaRepetida"]);
  });

  it("rechaza si la contraseña nueva es igual a la actual", () => {
    const resultado = esquemaCambioPassword.safeParse({
      passwordActual: "la-misma-123",
      passwordNueva: "la-misma-123",
      passwordNuevaRepetida: "la-misma-123",
    });

    expect(resultado.success).toBe(false);
  });

  it("aplica el largo mínimo a la contraseña nueva", () => {
    const resultado = esquemaCambioPassword.safeParse({
      ...BASE,
      passwordNueva: "corta",
      passwordNuevaRepetida: "corta",
    });

    expect(resultado.success).toBe(false);
  });
});

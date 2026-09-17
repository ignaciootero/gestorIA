// Tests unitarios de la validacion de variables de entorno de la API.

import { describe, expect, it } from "vitest";
import { leerConfigSmtp, leerEntornoApi } from "./entorno.ts";

const MINIMO = {
  ORIGENES_PERMITIDOS: "http://localhost:3000",
  BETTER_AUTH_SECRET: "un-secreto-de-al-menos-treinta-y-dos-caracteres",
  BETTER_AUTH_URL: "http://localhost:3001",
  URL_WEB: "http://localhost:3000",
};

describe("leerEntornoApi con las variables de autenticación", () => {
  it("exige el secreto de Better Auth", () => {
    const { BETTER_AUTH_SECRET: _, ...sinSecreto } = MINIMO;

    expect(() => leerEntornoApi(sinSecreto)).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rechaza un secreto de menos de 32 caracteres", () => {
    // Un secreto corto es un secreto adivinable: con él se pueden falsificar
    // las cookies de sesión de cualquiera.
    expect(() => leerEntornoApi({ ...MINIMO, BETTER_AUTH_SECRET: "corto" })).toThrow(
      /32 caracteres/,
    );
  });

  it("exige que las URLs sean completas", () => {
    expect(() => leerEntornoApi({ ...MINIMO, BETTER_AUTH_URL: "localhost:3001" })).toThrow(
      /BETTER_AUTH_URL/,
    );
    expect(() => leerEntornoApi({ ...MINIMO, URL_WEB: "no-es-una-url" })).toThrow(/URL_WEB/);
  });
});

describe("leerEntornoApi", () => {
  it("aplica valores por defecto razonables cuando solo estan los obligatorios", () => {
    const entorno = leerEntornoApi(MINIMO);

    expect(entorno.NODE_ENV).toBe("development");
    expect(entorno.PORT).toBe(3001);
    expect(entorno.LOG_LEVEL).toBe("info");
  });

  it("convierte el puerto a numero", () => {
    expect(leerEntornoApi({ ...MINIMO, PORT: "8080" }).PORT).toBe(8080);
  });

  it("parte la lista de origenes y descarta espacios sobrantes", () => {
    const entorno = leerEntornoApi({
      ...MINIMO,
      ORIGENES_PERMITIDOS: " http://localhost:3000 , https://gestion.example ,, ",
    });

    expect(entorno.ORIGENES_PERMITIDOS).toEqual([
      "http://localhost:3000",
      "https://gestion.example",
    ]);
  });

  it("rechaza un comodin en CORS", () => {
    expect(() => leerEntornoApi({ ...MINIMO, ORIGENES_PERMITIDOS: "*" })).toThrow(/CORS no admite/);
  });

  it("rechaza que falte la lista de origenes", () => {
    const { ORIGENES_PERMITIDOS: _sin, ...sinOrigenes } = MINIMO;
    expect(() => leerEntornoApi(sinOrigenes)).toThrow(/ORIGENES_PERMITIDOS/);
  });

  it("rechaza una lista de origenes vacia", () => {
    expect(() => leerEntornoApi({ ...MINIMO, ORIGENES_PERMITIDOS: "  ,  " })).toThrow(
      /al menos un origen/,
    );
  });

  it("rechaza un puerto fuera de rango", () => {
    expect(() => leerEntornoApi({ ...MINIMO, PORT: "70000" })).toThrow(/PORT/);
    expect(() => leerEntornoApi({ ...MINIMO, PORT: "0" })).toThrow(/PORT/);
    expect(() => leerEntornoApi({ ...MINIMO, PORT: "no-es-un-numero" })).toThrow(/PORT/);
  });

  it("rechaza un nivel de log desconocido", () => {
    expect(() => leerEntornoApi({ ...MINIMO, LOG_LEVEL: "gritando" })).toThrow(/LOG_LEVEL/);
  });

  it("rechaza un NODE_ENV desconocido", () => {
    expect(() => leerEntornoApi({ ...MINIMO, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });

  it("menciona el archivo .env.example para orientar a quien configura", () => {
    expect(() => leerEntornoApi({})).toThrow(/\.env\.example/);
  });
});

describe("leerEntornoApi con las variables de SMTP", () => {
  it("arranca sin SMTP configurado", () => {
    // Es el caso normal en desarrollo: los correos van al log.
    expect(() => leerEntornoApi(MINIMO)).not.toThrow();
  });

  it("acepta las variables de SMTP vacías, como quedan al copiar .env.example", () => {
    // En un .env, `SMTP_HOST=` llega como cadena vacía, no como ausente. Sin
    // tolerarlo, copiar el archivo de ejemplo dejaba la API sin arrancar.
    const entorno = leerEntornoApi({
      ...MINIMO,
      SMTP_HOST: "",
      SMTP_USUARIO: "",
      SMTP_PASSWORD: "",
      SMTP_REMITENTE: "",
    });

    expect(entorno.SMTP_HOST).toBeUndefined();
    expect(entorno.SMTP_USUARIO).toBeUndefined();
  });

  it("recorta los espacios sobrantes", () => {
    const entorno = leerEntornoApi({ ...MINIMO, SMTP_HOST: "  smtp.ejemplo.test  " });

    expect(entorno.SMTP_HOST).toBe("smtp.ejemplo.test");
  });

  it("trata como no configurado un SMTP con solo espacios", () => {
    const entorno = leerEntornoApi({ ...MINIMO, SMTP_HOST: "   " });

    expect(entorno.SMTP_HOST).toBeUndefined();
  });
});

describe("leerConfigSmtp", () => {
  const COMPLETO = {
    ...MINIMO,
    SMTP_HOST: "smtp.ejemplo.test",
    SMTP_USUARIO: "gestion@ejemplo.test",
    SMTP_PASSWORD: "una-clave",
  };

  it("devuelve undefined si no está el juego completo", () => {
    // Un SMTP a medias falla recién al mandar el primer correo, que es el peor
    // momento para enterarse.
    expect(leerConfigSmtp(leerEntornoApi(MINIMO))).toBeUndefined();
    const { SMTP_PASSWORD: _sin, ...sinPassword } = COMPLETO;
    expect(leerConfigSmtp(leerEntornoApi(sinPassword))).toBeUndefined();
  });

  it("devuelve la configuración cuando está completa", () => {
    const config = leerConfigSmtp(leerEntornoApi(COMPLETO));

    expect(config).toMatchObject({
      host: "smtp.ejemplo.test",
      port: 587,
      seguro: false,
      usuario: "gestion@ejemplo.test",
    });
  });

  it("usa el usuario como remitente si no se indicó uno", () => {
    const config = leerConfigSmtp(leerEntornoApi(COMPLETO));

    expect(config?.remitente).toBe("gestion@ejemplo.test");
  });
});

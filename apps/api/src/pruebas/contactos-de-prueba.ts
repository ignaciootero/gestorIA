// Utilidades de los tests del módulo de contactos.

import { type ClienteDb, esquema } from "@gestoria/db";
import type { DatosDeContacto } from "@gestoria/shared";
import { eq } from "drizzle-orm";
import { cookiesDe, entrarConUsuario, registrarAprobado } from "./auth-de-prueba.ts";
import type { appDePrueba } from "./entorno-de-prueba.ts";
import { APERTURA_AMPLIA, abrirPeriodo } from "./periodos-de-prueba.ts";

type App = ReturnType<typeof appDePrueba>;

export type PersonaDePrueba = { cookies: string; userId: string; usuario: string };

/**
 * Registra una cuenta aprobada, entra con ella y devuelve sus cookies y su id. Por defecto la
 * persona arranca SIN etiquetas de contactos ni categorías de tareas (se la marca como que ya recibió
 * las de por defecto), para que los tests cuenten solo lo que ellos crean; `conEtiquetasIniciales` y
 * `conCategoriasDeTareaIniciales` la dejan como una cuenta recién creada.
 */
export async function entrarComoPersona(
  app: App,
  cliente: ClienteDb,
  datos: {
    usuario?: string;
    zonaHoraria?: string;
    conEtiquetasIniciales?: boolean;
    conCategoriasDeTareaIniciales?: boolean;
  } = {},
): Promise<PersonaDePrueba> {
  const cuenta = await registrarAprobado(
    app,
    cliente,
    datos.usuario ? { usuario: datos.usuario } : {},
  );
  const cookies = cookiesDe(await entrarConUsuario(app, cuenta.usuario, cuenta.password));
  const fila = await cliente.db.query.usuarios.findFirst({
    where: (tabla, { eq }) => eq(tabla.email, cuenta.email),
    columns: { id: true },
  });
  if (!fila) throw new Error("No se encontró la cuenta recién creada.");

  await cliente.db
    .update(esquema.usuarios)
    .set({
      etiquetasInicialesCreadas: !datos.conEtiquetasIniciales,
      categoriasDeTareasInicialesCreadas: !datos.conCategoriasDeTareaIniciales,
    })
    .where(eq(esquema.usuarios.id, fila.id));
  if (datos.zonaHoraria) {
    await cliente.db
      .update(esquema.usuarios)
      .set({ zonaHoraria: datos.zonaHoraria })
      .where(eq(esquema.usuarios.id, fila.id));
  }
  return { cookies, userId: fila.id, usuario: cuenta.usuario };
}

export async function pedir(
  app: App,
  cookies: string | null,
  ruta: string,
  metodo = "GET",
  cuerpo?: unknown,
): Promise<Response> {
  return app.request(ruta, {
    method: metodo,
    headers: {
      ...(cookies === null ? {} : { cookie: cookies }),
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

/** Una persona válida con lo mínimo; cada test cambia lo que le interesa. */
export function personaValida(
  cambios: Partial<Extract<DatosDeContacto, { tipo: "persona" }>> = {},
) {
  return {
    tipo: "persona" as const,
    nombre: "Ana",
    apellido: "Pérez",
    fechaNacimiento: "",
    telefonos: [],
    correos: [],
    direccion: "",
    notas: "",
    favorito: false,
    etiquetaIds: [],
    ...cambios,
  };
}

/** Una empresa válida con lo mínimo. */
export function empresaValida(
  cambios: Partial<Extract<DatosDeContacto, { tipo: "empresa" }>> = {},
) {
  return {
    tipo: "empresa" as const,
    nombre: "Electricidad Sur",
    rubro: "",
    sitioWeb: "",
    horario: "",
    documento: "",
    personaDeContacto: "",
    telefonos: [],
    correos: [],
    direccion: "",
    notas: "",
    favorito: false,
    etiquetaIds: [],
    ...cambios,
  };
}

/** Crea un contacto por la API y devuelve su id. */
export async function crearContactoPorApi(
  app: App,
  cookies: string,
  datos: DatosDeContacto = personaValida(),
): Promise<string> {
  const respuesta = await pedir(app, cookies, "/api/contactos", "POST", datos);
  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear el contacto (${respuesta.status}): ${await respuesta.text()}`,
    );
  }
  return ((await respuesta.json()) as { id: string }).id;
}

/** Crea una etiqueta por la API y devuelve su id. */
export async function crearEtiquetaPorApi(
  app: App,
  cookies: string,
  nombre: string,
  color?: string,
): Promise<number> {
  const respuesta = await pedir(app, cookies, "/api/contactos/etiquetas", "POST", {
    nombre,
    ...(color ? { color } : {}),
  });
  if (respuesta.status !== 201) {
    throw new Error(
      `No se pudo crear la etiqueta (${respuesta.status}): ${await respuesta.text()}`,
    );
  }
  return ((await respuesta.json()) as { id: number }).id;
}

// --- Recordatorios: un atajo por repetición, con solo los campos que le tocan ---

export function unaVez(titulo: string, fecha: string, hora = "") {
  return { titulo, repeticion: "unica" as const, fecha, hora };
}

export function todosLosDias(titulo: string, hora: string) {
  return { titulo, repeticion: "diaria" as const, hora };
}

/** `diaSemana`: 1 es lunes y 7 es domingo. */
export function cadaSemana(titulo: string, diaSemana: number, hora = "") {
  return { titulo, repeticion: "semanal" as const, diaSemana, hora };
}

export function cadaMes(titulo: string, diaDelMes: number, hora = "") {
  return { titulo, repeticion: "mensual" as const, diaDelMes, hora };
}

export function cadaAnio(titulo: string, diaDelMes: number, mes: number, hora = "") {
  return { titulo, repeticion: "anual" as const, diaDelMes, mes, hora };
}

// --- Finanzas: lo mínimo para cargar movimientos y deudas con un contacto ---

export type EntornoDeFinanzas = {
  /** Una cuenta en pesos (la primera de las que se crean por defecto). */
  cuentaId: string;
  categoriaId: number;
};

/** Abre un período amplio y devuelve una cuenta y una categoría para cargar movimientos. */
export async function prepararFinanzas(app: App, cookies: string): Promise<EntornoDeFinanzas> {
  await abrirPeriodo(app, cookies, { nombre: "Amplio", aperturaEn: APERTURA_AMPLIA });
  const { cuentas } = (await (await pedir(app, cookies, "/api/finanzas/cuentas")).json()) as {
    cuentas: { id: string }[];
  };
  const { categorias } = (await (await pedir(app, cookies, "/api/finanzas/categorias")).json()) as {
    categorias: { id: number; sistema: string | null }[];
  };
  const cuenta = cuentas[0];
  const categoria = categorias.find((otra) => otra.sistema === null);
  if (!cuenta || !categoria) throw new Error("Faltan cuentas o categorías por defecto.");
  return { cuentaId: cuenta.id, categoriaId: categoria.id };
}

/** Carga un movimiento por la API (ingreso o gasto, en pesos) y devuelve la respuesta cruda. */
export function cargarMovimiento(
  app: App,
  cookies: string,
  entorno: EntornoDeFinanzas,
  datos: {
    tipo?: "ingreso" | "gasto" | "neutro";
    importe?: number;
    fecha?: string;
    descripcion?: string;
    contactoId?: string | null;
  } = {},
): Promise<Response> {
  return pedir(app, cookies, "/api/finanzas/movimientos", "POST", {
    tipo: "gasto",
    importe: 100,
    descripcion: "Movimiento",
    fecha: "2026-10-10T12:00:00.000Z",
    categoriaId: entorno.categoriaId,
    cuentaFinancieraId: entorno.cuentaId,
    ...datos,
  });
}

/** Registra una deuda por la API y devuelve la respuesta cruda. */
export function registrarDeuda(
  app: App,
  cookies: string,
  datos: {
    /** Con un contacto... */
    contactoId?: string;
    /** ...o con alguien que no lo es. */
    nombreLibre?: string;
    sentido?: "me_deben" | "debo";
    concepto?: string;
    monto?: number;
    moneda?: string;
    fecha?: string;
    /** Hasta qué día debería saldarse. */
    fechaLimite?: string;
  },
): Promise<Response> {
  return pedir(app, cookies, "/api/finanzas/deudas", "POST", {
    sentido: "me_deben",
    concepto: "Préstamo",
    monto: 1000,
    moneda: "UYU",
    fecha: "2026-10-01",
    ...datos,
  });
}

/** Registra una deuda y devuelve su id (falla el test si no se pudo crear). */
export async function crearDeudaPorApi(
  app: App,
  cookies: string,
  datos: Parameters<typeof registrarDeuda>[2],
): Promise<string> {
  const respuesta = await registrarDeuda(app, cookies, datos);
  if (respuesta.status !== 201) {
    throw new Error(`No se pudo crear la deuda (${respuesta.status}): ${await respuesta.text()}`);
  }
  return ((await respuesta.json()) as { id: string }).id;
}

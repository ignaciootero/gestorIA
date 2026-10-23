// Constantes del módulo de contactos, compartidas por la API y la web.

/** Un contacto es una persona o una empresa/servicio. */
export const TIPOS_DE_CONTACTO = { persona: "persona", empresa: "empresa" } as const;
export const TIPOS_DE_CONTACTO_VALIDOS = ["persona", "empresa"] as const;
export type TipoDeContacto = (typeof TIPOS_DE_CONTACTO_VALIDOS)[number];

export const TIPOS_DE_TELEFONO = { celular: "celular", fijo: "fijo" } as const;
export const TIPOS_DE_TELEFONO_VALIDOS = ["celular", "fijo"] as const;
export type TipoDeTelefono = (typeof TIPOS_DE_TELEFONO_VALIDOS)[number];

/** Cada cuánto se repite un recordatorio. "unica" ocurre una vez y desaparece al pasar el día. */
export const REPETICIONES = {
  unica: "unica",
  diaria: "diaria",
  semanal: "semanal",
  mensual: "mensual",
  anual: "anual",
} as const;
export const REPETICIONES_VALIDAS = ["unica", "diaria", "semanal", "mensual", "anual"] as const;
export type Repeticion = (typeof REPETICIONES_VALIDAS)[number];

/** Cómo se llama cada repetición en pantalla. */
export const NOMBRES_DE_REPETICION: Record<Repeticion, string> = {
  unica: "Una sola vez",
  diaria: "Todos los días",
  semanal: "Todas las semanas",
  mensual: "Todos los meses",
  anual: "Todos los años",
};

// Topes contra errores de carga y abusos; no son límites técnicos.
export const MAXIMO_DE_TELEFONOS = 5;
export const MAXIMO_DE_CORREOS = 5;
export const MAXIMO_DE_ETIQUETAS_POR_CONTACTO = 10;
export const MAXIMO_DE_RECORDATORIOS_POR_CONTACTO = 30;
export const MAXIMO_DE_ETIQUETAS = 50;

/**
 * Las etiquetas con las que arranca cada persona. Son suyas como cualquier otra: puede renombrarlas,
 * cambiarles el color o eliminarlas. Los colores salen del set por defecto de las categorías de
 * Finanzas (bien distintos entre sí).
 */
export const ETIQUETAS_POR_DEFECTO = [
  { nombre: "Familia", color: "#cf1754" },
  { nombre: "Amigos", color: "#17b0cf" },
  { nombre: "Trabajo", color: "#1717cf" },
  { nombre: "Servicios", color: "#889933" },
] as const;

/** Un recordatorio que el sistema recomienda crear. Es solo un punto de partida: se puede cambiar todo. */
export type SugerenciaDeRecordatorio = {
  titulo: string;
  repeticion: Repeticion;
  /** Si es el cumpleaños: la fecha se toma de la fecha de nacimiento del contacto, cuando la tiene. */
  usaElNacimiento?: boolean;
};

/** El título del recordatorio de cumpleaños, el que se sugiere y el que se crea al dar de alta a una persona. */
export const TITULO_DEL_CUMPLEANOS = "Cumpleaños";

/** Los recordatorios más comunes, según el tipo de contacto. */
export const SUGERENCIAS_DE_RECORDATORIO: Record<TipoDeContacto, SugerenciaDeRecordatorio[]> = {
  persona: [
    { titulo: TITULO_DEL_CUMPLEANOS, repeticion: "anual", usaElNacimiento: true },
    { titulo: "Aniversario", repeticion: "anual" },
    { titulo: "Llamarle", repeticion: "unica" },
    { titulo: "Devolverle algo", repeticion: "unica" },
  ],
  empresa: [
    { titulo: "Renovar el contrato", repeticion: "anual" },
    { titulo: "Pagar el servicio", repeticion: "mensual" },
    { titulo: "Control o mantenimiento", repeticion: "anual" },
    { titulo: "Pedir presupuesto", repeticion: "unica" },
  ],
};

/** Los días de la semana según ISO: 1 es lunes y 7 es domingo. */
export const NOMBRES_DE_DIA_DE_LA_SEMANA = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

/** Como se dice en "todos los ___": lunes, martes… sábados, domingos. */
export const NOMBRES_DE_DIA_EN_PLURAL = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábados",
  "domingos",
] as const;

export const NOMBRES_DE_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** Cuántos días tiene como máximo cada mes (febrero: 29, por los años bisiestos). */
export const DIAS_MAXIMOS_DE_CADA_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

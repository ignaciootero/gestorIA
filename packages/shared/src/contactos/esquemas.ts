// Esquemas Zod del módulo de contactos.
//
// Mismo criterio que el resto de los módulos: los usa el formulario de la web y la
// API valida el cuerpo contra los mismos, así las reglas no se desincronizan
// (docs/guias/seguridad-y-datos.md).
//
// Los textos opcionales aceptan cadena vacía (es lo que manda un campo en blanco del
// formulario); el servicio la guarda como "sin dato". Los esquemas no usan
// `.default()` ni transformaciones para que los tipos de entrada y salida coincidan
// al tipar `useForm`.

import { z } from "zod";
import { esquemaEmail } from "../auth/esquemas.ts";
import { esquemaColorCategoria } from "../finanzas/esquemas.ts";
import {
  DIAS_MAXIMOS_DE_CADA_MES,
  MAXIMO_DE_CORREOS,
  MAXIMO_DE_ETIQUETAS_POR_CONTACTO,
  MAXIMO_DE_TELEFONOS,
  TIPOS_DE_TELEFONO_VALIDOS,
} from "./constantes.ts";
import { esDiaReal } from "./fechas.ts";

export const LARGO_MAXIMO_NOMBRE_DE_CONTACTO = 60;
export const LARGO_MAXIMO_DIRECCION = 200;
export const LARGO_MAXIMO_NOTAS = 1000;
export const LARGO_MAXIMO_NOMBRE_DE_ETIQUETA = 30;
export const LARGO_MAXIMO_TITULO_DE_RECORDATORIO = 80;

/** El año más viejo que se acepta como nacimiento: contra errores de tipeo. */
const ANIO_MINIMO_DE_NACIMIENTO = 1900;

const textoCorto = (maximo: number, que: string) =>
  z.string().trim().max(maximo, `${que} no puede pasar de ${maximo} caracteres.`);

const nombreObligatorio = (que: string) =>
  z
    .string()
    .trim()
    .min(1, `Escribí ${que}.`)
    .max(
      LARGO_MAXIMO_NOMBRE_DE_CONTACTO,
      `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE_DE_CONTACTO} caracteres.`,
    );

/** Un día de calendario "AAAA-MM-DD" que existe. */
export const esquemaDiaDeCalendario = z.string().refine(esDiaReal, "Esa fecha no es válida.");

const esquemaFechaDeNacimiento = z.union([
  z.literal(""),
  esquemaDiaDeCalendario.refine(
    (dia) => Number(dia.slice(0, 4)) >= ANIO_MINIMO_DE_NACIMIENTO,
    `Revisá el año: tiene que ser ${ANIO_MINIMO_DE_NACIMIENTO} o posterior.`,
  ),
]);

/** Solo dígitos, espacios y los signos de un número ("+598 99 123 456", "(02) 900-0000"). */
const FORMATO_DE_TELEFONO = /^\+?[0-9 ().-]+$/;
const MINIMO_DE_DIGITOS = 3;
const MAXIMO_DE_DIGITOS = 15;

export const esquemaTelefono = z.object({
  numero: z
    .string()
    .trim()
    .min(1, "Escribí el número.")
    .max(25, "Ese número es demasiado largo.")
    .refine((numero) => FORMATO_DE_TELEFONO.test(numero), "Usá solo números, espacios y + ( ) - .")
    .refine((numero) => {
      const digitos = numero.replace(/\D/g, "").length;
      return digitos >= MINIMO_DE_DIGITOS && digitos <= MAXIMO_DE_DIGITOS;
    }, `Un número tiene entre ${MINIMO_DE_DIGITOS} y ${MAXIMO_DE_DIGITOS} cifras.`),
  tipo: z.enum(TIPOS_DE_TELEFONO_VALIDOS, { error: "Elegí si es celular o fijo." }),
});
export type DatosDeTelefono = z.infer<typeof esquemaTelefono>;

/** Un sitio web con o sin "https://" delante. Solo http o https: nada de `javascript:`. */
export function aEnlaceWeb(texto: string): string | null {
  const limpio = texto.trim();
  if (limpio === "" || /\s/.test(limpio)) return null;
  const conEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
  try {
    const url = new URL(conEsquema);
    const esWeb = url.protocol === "https:" || url.protocol === "http:";
    // Sin punto no es un sitio ("localhost", "abc"): casi seguro un error de tipeo.
    return esWeb && url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * El enlace para ver una dirección en el mapa: la búsqueda de OpenStreetMap con la dirección ya
 * escrita. Es un enlace común que abre otra pestaña: no se manda nada desde nuestro servidor ni
 * hace falta una librería de mapas ni guardar coordenadas. El texto va codificado, así que una
 * dirección con `&`, `#` o comillas no puede cambiar el enlace.
 */
export function enlaceDeMapa(direccion: string): string {
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(direccion.trim())}`;
}

const esquemaSitioWeb = z
  .string()
  .trim()
  .max(200, "La dirección web no puede pasar de 200 caracteres.")
  .refine(
    (texto) => texto === "" || aEnlaceWeb(texto) !== null,
    "Esa dirección web no parece válida. Por ejemplo: www.ejemplo.com.uy",
  );

const esquemaEtiquetaId = z
  .number("Elegí una etiqueta válida.")
  .int("Elegí una etiqueta válida.")
  .positive("Elegí una etiqueta válida.");

/** Lo que tienen en común personas y empresas. */
const camposComunes = {
  telefonos: z
    .array(esquemaTelefono)
    .max(MAXIMO_DE_TELEFONOS, `Hasta ${MAXIMO_DE_TELEFONOS} teléfonos por contacto.`),
  correos: z
    .array(esquemaEmail)
    .max(MAXIMO_DE_CORREOS, `Hasta ${MAXIMO_DE_CORREOS} correos por contacto.`),
  direccion: textoCorto(LARGO_MAXIMO_DIRECCION, "La dirección"),
  notas: textoCorto(LARGO_MAXIMO_NOTAS, "Las notas"),
  favorito: z.boolean(),
  etiquetaIds: z
    .array(esquemaEtiquetaId)
    .max(
      MAXIMO_DE_ETIQUETAS_POR_CONTACTO,
      `Hasta ${MAXIMO_DE_ETIQUETAS_POR_CONTACTO} etiquetas por contacto.`,
    ),
};

export const esquemaPersona = z.object({
  tipo: z.literal("persona"),
  nombre: nombreObligatorio("el nombre"),
  apellido: textoCorto(LARGO_MAXIMO_NOMBRE_DE_CONTACTO, "El apellido"),
  fechaNacimiento: esquemaFechaDeNacimiento,
  /**
   * Solo al dar de alta, y solo si hay fecha de nacimiento: crea además el recordatorio anual del
   * cumpleaños. Al editar se ignora (para eso están los recordatorios de la ficha).
   */
  recordarCumpleanos: z.boolean().optional(),
  ...camposComunes,
});
export type DatosDePersona = z.infer<typeof esquemaPersona>;

export const esquemaEmpresa = z.object({
  tipo: z.literal("empresa"),
  nombre: nombreObligatorio("el nombre de la empresa o servicio"),
  rubro: textoCorto(LARGO_MAXIMO_NOMBRE_DE_CONTACTO, "El rubro"),
  sitioWeb: esquemaSitioWeb,
  horario: textoCorto(120, "El horario"),
  documento: textoCorto(30, "El documento"),
  personaDeContacto: textoCorto(LARGO_MAXIMO_NOMBRE_DE_CONTACTO, "La persona de contacto"),
  ...camposComunes,
});
export type DatosDeEmpresa = z.infer<typeof esquemaEmpresa>;

/**
 * Crear o editar un contacto. Se distingue por `tipo`, que no se puede cambiar
 * después: una persona no se convierte en empresa (se crea otro contacto).
 */
export const esquemaContacto = z.discriminatedUnion("tipo", [esquemaPersona, esquemaEmpresa]);
export type DatosDeContacto = z.infer<typeof esquemaContacto>;

/** Cambiar solo si es favorito, sin tocar el resto. */
export const esquemaFavorito = z.object({ favorito: z.boolean() });

export const esquemaEtiquetaDeContacto = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribí un nombre para la etiqueta.")
    .max(
      LARGO_MAXIMO_NOMBRE_DE_ETIQUETA,
      `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE_DE_ETIQUETA} caracteres.`,
    ),
  color: esquemaColorCategoria.optional(),
});
export type DatosDeEtiquetaDeContacto = z.infer<typeof esquemaEtiquetaDeContacto>;

const esquemaTitulo = z
  .string()
  .trim()
  .min(1, "Escribí de qué te tenemos que acordar.")
  .max(
    LARGO_MAXIMO_TITULO_DE_RECORDATORIO,
    `El título no puede pasar de ${LARGO_MAXIMO_TITULO_DE_RECORDATORIO} caracteres.`,
  );

/** "HH:MM", de 00:00 a 23:59: lo que da un <input type="time">. */
const FORMATO_DE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const esquemaHora = z.string().regex(FORMATO_DE_HORA, "Esa hora no es válida.");

/** En blanco es "sin hora" (todo el día). */
export const esquemaHoraOpcional = z.union([z.literal(""), esquemaHora]);

export const esquemaDiaDeLaSemana = z
  .number("Elegí el día de la semana.")
  .int("Elegí el día de la semana.")
  .min(1, "Elegí el día de la semana.")
  .max(7, "Elegí el día de la semana.");

export const esquemaDiaDelMes = z
  .number("Elegí el día del mes.")
  .int("Elegí el día del mes.")
  .min(1, "Elegí el día del mes.")
  .max(31, "Elegí el día del mes.");

export const esquemaMes = z
  .number("Elegí el mes.")
  .int("Elegí el mes.")
  .min(1, "Elegí el mes.")
  .max(12, "Elegí el mes.");

/**
 * Un recordatorio. Qué se le pide a la persona depende de cada cuánto se repite, y cada
 * variante tiene solo los campos que le corresponden:
 * - `unica`: el día (no puede estar en el pasado; eso lo valida el servicio con "hoy").
 * - `diaria`: la hora, obligatoria.
 * - `semanal`: el día de la semana (1 es lunes y 7 es domingo).
 * - `mensual`: el día del mes. Si el mes no lo tiene, cae el último día.
 * - `anual`: el día y el mes (el 29 de febrero cae el 28 en los años comunes).
 * La hora es opcional en todas menos en la diaria; en blanco significa "todo el día".
 */
/**
 * Un recordatorio importante lleva un distintivo (no cambia el orden de las listas). Opcional: al crear, sin el campo no es
 * importante; al editar, sin el campo se conserva lo que tenía.
 */
const esquemaImportante = z.boolean().optional();

export const esquemaRecordatorio = z.discriminatedUnion("repeticion", [
  z.object({
    titulo: esquemaTitulo,
    importante: esquemaImportante,
    repeticion: z.literal("unica", { error: "Elegí cada cuánto se repite." }),
    fecha: esquemaDiaDeCalendario,
    hora: esquemaHoraOpcional,
  }),
  z.object({
    titulo: esquemaTitulo,
    importante: esquemaImportante,
    repeticion: z.literal("diaria"),
    // Vacía o mal escrita no sirve: la primera regla que falla es la que se muestra.
    hora: z.string().min(1, "Elegí a qué hora.").regex(FORMATO_DE_HORA, "Esa hora no es válida."),
  }),
  z.object({
    titulo: esquemaTitulo,
    importante: esquemaImportante,
    repeticion: z.literal("semanal"),
    diaSemana: esquemaDiaDeLaSemana,
    hora: esquemaHoraOpcional,
  }),
  z.object({
    titulo: esquemaTitulo,
    importante: esquemaImportante,
    repeticion: z.literal("mensual"),
    diaDelMes: esquemaDiaDelMes,
    hora: esquemaHoraOpcional,
  }),
  z
    .object({
      titulo: esquemaTitulo,
      importante: esquemaImportante,
      repeticion: z.literal("anual"),
      diaDelMes: esquemaDiaDelMes,
      mes: esquemaMes,
      hora: esquemaHoraOpcional,
    })
    .refine((datos) => datos.diaDelMes <= (DIAS_MAXIMOS_DE_CADA_MES[datos.mes - 1] ?? 31), {
      path: ["diaDelMes"],
      error: "Ese mes no tiene ese día.",
    }),
]);
export type DatosDeRecordatorio = z.infer<typeof esquemaRecordatorio>;

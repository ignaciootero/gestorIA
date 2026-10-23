// Esquemas Zod del módulo de tareas.
//
// Los usa el formulario de la web y la API valida el cuerpo contra los mismos, así las reglas no
// se desincronizan (docs/guias/seguridad-y-datos.md). Igual que en contactos, los textos
// opcionales aceptan cadena vacía (es lo que manda un campo en blanco) y los esquemas no usan
// `.default()` ni transformaciones, para que los tipos de entrada y salida coincidan al tipar `useForm`.

import { z } from "zod";
import { DIAS_MAXIMOS_DE_CADA_MES } from "../contactos/constantes.ts";
import {
  esquemaDiaDeCalendario,
  esquemaDiaDeLaSemana,
  esquemaDiaDelMes,
  esquemaHoraOpcional,
  esquemaMes,
} from "../contactos/esquemas.ts";
import { esquemaColorCategoria } from "../finanzas/esquemas.ts";
import {
  LARGO_MAXIMO_NOMBRE_DE_CATEGORIA_DE_TAREA,
  LARGO_MAXIMO_NOTAS_DE_TAREA,
  LARGO_MAXIMO_TITULO_DE_TAREA,
  MAXIMO_DE_DIAS_ENTRE_REPETICIONES,
  MINIMO_DE_DIAS_ENTRE_REPETICIONES,
  REPETICIONES_DE_TAREA,
} from "./constantes.ts";

const esquemaTitulo = z
  .string()
  .trim()
  .min(1, "Escribí qué hay que hacer.")
  .max(
    LARGO_MAXIMO_TITULO_DE_TAREA,
    `El título no puede pasar de ${LARGO_MAXIMO_TITULO_DE_TAREA} caracteres.`,
  );

const esquemaNotas = z
  .string()
  .trim()
  .max(
    LARGO_MAXIMO_NOTAS_DE_TAREA,
    `Las notas no pueden pasar de ${LARGO_MAXIMO_NOTAS_DE_TAREA} caracteres.`,
  );

/**
 * La categoría de la tarea: opcional. `null` es "sin categoría"; al editar, si no viene se conserva
 * la que tenía.
 */
const esquemaCategoriaId = z
  .number("Elegí una categoría válida.")
  .int("Elegí una categoría válida.")
  .positive("Elegí una categoría válida.")
  .nullable()
  .optional();

/**
 * Si las tareas de una repetitiva se dan por fallidas solas cuando pasa su día sin completarse (en vez de
 * quedar como atrasadas). Opcional: al crear, sin esto es que no; al editar, si no viene se conserva.
 */
const esquemaFallaSola = z.boolean("Indicá si se da por fallida sola o no.").optional();

/** Cada cuántos días se repite una tarea "cada tantos días": un entero de 2 a 365. */
const esquemaCadaDias = z
  .number("Indicá cada cuántos días se repite.")
  .int("Indicá un número entero de días.")
  .min(
    MINIMO_DE_DIAS_ENTRE_REPETICIONES,
    `Tiene que ser cada ${MINIMO_DE_DIAS_ENTRE_REPETICIONES} días o más. Para todos los días, elegí "Todos los días".`,
  )
  .max(
    MAXIMO_DE_DIAS_ENTRE_REPETICIONES,
    `No puede pasar de ${MAXIMO_DE_DIAS_ENTRE_REPETICIONES} días.`,
  );

/**
 * El primer día de una tarea "cada tantos días". En blanco es hoy; que no sea un día que ya pasó lo revisa el
 * servicio (necesita saber qué día es hoy para esa persona).
 */
const esquemaFechaDeInicio = z.union([z.literal(""), esquemaDiaDeCalendario]);

/** Los días de la semana de una tarea semanal: uno o varios, sin repetir. */
const esquemaDiasDeLaSemana = z
  .array(esquemaDiaDeLaSemana)
  .min(1, "Elegí al menos un día de la semana.")
  .refine((dias) => new Set(dias).size === dias.length, "No repitas los días de la semana.");

/** Crear o renombrar una categoría de tareas. Sin color, se elige el más distinto de los que ya hay. */
export const esquemaCategoriaDeTarea = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribí un nombre para la categoría.")
    .max(
      LARGO_MAXIMO_NOMBRE_DE_CATEGORIA_DE_TAREA,
      `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE_DE_CATEGORIA_DE_TAREA} caracteres.`,
    ),
  color: esquemaColorCategoria.optional(),
});
export type DatosDeCategoriaDeTarea = z.infer<typeof esquemaCategoriaDeTarea>;

/**
 * Una tarea de uso único. En blanco el día, es hoy. Si no se completa ese día, sigue en la lista
 * como atrasada hasta que se haga.
 */
/**
 * Una tarea importante lleva un distintivo (no cambia el orden de las listas). Opcional: al crear, sin el campo no es
 * importante; al editar, sin el campo se conserva lo que tenía.
 */
const esquemaImportante = z.boolean().optional();

export const esquemaTarea = z.object({
  titulo: esquemaTitulo,
  notas: esquemaNotas,
  fecha: z.union([z.literal(""), esquemaDiaDeCalendario]),
  hora: esquemaHoraOpcional,
  categoriaId: esquemaCategoriaId,
  importante: esquemaImportante,
});
export type DatosDeTarea = z.infer<typeof esquemaTarea>;

/**
 * Una tarea que se repite. Cada repetición lleva solo lo que le corresponde (como los
 * recordatorios de contactos): diaria, nada más; semanal, uno o varios días de la semana (1 es lunes y 7
 * domingo); mensual, el día del mes; anual, el día y el mes. La hora es opcional en todas.
 */
export const esquemaTareaRepetitiva = z.discriminatedUnion("repeticion", [
  z.object({
    titulo: esquemaTitulo,
    notas: esquemaNotas,
    categoriaId: esquemaCategoriaId,
    importante: esquemaImportante,
    fallaSola: esquemaFallaSola,
    repeticion: z.literal("diaria", { error: "Elegí cada cuánto se repite." }),
    hora: esquemaHoraOpcional,
  }),
  z.object({
    titulo: esquemaTitulo,
    notas: esquemaNotas,
    categoriaId: esquemaCategoriaId,
    importante: esquemaImportante,
    fallaSola: esquemaFallaSola,
    repeticion: z.literal("intervalo"),
    cadaDias: esquemaCadaDias,
    fechaInicio: esquemaFechaDeInicio,
    hora: esquemaHoraOpcional,
  }),
  z.object({
    titulo: esquemaTitulo,
    notas: esquemaNotas,
    categoriaId: esquemaCategoriaId,
    importante: esquemaImportante,
    fallaSola: esquemaFallaSola,
    repeticion: z.literal("semanal"),
    diasSemana: esquemaDiasDeLaSemana,
    hora: esquemaHoraOpcional,
  }),
  z.object({
    titulo: esquemaTitulo,
    notas: esquemaNotas,
    categoriaId: esquemaCategoriaId,
    importante: esquemaImportante,
    fallaSola: esquemaFallaSola,
    repeticion: z.literal("mensual"),
    diaDelMes: esquemaDiaDelMes,
    hora: esquemaHoraOpcional,
  }),
  z
    .object({
      titulo: esquemaTitulo,
      notas: esquemaNotas,
      categoriaId: esquemaCategoriaId,
      importante: esquemaImportante,
      fallaSola: esquemaFallaSola,
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
export type DatosDeTareaRepetitiva = z.infer<typeof esquemaTareaRepetitiva>;

/** En qué estado está una tarea: sin resolver, completada o dada por fallida. */
export const ESTADOS_DE_TAREA = ["pendiente", "completada", "fallida"] as const;
export type EstadoDeTarea = (typeof ESTADOS_DE_TAREA)[number];

export const NOMBRES_DE_ESTADO_DE_TAREA: Record<EstadoDeTarea, string> = {
  pendiente: "Pendientes",
  completada: "Completadas",
  fallida: "Fallidas",
};

/** Un campo de la query que viene en blanco es lo mismo que no venir. */
const opcionalEnBlanco = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((valor) => (valor === "" ? undefined : valor), esquema.optional());

/**
 * Los filtros del historial (query de `GET /api/tareas/historial`). Sin fechas se muestran los últimos 7 días;
 * todos son opcionales y se combinan. `categoriaId` puede ser `sin` (las tareas sin categoría) y `repeticion`
 * puede ser `unica` (las tareas sueltas).
 */
export const esquemaFiltrosDeHistorial = z
  .object({
    desde: opcionalEnBlanco(esquemaDiaDeCalendario),
    hasta: opcionalEnBlanco(esquemaDiaDeCalendario),
    estado: opcionalEnBlanco(z.enum(ESTADOS_DE_TAREA, { error: "Elegí un estado válido." })),
    categoriaId: opcionalEnBlanco(
      z.union([
        z.literal("sin"),
        z.coerce
          .number("Elegí una categoría válida.")
          .int("Elegí una categoría válida.")
          .positive("Elegí una categoría válida."),
      ]),
    ),
    repeticion: opcionalEnBlanco(
      z.enum(["unica", ...REPETICIONES_DE_TAREA], { error: "Elegí una periodicidad válida." }),
    ),
  })
  .refine((filtros) => !filtros.desde || !filtros.hasta || filtros.desde <= filtros.hasta, {
    path: ["hasta"],
    error: "La fecha final no puede ser anterior a la inicial.",
  });
export type FiltrosDeHistorial = z.infer<typeof esquemaFiltrosDeHistorial>;

/** Tachar o destachar una tarea. */
export const esquemaCompletarTarea = z.object({ completada: z.boolean() });

/** Marcar una tarea atrasada como fallida (que ya no se va a hacer) o volver a dejarla pendiente. */
export const esquemaFallarTarea = z.object({ fallida: z.boolean() });

// Constantes del módulo de tareas (la lista de to-do), compartidas por la API y la web.

import type { Repeticion } from "../contactos/constantes.ts";

/**
 * Cada cuánto se repite una tarea repetitiva. No incluye "una sola vez": las tareas de uso único
 * no son repetitivas, se crean sueltas (con su día) y desaparecen al completarse. "intervalo" es "cada
 * tantos días" (día por medio, cada 3 días…): es propia de las tareas, los recordatorios no la tienen.
 */
export const REPETICIONES_DE_TAREA = [
  "diaria",
  "intervalo",
  "semanal",
  "mensual",
  "anual",
] as const;
export type RepeticionDeTarea =
  | Extract<Repeticion, "diaria" | "semanal" | "mensual" | "anual">
  | "intervalo";

/** Cómo se llama cada repetición en el selector del formulario de tareas. */
export const NOMBRES_DE_REPETICION_DE_TAREA: Record<RepeticionDeTarea | "ninguna", string> = {
  ninguna: "No se repite",
  diaria: "Todos los días",
  intervalo: "Cada varios días",
  semanal: "Todas las semanas",
  mensual: "Todos los meses",
  anual: "Todos los años",
};

/** Cada cuántos días puede repetirse una tarea "cada tantos días": 2 es día por medio; 1 sería "todos los días". */
export const MINIMO_DE_DIAS_ENTRE_REPETICIONES = 2;
export const MAXIMO_DE_DIAS_ENTRE_REPETICIONES = 365;

export const LARGO_MAXIMO_TITULO_DE_TAREA = 120;
export const LARGO_MAXIMO_NOTAS_DE_TAREA = 500;
export const LARGO_MAXIMO_NOMBRE_DE_CATEGORIA_DE_TAREA = 30;

/**
 * Tareas progresivas ("tomar 2 litros de agua"): la meta es una cantidad con hasta dos decimales, de más
 * de 0 hasta este tope, y la unidad ("litros", "páginas") es un texto corto opcional.
 */
export const MAXIMO_DE_META_DE_TAREA = 1_000_000;
export const LARGO_MAXIMO_UNIDAD_DE_TAREA = 16;

// Topes contra errores de carga y abusos; no son límites técnicos.
export const MAXIMO_DE_TAREAS_REPETITIVAS = 100;
export const MAXIMO_DE_TAREAS_PENDIENTES = 500;
export const MAXIMO_DE_CATEGORIAS_DE_TAREA = 30;

/**
 * Las categorías con las que arranca cada persona. Son suyas como cualquier otra: puede renombrarlas,
 * cambiarles el color o eliminarlas (mientras no tengan tareas). Los colores salen del set por
 * defecto de las categorías de Finanzas (bien distintos entre sí).
 */
export const CATEGORIAS_DE_TAREA_POR_DEFECTO = [
  { nombre: "Personal", color: "#bb85d6" },
  { nombre: "Casa", color: "#cf5417" },
  { nombre: "Trabajo", color: "#1717cf" },
  { nombre: "Estudio", color: "#17b0cf" },
  { nombre: "Salud", color: "#cf1754" },
  { nombre: "Compras", color: "#17cf54" },
  { nombre: "Trámites", color: "#889933" },
] as const;

/**
 * Cuántos días hacia atrás se arman las tareas repetitivas si la persona no entró en un tiempo
 * (con 31 días ya no se acumula más, aunque falte un mes entero).
 */
export const DIAS_DE_TAREAS_A_ARMAR = 31;

/** Cuánto historial se conserva. Lo más viejo lo borra el job de limpieza. */
export const DIAS_DE_HISTORIAL_DE_TAREAS = 365;

/**
 * Cuántos días puede estar una tarea como atrasada antes de darse por fallida sola. Se cuentan desde el
 * día siguiente al suyo (o desde que la persona la devolvió a pendiente): pasada una semana, falla.
 */
export const DIAS_DE_ATRASO_PARA_FALLAR = 7;

/** Cuántos días hacia atrás muestra el historial si la persona no elige otro rango (hoy no cuenta). */
export const DIAS_POR_DEFECTO_DEL_HISTORIAL = 7;

/** Tope de tareas que trae una consulta del historial; si hay más, se avisa que se acote el rango. */
export const MAXIMO_DE_TAREAS_EN_EL_HISTORIAL = 1000;

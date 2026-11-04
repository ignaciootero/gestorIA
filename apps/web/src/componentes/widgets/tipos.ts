// Lo que necesita un widget para dibujarse, sin saber de qué módulo viene.
//
// Cada módulo arma su lista de `DatoDeWidget` a partir de sus datos y las
// pantallas la muestran en un carrusel (columna lateral) o en una grilla (inicio).
// Así el carrusel y las tarjetas no saben nada de finanzas, y el día que haya
// otro módulo solo hay que escribir su función de armado.
//
// Un widget puede ser una cifra sola o llevar un `visual`: un mini gráfico que
// muestra la forma de los datos. El visual nunca es la única fuente de información:
// el título, la cifra y el detalle dicen lo mismo con palabras, y el gráfico es
// decorativo para los lectores de pantalla.

import type { LucideIcon } from "lucide-react";

/** "neutro" es un dato más; los demás son los colores de estado, reservados para su significado. */
export type TonoDeWidget = "neutro" | "info" | "exito" | "advertencia" | "peligro";

/** Colores semánticos de un gráfico: el mismo criterio que los gráficos grandes del módulo. */
export type ColorDeVisual = "ingreso" | "gasto" | "acento" | "suave";

export type VisualDeWidget =
  /** Una o dos líneas (la segunda, punteada, sirve de referencia: "el período anterior"). */
  | {
      tipo: "linea";
      series: { valores: readonly (number | null)[]; referencia?: boolean }[];
    }
  /**
   * Barras verticales chicas; una va resaltada y el resto, más tenues. Por defecto la última
   * ("hoy" al final); `resaltada` elige otra (por ejemplo, el mes actual en un año) y
   * `colorDeLaResaltada` le da otro color (un color CSS; por defecto, el de acento). Con
   * `etiquetas`, cada barra lleva la suya debajo (cortas: "1", "Lu").
   */
  | {
      tipo: "barras";
      valores: readonly number[];
      resaltada?: number;
      colorDeLaResaltada?: string;
      etiquetas?: readonly string[];
    }
  /** Barras horizontales una debajo de la otra, a la misma escala (por ejemplo, ingresos y gastos). */
  | {
      tipo: "comparacion";
      filas: { etiqueta: string; texto: string; valor: number; color: ColorDeVisual }[];
    }
  /** Un porcentaje como anillo, con el número adentro. */
  | { tipo: "anillo"; porcentaje: number; color: string }
  /** Un porcentaje como barra de avance; pasa a advertencia al 80 % y a peligro al pasar el 100 %. */
  | { tipo: "progreso"; porcentaje: number }
  /** Filas con nombre, barra proporcional y monto. Reemplaza a la cifra grande. */
  | {
      tipo: "ranking";
      filas: { etiqueta: string; texto: string; proporcion: number; color: string }[];
    };

/**
 * La categoría decide en qué lugar de la columna lateral aparece el widget: arriba van los de
 * texto y abajo los gráficos. Se pueden sumar más categorías (cada una con su carrusel) sin tocar
 * los módulos: basta con agregarla acá y en `CATEGORIAS_DE_WIDGET`.
 * - "texto": una cifra, una curiosidad o un aviso, con su detalle (sin gráfico).
 * - "grafico": lleva un `visual` (línea, barras, comparación, anillo, avance o ranking).
 */
export type CategoriaDeWidget = "texto" | "grafico";

/** De arriba hacia abajo en la columna lateral: un carrusel por categoría. */
export const CATEGORIAS_DE_WIDGET: readonly CategoriaDeWidget[] = ["texto", "grafico"];

export type DatoDeWidget = {
  /** Estable entre recargas: el carrusel lo usa para no saltar de widget cuando se actualizan los datos. */
  id: string;
  /** Un "aviso" pide atención; un "dato" es una cifra o una curiosidad. */
  tipo: "dato" | "aviso";
  tono: TonoDeWidget;
  /** Dónde se muestra en la columna lateral. Un "grafico" siempre lleva `visual`. */
  categoria: CategoriaDeWidget;
  Icono: LucideIcon;
  titulo: string;
  /** La cifra principal, ya formateada (puede faltar en un aviso que se explica solo). */
  valor?: string;
  /** Una o dos frases cortas que completan la cifra. */
  detalle: string;
  /** Mini gráfico. Sin él, el widget es solo texto. */
  visual?: VisualDeWidget;
  /**
   * Datos de apoyo ("Entró: $ 5.000"), en filas debajo del detalle. Los muestran las tarjetas
   * grandes de la columna lateral; las chicas de la pantalla de inicio no.
   */
  extras?: { etiqueta: string; valor: string }[];
};

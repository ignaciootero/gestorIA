// Selector de segmentos: opciones con un fondo que se desliza entre ellas.
//
// Extraído del selector de PanelDeIngreso para el panel de admin, que necesita
// el mismo patrón (docs/guias/estetica.md, tabs/selectores segmentados) con
// más de dos secciones y contenido de forma muy distinta entre sí (listas,
// tablas), así que acá no anima el contenido, solo el propio selector.
//
// Sirve para dos casos con semántica de accesibilidad distinta, y por eso las
// dos ramas están separadas en vez de armar los atributos ARIA con un
// ternario: un `role` que depende de una condición deja al linter sin poder
// saber qué atributos le corresponden.
// - Pestañas de verdad (`pestanas`, el valor por defecto): cada opción muestra
//   u oculta un panel propio. Usa `role="tablist"`/`"tab"` y `aria-controls`.
// - Un filtro (`filtro`): elegir una opción angosta una lista que sigue siendo
//   la misma, no hay un panel por opción. Usa `role="radiogroup"`/`"radio"`,
//   igual que el selector de tema — poner semántica de pestañas acá violaba
//   la regla de que `aria-controls` apunte a algo que exista.

"use client";

import { RESORTE } from "@gestoria/ui-tokens";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/clases";

type SegmentoDe<T extends string> = { valor: T; etiqueta: string };

type PropsSelectorDeSegmentos<T extends string> = {
  segmentos: readonly SegmentoDe<T>[];
  activo: T;
  onCambiar: (valor: T) => void;
  /** Anuncia el grupo a los lectores de pantalla. */
  etiqueta: string;
  /** Distingue el fondo deslizante si hay más de un selector en la misma pantalla. */
  id: string;
  /** "pestanas" (por defecto) si cada opción controla un panel propio; "filtro" si solo angosta una lista. */
  modo?: "pestanas" | "filtro";
  className?: string;
};

// En una pantalla angosta las pestañas pueden no entrar (Finanzas tiene varias, y cada nombre va
// en una línea). En vez de empujar la pantalla hacia afuera, el grupo nunca es más ancho que su
// contenedor y se desplaza de costado, sin barra visible (se ve que sigue porque la última queda
// cortada). Con lugar de sobra, las pestañas se reparten el ancho por igual, como siempre.
const CLASE_GRUPO =
  "grid max-w-full gap-1 overflow-x-auto rounded-control bg-superficie-suave p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const CLASE_BOTON =
  "relative h-9 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-(--duracion-normal) ease-salida sm:px-4";

function Pastilla({
  id,
  reducirMovimiento,
  etiqueta,
}: {
  id: string;
  reducirMovimiento: boolean | null;
  etiqueta: string;
}) {
  return (
    <>
      {/* El mismo acento que Boton "principal": la pestaña activa se resuelve
          con el único color reservado para una acción o estado principal por
          pantalla (docs/guias/estetica.md, Colores). */}
      <motion.span
        layoutId={`fondo-${id}`}
        className="absolute inset-0 rounded-md bg-acento shadow-sutil"
        transition={reducirMovimiento ? { duration: 0 } : RESORTE.firme}
      />
      <span className="relative">{etiqueta}</span>
    </>
  );
}

export function SelectorDeSegmentos<T extends string>({
  segmentos,
  activo,
  onCambiar,
  etiqueta,
  id,
  modo = "pestanas",
  className,
}: PropsSelectorDeSegmentos<T>) {
  const reducirMovimiento = useReducedMotion();
  // Cada pestaña mide al menos lo que su nombre (`max-content`) y, si sobra lugar, se reparte por
  // igual (`1fr`). Con `1fr` a secas el grupo no se desplazaba: crecía y empujaba la pantalla.
  const columnas = { gridTemplateColumns: `repeat(${segmentos.length}, minmax(max-content, 1fr))` };

  if (modo === "filtro") {
    return (
      <div
        role="radiogroup"
        aria-label={etiqueta}
        className={cn(CLASE_GRUPO, className)}
        style={columnas}
      >
        {segmentos.map((segmento) => {
          const activa = activo === segmento.valor;
          return (
            <button
              key={segmento.valor}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onCambiar(segmento.valor)}
              className={cn(
                CLASE_BOTON,
                activa ? "text-acento-texto" : "text-texto-secundario hover:text-texto",
              )}
            >
              {activa ? (
                <Pastilla
                  id={id}
                  reducirMovimiento={reducirMovimiento}
                  etiqueta={segmento.etiqueta}
                />
              ) : (
                <span className="relative">{segmento.etiqueta}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={etiqueta}
      className={cn(CLASE_GRUPO, className)}
      style={columnas}
    >
      {segmentos.map((segmento) => {
        const activa = activo === segmento.valor;
        return (
          <button
            key={segmento.valor}
            type="button"
            role="tab"
            id={`${id}-${segmento.valor}`}
            aria-selected={activa}
            aria-controls={`panel-${id}-${segmento.valor}`}
            onClick={() => onCambiar(segmento.valor)}
            className={cn(
              CLASE_BOTON,
              activa ? "text-acento-texto" : "text-texto-secundario hover:text-texto",
            )}
          >
            {activa ? (
              <Pastilla
                id={id}
                reducirMovimiento={reducirMovimiento}
                etiqueta={segmento.etiqueta}
              />
            ) : (
              <span className="relative">{segmento.etiqueta}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

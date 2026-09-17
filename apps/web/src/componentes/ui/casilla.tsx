// Casilla de verificación, con el patrón de tareas incluido.
//
// El tilde se dibuja animando el recorrido del trazo, la caja se hunde al
// presionarla y, cuando se usa para una tarea, el texto se tacha con una línea
// que crece de izquierda a derecha (docs/guias/estetica.md).
//
// Debajo hay un <input type="checkbox"> de verdad, oculto a la vista pero no a
// los lectores de pantalla ni al teclado: la caja dibujada es decorativa. Eso
// es lo que hace que funcione la barra espaciadora, el clic en la etiqueta y el
// anuncio correcto del estado, sin escribir una línea de eso a mano.
//
// La animación entera vive en CSS (globals.css): son transiciones sobre el
// estado `:checked` del campo, así que no hace falta que React se entere de
// nada para que se vean.

"use client";

import type { ChangeEvent, ReactNode } from "react";
import { cn } from "@/lib/clases";

type PropsCasilla = {
  etiqueta: ReactNode;
  marcada: boolean;
  onCambio: (marcada: boolean) => void;
  /** Tacha la etiqueta al marcar. Para listas de tareas. */
  tachar?: boolean;
  disabled?: boolean;
  className?: string;
};

export function Casilla({
  etiqueta,
  marcada,
  onCambio,
  tachar = false,
  disabled = false,
  className,
}: PropsCasilla) {
  function alCambiar(evento: ChangeEvent<HTMLInputElement>): void {
    onCambio(evento.currentTarget.checked);
  }

  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-3 text-sm",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={marcada}
        onChange={alCambiar}
        disabled={disabled}
        className="casilla-entrada solo-lectores"
      />

      <span
        aria-hidden="true"
        className={cn(
          "casilla-caja inline-flex size-5 shrink-0 items-center justify-center",
          "rounded-[0.3rem]",
        )}
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none">
          <title>Tilde</title>
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            className="casilla-tilde"
            stroke="var(--color-acento-texto)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className={cn(tachar && "casilla-tachado")}>{etiqueta}</span>
    </label>
  );
}

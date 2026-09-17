// Interruptor: enciende o apaga algo en el momento, sin botón de guardar.
//
// La perilla se desliza y el fondo pasa al acento; al presionar, la perilla se
// estira hacia el lado contrario al que está apoyada, como si tuviera inercia
// (docs/guias/estetica.md).
//
// Es un <button role="switch">, no un checkbox: la diferencia no es cosmética.
// Un lector de pantalla anuncia "activado / desactivado" en vez de "marcado", y
// eso es lo que corresponde a algo que se aplica al instante en vez de esperar
// a que se envíe un formulario.

"use client";

import { cn } from "@/lib/clases";

type PropsInterruptor = {
  /** Qué controla. No se muestra, pero lo anuncia el lector de pantalla. */
  etiqueta: string;
  encendido: boolean;
  onCambio: (encendido: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function Interruptor({
  etiqueta,
  encendido,
  onCambio,
  disabled = false,
  className,
}: PropsInterruptor) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={encendido}
      aria-label={etiqueta}
      disabled={disabled}
      onClick={() => onCambio(!encendido)}
      className={cn(
        "interruptor inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-borde-fuerte p-0.5",
        encendido ? "bg-acento" : "bg-superficie-suave",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="interruptor-perilla block size-4 rounded-full bg-superficie shadow-sutil"
      />
    </button>
  );
}

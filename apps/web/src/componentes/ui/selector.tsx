// Selector nativo (<select>), con el mismo lenguaje visual que Campo: misma
// caja, mismo foco, misma etiqueta asociada.
//
// No es SelectorDeSegmentos: ese es para 2-4 opciones donde conviene ver todas
// a la vez: acá, para listas más largas (tipos de acción, por ejemplo), un
// desplegable nativo es más compacto y no hace falta escribirlo a mano —el
// navegador ya resuelve teclado y accesibilidad.

"use client";

import { AlertCircle } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes, useId } from "react";
import { cn } from "@/lib/clases";

type PropsSelector = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  etiqueta: string;
  /** Mensaje de error. Si viene, el selector se marca como inválido (mismo patrón que Campo). */
  error?: string | undefined;
};

export const Selector = forwardRef<HTMLSelectElement, PropsSelector>(function Selector(
  { etiqueta, error, className, children, ...resto },
  ref,
) {
  const id = useId();
  const idError = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {etiqueta}
      </label>
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        className={cn(
          "h-11 w-full rounded-control border bg-superficie px-3 text-base text-texto shadow-sutil",
          "transition-[border-color,box-shadow,background-color] duration-(--duracion-rapida) ease-salida",
          "hover:border-acento/40",
          "focus:border-acento",
          "focus-visible:border-acento focus-visible:shadow-(--anillo-foco) focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
          error
            ? cn(
                "border-peligro focus:border-peligro",
                "focus-visible:border-peligro focus-visible:shadow-(--anillo-foco-peligro)",
              )
            : "border-borde-fuerte",
          className,
        )}
        {...resto}
      >
        {children}
      </select>
      {error ? (
        <p id={idError} role="alert" className="flex items-center gap-1.5 text-xs text-peligro">
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
});

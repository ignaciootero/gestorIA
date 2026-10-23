// Área de texto de varias líneas, con el mismo lenguaje visual que Campo: misma caja,
// mismo foco, misma etiqueta asociada y el error anunciado a los lectores de pantalla.

"use client";

import { AlertCircle } from "lucide-react";
import { forwardRef, type ReactNode, type TextareaHTMLAttributes, useId } from "react";
import { cn } from "@/lib/clases";

type PropsAreaDeTexto = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  etiqueta: string;
  /** Texto de ayuda permanente bajo el campo. */
  ayuda?: ReactNode;
  /** Mensaje de error. Si viene, el campo se marca como inválido. */
  error?: string | undefined;
};

export const AreaDeTexto = forwardRef<HTMLTextAreaElement, PropsAreaDeTexto>(function AreaDeTexto(
  { etiqueta, ayuda, error, className, rows = 3, ...resto },
  ref,
) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const descrito = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {etiqueta}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={descrito === "" ? undefined : descrito}
        className={cn(
          "w-full resize-y rounded-control border bg-superficie px-3 py-2.5 text-base text-texto shadow-sutil",
          "placeholder:text-texto-secundario",
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
      />
      {ayuda ? (
        <p id={idAyuda} className="text-xs text-texto-secundario">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={idError} role="alert" className="flex items-center gap-1.5 text-xs text-peligro">
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
});

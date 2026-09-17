// Campo de formulario: etiqueta, control, ayuda y mensaje de error.
//
// Los tres van juntos en un solo componente a propósito. Es lo que garantiza
// que cada campo tenga su <label> asociado y que el error se anuncie a los
// lectores de pantalla, sin depender de que quien lo use se acuerde
// (docs/guias/usabilidad.md, Accesibilidad).

"use client";

import { AlertCircle } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";
import { cn } from "@/lib/clases";

type PropsCampo = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  etiqueta: string;
  /** Texto de ayuda permanente bajo el campo. */
  ayuda?: ReactNode;
  /** Mensaje de error. Si viene, el campo se marca como inválido. */
  error?: string | undefined;
};

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { etiqueta, ayuda, error, className, ...resto },
  ref,
) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;

  // El campo apunta a su ayuda y a su error para que el lector de pantalla los
  // lea al enfocarlo, no solo cuando la persona los ve.
  const descrito = [ayuda ? idAyuda : null, error ? idError : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {etiqueta}
      </label>

      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={descrito === "" ? undefined : descrito}
        className={cn(
          "h-11 rounded-control border bg-superficie px-3 text-base text-texto shadow-sutil",
          "placeholder:text-texto-secundario",
          "transition-[border-color,box-shadow,background-color] duration-(--duracion-rapida) ease-salida",
          "hover:border-acento/40",
          // Al enfocar, el borde se tiñe de acento y aparece un halo del mismo
          // color: el campo activo se distingue de un vistazo. Se quita el
          // outline general porque este anillo lo reemplaza.
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
        // `role="alert"` hace que el mensaje se anuncie apenas aparece. El ícono
        // acompaña al color: el error no depende solo de que el borde sea rojo.
        <p id={idError} role="alert" className="flex items-center gap-1.5 text-xs text-peligro">
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
});

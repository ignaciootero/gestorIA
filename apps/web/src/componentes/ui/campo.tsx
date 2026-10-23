// Campo de formulario: etiqueta, control, ayuda y mensaje de error.
//
// Los tres van juntos en un solo componente a propósito. Es lo que garantiza
// que cada campo tenga su <label> asociado y que el error se anuncie a los
// lectores de pantalla, sin depender de que quien lo use se acuerde
// (docs/guias/usabilidad.md, Accesibilidad).

"use client";

import { AlertCircle, type LucideIcon } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from "react";
import { cn } from "@/lib/clases";

type PropsCampo = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  etiqueta: string;
  /** Texto de ayuda permanente bajo el campo. */
  ayuda?: ReactNode;
  /** Mensaje de error. Si viene, el campo se marca como inválido. */
  error?: string | undefined;
  /** Ícono decorativo a la izquierda, por ejemplo la lupa de un buscador. */
  icono?: LucideIcon;
  /**
   * Etiqueta corta dentro del campo, a la derecha, que no se puede editar: por ejemplo el código
   * de la moneda de un importe ("USD"). Se anuncia junto con la ayuda.
   */
  sufijo?: string | undefined;
};

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { etiqueta, ayuda, error, icono: Icono, sufijo, className, ...resto },
  ref,
) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const idSufijo = `${id}-sufijo`;

  // El campo apunta a su sufijo, a su ayuda y a su error para que el lector de pantalla los
  // lea al enfocarlo, no solo cuando la persona los ve.
  const descrito = [sufijo ? idSufijo : null, ayuda ? idAyuda : null, error ? idError : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {etiqueta}
      </label>

      <div className="relative">
        {Icono ? (
          <Icono
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-secundario"
          />
        ) : null}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={descrito === "" ? undefined : descrito}
          className={cn(
            "h-11 w-full rounded-control border bg-superficie px-3 text-base text-texto shadow-sutil",
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
            Icono ? "pl-9" : null,
            // Lugar para la etiqueta de la derecha: el texto escrito no puede quedar debajo.
            sufijo ? "pr-14" : null,
            className,
          )}
          {...resto}
        />
        {sufijo ? (
          <span
            id={idSufijo}
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-sm bg-superficie-suave px-1.5 py-0.5 text-xs font-semibold tracking-wide text-texto-secundario"
          >
            {sufijo}
          </span>
        ) : null}
      </div>

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

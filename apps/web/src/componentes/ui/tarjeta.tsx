// Tarjeta: superficie con borde fino, esquinas de 12 px y elevación.
//
// El borde y la sombra se combinan, no se reemplazan: el borde define el
// contorno y la sombra dice a qué altura está (docs/guias/estetica.md).
//
// **Una tarjeta no se mueve al pasarle el mouse.** El levantado y la escala son
// exclusivos de los botones: si todo lo que está debajo del cursor se desplaza,
// la pantalla entera se vuelve inestable y deja de distinguirse qué es lo que
// se puede accionar. Una tarjeta interactiva responde con un fondo suave, y las
// que agrupan contenido con el brillo del borde.
//
// Es un componente de cliente por ese brillo, que necesita saber dónde está el
// puntero. El costo es mínimo (no trae estado ni datos) y las dos pantallas que
// la usan ya son de cliente.

"use client";

import type { ReactNode } from "react";
import { CapaDeBrillo } from "@/componentes/ui/brillo/capa-de-brillo";
import { cn } from "@/lib/clases";

type NivelDeElevacion = "sutil" | "elevada" | "flotante";

const ELEVACION: Record<NivelDeElevacion, string> = {
  sutil: "shadow-sutil",
  elevada: "shadow-elevada",
  flotante: "shadow-flotante",
};

type PropsTarjeta = {
  children: ReactNode;
  className?: string;
  elevacion?: NivelDeElevacion;
  /** Fondo suave al pasar el mouse. Solo para tarjetas en las que se hace clic. */
  interactiva?: boolean;
  /** Ilumina el borde según la cercanía del mouse. Para las que agrupan contenido. */
  brillo?: boolean;
};

export function Tarjeta({
  children,
  className,
  elevacion = "sutil",
  interactiva = false,
  brillo = false,
}: PropsTarjeta) {
  return (
    <div
      className={cn(
        "rounded-tarjeta border border-borde bg-superficie",
        ELEVACION[elevacion],
        brillo && "con-brillo",
        interactiva &&
          cn(
            "cursor-pointer",
            "transition-colors duration-(--anim-duracion) ease-(--anim-curva)",
            "hover:bg-superficie-suave",
          ),
        className,
      )}
    >
      {brillo ? <CapaDeBrillo /> : null}
      {children}
    </div>
  );
}

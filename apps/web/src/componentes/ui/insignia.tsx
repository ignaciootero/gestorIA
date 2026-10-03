// Insignia: pastilla chica para un estado (pendiente, bloqueada, correo sin
// confirmar...).
//
// Siempre ícono más texto, nunca solo color: "ningún significado depende solo
// del color" (docs/guias/estetica.md, Colores). El tono es de estado, nunca el
// acento — el acento es solo para la acción principal de la pantalla.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/clases";

export type TonoInsignia = "neutral" | "info" | "exito" | "advertencia" | "peligro";

const TONOS: Record<TonoInsignia, string> = {
  neutral: "bg-superficie-suave text-texto-secundario",
  // Mismos colores que el tono "info" de Aviso y Dialogo.
  info: "bg-acento-suave text-acento-suave-texto",
  exito: "bg-exito-fondo text-exito",
  advertencia: "bg-advertencia-fondo text-advertencia",
  peligro: "bg-peligro-fondo text-peligro",
};

type PropsInsignia = {
  tono?: TonoInsignia;
  icono?: LucideIcon;
  children: ReactNode;
  className?: string;
};

export function Insignia({ tono = "neutral", icono: Icono, children, className }: PropsInsignia) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        TONOS[tono],
        className,
      )}
    >
      {Icono ? <Icono aria-hidden="true" className="size-3 shrink-0" /> : null}
      {children}
    </span>
  );
}

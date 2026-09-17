// Aviso: mensaje destacado de información, éxito, advertencia o error.
//
// Cada tono lleva su ícono, porque el significado nunca puede depender solo del
// color (docs/guias/estetica.md y usabilidad.md).

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/clases";

export type TonoAviso = "info" | "exito" | "advertencia" | "peligro";

const TONOS: Record<TonoAviso, { clases: string; Icono: LucideIcon; etiqueta: string }> = {
  info: {
    clases: "bg-acento-suave text-acento-suave-texto",
    Icono: Info,
    etiqueta: "Información",
  },
  exito: { clases: "bg-exito-fondo text-exito", Icono: CheckCircle2, etiqueta: "Listo" },
  advertencia: {
    clases: "bg-advertencia-fondo text-advertencia",
    Icono: AlertTriangle,
    etiqueta: "Atención",
  },
  peligro: { clases: "bg-peligro-fondo text-peligro", Icono: XCircle, etiqueta: "Error" },
};

type PropsAviso = {
  tono?: TonoAviso;
  titulo?: string;
  children: ReactNode;
  className?: string;
};

export function Aviso({ tono = "info", titulo, children, className }: PropsAviso) {
  const { clases, Icono, etiqueta } = TONOS[tono];

  return (
    <div
      // Los errores se anuncian al instante; el resto espera a que el lector de
      // pantalla termine lo que está diciendo.
      role={tono === "peligro" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-tarjeta p-3 text-sm", clases, className)}
    >
      <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <span className="solo-lectores">{etiqueta}: </span>
        {titulo ? <p className="font-medium">{titulo}</p> : null}
        <div className={titulo ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}

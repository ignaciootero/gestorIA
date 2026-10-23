// Distintivo de "importante": una pastilla con una estrella y el texto, que marca lo importante en las
// listas (tareas y recordatorios). Como toda insignia, no depende solo del color: lleva ícono y palabra
// (docs/guias/estetica.md, Colores). Es siempre el mismo, para que se reconozca de un vistazo en cualquier
// pantalla.

import { Star } from "lucide-react";
import { cn } from "@/lib/clases";

export function DistintivoImportante({ className }: { className?: string }) {
  return (
    <span
      data-distintivo="importante"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-advertencia-fondo px-2 py-0.5 text-xs font-medium text-advertencia",
        className,
      )}
    >
      <Star aria-hidden="true" className="size-3 shrink-0 fill-current" />
      Importante
    </span>
  );
}

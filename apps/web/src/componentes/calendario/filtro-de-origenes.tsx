// El filtro de eventos por origen: una fila de botones, uno por origen (Calendario, Finanzas,
// Contactos y Tareas), que se prenden y se apagan. Sirve además de leyenda: cada uno muestra el ícono,
// el nombre y el color con que se marca ese origen en el calendario.
//
// Es un grupo de botones de "estado" (`aria-pressed`) y no casillas ni pestañas: cada uno es
// independiente y la persona puede dejar prendidos los que quiera. Apagado se ve tachado y con un
// círculo vacío, así que no depende solo del color para saber si está activo.

"use client";

import { NOMBRES_DE_ORIGEN, type OrigenDeEvento } from "@gestoria/shared";
import { cn } from "@/lib/clases";
import { ESTILOS_DE_ORIGEN, ORDEN_DE_ORIGENES } from "./origenes";

type PropsFiltroDeOrigenes = {
  ocultos: ReadonlySet<OrigenDeEvento>;
  alAlternar: (origen: OrigenDeEvento) => void;
};

export function FiltroDeOrigenes({ ocultos, alAlternar }: PropsFiltroDeOrigenes) {
  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-1.5 border-0 p-0">
      <legend className="solo-lectores">Mostrar en el calendario</legend>
      {ORDEN_DE_ORIGENES.map((origen) => {
        const { icono: Icono, punto, suave } = ESTILOS_DE_ORIGEN[origen];
        const visible = !ocultos.has(origen);
        return (
          <button
            key={origen}
            type="button"
            aria-pressed={visible}
            data-origen={origen}
            onClick={() => alAlternar(origen)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
              "transition-colors duration-(--duracion-rapida) ease-salida",
              "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
              "active:scale-(--anim-escala-presion) motion-reduce:active:scale-100",
              visible
                ? cn(suave, "border-transparent")
                : "border-borde-fuerte bg-superficie text-texto-secundario hover:bg-superficie-suave",
            )}
          >
            {/* Prendido: punto del color del origen. Apagado: círculo vacío. */}
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                visible ? punto : "border border-texto-secundario",
              )}
            />
            <Icono aria-hidden="true" className="size-3.5 shrink-0" />
            <span className={cn(!visible && "line-through")}>{NOMBRES_DE_ORIGEN[origen]}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

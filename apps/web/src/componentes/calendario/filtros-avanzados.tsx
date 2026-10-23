// Filtros avanzados del calendario: además de elegir qué orígenes ver (filtro-de-origenes.tsx), para Tareas
// y Contactos se elige **qué tipos de repetición** mostrar: las de una sola vez, las diarias, las
// semanales, las mensuales y las anuales. Por ejemplo, ver las tareas semanales, mensuales y anuales pero
// no las diarias, que llenarían todos los días.
//
// Es un botón "Más filtros" que abre y cierra el panel (el calendario queda limpio para quien no lo
// necesita). En pantallas anchas, donde el calendario tiene un alto fijo, el panel flota sobre la grilla
// en vez de empujarla; en las angostas se despliega en el lugar y la página se desplaza. Escape lo cierra. El botón avisa cuántas restricciones hay puestas, así el filtro no pasa inadvertido aunque el
// panel esté cerrado. Los botones de adentro son de "estado" (`aria-pressed`), como los de origen.
// Si un origen está oculto del todo, sus repeticiones quedan deshabilitadas: no hay nada para elegir.
//
// También se elige si se ven los eventos ya cerrados: por defecto no, para que lo hecho no tape lo que
// falta. Son las tareas tildadas o marcadas como fallidas y los recordatorios de Contactos cuyo día ya pasó
// (un recordatorio no se tilda: está completado cuando pasó su fecha).

"use client";

import {
  cantidadDeRestriccionesPorRepeticion,
  type FiltroDeEventos,
  hayRestricciones,
  NOMBRES_DE_ORIGEN,
  NOMBRES_DE_REPETICION_EN_PLURAL,
  ORIGENES_CON_REPETICION,
  type OrigenConRepeticion,
  type RepeticionDeEvento,
  repeticionesDeEvento,
} from "@gestoria/shared";
import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/clases";
import { ESTILOS_DE_ORIGEN } from "./origenes";

type PropsFiltrosAvanzados = {
  filtro: FiltroDeEventos;
  alAlternarRepeticion: (origen: OrigenConRepeticion, repeticion: RepeticionDeEvento) => void;
  alAlternarCompletados: () => void;
  alMostrarTodo: () => void;
};

export function FiltrosAvanzados({
  filtro,
  alAlternarRepeticion,
  alAlternarCompletados,
  alMostrarTodo,
}: PropsFiltrosAvanzados) {
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const botonDelPanel = useRef<HTMLButtonElement>(null);
  const restricciones = cantidadDeRestriccionesPorRepeticion(filtro);

  return (
    <fieldset
      className="flex min-w-0 flex-col gap-2 border-0 p-0 xl:relative"
      onKeyDown={(evento) => {
        if (evento.key !== "Escape" || !abierto) return;
        // Escape cierra el panel y deja el foco en el botón que lo abrió.
        evento.stopPropagation();
        setAbierto(false);
        botonDelPanel.current?.focus();
      }}
    >
      <legend className="solo-lectores">Filtros avanzados</legend>
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={botonDelPanel}
          type="button"
          aria-expanded={abierto}
          aria-controls={idPanel}
          onClick={() => setAbierto((actual) => !actual)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border border-borde-fuerte bg-superficie px-2.5 text-xs font-medium text-texto",
            "transition-colors duration-(--duracion-rapida) ease-salida",
            "hover:bg-superficie-suave",
            "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
            "active:scale-(--anim-escala-presion) motion-reduce:active:scale-100",
            (restricciones > 0 || filtro.mostrarCompletados) && "border-acento",
          )}
        >
          <SlidersHorizontal aria-hidden="true" className="size-3.5" />
          Más filtros
          {restricciones > 0 ? (
            <span
              data-restricciones={restricciones}
              className="numeros-tabulares rounded-full bg-acento px-1.5 text-[10px] leading-4 font-semibold text-acento-texto"
            >
              {restricciones}
              <span className="solo-lectores">
                {restricciones === 1 ? " tipo oculto" : " tipos ocultos"}
              </span>
            </span>
          ) : null}
        </button>

        {hayRestricciones(filtro) ? (
          <button
            type="button"
            onClick={alMostrarTodo}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-medium text-texto-secundario",
              "transition-colors duration-(--duracion-rapida) ease-salida",
              "hover:bg-superficie-suave hover:text-texto",
              "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
            )}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Mostrar todo
          </button>
        ) : null}
      </div>

      {abierto ? (
        <div
          id={idPanel}
          className={cn(
            "flex flex-col gap-3 rounded-tarjeta border border-borde-fuerte bg-superficie p-3",
            // Con alto fijo (pantallas anchas) flota sobre la grilla y no la deforma.
            "xl:absolute xl:inset-x-0 xl:top-full xl:z-10 xl:mt-1 xl:shadow-flotante",
          )}
        >
          {ORIGENES_CON_REPETICION.map((origen) => {
            const { icono: Icono, suave } = ESTILOS_DE_ORIGEN[origen];
            const origenOculto = filtro.origenesOcultos.has(origen);
            return (
              <fieldset
                key={origen}
                data-origen={origen}
                disabled={origenOculto}
                className="flex min-w-0 flex-col gap-1.5 border-0 p-0"
              >
                <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-texto">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                      origenOculto ? "bg-superficie text-texto-secundario" : suave,
                    )}
                  >
                    <Icono aria-hidden="true" className="size-3 shrink-0" />
                    {NOMBRES_DE_ORIGEN[origen]}
                  </span>
                  <span className="font-normal text-texto-secundario">
                    {origenOculto
                      ? "Está oculto: prendelo arriba para elegir."
                      : origen === "tareas"
                        ? "Qué tareas ver"
                        : "Qué recordatorios ver"}
                  </span>
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {repeticionesDeEvento(origen).map((repeticion) => {
                    const visible = !filtro.repeticionesOcultas[origen].has(repeticion);
                    return (
                      <button
                        key={repeticion}
                        type="button"
                        aria-pressed={visible}
                        data-repeticion={repeticion}
                        disabled={origenOculto}
                        onClick={() => alAlternarRepeticion(origen, repeticion)}
                        className={cn(
                          "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium",
                          "transition-colors duration-(--duracion-rapida) ease-salida",
                          "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
                          "active:scale-(--anim-escala-presion) motion-reduce:active:scale-100",
                          "disabled:pointer-events-none disabled:opacity-50",
                          visible && !origenOculto
                            ? cn(suave, "border-transparent")
                            : "border-borde-fuerte bg-superficie text-texto-secundario hover:bg-superficie-suave",
                        )}
                      >
                        <span className={cn(!visible && "line-through")}>
                          {NOMBRES_DE_REPETICION_EN_PLURAL[repeticion]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          <p className="text-xs text-texto-secundario">
            “Una sola vez” son las tareas sueltas y los recordatorios que no se repiten.
          </p>
          <div className="flex flex-col gap-1.5 border-t border-borde pt-3">
            <button
              type="button"
              aria-pressed={filtro.mostrarCompletados}
              data-completados={filtro.mostrarCompletados}
              disabled={ORIGENES_CON_REPETICION.every((origen) =>
                filtro.origenesOcultos.has(origen),
              )}
              onClick={alAlternarCompletados}
              className={cn(
                "inline-flex h-7 w-fit items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
                "transition-colors duration-(--duracion-rapida) ease-salida",
                "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
                "active:scale-(--anim-escala-presion) motion-reduce:active:scale-100",
                "disabled:pointer-events-none disabled:opacity-50",
                filtro.mostrarCompletados
                  ? cn(ESTILOS_DE_ORIGEN.tareas.suave, "border-transparent")
                  : "border-borde-fuerte bg-superficie text-texto-secundario hover:bg-superficie-suave",
              )}
            >
              <Check aria-hidden="true" className="size-3.5" />
              Mostrar completados y fallidos
            </button>
            <p className="text-xs text-texto-secundario">
              Se ocultan por defecto las tareas que ya hiciste o diste por fallidas y los
              recordatorios cuya fecha ya pasó. Si los mostrás, se ven tachados y con la marca
              “Completada” o “Fallida”.
            </p>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}

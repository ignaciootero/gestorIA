// Filtros avanzados del calendario: además de elegir qué orígenes ver (filtro-de-origenes.tsx), para Tareas
// y Contactos se elige **qué tipos de repetición** mostrar: las de una sola vez, las diarias, las
// semanales, las mensuales y las anuales. Por ejemplo, ver las tareas semanales, mensuales y anuales pero
// no las diarias, que llenarían todos los días.
//
// Cada categoría va en su propio recuadro, con una franja de su color arriba (lado a lado en pantallas
// anchas), y adentro sus dos grupos: repetición y estado. Sin textos explicativos: los nombres alcanzan.
//
// Es un botón "Más filtros" que abre y cierra el panel (el calendario queda limpio para quien no lo
// necesita). En pantallas anchas, donde el calendario tiene un alto fijo, el panel flota sobre la grilla
// en vez de empujarla; en las angostas se despliega en el lugar y la página se desplaza. Escape lo cierra, y también tocar afuera. El botón avisa cuántas restricciones hay puestas, así el filtro no pasa inadvertido aunque el
// panel esté cerrado. Los botones de adentro son de "estado" (`aria-pressed`), como los de origen.
// Si un origen está oculto del todo, sus repeticiones quedan deshabilitadas: no hay nada para elegir.
//
// Los cuatro orígenes se eligen también por **estado**, con los suyos (ver `estadosDeOrigen`): las tareas
// pendientes, atrasadas y finalizadas (tildadas o dadas por fallidas); los recordatorios próximos y pasados
// (un recordatorio no se tilda: pasó cuando pasó su día); las deudas de Finanzas pendientes, atrasadas
// (venció y no se saldó) y pagadas; y los eventos propios futuros y pasados. Por defecto se ven las tareas
// pendientes y atrasadas, los recordatorios próximos, las deudas pendientes y atrasadas y los eventos
// futuros, para que lo hecho y lo pasado no tape lo que falta. Calendario y Finanzas no se repiten: su
// recuadro solo tiene el grupo de estado.

"use client";

import {
  cantidadDeRestriccionesPorRepeticion,
  type EstadoParaFiltrar,
  estadosDeOrigen,
  estadosPorDefecto,
  type FiltroDeEventos,
  hayRestricciones,
  NOMBRES_DE_ORIGEN,
  NOMBRES_DE_REPETICION_EN_PLURAL,
  ORIGENES_CON_REPETICION,
  ORIGENES_DE_EVENTO,
  type OrigenConRepeticion,
  type OrigenDeEvento,
  type RepeticionDeEvento,
  repeticionesDeEvento,
} from "@gestoria/shared";
import {
  Check,
  Circle,
  type LucideIcon,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/clases";
import { ESTILOS_DE_ORIGEN, NOMBRES_DE_ESTADO } from "./origenes";

/** El ícono de cada estado, el mismo que la marca de la grilla: lleno lo que está por venir, vacío lo pasado. */
const ICONOS_DEL_FILTRO: Record<EstadoParaFiltrar, LucideIcon> = {
  pendiente: Circle,
  atrasada: TriangleAlert,
  finalizada: Check,
  proximo: Circle,
  pasado: Circle,
  pagada: Check,
  futuro: Circle,
};

/** Los estados que se dibujan con el círculo lleno. */
const ESTADOS_LLENOS: ReadonlySet<EstadoParaFiltrar> = new Set(["pendiente", "proximo", "futuro"]);

function tieneRepeticion(origen: OrigenDeEvento): origen is OrigenConRepeticion {
  return (ORIGENES_CON_REPETICION as readonly OrigenDeEvento[]).includes(origen);
}

/** Las clases de un botón del panel (repetición o estado), prendido o apagado. */
function clasesDeBoton(visible: boolean, suave: string): string {
  return cn(
    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium",
    "transition-colors duration-(--duracion-rapida) ease-salida",
    "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
    "active:scale-(--anim-escala-presion) motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-50",
    visible
      ? cn(suave, "border-transparent")
      : "border-borde-fuerte bg-superficie text-texto-secundario hover:bg-superficie-suave",
  );
}

type PropsFiltrosAvanzados = {
  filtro: FiltroDeEventos;
  alAlternarRepeticion: (origen: OrigenConRepeticion, repeticion: RepeticionDeEvento) => void;
  alAlternarEstado: (origen: OrigenDeEvento, estado: EstadoParaFiltrar) => void;
  alMostrarTodo: () => void;
};

export function FiltrosAvanzados({
  filtro,
  alAlternarRepeticion,
  alAlternarEstado,
  alMostrarTodo,
}: PropsFiltrosAvanzados) {
  const [abierto, setAbierto] = useState(false);
  const idPanel = useId();
  const botonDelPanel = useRef<HTMLButtonElement>(null);
  const contenedor = useRef<HTMLFieldSetElement>(null);

  // Tocar o hacer clic afuera (del panel y de su botón) lo cierra, sin tener que volver al botón.
  // `pointerdown` y no `click`: cierra apenas se toca, y vale igual para mouse, dedo y lápiz. El foco
  // queda donde se tocó (no se lo devuelve al botón, como con Escape): la persona ya eligió otra cosa.
  useEffect(() => {
    if (!abierto) return;
    function alTocar(evento: PointerEvent) {
      if (evento.target instanceof Node && contenedor.current?.contains(evento.target)) return;
      setAbierto(false);
    }
    document.addEventListener("pointerdown", alTocar);
    return () => document.removeEventListener("pointerdown", alTocar);
  }, [abierto]);
  const restricciones = cantidadDeRestriccionesPorRepeticion(filtro);

  return (
    <fieldset
      ref={contenedor}
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
            (restricciones > 0 || !estadosPorDefecto(filtro)) && "border-acento",
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
            "grid gap-3 rounded-tarjeta border border-borde-fuerte bg-superficie p-3 sm:grid-cols-2",
            // Con alto fijo (pantallas anchas) flota sobre la grilla y no la deforma.
            "xl:absolute xl:inset-x-0 xl:top-full xl:z-10 xl:mt-1 xl:shadow-flotante",
          )}
        >
          {ORIGENES_DE_EVENTO.map((origen) => {
            const { icono: Icono, suave } = ESTILOS_DE_ORIGEN[origen];
            const origenOculto = filtro.origenesOcultos.has(origen);
            return (
              // Cada categoría en su recuadro, con una franja de su color arriba: así se ve de un
              // vistazo qué filtros son de cuál.
              <fieldset
                key={origen}
                data-origen={origen}
                disabled={origenOculto}
                className="flex min-w-0 flex-col overflow-hidden rounded-control border border-borde p-0"
              >
                <legend className="solo-lectores">{NOMBRES_DE_ORIGEN[origen]}</legend>
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium",
                    origenOculto ? "bg-superficie-suave text-texto-secundario" : suave,
                  )}
                >
                  <span aria-hidden="true" className="flex items-center gap-1.5">
                    <Icono className="size-4 shrink-0" />
                    {NOMBRES_DE_ORIGEN[origen]}
                  </span>
                  {origenOculto ? (
                    <span className="text-xs font-normal">Está oculto: prendelo arriba</span>
                  ) : null}
                </div>
                <div className={cn("flex flex-col gap-3 p-3", origenOculto && "opacity-60")}>
                  {tieneRepeticion(origen) ? (
                    <fieldset
                      data-filtro="repeticion"
                      className="flex min-w-0 flex-col gap-1.5 border-0 p-0"
                    >
                      <legend className="mb-1.5 text-[11px] font-medium tracking-wide text-texto-secundario uppercase">
                        Repetición
                        <span className="solo-lectores"> de {NOMBRES_DE_ORIGEN[origen]}</span>
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
                              className={clasesDeBoton(visible && !origenOculto, suave)}
                            >
                              <span className={cn(!visible && "line-through")}>
                                {NOMBRES_DE_REPETICION_EN_PLURAL[repeticion]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}
                  <fieldset
                    data-filtro="estado"
                    className={cn(
                      "flex min-w-0 flex-col gap-1.5 border-0 p-0",
                      // Separado de la repetición por una línea, si la hay.
                      tieneRepeticion(origen) && "border-t border-borde pt-3",
                    )}
                  >
                    <legend className="solo-lectores">Estado de {NOMBRES_DE_ORIGEN[origen]}</legend>
                    <p
                      aria-hidden="true"
                      className="mb-1.5 text-[11px] font-medium tracking-wide text-texto-secundario uppercase"
                    >
                      Estado
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {estadosDeOrigen(origen).map((estado) => {
                        const visible = !filtro.estadosOcultos[origen].has(estado);
                        const IconoDeEstado = ICONOS_DEL_FILTRO[estado];
                        const lleno = ESTADOS_LLENOS.has(estado);
                        return (
                          <button
                            key={estado}
                            type="button"
                            aria-pressed={visible}
                            data-estado={estado}
                            disabled={origenOculto}
                            onClick={() => alAlternarEstado(origen, estado)}
                            className={clasesDeBoton(visible && !origenOculto, suave)}
                          >
                            <IconoDeEstado
                              aria-hidden="true"
                              strokeWidth={lleno ? 2 : 3}
                              className={cn("size-3", lleno && "fill-current")}
                            />
                            <span className={cn(!visible && "line-through")}>
                              {NOMBRES_DE_ESTADO[estado]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
              </fieldset>
            );
          })}
        </div>
      ) : null}
    </fieldset>
  );
}

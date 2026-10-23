// Carrusel de widgets: muestra uno a la vez y va pasando al siguiente solo.
//
// Pensado para la columna lateral. No dice cuántos widgets hay ni en cuál está: lo
// único que se suma a la tarjeta son dos flechas, una a cada lado y por fuera de
// ella (para que no tapen nada de lo que muestra), que aparecen cuando el mouse está
// sobre el carrusel o el foco llega con el teclado. Su lugar está siempre reservado,
// así que al aparecer no mueven nada.
//
// El tiempo es compartido: no lo cuenta cada carrusel sino la columna que los junta (ver
// ColumnaDeCarruseles), que les avisa con `tic` cuándo toca pasar al siguiente. Así los
// carruseles cambian a la vez, y tocar la flecha de cualquiera (`alCambiarAMano`) reinicia el
// tiempo de todos. Lo único propio de cada uno es detenerse: mientras el mouse está encima o el
// foco está adentro ignora los tics y se queda en su widget, y el otro sigue.
//
// Sigue el patrón de carrusel de la WAI-ARIA:
// - Se detiene mientras el mouse está encima o el foco llegó con el teclado (con
//   `:focus-visible`: tocar una flecha con el mouse deja el foco ahí, y eso no tiene
//   que dejar el carrusel quieto hasta hacer clic en otro lado).
// - Con la preferencia de reducir movimiento NO avanza solo (lo que molesta es el
//   movimiento) y, al cambiar a mano, la tarjeta se reemplaza sin deslizarse.
// - Mientras avanza solo, la región no anuncia los cambios a los lectores de
//   pantalla (sería ruido continuo); en cuanto se frena o se navega a mano, sí.
// - Tampoco avanza con la pestaña oculta.
//
// El alto es fijo para que el cambio de tarjeta no empuje nada (crece con el alto de la ventana,
// para aprovechar el lugar y que haya que deslizar menos): aunque cada widget
// tenga más o menos contenido, el espacio que ocupa el carrusel no baila.

"use client";

import { CURVA_SALIDA, DURACION_MS } from "@gestoria/ui-tokens";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { TarjetaDeWidget } from "@/componentes/widgets/tarjeta-de-widget";
import type { DatoDeWidget } from "@/componentes/widgets/tipos";
import { cn } from "@/lib/clases";

/** Cuánto se queda cada widget a la vista antes de pasar al siguiente. Lo cuenta la columna, para todos. */
export const INTERVALO_DEL_CARRUSEL_MS = 12000;
const DESPLAZAMIENTO = 24;

/**
 * Una flecha: un botón común y no el `Boton` del sistema, porque ese se levanta al pasar
 * el mouse y acá, al lado de una tarjeta que no se mueve, se vería como un error. Mide
 * lo mismo que el hueco que le reserva el carrusel, haya o no flechas. Se ve con el mouse
 * sobre el carrusel (`group-hover`) o con el foco del teclado en cualquiera de sus botones.
 */
const CLASE_FLECHA = cn(
  "flex size-6 shrink-0 items-center justify-center rounded-full text-texto-secundario",
  "opacity-0 transition-[opacity,color,background-color] duration-(--duracion-rapida) ease-salida",
  "group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 focus-visible:opacity-100",
  "hover:bg-superficie-suave hover:text-texto",
);

export function CarruselDeWidgets({
  widgets,
  etiqueta,
  tic,
  alCambiarAMano,
}: {
  widgets: readonly DatoDeWidget[];
  /** Anuncia el carrusel a los lectores de pantalla ("Widgets de finanzas"). */
  etiqueta: string;
  /** El reloj compartido: cada vez que cambia, se cumplió el tiempo y toca pasar al siguiente. */
  tic: number;
  /** Se llama al tocar una flecha, para que la columna reinicie el tiempo de todos. */
  alCambiarAMano: () => void;
}) {
  const reducirMovimiento = useReducedMotion();
  const [idActual, setIdActual] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<1 | -1>(1);
  const [mouseEncima, setMouseEncima] = useState(false);
  const [focoDeTeclado, setFocoDeTeclado] = useState(false);

  // Se sigue al widget por su id y no por su posición: si los datos se actualizan
  // y la lista cambia, la persona sigue viendo el mismo widget en vez de saltar a
  // otro. Si ese widget ya no existe (se resolvió el aviso), se vuelve al primero.
  const encontrado = widgets.findIndex((widget) => widget.id === idActual);
  const indice = encontrado === -1 ? 0 : encontrado;
  const actual = widgets[indice];

  const hayVarios = widgets.length > 1;
  const avanzaSolo = hayVarios && reducirMovimiento !== true && !mouseEncima && !focoDeTeclado;

  /** Cambio a mano con una flecha: además de moverse, le pide a la columna que reinicie el tiempo. */
  function irA(nuevoIndice: number, sentido: 1 | -1) {
    const destino = widgets[(nuevoIndice + widgets.length) % widgets.length];
    if (!destino) return;
    setDireccion(sentido);
    setIdActual(destino.id);
    alCambiarAMano();
  }

  // Cada tic nuevo es un "ya pasó el tiempo". Se recuerda el último visto para reaccionar solo a
  // los tics y no cuando cambia otra cosa (los datos, el mouse). Si justo está detenido, ese tic
  // se ignora: sigue con su widget hasta el próximo.
  const ticVisto = useRef(tic);
  useEffect(() => {
    if (tic === ticVisto.current) return;
    ticVisto.current = tic;
    const siguiente = widgets[(indice + 1) % widgets.length];
    if (!avanzaSolo || !siguiente) return;
    setDireccion(1);
    setIdActual(siguiente.id);
  }, [tic, avanzaSolo, indice, widgets]);

  if (!actual) return null;

  const variantes = {
    entra: (sentido: number) => ({
      opacity: 0,
      x: reducirMovimiento ? 0 : sentido * DESPLAZAMIENTO,
    }),
    centro: {
      opacity: 1,
      x: 0,
      transition: {
        duration: reducirMovimiento ? 0 : DURACION_MS.normal / 1000,
        ease: CURVA_SALIDA,
      },
    },
    sale: (sentido: number) => ({
      opacity: 0,
      x: reducirMovimiento ? 0 : -sentido * DESPLAZAMIENTO,
      // Las salidas van más rápido que las entradas.
      transition: {
        duration: reducirMovimiento ? 0 : DURACION_MS.rapida / 1000,
        ease: CURVA_SALIDA,
      },
    }),
  };

  return (
    <section
      aria-roledescription="carrusel"
      aria-label={etiqueta}
      className="group flex items-center gap-1"
      onMouseEnter={() => setMouseEncima(true)}
      onMouseLeave={() => setMouseEncima(false)}
      onFocus={(evento) => setFocoDeTeclado(evento.target.matches(":focus-visible"))}
      onBlur={() => setFocoDeTeclado(false)}
    >
      {hayVarios ? (
        <button
          type="button"
          aria-label="Widget anterior"
          className={CLASE_FLECHA}
          onClick={() => irA(indice - 1, -1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
      ) : (
        // Sin flechas el hueco se mantiene, para que todas las tarjetas queden del mismo ancho.
        <span aria-hidden="true" className="size-6 shrink-0" />
      )}

      <div
        aria-live={avanzaSolo ? "off" : "polite"}
        className="relative h-64 min-w-0 flex-1 overflow-hidden [@media(min-height:800px)]:h-72 [@media(min-height:900px)]:h-80"
      >
        {/* `custom` también le llega al que está saliendo: sin eso saldría hacia el
            lado de la dirección anterior. */}
        <AnimatePresence initial={false} custom={direccion}>
          <motion.div
            key={actual.id}
            custom={direccion}
            variants={variantes}
            initial="entra"
            animate="centro"
            exit="sale"
            role="group"
            aria-roledescription="widget"
            aria-label={`${indice + 1} de ${widgets.length}`}
            className="absolute inset-0 p-px"
          >
            <TarjetaDeWidget dato={actual} grande desplazarSolo={!mouseEncima && !focoDeTeclado} />
          </motion.div>
        </AnimatePresence>
      </div>

      {hayVarios ? (
        <button
          type="button"
          aria-label="Widget siguiente"
          className={CLASE_FLECHA}
          onClick={() => irA(indice + 1, 1)}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      ) : (
        <span aria-hidden="true" className="size-6 shrink-0" />
      )}
    </section>
  );
}

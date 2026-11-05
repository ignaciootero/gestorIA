// El carrusel de la pantalla de inicio: un resumen por módulo, uno a la vez, que pasa solo al
// siguiente cada tanto.
//
// Arriba, una pestaña por módulo (con su ícono y su nombre): dicen cuántos resúmenes hay, en cuál se
// está y llevan directo a cualquiera. La pestaña activa se va llenando con una barra fina mientras
// corre el tiempo, así se ve cuándo va a cambiar. A los costados del resumen, flechas para pasar al
// anterior y al siguiente; en una pantalla táctil también se puede deslizar con el dedo.
//
// Sigue el patrón de carrusel con pestañas de la WAI-ARIA:
// - **Se puede detener**: un botón "Pausar" lo deja quieto hasta que se vuelva a tocar (WCAG 2.2.2:
//   lo que se mueve solo más de cinco segundos tiene que poder pararse). Además se queda quieto
//   mientras el mouse está encima o el foco del teclado está adentro, y retoma al salir.
// - Con la preferencia de **reducir movimiento** no avanza solo y los cambios no se deslizan.
// - Mientras avanza solo, los cambios no se anuncian a los lectores de pantalla (sería ruido
//   continuo); detenido o al navegar a mano, sí.
// - No avanza con la pestaña del navegador oculta.
// - Las pestañas se recorren con las flechas del teclado, Inicio y Fin.
//
// Cualquier cambio a mano (una pestaña, una flecha, deslizar) vuelve a contar el tiempo desde cero.

"use client";

import { CURVA_SALIDA, DURACION_MS } from "@gestoria/ui-tokens";
import { ChevronLeft, ChevronRight, type LucideIcon, Pause, Play } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { cn } from "@/lib/clases";

/**
 * Cuánto se queda cada resumen a la vista. Más que los widgets de la columna lateral: un resumen
 * tiene una cifra, una lista y un gráfico.
 */
export const INTERVALO_DEL_CARRUSEL_DE_INICIO_MS = 15000;

/**
 * El alto de la tarjeta: fijo, para que el gráfico no se estire en una ventana alta ni la tarjeta se
 * llene de aire. Si la ventana no da, se achica (la tarjeta puede encogerse hasta lo que queda).
 */
export const ALTO_DE_LA_TARJETA = "h-[32rem] [@media(min-height:1000px)]:h-[36rem]";

/** Cuánto hay que deslizar con el dedo para pasar de resumen. */
const UMBRAL_DE_DESLIZAMIENTO = 60;
const DESPLAZAMIENTO = 32;

export type Diapositiva = {
  id: string;
  nombre: string;
  Icono: LucideIcon;
  /** El color pleno del módulo (una clase `bg-…`), para la barra del tiempo de su pestaña. */
  punto: string;
  contenido: ReactNode;
};

const CLASE_FLECHA = cn(
  "absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full",
  "border border-borde bg-superficie/90 text-texto-secundario shadow-sutil backdrop-blur-sm",
  "transition-colors duration-(--duracion-rapida) ease-salida",
  "hover:bg-superficie-suave hover:text-texto",
  "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
);

export function CarruselDeInicio({
  diapositivas,
  etiqueta,
  encabezado,
  demoraDeEntrada,
}: {
  diapositivas: readonly Diapositiva[];
  /** Anuncia el carrusel a los lectores de pantalla ("Resumen de tus módulos"). */
  etiqueta: string;
  /** Lo que va a la izquierda de las pestañas, alineado con la tarjeta (el saludo). */
  encabezado?: ReactNode;
  /**
   * Si se da, las pestañas y la tarjeta entran subiendo después de esos segundos (en la pantalla de
   * inicio, después del saludo). Sin ella, aparecen sin animación.
   */
  demoraDeEntrada?: number;
}) {
  const reducirMovimiento = useReducedMotion();
  const id = useId();
  const [indice, setIndice] = useState(0);
  const [direccion, setDireccion] = useState<1 | -1>(1);
  const [pausado, setPausado] = useState(false);
  const [mouseEncima, setMouseEncima] = useState(false);
  const [focoDeTeclado, setFocoDeTeclado] = useState(false);
  // Sube cada vez que el tiempo tiene que volver a empezar sin cambiar de resumen (por ejemplo, si
  // se cumplió con la pestaña del navegador oculta).
  const [ciclo, setCiclo] = useState(0);
  const pestanas = useRef<(HTMLButtonElement | null)[]>([]);

  const cantidad = diapositivas.length;
  const actual = diapositivas[indice];
  const puedeAvanzarSolo = cantidad > 1 && reducirMovimiento !== true;
  const avanzaSolo = puedeAvanzarSolo && !pausado && !mouseEncima && !focoDeTeclado;

  function irA(nuevo: number, sentido: 1 | -1) {
    setDireccion(sentido);
    setIndice((nuevo + cantidad) % cantidad);
  }

  // El tiempo corre solo mientras avanza solo; al cambiar de resumen (solo o a mano) o al
  // retomar, vuelve a empezar de cero.
  useEffect(() => {
    if (!avanzaSolo) return;
    const temporizador = window.setTimeout(() => {
      if (document.hidden) {
        setCiclo((actual) => actual + 1);
        return;
      }
      setDireccion(1);
      setIndice((actual) => (actual + 1) % cantidad);
    }, INTERVALO_DEL_CARRUSEL_DE_INICIO_MS);
    return () => window.clearTimeout(temporizador);
    // `indice` y `ciclo` están para reiniciar el tiempo cuando cambian.
  }, [avanzaSolo, cantidad, indice, ciclo]);

  /** Flechas, Inicio y Fin entre las pestañas: eligen y llevan el foco a la nueva. */
  function alTeclearEnPestanas(evento: KeyboardEvent<HTMLDivElement>) {
    const destinos: Record<string, number> = {
      ArrowRight: indice + 1,
      ArrowLeft: indice - 1,
      Home: 0,
      End: cantidad - 1,
    };
    const destino = destinos[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    const nuevo = (destino + cantidad) % cantidad;
    irA(nuevo, nuevo >= indice ? 1 : -1);
    pestanas.current[nuevo]?.focus();
  }

  // Sobre las pestañas o sobre la tarjeta (no sobre el encabezado, que no es parte del carrusel)
  // se queda quieto. `mouseover` y no `mouseenter`: si el puntero ya estaba encima cuando apareció,
  // `mouseenter` no llega nunca, y moverlo adentro tiene que detenerlo igual.
  const quietoConElMouse = {
    onMouseOver: () => setMouseEncima(true),
    onMouseLeave: () => setMouseEncima(false),
  };

  /** Entra subiendo después de `demoraDeEntrada` (más `extra`), salvo con reducir movimiento. */
  const entrada = (extra: number, desplazamiento: number) => ({
    initial:
      demoraDeEntrada === undefined || reducirMovimiento
        ? false
        : { opacity: 0, y: desplazamiento },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: DURACION_MS.lenta / 1000,
      delay: (demoraDeEntrada ?? 0) + extra,
      ease: CURVA_SALIDA,
    },
  });

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
        duration: reducirMovimiento ? 0 : DURACION_MS.lenta / 1000,
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
      data-avanza-solo={avanzaSolo}
      className="flex min-h-0 flex-col gap-4"
      onFocus={(evento) => setFocoDeTeclado(evento.target.matches(":focus-visible"))}
      onBlur={() => setFocoDeTeclado(false)}
    >
      {/* El encabezado a la izquierda y las pestañas a la derecha, alineados con los bordes de la
          tarjeta (el mismo `sm:px-12` que deja lugar a las flechas). En una pantalla angosta, las
          pestañas bajan a otra línea. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-6 gap-y-3 sm:px-12",
          encabezado ? "justify-between" : "justify-center",
        )}
      >
        {encabezado}
        <motion.div className="flex items-center gap-2" {...quietoConElMouse} {...entrada(0, 8)}>
          {puedeAvanzarSolo ? (
            <button
              type="button"
              onClick={() => setPausado((actual) => !actual)}
              aria-label={pausado ? "Reanudar el pase automático" : "Pausar el pase automático"}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full text-texto-secundario",
                "transition-colors duration-(--duracion-rapida) ease-salida",
                "hover:bg-superficie-suave hover:text-texto",
                "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
              )}
            >
              {pausado ? (
                <Play aria-hidden="true" className="size-4" />
              ) : (
                <Pause aria-hidden="true" className="size-4" />
              )}
            </button>
          ) : null}
          <div
            role="tablist"
            aria-label="Módulos"
            onKeyDown={alTeclearEnPestanas}
            className="flex min-w-0 flex-wrap justify-center gap-1 rounded-full border border-borde bg-superficie/80 p-1 shadow-sutil backdrop-blur-sm"
          >
            {diapositivas.map((diapositiva, posicion) => {
              const elegida = posicion === indice;
              const { Icono } = diapositiva;
              return (
                <button
                  key={diapositiva.id}
                  ref={(elemento) => {
                    pestanas.current[posicion] = elemento;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-pestana-${diapositiva.id}`}
                  aria-selected={elegida}
                  aria-label={diapositiva.nombre}
                  aria-controls={`${id}-resumen`}
                  tabIndex={elegida ? 0 : -1}
                  data-modulo={diapositiva.id}
                  onClick={() => irA(posicion, posicion >= indice ? 1 : -1)}
                  className={cn(
                    "relative flex h-8 items-center gap-1.5 overflow-hidden rounded-full px-3 text-sm font-medium",
                    "transition-colors duration-(--duracion-rapida) ease-salida",
                    "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
                    elegida
                      ? "bg-superficie-suave text-texto"
                      : "text-texto-secundario hover:bg-superficie-suave/60 hover:text-texto",
                  )}
                >
                  <Icono aria-hidden="true" className="size-4 shrink-0" />
                  {/* En pantallas chicas no entran los cuatro nombres: solo se ve el de la elegida (el
                    nombre accesible está siempre, en `aria-label`). */}
                  <span className={cn(!elegida && "hidden sm:inline")}>{diapositiva.nombre}</span>
                  {elegida && avanzaSolo ? (
                    // El tiempo que falta para pasar al siguiente: una barra fina que se llena.
                    <motion.span
                      key={`${indice}-${ciclo}`}
                      aria-hidden="true"
                      data-tiempo
                      className={cn(
                        "absolute inset-x-3 bottom-0.5 h-0.5 origin-left rounded-full",
                        diapositiva.punto,
                      )}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{
                        duration: INTERVALO_DEL_CARRUSEL_DE_INICIO_MS / 1000,
                        ease: "linear",
                      }}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>

      <motion.div
        className={cn(
          "relative flex min-h-0 px-0 sm:px-12 [@media(max-height:559px)]:min-h-120",
          ALTO_DE_LA_TARJETA,
        )}
        {...quietoConElMouse}
        {...entrada(0.1, 16)}
      >
        {cantidad > 1 ? (
          <button
            type="button"
            aria-label="Resumen anterior"
            className={cn(CLASE_FLECHA, "left-0 hidden sm:flex")}
            onClick={() => irA(indice - 1, -1)}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
        ) : null}

        <Tarjeta brillo className="relative min-h-0 flex-1 overflow-hidden">
          <div
            id={`${id}-resumen`}
            aria-live={avanzaSolo ? "off" : "polite"}
            className="absolute inset-0"
          >
            {/* `custom` también le llega al que está saliendo: sin eso saldría hacia el lado de la
                dirección anterior. */}
            <AnimatePresence initial={false} custom={direccion}>
              <motion.div
                key={actual.id}
                custom={direccion}
                variants={variantes}
                initial="entra"
                animate="centro"
                exit="sale"
                role="tabpanel"
                aria-roledescription="resumen"
                aria-labelledby={`${id}-pestana-${actual.id}`}
                data-resumen={actual.id}
                className="absolute inset-0"
                // Deslizar con el dedo (o arrastrar con el mouse) pasa de resumen.
                drag={cantidad > 1 ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                dragSnapToOrigin
                onDragEnd={(_, info) => {
                  if (info.offset.x <= -UMBRAL_DE_DESLIZAMIENTO) irA(indice + 1, 1);
                  else if (info.offset.x >= UMBRAL_DE_DESLIZAMIENTO) irA(indice - 1, -1);
                }}
              >
                {actual.contenido}
              </motion.div>
            </AnimatePresence>
          </div>
        </Tarjeta>

        {cantidad > 1 ? (
          <button
            type="button"
            aria-label="Resumen siguiente"
            className={cn(CLASE_FLECHA, "right-0 hidden sm:flex")}
            onClick={() => irA(indice + 1, 1)}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </motion.div>
    </section>
  );
}

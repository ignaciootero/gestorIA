// Zona de una tarjeta de widget que se desliza sola cuando su contenido no entra.
//
// Si el contenido cabe, no hace nada. Si se pasa del alto disponible (un nombre largo, un detalle
// de varias líneas), espera un momento, baja despacio hasta el final, espera y vuelve a subir, en
// bucle: así se puede leer todo sin cortar nada ni tocar nada. También se puede deslizar a mano
// con la rueda o el dedo.
//
// Respeta lo que pide la guía de accesibilidad para el contenido que se mueve solo (WCAG 2.2.2):
// se detiene mientras el mouse está encima o el foco está adentro (lo decide quien la usa con
// `activo`) y no se mueve con la preferencia de "reducir movimiento" (ahí queda desplazable a
// mano, sin animación). Tampoco corre con la pestaña oculta: el navegador frena los cuadros.

"use client";

import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/clases";

/** Cuánto se queda quieta al principio y al final antes de moverse, en milisegundos. */
const ESPERA_MS = 1800;
/** Velocidad de lectura cómoda, en píxeles por segundo. */
const VELOCIDAD_PX_POR_SEGUNDO = 28;

type Fase = "arriba" | "bajando" | "abajo" | "subiendo";

export function AreaDesplazable({
  children,
  activo,
  className,
}: {
  children: ReactNode;
  /** Si es falso (mouse encima, foco adentro), no se mueve sola. */
  activo: boolean;
  className?: string;
}) {
  const zona = useRef<HTMLDivElement>(null);
  const reducirMovimiento = useReducedMotion();
  const sePuedeMover = activo && reducirMovimiento !== true;
  const [desborda, setDesborda] = useState(false);

  // Si el contenido no entra, la zona se puede enfocar con el teclado para leerla con las flechas
  // (si no entra y no se puede enfocar, quien no usa mouse no llegaría al resto). Sin desborde no
  // suma una parada más al recorrido con Tab. Se vuelve a mirar cuando cambia el tamaño de la zona
  // o de lo que tiene adentro, y en cada render (cambian los datos del widget).
  // A lo ancho nunca se desplaza (`overflow-x-hidden`): si no, el pulso de un anillo que se anima, apenas más
  // ancho que la tarjeta, la volvía "desplazable" por un instante.
  useEffect(() => {
    const el = zona.current;
    if (!el) return;
    const medir = () => setDesborda(el.scrollHeight - el.clientHeight > 1);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    for (const hijo of el.children) observador.observe(hijo);
    return () => observador.disconnect();
  });

  useEffect(() => {
    const elemento = zona.current;
    if (!elemento || !sePuedeMover) return;

    let cuadro = 0;
    let fase: Fase = "arriba";
    let desde = performance.now();
    let anterior = desde;
    // La posición se lleva aparte, con decimales: `scrollTop` se redondea y a esta velocidad
    // cada cuadro avanza menos de un píxel.
    let posicion = elemento.scrollTop;

    function esperar(ahora: number, siguiente: Fase) {
      if (ahora - desde >= ESPERA_MS) {
        fase = siguiente;
        anterior = ahora;
      }
    }

    function paso(ahora: number) {
      const el = elemento;
      if (!el) return;
      const maximo = el.scrollHeight - el.clientHeight;
      const segundos = Math.min(ahora - anterior, 100) / 1000;
      anterior = ahora;

      if (maximo <= 1) {
        // Cabe: nada que mostrar. Se vuelve al principio por si antes se pasaba.
        posicion = 0;
        el.scrollTop = 0;
        fase = "arriba";
        desde = ahora;
      } else if (fase === "arriba") {
        esperar(ahora, "bajando");
      } else if (fase === "bajando") {
        posicion = Math.min(maximo, posicion + VELOCIDAD_PX_POR_SEGUNDO * segundos);
        el.scrollTop = posicion;
        if (posicion >= maximo) {
          fase = "abajo";
          desde = ahora;
        }
      } else if (fase === "abajo") {
        esperar(ahora, "subiendo");
      } else {
        posicion = Math.max(0, posicion - VELOCIDAD_PX_POR_SEGUNDO * 2 * segundos);
        el.scrollTop = posicion;
        if (posicion <= 0) {
          fase = "arriba";
          desde = ahora;
        }
      }
      cuadro = requestAnimationFrame(paso);
    }

    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [sePuedeMover]);

  return (
    <div
      ref={zona}
      data-area-desplazable=""
      tabIndex={desborda ? 0 : undefined}
      className={cn(
        "overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin]",
        className,
      )}
    >
      {children}
    </div>
  );
}

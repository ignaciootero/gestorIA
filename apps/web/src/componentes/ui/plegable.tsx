// Contenido que se abre y se cierra con una animación: la altura crece de 0 al alto del contenido
// (y vuelve a 0) mientras aparece o se desvanece. Es lo que usan las secciones plegables ("Hechas hoy",
// "Atrasadas"...) para que todo lo que hay adentro se abra junto, como una sola pieza, y no haya partes
// que aparecen de golpe mientras otras se deslizan.
//
// Se anima `height` (docs/guias/estetica.md lo permite en un elemento acotado, no en listas largas):
// el contenido va recortado solo mientras se anima, así después no corta sombras ni anillos de foco.
// El botón que lo abre es de quien lo usa: tiene que llevar `aria-expanded` y `aria-controls` con el `id`.
// Las salidas van más rápido que las entradas. Con la preferencia de reducir movimiento no se anima.
//
// Uso:
//
//   <button aria-expanded={abierto} aria-controls={id} onClick={…}>Título</button>
//   <Plegable abierto={abierto} id={id}>…</Plegable>

"use client";

import { CURVA_SALIDA, DURACION_MS } from "@gestoria/ui-tokens";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";

export function Plegable({
  abierto,
  id,
  children,
}: {
  abierto: boolean;
  id: string;
  children: ReactNode;
}) {
  const reducirMovimiento = useReducedMotion() === true;
  // Recortado mientras se anima; al terminar se libera.
  const [recortar, setRecortar] = useState(false);

  return (
    <AnimatePresence initial={false}>
      {abierto ? (
        <motion.div
          key="contenido"
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: "auto",
            opacity: 1,
            transition: {
              duration: reducirMovimiento ? 0 : DURACION_MS.normal / 1000,
              ease: CURVA_SALIDA,
            },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: {
              duration: reducirMovimiento ? 0 : DURACION_MS.rapida / 1000,
              ease: CURVA_SALIDA,
            },
          }}
          onAnimationStart={() => setRecortar(true)}
          onAnimationComplete={() => setRecortar(false)}
          style={{ overflow: recortar ? "hidden" : "visible" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// Lista cuyos elementos entran en cascada y salen un poco más rápido.
//
// Entrar en cascada es lo que hace que una lista se "arme" en lugar de aparecer
// de golpe; que las salidas vayan más rápido que las entradas es lo que evita
// que borrar algo se sienta lento (docs/guias/estetica.md).
//
// El escalonado lo maneja el contenedor con `staggerChildren`, así que cada
// elemento no necesita saber en qué posición está: se agrega uno en el medio y
// el orden se recalcula solo.
//
// Uso:
//
//   <ListaAnimada>
//     {tareas.map((t) => (
//       <ItemAnimado key={t.id}>…</ItemAnimado>
//     ))}
//   </ListaAnimada>

"use client";

import { CURVA_SALIDA, DURACION_MS, ESCALONADO_S } from "@gestoria/ui-tokens";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/clases";

const DESPLAZAMIENTO = 8;

const VARIANTES_CONTENEDOR: Variants = {
  visible: { transition: { staggerChildren: ESCALONADO_S } },
};

/**
 * Las dos versiones declaran `y` siempre, aunque valga 0.
 *
 * Si la variante sin movimiento omitiera la propiedad, el elemento se quedaría
 * con el valor de la variante anterior en vez de volver a su lugar. Ya pasó una
 * vez y dejó un título desplazado 8 px para siempre.
 */
function variantesDeItem(sinMovimiento: boolean): Variants {
  return {
    oculto: { opacity: 0, y: sinMovimiento ? 0 : DESPLAZAMIENTO },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: sinMovimiento ? 0 : DURACION_MS.normal / 1000,
        ease: CURVA_SALIDA,
      },
    },
    saliendo: {
      opacity: 0,
      y: sinMovimiento ? 0 : -DESPLAZAMIENTO / 2,
      transition: {
        // Las salidas van más rápido que las entradas.
        duration: sinMovimiento ? 0 : DURACION_MS.rapida / 1000,
        ease: CURVA_SALIDA,
      },
    },
  };
}

export function ListaAnimada({
  children,
  className,
  entrada = true,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Si los elementos entran en cascada al montarse. Se apaga cuando la lista vive dentro de algo que ya
   * se anima al abrirse (un `Plegable`): si no, los elementos se deslizarían aparte del contenedor.
   */
  entrada?: boolean;
}) {
  return (
    <motion.ul
      initial={entrada ? "oculto" : false}
      animate="visible"
      variants={VARIANTES_CONTENEDOR}
      className={cn("flex flex-col", className)}
    >
      {/* `popLayout` hace que los que quedan se corran mientras el que sale se
          desvanece, en vez de esperar a que termine y saltar. */}
      <AnimatePresence mode="popLayout" initial={false}>
        {children}
      </AnimatePresence>
    </motion.ul>
  );
}

export function ItemAnimado({ children, className }: { children: ReactNode; className?: string }) {
  const reducirMovimiento = useReducedMotion();

  return (
    <motion.li
      layout={!reducirMovimiento}
      variants={variantesDeItem(reducirMovimiento === true)}
      exit="saliendo"
      className={className}
    >
      {children}
    </motion.li>
  );
}

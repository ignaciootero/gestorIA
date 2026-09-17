// Encabezado de la pantalla de ingreso.
//
// Entra en cascada —título, bajada y después el panel— en vez de aparecer todo
// junto: es lo que hace que la pantalla se arme en lugar de encenderse de golpe
// (docs/guias/estetica.md, Entradas escalonadas).

"use client";

import { CURVA_SALIDA, DURACION_MS, ESCALONADO_S } from "@gestoria/ui-tokens";
import { motion, useReducedMotion } from "motion/react";

export function EncabezadoDeIngreso() {
  const reducirMovimiento = useReducedMotion();

  const contenedor = {
    oculto: {},
    visible: {
      transition: { staggerChildren: reducirMovimiento ? 0 : ESCALONADO_S },
    },
  };

  /*
   * `y` aparece en los dos estados aunque el movimiento esté reducido, con el
   * desplazamiento en cero. Si se quitara la propiedad, el elemento se quedaría
   * en la posición que tenía cuando `useReducedMotion` todavía no había
   * resuelto: sin destino al que ir, Motion no lo mueve y el título queda
   * corrido para siempre. Lo que cambia con la preferencia es la duración y la
   * distancia, no qué propiedades se animan.
   */
  const hijo = {
    oculto: { opacity: 0, y: reducirMovimiento ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: reducirMovimiento
        ? { duration: 0 }
        : { duration: DURACION_MS.normal / 1000, ease: CURVA_SALIDA },
    },
  };

  return (
    <motion.div
      variants={contenedor}
      initial="oculto"
      animate="visible"
      className="w-full max-w-md"
    >
      <motion.h1 variants={hijo} className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Entrá a tu cuenta
      </motion.h1>

      <motion.p variants={hijo} className="mt-2 text-base text-texto-secundario">
        Gastos, contactos, calendario y tareas, en un solo lugar.
      </motion.p>
    </motion.div>
  );
}

// Pestaña para esconder o mostrar una columna lateral del marco (el menú o los
// widgets). Queda pegada al borde de la ventana, a media altura, tanto con la
// columna abierta (para cerrarla) como cerrada (para volver a abrirla).
//
// Es un asa, no un botón de formulario, y por eso se ve distinta:
// - Abierta es una pastilla de superficie con la flecha en acento; cerrada se llena
//   de acento, que es lo que la hace fácil de encontrar cuando la columna ya no está.
// - La flecha gira media vuelta con un resorte al cambiar de estado, en vez de
//   cambiar de golpe, y al esconder la columna la pestaña emite un único pulso (no
//   un parpadeo infinito) para que la vista siga a la columna hasta su borde.
// - Al pasar el mouse se asoma hacia el contenido y muestra, al costado, qué hace.
//   Con el teclado, el mismo cartel aparece al enfocarla.
//
// Todo se mueve con `transform` y `opacity` y respeta la preferencia de reducir
// movimiento: sin desplazamientos, giros ni pulso, solo los cambios de color. Es un
// botón propio y no el `Boton` del sistema: ese se levanta 2 px hacia arriba al pasar
// el mouse, y una asa pegada al borde se desplaza hacia el contenido.

"use client";

import { RESORTE } from "@gestoria/ui-tokens";
import { ChevronLeft } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/clases";
import { type NombreDeColumna, usarColumnaPlegable } from "@/lib/columnas-plegables";

/** Cuánto se asoma hacia el contenido al pasar el mouse. */
const ASOMADA_PX = 4;

export function PestanaDeColumna({
  nombre,
  lado,
  etiqueta,
  controla,
  desde,
}: {
  nombre: NombreDeColumna;
  /** De qué borde de la ventana cuelga. */
  lado: "izquierda" | "derecha";
  /** Qué se esconde, con su artículo: "el menú", "los widgets". */
  etiqueta: string;
  /** Id de la columna que controla. */
  controla: string;
  /** Desde qué ancho de pantalla existe la columna: debajo de él no hay nada que esconder. */
  desde: "md" | "lg";
}) {
  const { abierta, alternar } = usarColumnaPlegable(nombre);
  const reducirMovimiento = useReducedMotion();
  // El pulso es para cuando la persona acaba de esconder la columna, no para cada
  // carga de página en la que ya estaba escondida.
  const [recienEscondida, setRecienEscondida] = useState(false);
  const izquierda = lado === "izquierda";
  const accion = `${abierta ? "Ocultar" : "Mostrar"} ${etiqueta}`;

  // La flecha apunta hacia el borde del que cuelga la pestaña mientras la columna está
  // abierta (hacia donde se va a ir) y hacia el centro cuando está cerrada: es la misma
  // flecha, girada. El ícono mira a la izquierda sin girar, así que en la pestaña derecha
  // (que apunta a la derecha estando abierta) hay que darle media vuelta de entrada.
  const giro = (izquierda ? 0 : 180) + (abierta ? 0 : 180);

  return (
    <motion.button
      type="button"
      onClick={() => {
        setRecienEscondida(abierta);
        alternar();
      }}
      aria-expanded={abierta}
      aria-controls={controla}
      aria-label={accion}
      {...(reducirMovimiento
        ? {}
        : { whileHover: { x: izquierda ? ASOMADA_PX : -ASOMADA_PX }, whileTap: { scale: 0.94 } })}
      transition={RESORTE.firme}
      className={cn(
        // `fixed`: acompaña la ventana y no el scroll. `group` para el cartel de al lado.
        "group fixed top-1/2 z-10 h-16 w-7 -translate-y-1/2 items-center justify-center",
        desde === "md" ? "hidden md:flex" : "hidden lg:flex",
        "border shadow-elevada transition-colors duration-(--duracion-normal) ease-salida",
        izquierda ? "left-0 rounded-r-xl border-l-0" : "right-0 rounded-l-xl border-r-0",
        abierta
          ? "border-borde bg-superficie text-acento hover:bg-acento-suave"
          : "border-acento bg-acento text-acento-texto hover:brightness-110",
      )}
    >
      {/* El pulso de cuando se acaba de esconder: un aro que se agranda y se apaga, una sola vez. */}
      {!abierta && recienEscondida && !reducirMovimiento ? (
        <motion.span
          aria-hidden="true"
          initial={{ opacity: 0.55, scale: 1 }}
          animate={{ opacity: 0, scale: 1.7 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={cn(
            "pointer-events-none absolute inset-0 bg-acento",
            izquierda ? "rounded-r-xl" : "rounded-l-xl",
          )}
        />
      ) : null}

      <motion.span
        aria-hidden="true"
        // Sin `initial={false}` la flecha arrancaría en 0° y giraría hasta su posición cada vez que se carga la pantalla.
        initial={false}
        animate={{ rotate: giro }}
        transition={reducirMovimiento ? { duration: 0 } : RESORTE.suave}
        className="relative flex"
      >
        <ChevronLeft className="size-5" strokeWidth={2.5} />
      </motion.span>

      {/* Lo que hace, al costado, con el mouse encima o con el foco del teclado. Decorativo:
          el nombre accesible ya es el aria-label del botón. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-control",
          "border border-borde bg-superficie px-2.5 py-1 text-xs font-medium text-texto shadow-flotante",
          "opacity-0 transition-[opacity,transform] duration-(--duracion-rapida) ease-salida",
          "group-hover:translate-x-0 group-hover:opacity-100",
          "group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
          izquierda ? "left-full ml-2 -translate-x-1" : "right-full mr-2 translate-x-1",
        )}
      >
        {accion}
      </span>
    </motion.button>
  );
}

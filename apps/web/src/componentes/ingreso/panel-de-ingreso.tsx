// Pantalla de ingreso: entrar y crear cuenta en el mismo lugar.
//
// Un solo panel con dos pestañas en vez de dos páginas separadas: es un clic
// menos y evita la duda de "¿me registré o no?" que aparece cuando hay que
// navegar a otra pantalla para cambiar (docs/guias/usabilidad.md).

"use client";

import { CURVA_SALIDA, DURACION_MS, RESORTE } from "@gestoria/ui-tokens";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { Boton } from "@/componentes/ui/boton";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { cn } from "@/lib/clases";
import { AvisoDeVerificacion } from "./aviso-verificacion";
import { FormularioLogin } from "./formulario-login";
import { FormularioRegistro } from "./formulario-registro";

type Pestana = "entrar" | "registrarse";

const PESTANAS = [
  { valor: "entrar", etiqueta: "Entrar" },
  { valor: "registrarse", etiqueta: "Crear cuenta" },
] as const;

/** Curva de desaceleración del sistema visual (packages/ui-tokens). */
const CURVA = CURVA_SALIDA;

const DURACION_ENTRADA = DURACION_MS.normal / 1000;
// La salida va más rápida que la entrada: el contenido viejo se quita de en
// medio antes y la transición no se siente en dos tiempos. Sumadas dan 300 ms,
// el techo que fija docs/guias/estetica.md.
const DURACION_SALIDA = DURACION_MS.rapida / 1000;

/** Desplazamiento lateral: unos pocos píxeles, nunca un salto grande. */
const DESPLAZAMIENTO = 12;

/**
 * El contenido entra desde el lado de su pestaña y el anterior sale hacia el
 * opuesto, acompañando a la pastilla que se desliza arriba. La dirección viaja
 * por `custom` y no calculada en el render, porque el que se está yendo también
 * la necesita y para entonces la pestaña activa ya cambió.
 */
const VARIANTES = {
  entra: (direccion: number) => ({ opacity: 0, x: direccion * DESPLAZAMIENTO }),
  centro: {
    opacity: 1,
    x: 0,
    transition: { duration: DURACION_ENTRADA, ease: CURVA },
  },
  sale: (direccion: number) => ({
    opacity: 0,
    x: -direccion * DESPLAZAMIENTO,
    transition: { duration: DURACION_SALIDA, ease: CURVA },
  }),
};

/**
 * Con la preferencia de reducir movimiento: solo opacidad y casi instantáneo.
 *
 * `x` sigue declarado, en cero. Si se quitara la propiedad, un elemento que
 * hubiera empezado a moverse antes de que `useReducedMotion` resolviera se
 * quedaría corrido para siempre: sin destino al que ir, Motion no lo mueve.
 */
const VARIANTES_SIN_MOVIMIENTO = {
  entra: () => ({ opacity: 0, x: 0 }),
  centro: { opacity: 1, x: 0, transition: { duration: 0 } },
  sale: () => ({ opacity: 0, x: 0, transition: { duration: 0 } }),
};

export function PanelDeIngreso() {
  const [pestana, setPestana] = useState<Pestana>("entrar");
  const [direccion, setDireccion] = useState(1);
  const [emailRegistrado, setEmailRegistrado] = useState<string | null>(null);
  const reducirMovimiento = useReducedMotion();

  // Alto del contenido, para que la tarjeta crezca y se achique en vez de
  // saltar: entrar tiene dos campos y crear cuenta cinco.
  const contenido = useRef<HTMLDivElement>(null);
  // Arranca en "auto" y el efecto lo reemplaza por el alto medido antes del
  // primer pintado, así el valor inicial nunca se ve.
  const [alto, setAlto] = useState<number | "auto">("auto");

  useLayoutEffect(() => {
    const elemento = contenido.current;
    if (!elemento) return;

    // Con ResizeObserver y no una medición única, la tarjeta también acompaña
    // los cambios de alto dentro del mismo formulario: cuando aparece un
    // mensaje de error, crece en vez de dar un tirón.
    const observador = new ResizeObserver(() => {
      // Al desmontarse este div (al registrarse, que reemplaza el formulario
      // por el aviso de "revisá tu correo"), el navegador dispara un último
      // aviso sobre un elemento ya fuera del documento: mide 0 y, sin este
      // chequeo, ese cero quedaba pegado para siempre, porque el efecto no
      // se repite hasta que la persona vuelve a este mismo formulario.
      if (!elemento.isConnected) return;
      setAlto(elemento.offsetHeight);
    });
    observador.observe(elemento);
    setAlto(elemento.offsetHeight);

    return () => observador.disconnect();
    // Se repite cuando se vuelve del aviso de verificación al formulario: ese
    // "Volver" desmonta y remonta este div, así que hace falta un observador
    // nuevo apuntando al elemento nuevo, no el que quedó huérfano.
  }, [emailRegistrado]);

  function cambiarA(nueva: Pestana): void {
    if (nueva !== pestana) {
      setDireccion(nueva === "registrarse" ? 1 : -1);
    }
    setPestana(nueva);
    setEmailRegistrado(null);
  }

  if (emailRegistrado) {
    return (
      <Tarjeta brillo elevacion="elevada" className="w-full max-w-md p-6 sm:p-8">
        <AvisoDeVerificacion email={emailRegistrado} reciénRegistrado />

        <Boton variante="sutil" className="mt-4 w-full" onClick={() => cambiarA("entrar")}>
          Volver
        </Boton>
      </Tarjeta>
    );
  }

  const variantes = reducirMovimiento ? VARIANTES_SIN_MOVIMIENTO : VARIANTES;
  const transicionDeAlto = reducirMovimiento
    ? { duration: 0 }
    : { duration: DURACION_ENTRADA, ease: CURVA };

  return (
    <Tarjeta brillo elevacion="elevada" className="w-full max-w-md p-6 sm:p-8">
      {/*
        Pestañas con el patrón de accesibilidad estándar: el grupo es un
        `tablist`, cada botón un `tab` que dice qué panel controla, y el
        contenido un `tabpanel`. Así un lector de pantalla anuncia "pestaña 1 de 2".
      */}
      <div
        role="tablist"
        aria-label="Entrar o crear una cuenta"
        className="mb-6 grid grid-cols-2 gap-1 rounded-control bg-superficie-suave p-1"
      >
        {PESTANAS.map(({ valor, etiqueta }) => {
          const activa = pestana === valor;
          return (
            <button
              key={valor}
              type="button"
              role="tab"
              id={`pestana-${valor}`}
              aria-selected={activa}
              aria-controls={`panel-${valor}`}
              onClick={() => cambiarA(valor)}
              className={cn(
                "relative h-9 rounded-[0.375rem] text-sm font-medium",
                "transition-colors duration-[var(--duracion-rapida)] ease-salida",
                activa ? "text-texto" : "text-texto-secundario hover:text-texto",
              )}
            >
              {activa ? (
                <motion.span
                  // `layoutId` hace que el fondo se deslice de una pestaña a la
                  // otra en vez de aparecer de golpe: muestra de dónde a dónde fue.
                  layoutId="fondo-pestana"
                  className="absolute inset-0 rounded-[0.375rem] bg-superficie shadow-sm"
                  // Resorte y no curva fija: la pastilla responde a un clic
                  // directo, y así se siente física (docs/guias/estetica.md).
                  transition={reducirMovimiento ? { duration: 0 } : RESORTE.firme}
                />
              ) : null}
              <span className="relative">{etiqueta}</span>
            </button>
          );
        })}
      </div>

      {/*
        La tarjeta anima su alto mientras cambia el contenido. `height` es una
        propiedad de layout y no `transform`, contra la regla general de la guía
        de estética, pero es un solo elemento chico y era justamente el salto de
        alto lo que hacía que la transición se sintiera brusca.

        `initial={false}` evita que anime en la primera carga, y `-mx-1 px-1`
        deja lugar para que el recuadro de foco de los campos no quede cortado
        por el `overflow: hidden`.
      */}
      <motion.div
        // Punto de anclaje para el test que verifica que el alto se anima: es lo
        // único de esta transición que no se puede localizar por rol ni etiqueta.
        data-animacion="alto"
        initial={false}
        animate={{ height: alto }}
        transition={transicionDeAlto}
        className="-mx-1 overflow-hidden px-1"
      >
        <div ref={contenido}>
          {/*
            `mode="wait"` a propósito: los dos formularios comparten etiquetas
            (las dos tienen "Contraseña"), y tenerlos montados a la vez dejaría
            dos campos con el mismo nombre accesible durante la transición.
          */}
          <AnimatePresence mode="wait" initial={false} custom={direccion}>
            <motion.div
              key={pestana}
              role="tabpanel"
              id={`panel-${pestana}`}
              aria-labelledby={`pestana-${pestana}`}
              custom={direccion}
              variants={variantes}
              initial="entra"
              animate="centro"
              exit="sale"
            >
              {pestana === "entrar" ? (
                <FormularioLogin />
              ) : (
                <FormularioRegistro alRegistrarse={setEmailRegistrado} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </Tarjeta>
  );
}

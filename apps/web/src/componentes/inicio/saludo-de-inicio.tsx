// El saludo de la pantalla de inicio: una etiqueta "Inicio", "Hola, <nombre>" en grande y la fecha de
// hoy, con una manito que saluda.
//
// Va en la misma fila que las pestañas del carrusel (ver CarruselDeInicio, `encabezado`), alineado
// con el borde izquierdo de la tarjeta, en vez de quedar suelto y centrado arriba de todo. La
// etiqueta "Inicio" lleva el mismo ícono que el menú, para que quede claro en qué pantalla se está.
// En una ventana baja (menos de 701 px, ver `ventana-alta` en globals.css) el saludo se achica y la
// etiqueta se esconde, para dejarle lugar a la tarjeta.
//
// La entrada es una bienvenida en pasos, para que la pantalla "se arme" en vez de aparecer de golpe:
// 1. La manito aparece con un resorte suave.
// 2. La etiqueta "Inicio" sube.
// 3. "Hola, <nombre>" se escribe letra por letra, en cascada.
// 4. Llega la fecha y la manito saluda (se agita un par de veces).
// 5. Mientras tanto entran las pestañas y la tarjeta del carrusel (ver ENTRADA_DEL_CARRUSEL_S).
// Pasar el mouse por la manito la hace saludar de nuevo. Todo es `transform` y `opacity`, y nada
// bloquea la interacción. Con la preferencia de reducir movimiento aparece quieto, de una vez.

"use client";

import { CURVA_SALIDA, DURACION_MS, RESORTE } from "@gestoria/ui-tokens";
import { Hand, Home } from "lucide-react";
import { motion, useAnimate, useReducedMotion } from "motion/react";
import { Fragment, useCallback, useEffect } from "react";

/** El giro de la manito al saludar, en grados: ida y vuelta, cada vez más corto. */
const SALUDO = [0, 16, -8, 14, -4, 10, 0];
const DURACION_DEL_SALUDO_S = 1.4;
/** Cuándo empieza a escribirse el saludo y cuánto espera cada letra a la anterior. */
const INICIO_DE_LAS_LETRAS_S = 0.12;
const LETRA_S = 0.025;

/**
 * Cuándo empiezan a entrar las pestañas y la tarjeta del carrusel: con el saludo ya en camino, para
 * que se lea primero y la pantalla se arme de arriba hacia abajo.
 */
export const ENTRADA_DEL_CARRUSEL_S = 0.3;

/** "Miércoles, 4 de noviembre". */
function hoyEnPalabras(dia: string): string {
  const texto = new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dia}T00:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function SaludoDeInicio({ nombre, hoy }: { nombre: string; hoy: string }) {
  const reducirMovimiento = useReducedMotion();
  const [manito, animar] = useAnimate<HTMLSpanElement>();

  const saludo = `Hola, ${nombre}`;
  const palabras = saludo.split(" ");
  const finDeLasLetras = INICIO_DE_LAS_LETRAS_S + saludo.length * LETRA_S;

  // Con `useAnimate` y no con `animate`/`whileHover`: al terminar el hover, Motion vuelve a lo que
  // dice `animate`, y siendo una secuencia la repetiría (saludaría dos veces).
  const saludar = useCallback(
    (demora: number) => {
      if (reducirMovimiento || !manito.current) return;
      animar(
        manito.current,
        { rotate: SALUDO },
        { duration: DURACION_DEL_SALUDO_S, delay: demora, ease: "easeInOut" },
      );
    },
    [animar, manito, reducirMovimiento],
  );

  useEffect(() => {
    saludar(finDeLasLetras);
  }, [saludar, finDeLasLetras]);

  const sube = (demora: number, desplazamiento = 8) => ({
    initial: reducirMovimiento ? false : { opacity: 0, y: desplazamiento },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURACION_MS.lenta / 1000, delay: demora, ease: CURVA_SALIDA },
  });

  // Cada letra con su demora, contando las de las palabras anteriores (y el espacio entre ellas).
  let posicion = 0;

  return (
    <header className="flex min-w-0 items-center gap-4">
      <motion.span
        aria-hidden="true"
        data-manito
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-acento-suave text-acento-suave-texto ventana-alta:size-16"
        onMouseEnter={() => saludar(0)}
        initial={reducirMovimiento ? false : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={RESORTE.suave}
      >
        <span ref={manito} className="flex origin-[70%_85%]">
          <Hand className="size-5 ventana-alta:size-8" />
        </span>
      </motion.span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <motion.p
          className="hidden items-center gap-1.5 text-xs font-medium tracking-wide text-acento uppercase ventana-alta:flex"
          {...sube(0.06, 6)}
        >
          <Home aria-hidden="true" className="size-3.5" />
          Inicio
        </motion.p>
        {/* Las letras se animan una por una, así que el nombre accesible va aparte, entero. Cada
            palabra no se corta entre renglones. */}
        <h1
          aria-label={saludo}
          className="text-2xl font-semibold tracking-tight ventana-alta:text-4xl"
        >
          <span aria-hidden="true">
            {palabras.map((palabra, indice) => {
              const letras = [...palabra].map((letra) => {
                const demora = INICIO_DE_LAS_LETRAS_S + posicion * LETRA_S;
                posicion += 1;
                return { letra, demora };
              });
              posicion += 1;
              return (
                // Las palabras y sus letras están en un orden fijo: la posición es su identidad.
                <Fragment key={indice}>
                  {indice > 0 ? " " : null}
                  <span className="inline-block whitespace-nowrap">
                    {letras.map(({ letra, demora }, orden) => (
                      <motion.span key={orden} className="inline-block" {...sube(demora, 10)}>
                        {letra}
                      </motion.span>
                    ))}
                  </span>
                </Fragment>
              );
            })}
          </span>
        </h1>
        <motion.p
          className="text-sm text-texto-secundario ventana-alta:text-lg"
          {...sube(finDeLasLetras - 0.1)}
        >
          {hoyEnPalabras(hoy)}
        </motion.p>
      </div>
    </header>
  );
}

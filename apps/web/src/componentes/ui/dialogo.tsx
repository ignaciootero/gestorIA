// Diálogo modal, sobre el elemento nativo <dialog>.
//
// Sin dependencia nueva: <dialog> con showModal() ya trae foco atrapado,
// cierre con Escape y capa de fondo, que es exactamente lo que pide
// docs/guias/usabilidad.md para confirmar una acción destructiva o irreversible
// (bloquear una cuenta, resetear una contraseña).
//
// El <dialog> ocupa toda la pantalla y solo centra con flex (ver .dialogo en
// globals.css); la tarjeta visible es el <div> de adentro. Sin esto, el reset
// de márgenes de Tailwind rompe el `margin: auto` del que depende el centrado
// automático del navegador, y el diálogo queda pegado a una esquina en vez de
// centrado.

"use client";

import type { LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/clases";

export type TonoDialogo = "info" | "exito" | "advertencia" | "peligro";

// Mismos cuatro tonos y mismo significado que Aviso e Insignia: el color
// nunca es decorativo solo, así que acompaña siempre a un ícono elegido por
// quien llama, según lo que se está por confirmar.
const TONOS: Record<TonoDialogo, string> = {
  info: "bg-acento-suave text-acento-suave-texto",
  exito: "bg-exito-fondo text-exito",
  advertencia: "bg-advertencia-fondo text-advertencia",
  peligro: "bg-peligro-fondo text-peligro",
};

type PropsDialogo = {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  /** Insignia de color junto al título. Sin ícono, el diálogo queda neutro. */
  icono?: LucideIcon;
  tono?: TonoDialogo;
  children: ReactNode;
  className?: string;
};

export function Dialogo({
  abierto,
  onCerrar,
  titulo,
  icono: Icono,
  tono = "info",
  children,
  className,
}: PropsDialogo) {
  const referencia = useRef<HTMLDialogElement>(null);
  // Si el botón del mouse se apretó sobre el fondo (y no adentro del diálogo). Al
  // seleccionar texto de un campo arrastrando, se puede soltar afuera de la
  // tarjeta: el navegador dispara el clic sobre el <dialog> (ancestro común) y
  // sin esta comprobación eso cerraba el diálogo.
  const pulsoEnElFondo = useRef(false);
  // Único por instancia: con un id fijo, dos diálogos montados a la vez (algo
  // habitual acá, por ejemplo "Agregar movimiento" junto con el de "Editar" o
  // "Eliminar" de una lista) terminaban con el mismo id y el `aria-labelledby`
  // de uno podía resolver al título del otro.
  const idTitulo = useId();

  // El <dialog> sigue pintado unos instantes más mientras se cierra, por la
  // animación de salida (ver .dialogo en globals.css). Quien llama suele
  // vaciar su estado (poner en null la cuenta a bloquear, por ejemplo) apenas
  // se cierra, así que título/ícono/contenido calculados a partir de ese
  // estado cambiarían de golpe a mitad de la animación: un parpadeo con
  // pinta de "otro" diálogo. Por eso se muestra lo último visto mientras
  // estaba abierto, no lo que llega en cuanto empieza a cerrarse.
  //
  // Actualización en el cuerpo del render (no en un efecto) para que no haya
  // ni un cuadro de por medio con el contenido viejo mientras algo cambia con
  // el diálogo todavía abierto (un error de la mutación, por ejemplo).
  const [contenido, setContenido] = useState({ titulo, icono: Icono, tono, children });
  if (
    abierto &&
    (contenido.titulo !== titulo ||
      contenido.icono !== Icono ||
      contenido.tono !== tono ||
      contenido.children !== children)
  ) {
    setContenido({ titulo, icono: Icono, tono, children });
  }
  const {
    titulo: tituloMostrado,
    icono: IconoMostrado,
    tono: tonoMostrado,
    children: contenidoMostrado,
  } = contenido;

  useEffect(() => {
    const elemento = referencia.current;
    if (!elemento) return;

    if (abierto && !elemento.open) elemento.showModal();
    if (!abierto && elemento.open) elemento.close();
  }, [abierto]);

  return (
    // El clic en el backdrop para cerrar (comparando el target) es un patrón
    // estándar de <dialog>, no un control con el que se interactúe por
    // teclado: para eso ya está Escape, que <dialog> maneja solo con su
    // evento "cancel" nativo.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape ya cierra por teclado (evento "cancel" nativo de <dialog>); el clic es solo para el backdrop.
    <dialog
      ref={referencia}
      // Se dispara al cerrar por cualquier motivo (Escape, .close(), el botón de
      // abajo): un solo lugar mantiene sincronizado el estado del padre.
      onClose={onCerrar}
      // Clic en el backdrop: el target es el propio <dialog> porque el contenido
      // de adentro corta la propagación.
      onPointerDown={(evento) => {
        pulsoEnElFondo.current = evento.target === referencia.current;
      }}
      onClick={(evento) => {
        // Solo cierra si el clic empezó Y terminó en el fondo.
        if (evento.target === referencia.current && pulsoEnElFondo.current) onCerrar();
        pulsoEnElFondo.current = false;
      }}
      // Recién cuando termina de verdad la animación de salida (no el evento
      // "close", que dispara al toque de cerrar) se olvida el contenido
      // congelado. Antes de esto, quedaba pisado en el DOM (invisible, pero
      // presente) incluso después de cerrado, y un texto que también
      // estuviera en la fila de atrás dejaba de identificar un solo lugar.
      onTransitionEnd={(evento) => {
        if (evento.target === referencia.current && !abierto) {
          setContenido({ titulo, icono: Icono, tono, children });
        }
      }}
      aria-labelledby={idTitulo}
      className="dialogo fixed inset-0 m-0 h-full max-h-none w-full max-w-none bg-transparent p-4"
    >
      {/* Corta la propagación para que un clic adentro no cierre el diálogo.
          No es un control: por eso no le hace falta un manejador de teclado. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: solo corta la propagación de un clic, no es un control. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: idem; no hay acción que un teclado deba disparar acá. */}
      <div
        onClick={(evento) => evento.stopPropagation()}
        className={cn(
          "flex w-full max-w-md flex-col gap-4 rounded-tarjeta border border-borde bg-superficie p-6 text-texto shadow-flotante",
          className,
        )}
      >
        <div className="flex items-center gap-3">
          {IconoMostrado ? (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                TONOS[tonoMostrado],
              )}
            >
              <IconoMostrado className="size-5" />
            </span>
          ) : null}
          <h2 id={idTitulo} className="text-lg font-semibold tracking-tight">
            {tituloMostrado}
          </h2>
        </div>
        {contenidoMostrado}
      </div>
    </dialog>
  );
}

// Botón del sistema visual.
//
// Tres variantes: la principal lleva el acento (como máximo una por pantalla),
// la secundaria es un borde fino y la sutil no tiene fondo.
//
// Responde a los tres estados que pide docs/guias/estetica.md: al pasar el
// mouse sube un nivel de elevación y se levanta, al presionarlo baja y se
// achica, y el foco siempre deja un anillo visible. Ese ida y vuelta es lo que
// hace que se sienta táctil en vez de una imagen.
//
// El levantado y el hundido salen de la clase .boton-tactil, que usa los tokens
// de microinteracción. El botón es el único elemento que se levanta 2 px: en
// una tarjeta ese mismo recorrido se siente inestable.

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/clases";

type Variante = "principal" | "secundario" | "sutil";
type Tamano = "normal" | "chico";

const VARIANTES: Record<Variante, string> = {
  principal: cn(
    "bg-acento text-acento-texto shadow-sutil",
    "hover:shadow-elevada hover:brightness-110",
    "active:shadow-sutil active:brightness-95",
  ),
  secundario: cn(
    "border border-borde-fuerte bg-superficie text-texto shadow-sutil",
    "hover:border-acento/40 hover:bg-superficie-suave hover:shadow-elevada",
    "active:shadow-sutil",
  ),
  sutil: cn(
    "text-texto-secundario",
    "hover:bg-superficie-suave hover:text-texto",
    "active:bg-superficie-suave",
  ),
};

const TAMANOS: Record<Tamano, string> = {
  // 44 px de alto: el mínimo cómodo para tocar con el dedo.
  normal: "h-11 px-5 text-base",
  chico: "h-9 px-3 text-sm",
};

type PropsBoton = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamano?: Tamano;
  /** Muestra un indicador y bloquea el botón mientras dura la acción. */
  cargando?: boolean;
  /** Qué se está haciendo, para los lectores de pantalla. */
  textoCargando?: string;
  children: ReactNode;
};

export function Boton({
  variante = "principal",
  tamano = "normal",
  cargando = false,
  textoCargando = "Procesando",
  className,
  disabled,
  children,
  ...resto
}: PropsBoton) {
  const bloqueado = disabled === true || cargando;

  return (
    <button
      type="button"
      disabled={bloqueado}
      // `aria-busy` es lo que hace que un lector de pantalla anuncie la espera.
      aria-busy={cargando}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-medium",
        // Levantado al pasar el mouse, hundido al presionar y sin ninguna de las
        // dos cosas si el botón está deshabilitado: todo eso está en la clase.
        "boton-tactil",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        VARIANTES[variante],
        TAMANOS[tamano],
        className,
      )}
      {...resto}
    >
      {cargando ? (
        <>
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          <span>{textoCargando}…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

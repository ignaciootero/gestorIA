// Logotipo de gestorIA.
//
// El nombre es un juego de palabras entre "gestoría" e IA, así que el logotipo
// lo hace visible: "gestor" en el color del texto y "IA" en el acento.
//
// Hay dos versiones (ver docs/guias/estetica.md):
//
// - <Logotipo />: el símbolo más el nombre. Es la versión por defecto.
// - <Isotipo />:  solo el símbolo, para donde el nombre no entra o sobra
//                 (favicon, ícono de la app, avatares, espacios angostos).
//
// El símbolo es una ficha con dos renglones —lo que se gestiona— y un destello,
// que es el signo con el que hoy se lee "inteligencia artificial". Va dibujado
// con `currentColor` y trazo fino, como los íconos de Lucide, así hereda el
// color de donde se use y funciona igual en claro y en oscuro
// (docs/guias/estetica.md).

import { NOMBRE_APP, NOMBRE_APP_PARTES } from "@gestoria/shared";
import { cn } from "@/lib/clases";

type PropsIsotipo = {
  className?: string;
  /** Tamaño en píxeles. Por debajo de 20 conviene usar el favicon. */
  tamano?: number;
};

export function Isotipo({ className, tamano = 24 }: PropsIsotipo) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorativo: el nombre ya está escrito al lado, así que repetirlo sería
      // ruido para un lector de pantalla.
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M7.5 10h9" />
      <path d="M7.5 13.5h4" />
      {/*
        Destello de cuatro puntas, relleno para que se distinga de los renglones
        y no se pierda en tamaños chicos. Queda justo después del renglón corto,
        como si fuera lo que la aplicación agrega a lo que uno escribió.

        Las curvas apuntan al centro exacto (16 16): eso hace las puntas finas y
        los lados hundidos. Con curvas más suaves el dibujo se lee como un signo
        de más, no como un destello.
      */}
      <path
        d="M15.6 12.4 Q15.6 15.4 18.6 15.4 Q15.6 15.4 15.6 18.4 Q15.6 15.4 12.6 15.4 Q15.6 15.4 15.6 12.4 Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

type PropsLogotipo = {
  className?: string;
  /** Sin el símbolo, solo el nombre. Útil donde el espacio es poco. */
  soloTexto?: boolean;
  /**
   * Todo del mismo color, heredado de donde se use.
   *
   * Es obligatorio sobre fondos de color: encima del acento, el "IA" en acento
   * queda invisible. Lo detectó la guía de estilo, que muestra el logotipo
   * sobre las dos superficies justamente para eso.
   */
  mono?: boolean;
  /** Tamaño del isotipo en píxeles. */
  tamanoSimbolo?: number;
};

/**
 * Logotipo completo: símbolo y nombre.
 *
 * El nombre va en un solo `span` accesible para que un lector de pantalla lea
 * "gestorIA" de corrido y no "gestor" e "IA" por separado.
 */
export function Logotipo({
  className,
  soloTexto = false,
  mono = false,
  tamanoSimbolo = 28,
}: PropsLogotipo) {
  const colorDestacado = mono ? "" : "text-acento";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {soloTexto ? null : <Isotipo tamano={tamanoSimbolo} className={colorDestacado} />}

      <span className="text-lg font-semibold tracking-tight">
        <span className="solo-lectores">{NOMBRE_APP}</span>
        <span aria-hidden="true">
          {NOMBRE_APP_PARTES.raiz}
          <span className={colorDestacado}>{NOMBRE_APP_PARTES.ia}</span>
        </span>
      </span>
    </span>
  );
}

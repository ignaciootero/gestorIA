// Casilla de verificación, con el patrón de tareas incluido.
//
// El tilde se dibuja animando el recorrido del trazo, la caja se hunde al
// presionarla y, cuando se usa para una tarea, el texto se tacha con una línea
// que crece de izquierda a derecha (docs/guias/estetica.md).
//
// Debajo hay un <input type="checkbox"> de verdad, oculto a la vista pero no a
// los lectores de pantalla ni al teclado: la caja dibujada es decorativa. Eso
// es lo que hace que funcione la barra espaciadora, el clic en la etiqueta y el
// anuncio correcto del estado, sin escribir una línea de eso a mano.
//
// La animación entera vive en CSS (globals.css): son transiciones sobre el
// estado `:checked` del campo, así que no hace falta que React se entere de
// nada para que se vean.
//
// Para una fila de una lista, además de la etiqueta se puede pasar `junto` (algo
// a la derecha de la caja, como un botón) y `debajo` (más información bajo la
// etiqueta, que no se tacha). La caja queda centrada verticalmente respecto de todo
// el bloque. Como entonces la etiqueta de la <label> incluiría todo ese contenido,
// hay que pasar `nombre`: es el nombre accesible del campo.

"use client";

import type { ChangeEvent, ReactNode } from "react";
import { cn } from "@/lib/clases";

type PropsCasilla = {
  etiqueta: ReactNode;
  marcada: boolean;
  onCambio: (marcada: boolean) => void;
  /** Tacha la etiqueta al marcar. Para listas de tareas. */
  tachar?: boolean;
  disabled?: boolean;
  /** Algo a la derecha de la caja (por ejemplo un botón). Si hay, hace falta `nombre`. */
  junto?: ReactNode;
  /** Información bajo la etiqueta; no se tacha. Si hay, hace falta `nombre`. */
  debajo?: ReactNode;
  /** El nombre accesible del campo cuando la etiqueta lleva más que el texto (`junto` o `debajo`). */
  nombre?: string;
  /**
   * La forma de la caja: cuadrada (la de siempre) o circular, con la estética del botón de "fallida" pero con un
   * tilde y en verde (la usan las tareas).
   */
  forma?: "cuadrada" | "circular";
  /**
   * Con mouse, la caja (y lo que va `junto`) no ocupan lugar hasta apuntar a la fila o navegar con el teclado: entonces
   * se despliegan desde la izquierda empujando el título, con la animación de las acciones de las listas (en pantallas
   * táctiles se ven siempre). La fila que la contiene tiene que ser un `group`. Quien la use debe dejarla fuera cuando
   * ya está marcada.
   */
  reveladaAlApuntar?: boolean;
  className?: string;
};

export function Casilla({
  etiqueta,
  marcada,
  onCambio,
  tachar = false,
  disabled = false,
  junto,
  debajo,
  nombre,
  forma = "cuadrada",
  reveladaAlApuntar = false,
  className,
}: PropsCasilla) {
  function alCambiar(evento: ChangeEvent<HTMLInputElement>): void {
    onCambio(evento.currentTarget.checked);
  }

  const compuesta = junto !== undefined || debajo !== undefined;

  const propiedadesDelCampo = {
    checked: marcada,
    onChange: alCambiar,
    disabled,
    "aria-label": nombre,
    className: "casilla-entrada solo-lectores",
  };

  const caja = (
    <span
      aria-hidden="true"
      className={cn(
        "casilla-caja inline-flex shrink-0 items-center justify-center",
        forma === "circular" ? "casilla-circular size-6 rounded-full" : "size-5 rounded-[0.3rem]",
        compuesta && !reveladaAlApuntar && "row-span-2 self-center",
      )}
    >
      <svg viewBox="0 0 16 16" className={forma === "circular" ? "size-3.5" : "size-4"} fill="none">
        <title>Tilde</title>
        <path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          className="casilla-tilde"
          stroke="var(--color-acento-texto)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );

  // `justify-self-start`: en la grilla el texto no se estira a todo el ancho, así la línea del tachado
  // (que mide lo que el texto) cubre solo el título.
  const texto = (
    <span className={cn("justify-self-start", tachar && "casilla-tachado")}>{etiqueta}</span>
  );

  // Oculta hasta apuntar: la casilla y la cruz van juntas en una pieza que mide cero hasta que se apunta a la fila y
  // entonces se despliega a la izquierda del título (la misma animación que las acciones de la lista de recordatorios
  // de Contactos, pero del otro lado). El campo real va adentro, pegado a la caja, así la caja sigue marcándose con
  // el selector de hermano; el tachado, que ya no es hermano del campo, se resuelve con :has (globals.css).
  if (reveladaAlApuntar) {
    return (
      <label
        className={cn(
          "casilla-raiz grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center text-sm",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span
          data-acciones-reveladas=""
          className={cn(
            "row-span-2 flex self-center",
            "con-mouse:max-w-0 con-mouse:overflow-hidden con-mouse:opacity-0",
            "con-mouse:group-hover:max-w-20 con-mouse:group-hover:overflow-visible con-mouse:group-hover:opacity-100",
            "con-mouse:group-focus-within:max-w-20 con-mouse:group-focus-within:overflow-visible con-mouse:group-focus-within:opacity-100",
            // El doble de la duración base: más lenta que el resto, y con "reducir movimiento" sigue siendo instantánea.
            "transition-[max-width,opacity] duration-[calc(var(--anim-duracion)*2)] ease-(--anim-curva)",
          )}
        >
          <span className="flex items-center gap-2 pr-3">
            <input type="checkbox" {...propiedadesDelCampo} />
            {caja}
            {junto}
          </span>
        </span>
        {texto}
        {debajo !== undefined ? <span className="col-start-2 row-start-2">{debajo}</span> : null}
      </label>
    );
  }

  if (!compuesta) {
    return (
      <label
        className={cn(
          "inline-flex cursor-pointer items-center gap-3 text-sm",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <input type="checkbox" {...propiedadesDelCampo} />
        {caja}
        {texto}
      </label>
    );
  }

  // Con `junto` o `debajo`: una grilla donde la caja (y lo que va junto) ocupan las dos filas y
  // quedan centradas, y la etiqueta y lo de abajo se apilan a su derecha.
  return (
    <label
      className={cn(
        "grid cursor-pointer items-center gap-x-3 text-sm",
        junto !== undefined
          ? "grid-cols-[auto_auto_minmax(0,1fr)]"
          : "grid-cols-[auto_minmax(0,1fr)]",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input type="checkbox" {...propiedadesDelCampo} />
      {caja}
      {junto !== undefined ? <span className="row-span-2 self-center">{junto}</span> : null}
      {texto}
      {debajo !== undefined ? (
        <span className={cn("row-start-2", junto !== undefined ? "col-start-3" : "col-start-2")}>
          {debajo}
        </span>
      ) : null}
    </label>
  );
}

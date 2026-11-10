// Las piezas de una tarea progresiva ("tomar 2 litros de agua") en su fila:
//
// - AnilloDeProgreso: va a la izquierda, donde las demás tareas tienen la casilla, **siempre visible**
//   (también en Hoy, donde la casilla aparece al apuntar). Es más grande que la casilla (40 px) para que
//   entre adentro el porcentaje cubierto ("75%"), y se va llenando de verde; al llegar a la meta queda
//   lleno con un tilde, como una completada.
// - PanelDeProgreso: se abre con el botón "Sumar o restar" de la fila (aparece al apuntar, junto a editar
//   y eliminar) o tocando el aro. Tiene las sumas rápidas (más o menos la cuarta parte y la mitad de la
//   meta: "+0,5" y "+1" para 2 litros) y un campo para **sumar**, **restar** o decir que **es el total**.
//
// No se tilda a mano: se completa sola al llegar a la meta (y si se corrige por debajo, vuelve a
// pendiente). Ver tareas/progreso.ts en @gestoria/shared.

"use client";

import {
  formatearCantidad,
  type ProgresoDeTarea,
  proporcionDelProgreso,
  sumasRapidas,
} from "@gestoria/shared";
import { Check, Minus, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import type { Tarea } from "@/lib/api-tareas";
import { cn } from "@/lib/clases";

/** El aro, en un lienzo de 40 × 40: grande para que entre el porcentaje adentro. */
const LADO = 40;
const CENTRO = LADO / 2;
const RADIO = 17;
const VUELTA = 2 * Math.PI * RADIO;

export function AnilloDeProgreso({
  tarea,
  alTocar,
  abierto = false,
}: {
  tarea: Tarea;
  /** Abrir o cerrar el campo para anotar. Sin esto, el aro solo muestra. */
  alTocar?: (() => void) | undefined;
  abierto?: boolean;
}) {
  const reducirMovimiento = useReducedMotion();
  const proporcion = proporcionDelProgreso(tarea.progreso, tarea.meta ?? 1);
  const porcentaje = Math.round(proporcion * 100);
  const completa = tarea.completada;
  const dibujo = (
    <span className="relative inline-grid size-10 shrink-0 place-items-center">
      <svg viewBox={`0 0 ${LADO} ${LADO}`} aria-hidden="true" className="absolute inset-0 size-full">
        <circle
          cx={CENTRO}
          cy={CENTRO}
          r={RADIO}
          fill={completa ? "currentColor" : "none"}
          strokeWidth="3.5"
          className={completa ? "stroke-exito text-exito" : "stroke-borde"}
        />
        {completa ? null : (
          // Arranca arriba y avanza en el sentido del reloj.
          <g transform={`rotate(-90 ${CENTRO} ${CENTRO})`}>
            <motion.circle
              cx={CENTRO}
              cy={CENTRO}
              r={RADIO}
              fill="none"
              strokeWidth="3.5"
              strokeLinecap="round"
              className="stroke-exito"
              strokeDasharray={VUELTA}
              initial={false}
              // Sin nada anotado no se dibuja (el extremo redondeado dejaría un punto).
              animate={{
                strokeDashoffset: VUELTA * (1 - proporcion),
                opacity: proporcion > 0 ? 1 : 0,
              }}
              transition={reducirMovimiento ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
            />
          </g>
        )}
      </svg>
      {/* El número adentro: el tilde cuando llegó, si no el porcentaje. */}
      {completa ? (
        <Check aria-hidden="true" strokeWidth={3} className="relative size-5 text-exito-fondo" />
      ) : (
        <span
          aria-hidden="true"
          className="numeros-tabulares relative text-[11px] leading-none font-semibold text-texto"
        >
          {porcentaje}%
        </span>
      )}
    </span>
  );

  if (!alTocar) {
    return (
      <span role="img" aria-label={`${porcentaje} % hecho`} className="inline-flex shrink-0">
        {dibujo}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={alTocar}
      aria-expanded={abierto}
      aria-label={`Progreso de ${tarea.titulo}: ${porcentaje} %`}
      title="Sumar o restar"
      className={cn(
        "inline-flex shrink-0 rounded-full",
        "transition-transform duration-(--duracion-rapida) ease-salida active:scale-90",
        "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
      )}
    >
      {dibujo}
    </button>
  );
}

const CLASE_DE_FICHA = cn(
  "inline-flex h-7 items-center gap-1 rounded-full border border-borde px-2.5 text-xs font-medium",
  "numeros-tabulares text-texto transition-colors duration-(--duracion-rapida) ease-salida",
  "hover:border-exito hover:bg-exito-fondo hover:text-exito",
  "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
);

/** "1,5" o "1.5" → 1.5; en blanco o algo que no es un número, NaN. */
function aNumero(texto: string): number {
  const limpio = texto.trim().replace(",", ".");
  return limpio === "" ? Number.NaN : Number(limpio);
}

export function PanelDeProgreso({
  tarea,
  alCerrar,
  alAnotar,
}: {
  tarea: Tarea;
  alCerrar: () => void;
  alAnotar: (cambio: ProgresoDeTarea) => void;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const meta = tarea.meta ?? 1;
  const unidad = tarea.unidad ? ` ${tarea.unidad}` : "";

  function anotar(como: "sumar" | "restar" | "total") {
    const cantidad = aNumero(texto);
    if (Number.isNaN(cantidad)) return setError("Escribí una cantidad.");
    if (como !== "total" && cantidad <= 0) return setError("Tiene que ser mayor que 0.");
    if (cantidad < 0) return setError("No puede ser menos de 0.");
    if (Math.abs(cantidad * 100 - Math.round(cantidad * 100)) > 1e-6) {
      return setError("Usá como mucho dos decimales.");
    }
    alAnotar(
      como === "sumar"
        ? { sumar: cantidad }
        : como === "restar"
          ? { restar: cantidad }
          : { total: cantidad },
    );
    setTexto("");
    setError(null);
    alCerrar();
  }

  return (
    <form
      aria-label={`Sumar o restar: ${tarea.titulo}`}
      className="mt-1.5 flex flex-col gap-2 rounded-control bg-superficie-suave p-2"
      onSubmit={(evento) => {
        evento.preventDefault();
        anotar("sumar");
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {sumasRapidas(meta).map((cantidad) => (
          <button
            key={cantidad}
            type="button"
            className={CLASE_DE_FICHA}
            aria-label={`Sumar ${formatearCantidad(cantidad)}${unidad}: ${tarea.titulo}`}
            onClick={() => {
              alAnotar({ sumar: cantidad });
              alCerrar();
            }}
          >
            +{formatearCantidad(cantidad)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor={`${id}-cantidad`} className="solo-lectores">
          Cantidad{unidad}
        </label>
        <input
          id={`${id}-cantidad`}
          inputMode="decimal"
          // Se abre para escribir: el foco va directo al campo.
          autoFocus
          value={texto}
          onChange={(evento) => {
            setTexto(evento.target.value);
            setError(null);
          }}
          onKeyDown={(evento) => {
            if (evento.key === "Escape") alCerrar();
          }}
          placeholder={`Por ejemplo: ${formatearCantidad(sumasRapidas(meta)[0] ?? 1)}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "numeros-tabulares h-8 w-28 rounded-control border border-borde bg-superficie px-2 text-sm",
            "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
            error && "border-peligro",
          )}
        />
        <button type="submit" className={CLASE_DE_FICHA}>
          <Plus aria-hidden="true" className="size-3.5" />
          Sumar
        </button>
        <button type="button" className={CLASE_DE_FICHA} onClick={() => anotar("restar")}>
          <Minus aria-hidden="true" className="size-3.5" />
          Restar
        </button>
        <button type="button" className={CLASE_DE_FICHA} onClick={() => anotar("total")}>
          Es el total
        </button>
        <button
          type="button"
          className={cn(CLASE_DE_FICHA, "border-transparent text-texto-secundario")}
          onClick={alCerrar}
        >
          Cancelar
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-peligro">
          {error}
        </p>
      ) : null}
    </form>
  );
}

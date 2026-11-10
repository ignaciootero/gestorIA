// Las piezas de una tarea progresiva ("tomar 2 litros de agua") en su fila:
//
// - AnilloDeProgreso: va donde las demás tareas tienen la casilla, del mismo tamaño y con la misma
//   estética (un círculo con borde). Se va llenando de verde con lo que se lleva; al llegar a la meta
//   queda lleno con un tilde, como la casilla de una completada. Tocarlo abre el campo para anotar.
// - ControlesDeProgreso: debajo del título, los botones para sumar rápido (más o menos la cuarta parte
//   y la mitad de la meta: "+0,5" y "+1" para 2 litros) y "Otra cantidad", que abre un campo para sumar
//   lo que sea o corregir el total ("Es el total").
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
import { Check, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import type { Tarea } from "@/lib/api-tareas";
import { cn } from "@/lib/clases";

/** El radio del aro, en un lienzo de 24 × 24 (el mismo tamaño que la casilla). */
const RADIO = 10;
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
  const completa = tarea.completada;
  const dibujo = (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
      <circle
        cx="12"
        cy="12"
        r={RADIO}
        fill={completa ? "currentColor" : "none"}
        strokeWidth="1.5"
        className={completa ? "stroke-exito text-exito" : "stroke-borde-fuerte"}
      />
      {completa ? null : (
        // Arranca arriba y avanza en el sentido del reloj.
        <g transform="rotate(-90 12 12)">
          <motion.circle
            cx="12"
            cy="12"
            r={RADIO}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="stroke-exito"
            strokeDasharray={VUELTA}
            initial={false}
            animate={{ strokeDashoffset: VUELTA * (1 - proporcion) }}
            transition={reducirMovimiento ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
          />
        </g>
      )}
      {completa ? (
        <Check x="6" y="6" width="12" height="12" strokeWidth={3} className="text-exito-fondo" />
      ) : null}
    </svg>
  );

  if (!alTocar) return <span className="inline-flex shrink-0">{dibujo}</span>;
  return (
    <button
      type="button"
      onClick={alTocar}
      aria-expanded={abierto}
      aria-label={`Anotar cuánto llevás: ${tarea.titulo}`}
      title="Anotar cuánto llevás"
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

export function ControlesDeProgreso({
  tarea,
  abierto,
  alAbrir,
  alCerrar,
  alAnotar,
}: {
  tarea: Tarea;
  /** El campo para otra cantidad está abierto (también se abre tocando el aro). */
  abierto: boolean;
  alAbrir: () => void;
  alCerrar: () => void;
  alAnotar: (cambio: ProgresoDeTarea) => void;
}) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const meta = tarea.meta ?? 1;
  const unidad = tarea.unidad ? ` ${tarea.unidad}` : "";

  function anotar(como: "sumar" | "total") {
    const cantidad = aNumero(texto);
    if (Number.isNaN(cantidad)) return setError("Escribí una cantidad.");
    if (como === "sumar" && cantidad <= 0) return setError("Tiene que ser mayor que 0.");
    if (cantidad < 0) return setError("No puede ser menos de 0.");
    if (Math.abs(cantidad * 100 - Math.round(cantidad * 100)) > 1e-6) {
      return setError("Usá como mucho dos decimales.");
    }
    alAnotar(como === "sumar" ? { sumar: cantidad } : { total: cantidad });
    setTexto("");
    setError(null);
    alCerrar();
  }

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {/* Una ya completa solo se corrige (desde el aro); las fichas son para ir sumando. */}
      {tarea.completada ? null : (
        <div className="flex flex-wrap items-center gap-1.5">
          {sumasRapidas(meta).map((cantidad) => (
            <button
              key={cantidad}
              type="button"
              className={CLASE_DE_FICHA}
              aria-label={`Sumar ${formatearCantidad(cantidad)}${unidad}: ${tarea.titulo}`}
              onClick={() => alAnotar({ sumar: cantidad })}
            >
              +{formatearCantidad(cantidad)}
            </button>
          ))}
          <button
            type="button"
            className={cn(CLASE_DE_FICHA, "text-texto-secundario")}
            aria-expanded={abierto}
            aria-controls={`${id}-campo`}
            onClick={abierto ? alCerrar : alAbrir}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Otra cantidad
          </button>
        </div>
      )}
      {abierto ? (
        <form
          id={`${id}-campo`}
          className="flex flex-col gap-1.5"
          onSubmit={(evento) => {
            evento.preventDefault();
            anotar("sumar");
          }}
        >
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
              Sumar
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
      ) : null}
    </div>
  );
}

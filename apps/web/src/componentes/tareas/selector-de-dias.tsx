// Selector de los días de la semana de una tarea semanal: siete botones que se marcan y desmarcan
// (lunes a domingo), con al menos uno. Debajo de cada uno hay una casilla de verdad (oculta a la
// vista, no a los lectores de pantalla ni al teclado): la barra espaciadora marca, Tab recorre los
// días y el lector anuncia "lunes, casilla, marcada". Lo dibujado es decorativo.
//
// Se conecta a react-hook-form con `register`: varias casillas con el mismo nombre dan un arreglo
// con los valores marcados ("1" es lunes … "7" es domingo).

"use client";

import { NOMBRES_DE_DIA_DE_LA_SEMANA } from "@gestoria/shared";
import { AlertCircle } from "lucide-react";
import type { UseFormRegisterReturn } from "react-hook-form";

const ABREVIATURAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export function SelectorDeDias({
  registro,
  error,
}: {
  registro: UseFormRegisterReturn;
  error?: string | undefined;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-texto">Días de la semana</legend>
      <div className="flex flex-wrap gap-2">
        {NOMBRES_DE_DIA_DE_LA_SEMANA.map((nombre, indice) => (
          <label key={nombre} className="relative cursor-pointer">
            <input
              type="checkbox"
              value={indice + 1}
              aria-label={nombre}
              className="peer solo-lectores"
              {...registro}
            />
            <span
              aria-hidden="true"
              className="inline-flex h-10 min-w-12 items-center justify-center rounded-control border border-borde-fuerte bg-superficie px-3 text-sm font-medium text-texto-secundario transition-colors duration-(--duracion-rapida) ease-salida hover:bg-superficie-suave peer-checked:border-transparent peer-checked:bg-acento peer-checked:text-acento-texto peer-focus-visible:shadow-(--anillo-foco)"
            >
              {ABREVIATURAS[indice]}
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs text-texto-secundario">Podés marcar varios.</p>
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-peligro">
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

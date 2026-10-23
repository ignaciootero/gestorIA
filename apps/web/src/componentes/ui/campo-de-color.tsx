// Campo de color: igual que Campo, pero para un `<input type="color">` (etiquetas de contactos y
// categorías de finanzas y de tareas).

"use client";

import { type InputHTMLAttributes, useId } from "react";

export function CampoColor({
  etiqueta,
  ...resto
}: { etiqueta: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {etiqueta}
      </label>
      <input
        id={id}
        type="color"
        className="h-11 w-16 cursor-pointer rounded-control border border-borde-fuerte bg-superficie p-1"
        {...resto}
      />
    </div>
  );
}

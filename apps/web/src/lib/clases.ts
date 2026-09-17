// Utilidad para combinar clases de Tailwind.
//
// `clsx` arma la lista y `twMerge` resuelve los conflictos: si un componente
// trae `px-4` y quien lo usa pasa `px-6`, gana el de afuera en vez de quedar los
// dos y depender del orden en la hoja de estilos.

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...clases: ClassValue[]): string {
  return twMerge(clsx(clases));
}

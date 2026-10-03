// Cómo se pinta un movimiento según su tipo, igual en todo el módulo:
// - ingreso: flecha hacia arriba y monto en verde, con "+";
// - gasto: flecha hacia abajo y monto en rojo, con "-";
// - transferencia entre cuentas ("neutro"): flechas cruzadas y color amarillo
//   (en ámbar, que se lee bien sobre el fondo; el amarillo puro solo se usa en
//   el punto de la categoría), sin signo: no es ni ingreso ni gasto.
//
// Ningún significado depende solo del color: cada tipo tiene su ícono propio
// (docs/guias/estetica.md).

import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { TipoMovimiento } from "@/lib/api-finanzas";
import { cn } from "@/lib/clases";

export function IconoDeMovimiento({
  tipo,
  className,
}: {
  tipo: TipoMovimiento;
  className?: string;
}) {
  const clases = cn("size-5 shrink-0", className);

  if (tipo === "ingreso") {
    return (
      <ArrowUpRight aria-hidden="true" strokeWidth={2.75} className={cn(clases, "text-exito")} />
    );
  }
  if (tipo === "neutro") {
    return (
      <ArrowLeftRight
        aria-hidden="true"
        strokeWidth={2.75}
        className={cn(clases, "text-advertencia")}
      />
    );
  }
  return (
    <ArrowDownRight aria-hidden="true" strokeWidth={2.75} className={cn(clases, "text-peligro")} />
  );
}

/** Color del monto de un movimiento según su tipo. */
export function claseDeMonto(tipo: TipoMovimiento): string {
  if (tipo === "ingreso") return "text-exito";
  if (tipo === "neutro") return "text-advertencia";
  return "text-peligro";
}

/** "+" para un ingreso, "-" para un gasto y nada para una transferencia. */
export function signoDeMonto(tipo: TipoMovimiento): string {
  if (tipo === "ingreso") return "+";
  if (tipo === "neutro") return "";
  return "-";
}

/**
 * Lo que va entre puntos debajo de la descripción de un movimiento: en una
 * transferencia, "Origen → Destino"; en el resto, la cuenta.
 */
export function cuentasDeMovimiento(movimiento: {
  tipo: TipoMovimiento;
  cuentaFinanciera: { nombre: string };
  cuentaDestino: { nombre: string } | null;
}): string {
  return movimiento.tipo === "neutro" && movimiento.cuentaDestino
    ? `${movimiento.cuentaFinanciera.nombre} → ${movimiento.cuentaDestino.nombre}`
    : movimiento.cuentaFinanciera.nombre;
}

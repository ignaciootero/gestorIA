// Cómo se pinta un movimiento según su tipo, igual en todo el módulo:
// - ingreso: flecha hacia arriba y monto en verde, con "+";
// - gasto: flecha hacia abajo y monto en rojo, con "-";
// - transferencia entre cuentas ("neutro"): flechas cruzadas y color amarillo
//   (en ámbar, que se lee bien sobre el fondo; el amarillo puro solo se usa en
//   el punto de la categoría), sin signo: no es ni ingreso ni gasto.
//
// Ningún significado depende solo del color: cada tipo tiene su ícono propio
// (docs/guias/estetica.md).

import { decirCotizacion, formatearMonto, formatearTasa } from "@gestoria/shared";
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { Movimiento, TipoMovimiento } from "@/lib/api-finanzas";
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
 * Qué dice de la conversión un movimiento entre monedas distintas, o null si no cruza ninguna.
 * Un ingreso o gasto en una cuenta que no está en la moneda base "equivale" a ese importe en la
 * base; una transferencia entre monedas distintas dice cuánto llegó a la cuenta de destino.
 */
export function equivalenciaDeMovimiento(
  movimiento: Pick<
    Movimiento,
    | "tipo"
    | "tipoDeCambio"
    | "importeConvertidoCentavos"
    | "cambioManual"
    | "cuentaFinanciera"
    | "cuentaDestino"
  >,
  monedaBase: string,
): string | null {
  const origen = movimiento.cuentaFinanciera.moneda;
  const destino =
    movimiento.tipo === "neutro" && movimiento.cuentaDestino
      ? movimiento.cuentaDestino.moneda
      : monedaBase;
  if (origen === destino) return null;

  const dicha = decirCotizacion(origen, destino, movimiento.tipoDeCambio);
  const tasa = `1 ${dicha.unidad} = ${formatearTasa(dicha.valor)} ${dicha.otra}`;
  const quien = movimiento.cambioManual ? " (la fijaste vos)" : "";
  const monto = formatearMonto(movimiento.importeConvertidoCentavos, destino);
  return movimiento.tipo === "neutro"
    ? `Llegaron ${monto} · ${tasa}${quien}`
    : `Equivale a ${monto} · ${tasa}${quien}`;
}

/**
 * El monto de un movimiento, en la moneda de su cuenta, y debajo su equivalencia en la
 * moneda base cuando son distintas.
 */
export function MontoDeMovimiento({
  movimiento,
  monedaBase,
}: {
  movimiento: Movimiento;
  monedaBase: string;
}) {
  const equivalencia = equivalenciaDeMovimiento(movimiento, monedaBase);

  return (
    <div className="flex flex-col items-end">
      <p className={cn("text-sm font-medium tabular-nums", claseDeMonto(movimiento.tipo))}>
        {signoDeMonto(movimiento.tipo)}
        {formatearMonto(movimiento.importeCentavos, movimiento.cuentaFinanciera.moneda)}
      </p>
      {equivalencia ? (
        <p className="text-right text-xs tabular-nums text-texto-secundario">{equivalencia}</p>
      ) : null}
    </div>
  );
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

// Un saldo de cuenta con formato de moneda, en rojo si es negativo.
//
// El signo menos ya lo dice ("-$ 500,00"), así que el color es un refuerzo y la
// información no depende solo de él (docs/guias/usabilidad.md, Accesibilidad).

import { formatearMonto } from "@gestoria/shared";
import { cn } from "@/lib/clases";

/** La clase de color de un saldo: rojo si es negativo, ninguna si no. */
export function claseDeSaldoNegativo(centavos: number): string | undefined {
  return centavos < 0 ? "text-peligro" : undefined;
}

/**
 * La clase de color de una <option> con saldo. Siempre lleva un color explícito: una
 * opción sin color hereda el del <select>, que se pone en rojo cuando la cuenta
 * elegida está en negativo, y entonces todas las opciones se verían rojas.
 */
export function claseDeOpcionDeSaldo(centavos: number): string {
  return centavos < 0 ? "text-peligro" : "text-texto";
}

export function Saldo({
  centavos,
  moneda,
  className,
}: {
  centavos: number;
  moneda: string;
  className?: string;
}) {
  return (
    <span className={cn(claseDeSaldoNegativo(centavos), className)}>
      {formatearMonto(centavos, moneda)}
    </span>
  );
}

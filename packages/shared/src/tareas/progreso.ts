// Las tareas progresivas: en vez de tildarse, se van completando de a poco ("tomar 2 litros de agua":
// 0,5 + 0,5 + 1). Tienen una **meta** (una cantidad con hasta dos decimales) y, si se quiere, una
// **unidad** ("litros"); cada tarea lleva su **progreso**, lo que se lleva anotado ese día. Cuando el
// progreso llega a la meta, la tarea se completa sola; si se corrige por debajo, vuelve a pendiente. Si
// no llega, falla como cualquier otra tarea (sola al terminar el día si su repetitiva lo pide, o a mano).
//
// En la base las cantidades se guardan en **centésimos** (enteros), como la plata en centavos: así
// 0,1 + 0,2 da 0,3 y no 0,30000000000000004. Por la API y en pantalla viajan como números comunes.

/** 1,5 → 150. Redondea al centésimo (lo que se puede escribir son hasta dos decimales). */
export function aCentesimos(cantidad: number): number {
  return Math.round(cantidad * 100);
}

/** 150 → 1,5. */
export function desdeCentesimos(centesimos: number): number {
  return centesimos / 100;
}

/** true si el número tiene como mucho dos decimales (lo que se puede guardar sin perder nada). */
export function tieneHastaDosDecimales(cantidad: number): boolean {
  return Math.abs(cantidad * 100 - Math.round(cantidad * 100)) < 1e-6;
}

const FORMATO = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 2 });

/** Una cantidad como se lee: 1.5 → "1,5"; 10000 → "10.000". */
export function formatearCantidad(cantidad: number): string {
  return FORMATO.format(cantidad);
}

/** "1,5 de 2 litros", o "3 de 5" si no tiene unidad. */
export function progresoEnPalabras(progreso: number, meta: number, unidad: string | null): string {
  const base = `${formatearCantidad(progreso)} de ${formatearCantidad(meta)}`;
  return unidad ? `${base} ${unidad}` : base;
}

/** Cuánto se lleva de la meta, de 0 a 1 (pasarse de la meta cuenta como 1). */
export function proporcionDelProgreso(progreso: number, meta: number): number {
  if (meta <= 0) return 0;
  return Math.min(1, Math.max(0, progreso / meta));
}

/**
 * Cantidades rápidas para sumar, según la meta: más o menos la cuarta parte y la mitad, redondeadas a
 * números cómodos (0,25, 0,5, 1, 2, 5, 10…). Para una meta de 2 litros: +0,5 y +1; de 8 vasos, +2 y +4.
 * Sin repetidos.
 */
export function sumasRapidas(meta: number): number[] {
  const comodos = [
    0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500,
    5000, 10000, 25000, 50000, 100000, 250000, 500000,
  ];
  const cercano = (objetivo: number) =>
    comodos.reduce((mejor, valor) =>
      Math.abs(Math.log(valor / objetivo)) < Math.abs(Math.log(mejor / objetivo)) ? valor : mejor,
    );
  const sumas = [cercano(meta / 4), cercano(meta / 2)];
  return [...new Set(sumas)].sort((a, b) => a - b);
}

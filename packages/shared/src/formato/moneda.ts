// Formato y conversión de montos de dinero, compartidos por API y web.
//
// Los montos se guardan en la base como centésimos enteros
// (docs/guias/convenciones.md), pero la API y los formularios trabajan con la
// unidad normal (pesos, dólares): estas funciones son el único lugar donde se
// pasa de una representación a la otra, para que ninguna capa haga la cuenta a
// mano y termine redondeando distinto.

/** Centésimos a partir de un importe en la unidad normal (ej. 1200.5 → 120050). */
export function centavosDesdeImporte(importe: number): number {
  return Math.round(importe * 100);
}

/** Importe en la unidad normal a partir de centésimos (ej. 120050 → 1200.5). */
export function importeDesdeCentavos(centavos: number): number {
  return centavos / 100;
}

/**
 * Formatea un monto guardado en centésimos con `Intl.NumberFormat`, nunca a
 * mano (docs/guias/convenciones.md, Formatos regionales). Con la configuración
 * regional por defecto (es-UY) da "$ 1.200,50" para pesos uruguayos y
 * "US$ 1.200,50" para dólares, tal como pide esa guía.
 */
export function formatearMonto(centavos: number, moneda: string, region = "es-UY"): string {
  return new Intl.NumberFormat(region, { style: "currency", currency: moneda }).format(
    importeDesdeCentavos(centavos),
  );
}

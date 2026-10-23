// Formato de porcentajes con Intl, según la región (docs/guias/convenciones.md,
// Formatos regionales).

/**
 * Un porcentaje con el formato de la región, con hasta un decimal: 12,5 da "12,5%".
 * Recibe el porcentaje ya como tal (12,5 es 12,5 %), no una proporción (0,125).
 */
export function formatearPorcentaje(porcentaje: number, region = "es-UY"): string {
  return new Intl.NumberFormat(region, { style: "percent", maximumFractionDigits: 1 }).format(
    porcentaje / 100,
  );
}

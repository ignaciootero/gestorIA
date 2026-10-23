// Formato de un tipo de cambio para mostrarlo ("40,2857"). Va con `Intl`, como el
// resto de los formatos (docs/guias/convenciones.md, Formatos regionales).

/**
 * Una tasa con los decimales justos para leerla: dos si es grande (1522,21 pesos
 * argentinos por dólar), cuatro si ronda la unidad (40,2857) y hasta seis si es
 * chica (0,026357, lo que vale un peso argentino en uruguayos). Nunca termina en
 * ceros de más: 40 se ve "40,00".
 */
export function formatearTasa(tasa: number, region = "es-UY"): string {
  const maximo = tasa >= 100 ? 2 : tasa >= 1 ? 4 : 6;
  return new Intl.NumberFormat(region, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maximo,
  }).format(tasa);
}

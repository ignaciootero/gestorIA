// Conversión entre monedas con un tipo de cambio ("tasa").
//
// La tasa dice cuántas unidades de la moneda de destino vale 1 unidad de la de
// origen: 1 USD = 40,29 UYU → tasa 40,29 al convertir de USD a UYU. Los montos son
// centésimos enteros (docs/guias/convenciones.md); la conversión se hace con
// enteros grandes (`bigint`) y no con punto flotante, porque un importe de 10^12
// centésimos por una tasa de 1500 ya no cabe con precisión en un `number`.
//
// Todas las capas (API al guardar, formulario al mostrar una vista previa) usan
// estas funciones, para que el redondeo sea siempre el mismo.

/** Decimales que se guardan de una tasa (la base usa numeric(20,8)). */
export const DECIMALES_DE_TASA = 8;
/** Contra un error de tipeo: ninguna cotización razonable pasa de acá. */
export const TASA_MAXIMA = 1_000_000;
export const TASA_MINIMA = 10 ** -DECIMALES_DE_TASA;

const FACTOR = 10 ** DECIMALES_DE_TASA;

/** La tasa con los decimales que se guardan (8). */
export function redondearTasa(tasa: number): number {
  return Number(tasa.toFixed(DECIMALES_DE_TASA));
}

/** Una tasa usable: finita, positiva y dentro de los topes. */
export function esTasaValida(tasa: number): boolean {
  return Number.isFinite(tasa) && redondearTasa(tasa) >= TASA_MINIMA && tasa <= TASA_MAXIMA;
}

/**
 * Convierte centésimos con una tasa, redondeando al centésimo más cercano (la
 * mitad, lejos del cero). Falla con `RangeError` si la tasa no es válida o si el
 * resultado no cabe en un número de JavaScript sin perder precisión.
 */
export function convertirCentavos(centavos: number, tasa: number): number {
  if (!Number.isSafeInteger(centavos))
    throw new RangeError("Los centésimos tienen que ser enteros.");
  if (!esTasaValida(tasa)) throw new RangeError("Esa tasa de cambio no es válida.");

  const base = BigInt(FACTOR);
  const producto = BigInt(centavos) * BigInt(Math.round(tasa * FACTOR));
  // Se redondea el valor absoluto y se le devuelve el signo: la mitad se aleja del
  // cero, así un saldo negativo y su opuesto positivo dan el mismo número.
  const magnitud = producto < 0n ? -producto : producto;
  const redondeada = (magnitud * 2n + base) / (base * 2n);

  if (redondeada > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("El importe convertido es demasiado grande.");
  }
  return producto < 0n ? -Number(redondeada) : Number(redondeada);
}

/**
 * Lo inverso de `convertirCentavos`: cuántos centésimos de la moneda de origen hacen falta para
 * que, con esta tasa, lleguen `centavos` de la de destino (por ejemplo, para comprar 100 dólares
 * con pesos). Mismo redondeo y mismos errores.
 */
export function convertirCentavosInverso(centavos: number, tasa: number): number {
  if (!Number.isSafeInteger(centavos))
    throw new RangeError("Los centésimos tienen que ser enteros.");
  if (!esTasaValida(tasa)) throw new RangeError("Esa tasa de cambio no es válida.");

  const divisor = BigInt(Math.round(tasa * FACTOR));
  const dividendo = BigInt(centavos) * BigInt(FACTOR);
  const magnitud = dividendo < 0n ? -dividendo : dividendo;
  const redondeada = (magnitud * 2n + divisor) / (divisor * 2n);

  if (redondeada > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("El importe convertido es demasiado grande.");
  }
  return dividendo < 0n ? -Number(redondeada) : Number(redondeada);
}

/**
 * La tasa que se deduce de dos importes: lo que se entregó y lo que se recibió.
 * Devuelve null si no hay una tasa válida (algún importe en cero, o una
 * relación absurda).
 */
export function derivarTasa(importeCentavos: number, convertidoCentavos: number): number | null {
  if (!(importeCentavos > 0) || !(convertidoCentavos > 0)) return null;
  const tasa = redondearTasa(convertidoCentavos / importeCentavos);
  return esTasaValida(tasa) ? tasa : null;
}

/**
 * Monedas de la que más vale a la que menos, para decidir cómo se dice una cotización: se
 * dice "1 USD = 40 UYU" (la que más vale va de a uno) y no "1 UYU = 0,025 USD". Una moneda
 * que no está acá se considera de poco valor.
 */
const MONEDAS_DE_MAYOR_A_MENOR_VALOR = ["EUR", "USD", "BRL", "UYU", "ARS"];

function lugarPorValor(moneda: string): number {
  const lugar = MONEDAS_DE_MAYOR_A_MENOR_VALOR.indexOf(moneda);
  return lugar === -1 ? MONEDAS_DE_MAYOR_A_MENOR_VALOR.length : lugar;
}

/** Cómo se dice la cotización entre dos monedas: "1 {unidad} = {valor} {otra}". */
export type CotizacionDicha = { unidad: string; otra: string; valor: number; invertida: boolean };

/**
 * Dice una tasa (de `origen` a `destino`) en el sentido que la gente la entiende: con la
 * moneda que más vale como unidad. Si el origen es la que menos vale, se invierte
 * (0,025 de pesos a dólares se dice 1 USD = 40 UYU). Es solo cómo se muestra y se
 * escribe: lo que se guarda es siempre la tasa de origen a destino.
 */
export function decirCotizacion(origen: string, destino: string, tasa: number): CotizacionDicha {
  return lugarPorValor(origen) > lugarPorValor(destino)
    ? { unidad: destino, otra: origen, valor: 1 / tasa, invertida: true }
    : { unidad: origen, otra: destino, valor: tasa, invertida: false };
}

/** Lo inverso de `decirCotizacion`: la tasa de `origen` a `destino` a partir de lo que se dijo. */
export function tasaDesdeCotizacionDicha(origen: string, destino: string, valor: number): number {
  return lugarPorValor(origen) > lugarPorValor(destino) ? redondearTasa(1 / valor) : valor;
}

/**
 * Tasa entre dos monedas a partir de cuántas unidades de cada una vale un dólar
 * (así publica sus datos la fuente de cotizaciones). Por ejemplo, con 1 USD = 40 UYU
 * y 1 USD = 0,9 EUR, la tasa de EUR a UYU es 40 / 0,9.
 */
export function tasaEntreMonedas(
  unidadesPorDolarDeOrigen: number,
  unidadesPorDolarDeDestino: number,
): number | null {
  if (!(unidadesPorDolarDeOrigen > 0) || !(unidadesPorDolarDeDestino > 0)) return null;
  const tasa = redondearTasa(unidadesPorDolarDeDestino / unidadesPorDolarDeOrigen);
  return esTasaValida(tasa) ? tasa : null;
}

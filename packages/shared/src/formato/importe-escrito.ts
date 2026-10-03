// Importes tal como se escriben en un campo de texto, con separador de miles.
//
// Un <input type="number"> no puede mostrar "1.234,50": solo acepta dígitos y un
// punto. Para que la persona vea los miles separados mientras escribe, los
// importes se escriben en un campo de texto y estas funciones se encargan de
// darle formato ("12345,5" → "12.345,5") y de volver al número.
//
// Los separadores no se escriben a mano: salen de `Intl` para la región (es-UY:
// punto para los miles y coma para los decimales), igual que `formatearMonto`
// (docs/guias/convenciones.md, Formatos regionales).

const REGION_POR_DEFECTO = "es-UY";
/** Más enteros que esto pierde precisión como número de JavaScript al operar en centésimos. */
const MAXIMO_DE_ENTEROS = 12;
const MAXIMO_DE_DECIMALES = 2;

export type OpcionesDeImporte = {
  /** Deja escribir un signo menos al principio (saldos). Los importes y límites no. */
  permitirNegativo?: boolean;
  region?: string;
};

/** El separador de miles y el de decimales de la región. */
export function separadoresDeImporte(region = REGION_POR_DEFECTO): {
  grupo: string;
  decimal: string;
} {
  const partes = new Intl.NumberFormat(region).formatToParts(1234567.5);
  return {
    grupo: partes.find((parte) => parte.type === "group")?.value ?? ".",
    decimal: partes.find((parte) => parte.type === "decimal")?.value ?? ",",
  };
}

/**
 * Le da formato a lo que hay escrito en el campo: miles separados, a lo sumo dos
 * decimales, sin ceros a la izquierda y sin caracteres que no sean números. Los
 * separadores de miles que ya estaban se ignoran (se vuelven a poner donde
 * corresponde); el separador decimal es el de la región. Conserva un decimal
 * recién tipeado ("12," sigue siendo "12,") para no estorbar al escribir.
 */
export function darFormatoAImporteEscrito(
  crudo: string,
  { permitirNegativo = false, region = REGION_POR_DEFECTO }: OpcionesDeImporte = {},
): string {
  const { decimal } = separadoresDeImporte(region);
  const negativo = permitirNegativo && crudo.trimStart().startsWith("-");

  const posicionDecimal = crudo.indexOf(decimal);
  const textoEntero = posicionDecimal === -1 ? crudo : crudo.slice(0, posicionDecimal);
  const decimales =
    posicionDecimal === -1
      ? null
      : crudo
          .slice(posicionDecimal + decimal.length)
          .replace(/\D/g, "")
          .slice(0, MAXIMO_DE_DECIMALES);

  const enteros = textoEntero
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, MAXIMO_DE_ENTEROS);

  const enterosConMiles =
    enteros === ""
      ? decimales === null
        ? ""
        : "0"
      : new Intl.NumberFormat(region, { useGrouping: true, maximumFractionDigits: 0 }).format(
          Number(enteros),
        );

  return `${negativo ? "-" : ""}${enterosConMiles}${decimales === null ? "" : `${decimal}${decimales}`}`;
}

/** El número que representa lo escrito, o NaN si está vacío o incompleto ("", "-"). */
export function interpretarImporteEscrito(
  texto: string,
  { region = REGION_POR_DEFECTO }: OpcionesDeImporte = {},
): number {
  const { grupo, decimal } = separadoresDeImporte(region);
  const limpio = texto.trim();
  if (limpio === "" || limpio === "-") return Number.NaN;
  const numero = Number(limpio.replaceAll(grupo, "").replace(decimal, "."));
  return Number.isFinite(numero) ? numero : Number.NaN;
}

/** El texto con formato de un importe que ya es número (para mostrarlo en el campo). Vacío si no es un número. */
export function textoDeImporte(
  valor: number | null | undefined,
  { region = REGION_POR_DEFECTO }: OpcionesDeImporte = {},
): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return new Intl.NumberFormat(region, {
    useGrouping: true,
    maximumFractionDigits: MAXIMO_DE_DECIMALES,
  }).format(valor);
}

/**
 * Interpreta un importe pegado desde afuera, que puede venir con otro formato
 * ("1.234,56", "1,234.56", "$ 250.5", "1234"), y lo devuelve con el separador
 * decimal de la región y sin miles, listo para `darFormatoAImporteEscrito`.
 *
 * La regla para decidir qué es cada separador: si aparecen los dos, el último es el
 * decimal; si aparece uno solo y se repite, son miles; si aparece una sola vez,
 * es decimal cuando le siguen uno o dos dígitos ("250.5") y miles cuando le siguen
 * tres ("1.234"), porque un importe no tiene más de dos decimales.
 */
export function normalizarImportePegado(
  pegado: string,
  { region = REGION_POR_DEFECTO }: OpcionesDeImporte = {},
): string {
  const { decimal } = separadoresDeImporte(region);
  const negativo = pegado.trimStart().startsWith("-");
  const limpio = pegado.replace(/[^\d.,]/g, "");

  const ultimoPunto = limpio.lastIndexOf(".");
  const ultimaComa = limpio.lastIndexOf(",");

  let posicionDecimal = -1;
  if (ultimoPunto !== -1 && ultimaComa !== -1) {
    posicionDecimal = Math.max(ultimoPunto, ultimaComa);
  } else {
    const separador = ultimoPunto !== -1 ? "." : ultimaComa !== -1 ? "," : null;
    if (separador !== null) {
      const veces = limpio.split(separador).length - 1;
      const posicion = limpio.lastIndexOf(separador);
      const digitosDespues = limpio.length - posicion - 1;
      if (veces === 1 && digitosDespues <= MAXIMO_DE_DECIMALES) posicionDecimal = posicion;
    }
  }

  const enteros = (posicionDecimal === -1 ? limpio : limpio.slice(0, posicionDecimal)).replace(
    /\D/g,
    "",
  );
  const decimales =
    posicionDecimal === -1 ? "" : limpio.slice(posicionDecimal + 1).replace(/\D/g, "");

  return `${negativo ? "-" : ""}${enteros}${posicionDecimal === -1 ? "" : `${decimal}${decimales}`}`;
}

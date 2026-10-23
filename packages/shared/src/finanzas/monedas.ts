// Monedas con las que se puede abrir una cuenta financiera.
//
// Es una lista cerrada y corta a propósito: son las monedas de dos decimales que
// publica la fuente de cotizaciones (apps/api/src/servicios/finanzas/cotizaciones.ts)
// y que `Intl` sabe mostrar. Agregar otra es agregar una línea acá: no cambia el
// esquema de la base (la moneda es un código de texto), solo lo que se ofrece al
// crear una cuenta. La moneda base de cada persona (la que va en el resumen y las
// estadísticas) es `usuarios.monedaPorDefecto`.

export const MONEDAS_ADMITIDAS = [
  { codigo: "UYU", nombre: "Peso uruguayo" },
  { codigo: "USD", nombre: "Dólar estadounidense" },
  { codigo: "ARS", nombre: "Peso argentino" },
  { codigo: "EUR", nombre: "Euro" },
  { codigo: "BRL", nombre: "Real brasileño" },
] as const;

export type CodigoDeMoneda = (typeof MONEDAS_ADMITIDAS)[number]["codigo"];

/** Los códigos, en el formato que pide `z.enum`. */
export const CODIGOS_DE_MONEDA = MONEDAS_ADMITIDAS.map((moneda) => moneda.codigo) as [
  CodigoDeMoneda,
  ...CodigoDeMoneda[],
];

export function esMonedaAdmitida(codigo: string): codigo is CodigoDeMoneda {
  return (CODIGOS_DE_MONEDA as string[]).includes(codigo);
}

/** "Dólar estadounidense" a partir de "USD"; si no la conocemos, el mismo código. */
export function nombreDeMoneda(codigo: string): string {
  return MONEDAS_ADMITIDAS.find((moneda) => moneda.codigo === codigo)?.nombre ?? codigo;
}

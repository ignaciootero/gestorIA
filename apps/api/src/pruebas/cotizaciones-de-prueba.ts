// Fuente de cotizaciones falsa para los tests: ningún test sale a internet.
// Es lo único que se simula del módulo (es un servicio externo); la base es real.

import type { CodigoDeMoneda } from "@gestoria/shared";
import {
  type CotizacionesDelDia,
  diaUtc,
  type FuenteDeCotizaciones,
} from "../servicios/finanzas/cotizaciones.ts";

/** 1 dólar vale 40 pesos uruguayos, 1500 argentinos, 0,8 euros y 5 reales. */
export const UNIDADES_POR_DOLAR_DE_PRUEBA: Record<CodigoDeMoneda, number> = {
  USD: 1,
  UYU: 40,
  ARS: 1500,
  EUR: 0.8,
  BRL: 5,
};

export type FuenteDePrueba = {
  fuente: FuenteDeCotizaciones;
  /** Cada pedido que recibió ("ultimas" o un día AAAA-MM-DD), en orden. */
  llamadas: string[];
  /** Mientras sea true, la fuente "no responde". */
  caida: boolean;
  /** Qué día dice la fuente que son "las últimas" (por defecto, hoy de verdad). */
  diaDeLasUltimas: string | undefined;
  /** Lo que devuelve; se puede cambiar entre pedidos. */
  unidadesPorDolar: Partial<Record<CodigoDeMoneda, number>>;
};

export function crearFuenteDePrueba(
  unidadesPorDolar: Partial<Record<CodigoDeMoneda, number>> = UNIDADES_POR_DOLAR_DE_PRUEBA,
): FuenteDePrueba {
  const estado: FuenteDePrueba = {
    llamadas: [],
    caida: false,
    diaDeLasUltimas: undefined,
    unidadesPorDolar: { ...unidadesPorDolar },
    fuente: async (dia): Promise<CotizacionesDelDia | null> => {
      estado.llamadas.push(dia);
      if (estado.caida) return null;
      return {
        unidadesPorDolar: { ...estado.unidadesPorDolar },
        fechaDeLaFuente: dia === "ultimas" ? (estado.diaDeLasUltimas ?? diaUtc(new Date())) : dia,
      };
    },
  };
  return estado;
}

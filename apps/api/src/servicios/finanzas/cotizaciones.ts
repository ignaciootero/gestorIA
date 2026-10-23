// Cotizaciones de las monedas: de dónde salen y cómo se guardan.
//
// La fuente es la API pública fawazahmed0/currency-api (proyecto abierto, sin clave ni
// límite de uso), servida por dos CDN que publican lo mismo. Cada día publica cuántas
// unidades de cada moneda vale un dólar. Con eso se calcula la tasa entre cualquier par
// (`tasaEntreMonedas`), también entre dos monedas que no son el dólar. No hay ninguna
// otra fuente: ninguna de las alternativas es gratis sin límites.
//
// Los clientes nunca llaman a la fuente: lo hace este servicio, y **siempre mira primero
// la tabla `cotizaciones`**. Un pedido a la fuente trae las cotizaciones de todas las
// monedas de un día y se guardan todas, así que a lo sumo se pide una vez por día (y los
// días pasados, una vez en la vida). Si la fuente no responde, se usa la cotización
// guardada más cercana de los últimos días (marcada como desactualizada) y, si no hay
// ninguna, la persona escribe la cotización a mano: nunca se bloquea cargar un movimiento.
//
// Son datos de mercado, iguales para todos: la tabla no lleva `userId`.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { CODIGOS_DE_MONEDA, type CodigoDeMoneda, tasaEntreMonedas } from "@gestoria/shared";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

/** Cuántas unidades de cada moneda vale un dólar, para un día. */
export type CotizacionesDelDia = {
  unidadesPorDolar: Partial<Record<CodigoDeMoneda, number>>;
  /** El día al que corresponde el dato que devolvió la fuente (AAAA-MM-DD). */
  fechaDeLaFuente: string;
};

/**
 * Trae las cotizaciones de un día (AAAA-MM-DD) o las últimas ("ultimas"), o `null`
 * si ninguna fuente respondió. Es lo único del servicio que sale a internet, y por
 * eso se puede reemplazar en los tests.
 */
export type FuenteDeCotizaciones = (dia: string | "ultimas") => Promise<CotizacionesDelDia | null>;

export type TasaObtenida = {
  /** Cuántas unidades de la moneda de destino vale 1 de la de origen. */
  tasa: number;
  /** El día de la cotización usada. */
  fechaDeLaFuente: string;
  /** Es de un día anterior al pedido porque la fuente no respondió. */
  desactualizada: boolean;
};

/** Primer día con datos en la fuente: antes de esto no hay cotización que pedir. */
export const PRIMER_DIA_CON_COTIZACIONES = "2024-03-02";
/** Hasta cuántos días atrás se acepta una cotización guardada cuando la fuente no responde. */
const DIAS_DE_TOLERANCIA = 7;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const ESPERA_MAXIMA_MS = 3000;
/**
 * Si la fuente no respondió, no se le vuelve a preguntar durante este tiempo: sin esto, cada
 * pantalla que necesita una cotización (el resumen, por ejemplo) esperaría varios segundos a una
 * fuente caída en cada visita.
 */
const PAUSA_TRAS_UN_FALLO_MS = 60_000;

/** El día (AAAA-MM-DD) en UTC de un instante. */
export function diaUtc(instante: Date): string {
  return instante.toISOString().slice(0, 10);
}

function restarDias(dia: string, dias: number): string {
  return diaUtc(new Date(Date.parse(`${dia}T00:00:00Z`) - dias * MS_POR_DIA));
}

// --- La fuente real ---

const esquemaDeLaFuente = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usd: z.record(z.string(), z.unknown()),
});

function soloLasAdmitidas(valores: Record<string, unknown>) {
  const resultado: Partial<Record<CodigoDeMoneda, number>> = {};
  for (const codigo of CODIGOS_DE_MONEDA) {
    const valor = valores[codigo.toLowerCase()];
    if (typeof valor === "number" && Number.isFinite(valor) && valor > 0) resultado[codigo] = valor;
  }
  // El dólar es la unidad de la que parten todas las demás.
  resultado.USD = 1;
  return resultado;
}

async function pedirJson(url: string): Promise<unknown> {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
  if (!respuesta.ok) throw new Error(`La fuente respondió ${respuesta.status}`);
  return await respuesta.json();
}

/** Las dos CDN publican lo mismo: se pregunta a las dos a la vez y vale la primera que responde bien. */
async function desdeFawaz(urls: string[]): Promise<CotizacionesDelDia | null> {
  try {
    return await Promise.any(
      urls.map(async (url) => {
        const datos = esquemaDeLaFuente.parse(await pedirJson(url));
        return {
          unidadesPorDolar: soloLasAdmitidas(datos.usd),
          fechaDeLaFuente: datos.date,
        };
      }),
    );
  } catch {
    return null;
  }
}

/** Cuándo falló por última vez cada consulta ("ultimas" o un día), para no insistir de inmediato. */
const fallosRecientes = new Map<string, number>();

/** La fuente real. Para los tests existe `crearFuenteDePrueba`, que no sale a internet. */
export const fuenteDeCotizaciones: FuenteDeCotizaciones = async (dia) => {
  const ultimoFallo = fallosRecientes.get(dia);
  if (ultimoFallo !== undefined && Date.now() - ultimoFallo < PAUSA_TRAS_UN_FALLO_MS) return null;

  const traidas = await traerDeLaFuente(dia);
  if (traidas) fallosRecientes.delete(dia);
  else fallosRecientes.set(dia, Date.now());
  return traidas;
};

/** Solo para los tests de la fuente real: olvida los fallos recientes. */
export function olvidarFallosDeLaFuente(): void {
  fallosRecientes.clear();
}

async function traerDeLaFuente(dia: string | "ultimas"): Promise<CotizacionesDelDia | null> {
  const version = dia === "ultimas" ? "latest" : dia;
  return await desdeFawaz([
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${version}/v1/currencies/usd.json`,
    `https://${version}.currency-api.pages.dev/v1/currencies/usd.json`,
  ]);
}

// --- La caché ---

type FilaDeCache = { moneda: string; valor: number; fechaDeLaFuente: string; obtenidaEn: Date };

async function leerDelDia(cliente: ClienteDb, dia: string): Promise<FilaDeCache[]> {
  const filas = await cliente.db
    .select({
      moneda: esquema.cotizaciones.moneda,
      valor: esquema.cotizaciones.unidadesPorDolar,
      fechaDeLaFuente: esquema.cotizaciones.fechaDeLaFuente,
      obtenidaEn: esquema.cotizaciones.obtenidaEn,
    })
    .from(esquema.cotizaciones)
    .where(eq(esquema.cotizaciones.fecha, dia));
  return filas;
}

async function guardar(
  cliente: ClienteDb,
  dia: string,
  cotizaciones: CotizacionesDelDia,
  ahora: Date,
): Promise<void> {
  const filas = Object.entries(cotizaciones.unidadesPorDolar).map(([moneda, unidadesPorDolar]) => ({
    fecha: dia,
    moneda,
    unidadesPorDolar,
    fechaDeLaFuente: cotizaciones.fechaDeLaFuente,
    obtenidaEn: ahora,
  }));
  if (filas.length === 0) return;

  await cliente.db
    .insert(esquema.cotizaciones)
    .values(filas)
    .onConflictDoUpdate({
      target: [esquema.cotizaciones.fecha, esquema.cotizaciones.moneda],
      set: {
        unidadesPorDolar: sql`excluded.unidades_por_dolar`,
        fechaDeLaFuente: sql`excluded.fecha_de_la_fuente`,
        obtenidaEn: sql`excluded.obtenida_en`,
      },
    });
}

function tasaDe(filas: FilaDeCache[], desde: string, hasta: string): TasaObtenida | null {
  const valor = (moneda: string) => filas.find((fila) => fila.moneda === moneda);
  const origen = valor(desde);
  const destino = valor(hasta);
  if (!origen || !destino) return null;

  const tasa = tasaEntreMonedas(origen.valor, destino.valor);
  if (tasa === null) return null;
  return {
    tasa,
    fechaDeLaFuente:
      origen.fechaDeLaFuente < destino.fechaDeLaFuente
        ? origen.fechaDeLaFuente
        : destino.fechaDeLaFuente,
    desactualizada: false,
  };
}

/** La cotización guardada más cercana (hasta una semana antes del día pedido) con las dos monedas. */
async function lasMasCercanasGuardadas(
  cliente: ClienteDb,
  dia: string,
  desde: string,
  hasta: string,
): Promise<TasaObtenida | null> {
  const filas = await cliente.db
    .select({
      fecha: esquema.cotizaciones.fecha,
      moneda: esquema.cotizaciones.moneda,
      valor: esquema.cotizaciones.unidadesPorDolar,
      fechaDeLaFuente: esquema.cotizaciones.fechaDeLaFuente,
      obtenidaEn: esquema.cotizaciones.obtenidaEn,
    })
    .from(esquema.cotizaciones)
    .where(
      and(
        inArray(esquema.cotizaciones.moneda, [desde, hasta]),
        gte(esquema.cotizaciones.fecha, restarDias(dia, DIAS_DE_TOLERANCIA)),
        lte(esquema.cotizaciones.fecha, dia),
      ),
    )
    .orderBy(desc(esquema.cotizaciones.fecha));

  const fechas = [...new Set(filas.map((fila) => fila.fecha))];
  for (const fecha of fechas) {
    const tasa = tasaDe(
      filas.filter((fila) => fila.fecha === fecha),
      desde,
      hasta,
    );
    if (tasa) return { ...tasa, desactualizada: true };
  }
  return null;
}

// --- Lo que usa el resto de la API ---

export type OpcionesDeCotizacion = {
  /** De dónde traer lo que falta en la caché. Se reemplaza en los tests. */
  fuente?: FuenteDeCotizaciones | undefined;
  /** Qué instante es "ahora". Se reemplaza en los tests. */
  ahora?: Date | undefined;
};

/**
 * La tasa para convertir de una moneda a otra en el día de `fecha` (hora UTC), o
 * `null` si no hay forma de saberla (la persona la escribe a mano). Una fecha futura
 * usa la de hoy; una anterior al primer día con datos no tiene cotización.
 * Con la misma moneda de un lado y del otro la tasa es siempre 1, sin consultar nada.
 */
export async function obtenerTasa(
  cliente: ClienteDb,
  desde: string,
  hasta: string,
  fecha: Date,
  { fuente = fuenteDeCotizaciones, ahora = new Date() }: OpcionesDeCotizacion = {},
): Promise<TasaObtenida | null> {
  const hoy = diaUtc(ahora);
  const dia = diaUtc(fecha) > hoy ? hoy : diaUtc(fecha);

  if (desde === hasta) return { tasa: 1, fechaDeLaFuente: dia, desactualizada: false };
  if (dia < PRIMER_DIA_CON_COTIZACIONES) return null;

  // Primero la base: si ya está guardada, no se le pregunta a la fuente (la de hoy tampoco:
  // la fuente publica una vez por día).
  const guardada = tasaDe(await leerDelDia(cliente, dia), desde, hasta);
  if (guardada) return guardada;

  const traidas = await fuente(dia === hoy ? "ultimas" : dia).catch(() => null);
  if (traidas) {
    await guardar(cliente, dia, traidas, ahora);
    const nueva = tasaDe(
      Object.entries(traidas.unidadesPorDolar).map(([moneda, valor]) => ({
        moneda,
        valor,
        fechaDeLaFuente: traidas.fechaDeLaFuente,
        obtenidaEn: ahora,
      })),
      desde,
      hasta,
    );
    if (nueva) return nueva;
  }

  return await lasMasCercanasGuardadas(cliente, dia, desde, hasta);
}

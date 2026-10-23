// Lógica de negocio de las cuentas/medios de pago del módulo de ingresos y
// gastos ("cuentas_financieras" en la base: ver esquema/finanzas.ts para el
// porqué del nombre, distinto de la tabla "cuentas" de Better Auth).
//
// Cada cuenta tiene su moneda (la base de la persona, si no elige otra) y su saldo
// está siempre en esa moneda. El saldo se calcula siempre al leer, nunca se guarda:
//   saldo inicial (fijado al crearla) + ingresos − gastos + ajustes manuales
//   − transferencias que salen + transferencias que entran (ya convertidas a la
//   moneda de esta cuenta: ver `importeConvertidoCentavos` en esquema/finanzas.ts).
// Un ajuste manual ("hoy tengo $X") NO es un movimiento: no cuenta en ningún
// período ni infla los ingresos o gastos; solo queda en el historial de la cuenta.
//
// Reglas de borrado: una cuenta con movimientos no se puede eliminar (se puede
// ocultar, para que no se ofrezca al cargar movimientos nuevos); sin movimientos
// sí. Toda consulta filtra por `userId`, que sale de la sesión.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { CUENTAS_FINANCIERAS_POR_DEFECTO } from "@gestoria/shared";
import { and, count, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { obtenerMonedaBase } from "./moneda-base.ts";

export type CuentaFinanciera = {
  id: string;
  nombre: string;
  /** Código ISO de la moneda de la cuenta ("UYU", "USD"...). No cambia. */
  moneda: string;
  saldoInicialCentavos: number;
  /** Saldo inicial + ingresos − gastos + ajustes − transferencias salientes + entrantes, calculado al leer y en la moneda de la cuenta. */
  saldoCentavos: number;
  /** Oculta: no se ofrece al cargar movimientos nuevos, pero conserva saldo e historial. */
  oculta: boolean;
  /** Tiene movimientos (no eliminados), contando las transferencias que le llegan. Con alguno no se puede eliminar, solo ocultar. */
  tieneMovimientos: boolean;
  creadoEn: Date;
};

/** Mismo criterio que categorias.ts: se siembran solas la primera vez que hacen falta. */
async function asegurarCuentasPorDefecto(cliente: ClienteDb, userId: string): Promise<void> {
  const [fila] = await cliente.db
    .select({ total: count() })
    .from(esquema.cuentasFinancieras)
    .where(eq(esquema.cuentasFinancieras.userId, userId));

  if ((fila?.total ?? 0) > 0) return;

  const moneda = await obtenerMonedaBase(cliente, userId);
  await cliente.db
    .insert(esquema.cuentasFinancieras)
    .values(CUENTAS_FINANCIERAS_POR_DEFECTO.map((nombre) => ({ userId, nombre, moneda })));
}

/**
 * Lo que mueven los movimientos y los ajustes en cada cuenta de la persona.
 * Dos consultas agrupadas en vez de un join doble: unir movimientos y ajustes a
 * la vez multiplicaría las filas y descuadraría las sumas.
 */
async function cambiosPorCuenta(
  cliente: ClienteDb,
  userId: string,
): Promise<Map<string, { neto: number; movimientos: number }>> {
  const [deMovimientos, deAjustes, deTransferenciasEntrantes] = await Promise.all([
    cliente.db
      .select({
        cuentaId: esquema.movimientos.cuentaFinancieraId,
        // Ingreso suma; gasto y transferencia (en la cuenta de origen) restan.
        neto: sql<number>`coalesce(sum(case when ${esquema.movimientos.tipo} = 'ingreso' then ${esquema.movimientos.importeCentavos} else -${esquema.movimientos.importeCentavos} end), 0)::bigint`.mapWith(
          Number,
        ),
        movimientos: count(),
      })
      .from(esquema.movimientos)
      .where(and(eq(esquema.movimientos.userId, userId), isNull(esquema.movimientos.eliminadoEn)))
      .groupBy(esquema.movimientos.cuentaFinancieraId),
    cliente.db
      .select({
        cuentaId: esquema.ajustesDeSaldo.cuentaFinancieraId,
        neto: sql<number>`coalesce(sum(${esquema.ajustesDeSaldo.diferenciaCentavos}), 0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(esquema.ajustesDeSaldo)
      .where(eq(esquema.ajustesDeSaldo.userId, userId))
      .groupBy(esquema.ajustesDeSaldo.cuentaFinancieraId),
    // Las transferencias le suman a la cuenta de destino lo que llega, en su moneda.
    cliente.db
      .select({
        cuentaId: esquema.movimientos.cuentaDestinoId,
        neto: sql<number>`coalesce(sum(${esquema.movimientos.importeConvertidoCentavos}), 0)::bigint`.mapWith(
          Number,
        ),
        movimientos: count(),
      })
      .from(esquema.movimientos)
      .where(
        and(
          eq(esquema.movimientos.userId, userId),
          isNull(esquema.movimientos.eliminadoEn),
          isNotNull(esquema.movimientos.cuentaDestinoId),
        ),
      )
      .groupBy(esquema.movimientos.cuentaDestinoId),
  ]);

  const resultado = new Map<string, { neto: number; movimientos: number }>();
  for (const fila of deMovimientos) {
    resultado.set(fila.cuentaId, { neto: fila.neto, movimientos: fila.movimientos });
  }
  for (const fila of deAjustes) {
    const previo = resultado.get(fila.cuentaId) ?? { neto: 0, movimientos: 0 };
    resultado.set(fila.cuentaId, { ...previo, neto: previo.neto + fila.neto });
  }
  for (const fila of deTransferenciasEntrantes) {
    if (fila.cuentaId === null) continue;
    const previo = resultado.get(fila.cuentaId) ?? { neto: 0, movimientos: 0 };
    resultado.set(fila.cuentaId, {
      neto: previo.neto + fila.neto,
      movimientos: previo.movimientos + fila.movimientos,
    });
  }
  return resultado;
}

/** Las cuentas activas de la persona (ocultas incluidas), las visibles primero. */
export async function listarCuentasFinancieras(
  cliente: ClienteDb,
  userId: string,
): Promise<CuentaFinanciera[]> {
  await asegurarCuentasPorDefecto(cliente, userId);

  const [filas, cambios] = await Promise.all([
    cliente.db
      .select({
        id: esquema.cuentasFinancieras.id,
        nombre: esquema.cuentasFinancieras.nombre,
        moneda: esquema.cuentasFinancieras.moneda,
        saldoInicialCentavos: esquema.cuentasFinancieras.saldoInicialCentavos,
        ocultaEn: esquema.cuentasFinancieras.ocultaEn,
        creadoEn: esquema.cuentasFinancieras.creadoEn,
      })
      .from(esquema.cuentasFinancieras)
      .where(
        and(
          eq(esquema.cuentasFinancieras.userId, userId),
          isNull(esquema.cuentasFinancieras.eliminadoEn),
        ),
      )
      .orderBy(esquema.cuentasFinancieras.nombre),
    cambiosPorCuenta(cliente, userId),
  ]);

  const cuentas = filas.map((fila) => {
    const cambio = cambios.get(fila.id);
    return {
      id: fila.id,
      nombre: fila.nombre,
      moneda: fila.moneda,
      saldoInicialCentavos: fila.saldoInicialCentavos,
      saldoCentavos: fila.saldoInicialCentavos + (cambio?.neto ?? 0),
      oculta: fila.ocultaEn !== null,
      tieneMovimientos: (cambio?.movimientos ?? 0) > 0,
      creadoEn: fila.creadoEn,
    };
  });

  // Las ocultas al final, sin perder el orden por nombre dentro de cada grupo.
  return [...cuentas.filter((c) => !c.oculta), ...cuentas.filter((c) => c.oculta)];
}

/** Una cuenta activa de la persona, o null si no existe, es de otra persona o está eliminada. */
export async function obtenerCuentaFinanciera(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<CuentaFinanciera | null> {
  const cuentas = await listarCuentasFinancieras(cliente, userId);
  return cuentas.find((cuenta) => cuenta.id === id) ?? null;
}

async function existeActivaConNombre(
  cliente: ClienteDb,
  userId: string,
  nombre: string,
  excluirId?: string,
): Promise<boolean> {
  const fila = await cliente.db.query.cuentasFinancieras.findFirst({
    where: () =>
      and(
        eq(esquema.cuentasFinancieras.userId, userId),
        isNull(esquema.cuentasFinancieras.eliminadoEn),
        sql`lower(${esquema.cuentasFinancieras.nombre}) = lower(${nombre})`,
      ),
    columns: { id: true },
  });
  return fila !== undefined && fila.id !== excluirId;
}

export class NombreDeCuentaEnUso extends Error {}

/**
 * Crea una cuenta. Sin `moneda`, nace en la moneda base de la persona; con ella, en esa
 * (por ejemplo una caja de ahorro en dólares). La moneda no se puede cambiar después:
 * todos los importes de la cuenta están en ella.
 */
export async function crearCuentaFinanciera(
  cliente: ClienteDb,
  userId: string,
  nombre: string,
  saldoInicialCentavos: number,
  moneda?: string,
): Promise<CuentaFinanciera> {
  if (await existeActivaConNombre(cliente, userId, nombre)) {
    throw new NombreDeCuentaEnUso(nombre);
  }

  const [fila] = await cliente.db
    .insert(esquema.cuentasFinancieras)
    .values({
      userId,
      nombre,
      saldoInicialCentavos,
      moneda: moneda ?? (await obtenerMonedaBase(cliente, userId)),
    })
    .returning({
      id: esquema.cuentasFinancieras.id,
      nombre: esquema.cuentasFinancieras.nombre,
      moneda: esquema.cuentasFinancieras.moneda,
      saldoInicialCentavos: esquema.cuentasFinancieras.saldoInicialCentavos,
      creadoEn: esquema.cuentasFinancieras.creadoEn,
    });

  if (!fila) throw new Error("No se pudo crear la cuenta.");
  return {
    ...fila,
    saldoCentavos: fila.saldoInicialCentavos,
    oculta: false,
    tieneMovimientos: false,
  };
}

/**
 * Cambia el nombre de una cuenta. El saldo no se edita acá: se carga con
 * `ajustarSaldoDeCuenta`, que deja constancia en el historial de la cuenta.
 */
export async function renombrarCuentaFinanciera(
  cliente: ClienteDb,
  userId: string,
  id: string,
  nombre: string,
): Promise<{ id: string } | null> {
  if (await existeActivaConNombre(cliente, userId, nombre, id)) {
    throw new NombreDeCuentaEnUso(nombre);
  }

  const [fila] = await cliente.db
    .update(esquema.cuentasFinancieras)
    .set({ nombre })
    .where(
      and(
        eq(esquema.cuentasFinancieras.id, id),
        eq(esquema.cuentasFinancieras.userId, userId),
        isNull(esquema.cuentasFinancieras.eliminadoEn),
      ),
    )
    .returning({ id: esquema.cuentasFinancieras.id });

  return fila ?? null;
}

export type AjusteDeSaldo = {
  id: string;
  fecha: Date;
  saldoIndicadoCentavos: number;
  diferenciaCentavos: number;
};

/** El saldo indicado ya es el que tiene la cuenta: no hay nada que ajustar. */
export class SaldoSinCambios extends Error {}

/**
 * Carga manual del saldo: la persona dice cuánto dinero tiene hoy en la cuenta
 * y se registra la diferencia contra el saldo que la cuenta mostraba. No es un
 * movimiento (no pertenece a un período ni cuenta como ingreso o gasto), pero
 * queda en el historial de la cuenta y suma al saldo y al disponible.
 *
 * Es una foto de ese momento: los movimientos que se carguen después mueven el
 * saldo a partir de ahí. Devuelve null si la cuenta no existe (o no es suya).
 */
export async function ajustarSaldoDeCuenta(
  cliente: ClienteDb,
  userId: string,
  id: string,
  saldoIndicadoCentavos: number,
): Promise<AjusteDeSaldo | null> {
  const cuenta = await obtenerCuentaFinanciera(cliente, userId, id);
  if (!cuenta) return null;

  const diferenciaCentavos = saldoIndicadoCentavos - cuenta.saldoCentavos;
  if (diferenciaCentavos === 0) throw new SaldoSinCambios();

  const [fila] = await cliente.db
    .insert(esquema.ajustesDeSaldo)
    .values({ userId, cuentaFinancieraId: id, saldoIndicadoCentavos, diferenciaCentavos })
    .returning({
      id: esquema.ajustesDeSaldo.id,
      fecha: esquema.ajustesDeSaldo.fecha,
      saldoIndicadoCentavos: esquema.ajustesDeSaldo.saldoIndicadoCentavos,
      diferenciaCentavos: esquema.ajustesDeSaldo.diferenciaCentavos,
    });

  if (!fila) throw new Error("No se pudo guardar el ajuste de saldo.");
  return fila;
}

/**
 * Oculta o vuelve a mostrar una cuenta. Oculta, deja de ofrecerse al cargar
 * movimientos nuevos, pero conserva su saldo (que sigue sumando al disponible)
 * y su historial. Es idempotente. Devuelve false si la cuenta no existe.
 */
export async function cambiarVisibilidadDeCuenta(
  cliente: ClienteDb,
  userId: string,
  id: string,
  oculta: boolean,
): Promise<boolean> {
  const [fila] = await cliente.db
    .update(esquema.cuentasFinancieras)
    .set({ ocultaEn: oculta ? new Date() : null })
    .where(
      and(
        eq(esquema.cuentasFinancieras.id, id),
        eq(esquema.cuentasFinancieras.userId, userId),
        isNull(esquema.cuentasFinancieras.eliminadoEn),
      ),
    )
    .returning({ id: esquema.cuentasFinancieras.id });

  return fila !== undefined;
}

/** La cuenta tiene movimientos: se puede ocultar, no eliminar. */
export class CuentaConMovimientos extends Error {}

/**
 * Borrado lógico, solo para una cuenta sin movimientos (los eliminados no
 * cuentan: ya no se ven). Con movimientos, falla: hay que ocultarla. El saldo
 * que tuviera por su saldo inicial o sus ajustes deja de sumar al disponible.
 * Devuelve false si la cuenta no existe.
 */
export async function eliminarCuentaFinanciera(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<boolean> {
  const cuenta = await obtenerCuentaFinanciera(cliente, userId, id);
  if (!cuenta) return false;
  if (cuenta.tieneMovimientos) throw new CuentaConMovimientos(id);

  const [fila] = await cliente.db
    .update(esquema.cuentasFinancieras)
    .set({ eliminadoEn: new Date() })
    .where(
      and(
        eq(esquema.cuentasFinancieras.id, id),
        eq(esquema.cuentasFinancieras.userId, userId),
        isNull(esquema.cuentasFinancieras.eliminadoEn),
      ),
    )
    .returning({ id: esquema.cuentasFinancieras.id });

  return fila !== undefined;
}

// --- Historial ---

/**
 * Un renglón del historial de una cuenta: o un movimiento o un ajuste manual.
 * `montoCentavos` es siempre el efecto sobre el saldo, con signo.
 */
export type ItemDeHistorial =
  | {
      origen: "movimiento";
      id: string;
      fecha: Date;
      montoCentavos: number;
      tipo: "ingreso" | "gasto" | "neutro";
      descripcion: string;
      categoria: { nombre: string; color: string };
      /** Solo en una transferencia: de qué cuenta a cuál. */
      transferencia: { desde: string; hacia: string } | null;
      /** La conversión del movimiento (ver esquema/finanzas.ts): con qué tasa y a cuánto quedó. */
      cambio: {
        tipoDeCambio: number;
        manual: boolean;
        /** Ingreso o gasto: lo que vale en la moneda base. Transferencia: lo que llegó a la cuenta de destino. */
        convertidoCentavos: number;
        monedaDeOrigen: string;
        /** Solo en una transferencia: la moneda de la cuenta de destino. */
        monedaDeDestino: string | null;
      };
      /** El período al que pertenece el movimiento. Los ajustes manuales no tienen. */
      periodo: { nombre: string };
    }
  | {
      origen: "ajuste";
      id: string;
      fecha: Date;
      montoCentavos: number;
      saldoIndicadoCentavos: number;
    }
  | {
      /** La "Carga inicial": el saldo con el que se creó la cuenta (solo si no era cero). */
      origen: "saldo_inicial";
      id: string;
      fecha: Date;
      montoCentavos: number;
    };

const LIMITE_MAXIMO_HISTORIAL = 100;

type FilaDeHistorial = {
  origen: "movimiento" | "ajuste" | "saldo_inicial";
  id: string;
  /** Instante ISO 8601 en UTC: el driver puede devolver `fecha` como texto, así que se arma acá. */
  fecha_iso: string;
  /** Las columnas son bigint: el driver las entrega como texto en una consulta cruda. */
  monto_centavos: number | string;
  tipo: "ingreso" | "gasto" | "neutro" | null;
  descripcion: string | null;
  categoria_nombre: string | null;
  categoria_color: string | null;
  saldo_indicado_centavos: number | string | null;
  periodo_nombre: string | null;
  origen_nombre: string | null;
  destino_nombre: string | null;
  moneda_origen: string | null;
  moneda_destino: string | null;
  /** numeric y bigint llegan como texto en una consulta cruda. */
  tipo_de_cambio: number | string | null;
  importe_convertido_centavos: number | string | null;
  cambio_manual: boolean | null;
};

/**
 * El historial de una cuenta: sus movimientos y sus ajustes manuales juntos,
 * del más nuevo al más viejo (por fecha del movimiento o del ajuste), paginado.
 * Si la cuenta se creó con saldo, la "Carga inicial" va siempre al final: es el
 * punto de partida, aunque haya movimientos con fecha anterior a su creación.
 * Devuelve null si la cuenta no existe, es de otra persona o está eliminada.
 */
export async function historialDeCuenta(
  cliente: ClienteDb,
  userId: string,
  id: string,
  { limit = 20, offset = 0 }: { limit?: number | undefined; offset?: number | undefined } = {},
): Promise<{ items: ItemDeHistorial[]; total: number } | null> {
  const cuenta = await obtenerCuentaFinanciera(cliente, userId, id);
  if (!cuenta) return null;

  const limite = Math.min(limit, LIMITE_MAXIMO_HISTORIAL);
  const m = esquema.movimientos;
  const a = esquema.ajustesDeSaldo;
  const c = esquema.categorias;
  const p = esquema.periodos;

  const cf = esquema.cuentasFinancieras;
  const [resultado, [totalMovimientos], [totalAjustes]] = await Promise.all([
    cliente.db.execute<FilaDeHistorial>(sql`
      select * from (
      select
        'movimiento'::text as origen,
        ${m.id}::text as id,
        ${m.fecha} as fecha,
        to_char(${m.fecha} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as fecha_iso,
        -- Ingreso suma; gasto resta; una transferencia resta en la cuenta de origen y suma en la de destino.
        case
          when ${m.tipo} = 'ingreso' then ${m.importeCentavos}
          when ${m.tipo} = 'gasto' then -${m.importeCentavos}
          when ${m.cuentaFinancieraId} = ${id} then -${m.importeCentavos}
          else ${m.importeConvertidoCentavos}
        end as monto_centavos,
        ${m.tipo} as tipo,
        ${m.descripcion} as descripcion,
        ${c.nombre} as categoria_nombre,
        ${c.color} as categoria_color,
        null::bigint as saldo_indicado_centavos,
        ${p.nombre} as periodo_nombre,
        co.nombre as origen_nombre,
        cd.nombre as destino_nombre,
        co.moneda as moneda_origen,
        cd.moneda as moneda_destino,
        ${m.tipoDeCambio} as tipo_de_cambio,
        ${m.importeConvertidoCentavos} as importe_convertido_centavos,
        ${m.cambioManual} as cambio_manual
      from ${m}
      join ${c} on ${c.id} = ${m.categoriaId}
      join ${p} on ${p.id} = ${m.periodoId}
      join ${esquema.cuentasFinancieras} co on co.id = ${m.cuentaFinancieraId}
      left join ${esquema.cuentasFinancieras} cd on cd.id = ${m.cuentaDestinoId}
      where ${m.userId} = ${userId}
        and (${m.cuentaFinancieraId} = ${id} or ${m.cuentaDestinoId} = ${id})
        and ${m.eliminadoEn} is null
      union all
      select
        'ajuste'::text,
        ${a.id}::text,
        ${a.fecha},
        to_char(${a.fecha} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        ${a.diferenciaCentavos},
        null::text,
        null::text,
        null::text,
        null::text,
        ${a.saldoIndicadoCentavos},
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::numeric,
        null::bigint,
        null::boolean
      from ${a}
      where ${a.userId} = ${userId}
        and ${a.cuentaFinancieraId} = ${id}
      union all
      select
        'saldo_inicial'::text,
        ${cf.id}::text,
        ${cf.creadoEn},
        to_char(${cf.creadoEn} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        ${cf.saldoInicialCentavos},
        null::text,
        null::text,
        null::text,
        null::text,
        null::bigint,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        null::numeric,
        null::bigint,
        null::boolean
      from ${cf}
      where ${cf.userId} = ${userId}
        and ${cf.id} = ${id}
        and ${cf.saldoInicialCentavos} <> 0
      ) historial
      -- La carga inicial siempre al final; el resto del más nuevo al más viejo.
      order by (origen = 'saldo_inicial'), fecha desc, id desc
      limit ${limite} offset ${offset}
    `),
    cliente.db
      .select({ total: count() })
      .from(m)
      .where(
        and(
          eq(m.userId, userId),
          or(eq(m.cuentaFinancieraId, id), eq(m.cuentaDestinoId, id)),
          isNull(m.eliminadoEn),
        ),
      ),
    cliente.db
      .select({ total: count() })
      .from(a)
      .where(and(eq(a.userId, userId), eq(a.cuentaFinancieraId, id))),
  ]);

  const items = resultado.rows.map((fila): ItemDeHistorial => {
    if (fila.origen === "saldo_inicial") {
      return {
        origen: "saldo_inicial",
        id: fila.id,
        fecha: new Date(fila.fecha_iso),
        montoCentavos: Number(fila.monto_centavos),
      };
    }
    if (fila.origen === "ajuste") {
      return {
        origen: "ajuste",
        id: fila.id,
        fecha: new Date(fila.fecha_iso),
        montoCentavos: Number(fila.monto_centavos),
        saldoIndicadoCentavos: Number(fila.saldo_indicado_centavos ?? 0),
      };
    }
    return {
      origen: "movimiento",
      id: fila.id,
      fecha: new Date(fila.fecha_iso),
      montoCentavos: Number(fila.monto_centavos),
      tipo: fila.tipo ?? "gasto",
      descripcion: fila.descripcion ?? "",
      categoria: { nombre: fila.categoria_nombre ?? "", color: fila.categoria_color ?? "#64748b" },
      periodo: { nombre: fila.periodo_nombre ?? "" },
      cambio: {
        tipoDeCambio: Number(fila.tipo_de_cambio ?? 1),
        manual: fila.cambio_manual ?? false,
        convertidoCentavos: Number(fila.importe_convertido_centavos ?? 0),
        monedaDeOrigen: fila.moneda_origen ?? "",
        monedaDeDestino: fila.tipo === "neutro" ? fila.moneda_destino : null,
      },
      transferencia:
        fila.tipo === "neutro"
          ? { desde: fila.origen_nombre ?? "", hacia: fila.destino_nombre ?? "" }
          : null,
    };
  });

  const cargaInicial = cuenta.saldoInicialCentavos !== 0 ? 1 : 0;
  return {
    items,
    total: (totalMovimientos?.total ?? 0) + (totalAjustes?.total ?? 0) + cargaInicial,
  };
}

export { LIMITE_MAXIMO_HISTORIAL };

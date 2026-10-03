// Lógica de negocio de los movimientos: ingresos, gastos y transferencias entre
// cuentas (tipo "neutro": ni ingreso ni gasto, no cuenta en los totales).
//
// Una transferencia tiene cuenta de origen (`cuentaFinancieraId`) y de destino
// (`cuentaDestinoId`), y siempre usa la categoría especial de transferencias; esa
// categoría, a su vez, solo la pueden usar las transferencias.
//
// Igual que categorías y cuentas: toda consulta filtra por `userId`, que sale
// siempre de la sesión (CLAUDE.md, Principios de arquitectura). Un movimiento
// se borra lógicamente (`eliminadoEn`), como pide
// docs/guias/seguridad-y-datos.md para los datos de usuario.
//
// Cada movimiento tiene fecha y hora, y pertenece a un solo período: el que
// contiene esa fecha (ver periodos.ts). Se deduce al crear y al editar; una
// fecha que no cae en ningún período se rechaza.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { SISTEMA_TRANSFERENCIA } from "@gestoria/shared";
import { and, count, eq, ilike, isNull, or } from "drizzle-orm";
import { obtenerPeriodoAbierto, obtenerPeriodoQueContiene } from "./periodos.ts";

export type Movimiento = {
  id: string;
  tipo: "ingreso" | "gasto" | "neutro";
  importeCentavos: number;
  descripcion: string;
  fecha: Date;
  periodoId: number;
  creadoEn: Date;
  categoria: { id: number; nombre: string; color: string };
  /** La cuenta del movimiento; en una transferencia, la de origen. */
  cuentaFinanciera: { id: string; nombre: string };
  /** Solo en una transferencia: la cuenta a la que llega la plata. */
  cuentaDestino: { id: string; nombre: string } | null;
};

export type DatosNuevoMovimiento = {
  tipo: "ingreso" | "gasto" | "neutro";
  importeCentavos: number;
  descripcion: string;
  categoriaId: number;
  cuentaFinancieraId: string;
  /** Obligatoria en una transferencia ("neutro") y prohibida en el resto. */
  cuentaDestinoId?: string | null | undefined;
  fecha: Date;
};

/**
 * La fecha no cae en ningún período de la persona. `sinPeriodoAbierto` distingue
 * el caso más común (todavía no abrió uno, o cerró el último) de una fecha
 * puntual que quedó en un hueco o antes del primer período.
 */
export class FechaFueraDePeriodos extends Error {
  readonly sinPeriodoAbierto: boolean;

  constructor(sinPeriodoAbierto: boolean) {
    super(sinPeriodoAbierto ? "sin período abierto" : "fecha fuera de períodos");
    this.sinPeriodoAbierto = sinPeriodoAbierto;
  }
}

/** Cuál de las referencias no es válida para este usuario (y, si hace falta, por qué). */
export class ReferenciaInvalida extends Error {
  readonly campo: "categoriaId" | "cuentaFinancieraId" | "cuentaDestinoId";
  /** Explicación para la persona; sin ella la ruta usa un mensaje genérico del campo. */
  readonly explicacion: string | undefined;

  constructor(campo: ReferenciaInvalida["campo"], explicacion?: string) {
    super(campo);
    this.campo = campo;
    this.explicacion = explicacion;
  }
}

/**
 * Valida categoría y cuentas del movimiento.
 *
 * - Una cuenta oculta no se ofrece para movimientos nuevos. `actuales` son las
 *   cuentas que ya tiene el movimiento que se está editando: si siguen siendo
 *   esas, se aceptan aunque se hayan ocultado después.
 * - Una transferencia usa la categoría especial y lleva cuenta de destino
 *   distinta de la de origen; un ingreso o gasto no puede usar la especial.
 */
async function validarReferencias(
  cliente: ClienteDb,
  userId: string,
  datos: Pick<
    DatosNuevoMovimiento,
    "tipo" | "categoriaId" | "cuentaFinancieraId" | "cuentaDestinoId"
  >,
  actuales: {
    cuentaFinancieraId?: string | undefined;
    cuentaDestinoId?: string | null | undefined;
  } = {},
): Promise<void> {
  const cuentaActiva = (id: string, aceptaOculta: boolean) =>
    cliente.db.query.cuentasFinancieras.findFirst({
      where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
        andCol(
          eqCol(tabla.id, id),
          eqCol(tabla.userId, userId),
          isNullCol(tabla.eliminadoEn),
          aceptaOculta ? undefined : isNullCol(tabla.ocultaEn),
        ),
      columns: { id: true },
    });

  const [categoria, origen, destino] = await Promise.all([
    cliente.db.query.categorias.findFirst({
      where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
        andCol(
          eqCol(tabla.id, datos.categoriaId),
          eqCol(tabla.userId, userId),
          isNullCol(tabla.eliminadoEn),
        ),
      columns: { id: true, sistema: true },
    }),
    cuentaActiva(
      datos.cuentaFinancieraId,
      actuales.cuentaFinancieraId === datos.cuentaFinancieraId,
    ),
    datos.cuentaDestinoId
      ? cuentaActiva(datos.cuentaDestinoId, actuales.cuentaDestinoId === datos.cuentaDestinoId)
      : Promise.resolve(undefined),
  ]);

  if (!categoria) throw new ReferenciaInvalida("categoriaId");
  if (!origen) throw new ReferenciaInvalida("cuentaFinancieraId");

  if (datos.tipo === "neutro") {
    if (categoria.sistema !== SISTEMA_TRANSFERENCIA) {
      throw new ReferenciaInvalida(
        "categoriaId",
        "Una transferencia entre cuentas siempre usa la categoría de transferencias.",
      );
    }
    if (!destino) throw new ReferenciaInvalida("cuentaDestinoId");
    if (datos.cuentaDestinoId === datos.cuentaFinancieraId) {
      throw new ReferenciaInvalida(
        "cuentaDestinoId",
        "La cuenta de destino tiene que ser distinta de la de origen.",
      );
    }
  } else if (categoria.sistema !== null) {
    throw new ReferenciaInvalida(
      "categoriaId",
      "Esa categoría es solo para transferencias entre cuentas.",
    );
  }
}

/** El período al que pertenece una fecha, o error si no cae en ninguno. */
async function periodoDe(cliente: ClienteDb, userId: string, fecha: Date): Promise<number> {
  const periodo = await obtenerPeriodoQueContiene(cliente, userId, fecha);
  if (periodo) return periodo.id;

  throw new FechaFueraDePeriodos((await obtenerPeriodoAbierto(cliente, userId)) === null);
}

function aMovimiento(fila: {
  id: string;
  tipo: string;
  importeCentavos: number;
  descripcion: string;
  fecha: Date;
  periodoId: number;
  creadoEn: Date;
  categoria: { id: number; nombre: string; color: string } | null;
  cuentaFinanciera: { id: string; nombre: string } | null;
  cuentaDestino: { id: string; nombre: string } | null;
}): Movimiento {
  return {
    id: fila.id,
    tipo: fila.tipo as "ingreso" | "gasto" | "neutro",
    importeCentavos: fila.importeCentavos,
    descripcion: fila.descripcion,
    fecha: fila.fecha,
    periodoId: fila.periodoId,
    creadoEn: fila.creadoEn,
    // No nulos en la práctica: la referencia se valida al crear/editar y la
    // categoría/cuenta solo se borra lógicamente, nunca desaparece de verdad.
    categoria: fila.categoria ?? { id: 0, nombre: "(sin categoría)", color: "#64748b" },
    cuentaFinanciera: fila.cuentaFinanciera ?? { id: "", nombre: "(sin cuenta)" },
    cuentaDestino: fila.cuentaDestino,
  };
}

export type FiltrosMovimientos = {
  periodoId?: number | undefined;
  categoriaId?: number | undefined;
  /** Movimientos de la cuenta: los suyos y las transferencias que le llegan o le salen. */
  cuentaFinancieraId?: string | undefined;
  tipo?: "ingreso" | "gasto" | "neutro" | undefined;
  busqueda?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

const LIMITE_MAXIMO_LISTADO = 100;

export async function listarMovimientos(
  cliente: ClienteDb,
  userId: string,
  filtros: FiltrosMovimientos = {},
): Promise<{ movimientos: Movimiento[]; total: number }> {
  const limit = Math.min(filtros.limit ?? 20, LIMITE_MAXIMO_LISTADO);
  const offset = filtros.offset ?? 0;
  const busqueda = filtros.busqueda?.trim();

  const condiciones = [
    eq(esquema.movimientos.userId, userId),
    isNull(esquema.movimientos.eliminadoEn),
    filtros.periodoId !== undefined
      ? eq(esquema.movimientos.periodoId, filtros.periodoId)
      : undefined,
    filtros.categoriaId !== undefined
      ? eq(esquema.movimientos.categoriaId, filtros.categoriaId)
      : undefined,
    filtros.cuentaFinancieraId
      ? or(
          eq(esquema.movimientos.cuentaFinancieraId, filtros.cuentaFinancieraId),
          eq(esquema.movimientos.cuentaDestinoId, filtros.cuentaFinancieraId),
        )
      : undefined,
    filtros.tipo ? eq(esquema.movimientos.tipo, filtros.tipo) : undefined,
    busqueda ? ilike(esquema.movimientos.descripcion, `%${busqueda}%`) : undefined,
  ].filter((condicion) => condicion !== undefined);
  const donde = and(...condiciones);

  const [filas, [totalFila]] = await Promise.all([
    cliente.db.query.movimientos.findMany({
      where: () => donde,
      with: {
        categoria: { columns: { id: true, nombre: true, color: true } },
        cuentaFinanciera: { columns: { id: true, nombre: true } },
        cuentaDestino: { columns: { id: true, nombre: true } },
      },
      // Más reciente primero; `creadoEn` desempata cuando dos movimientos
      // comparten fecha, para que el orden no salte entre pedidos.
      orderBy: (tabla, { desc: descCol }) => [descCol(tabla.fecha), descCol(tabla.creadoEn)],
      limit,
      offset,
    }),
    cliente.db.select({ total: count() }).from(esquema.movimientos).where(donde),
  ]);

  return { movimientos: filas.map(aMovimiento), total: totalFila?.total ?? 0 };
}

export async function crearMovimiento(
  cliente: ClienteDb,
  userId: string,
  datos: DatosNuevoMovimiento,
): Promise<Movimiento> {
  await validarReferencias(cliente, userId, datos);
  const periodoId = await periodoDe(cliente, userId, datos.fecha);

  const [fila] = await cliente.db
    .insert(esquema.movimientos)
    .values({ userId, ...valoresDe(datos), periodoId })
    .returning({ id: esquema.movimientos.id });

  if (!fila) throw new Error("No se pudo crear el movimiento.");
  return await obtenerMovimiento(cliente, userId, fila.id);
}

/** Lo que se guarda: solo una transferencia lleva cuenta de destino. */
function valoresDe(datos: DatosNuevoMovimiento) {
  const { cuentaDestinoId, ...resto } = datos;
  return { ...resto, cuentaDestinoId: datos.tipo === "neutro" ? (cuentaDestinoId ?? null) : null };
}

async function obtenerMovimiento(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<Movimiento> {
  const fila = await cliente.db.query.movimientos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol }) =>
      andCol(eqCol(tabla.id, id), eqCol(tabla.userId, userId)),
    with: {
      categoria: { columns: { id: true, nombre: true, color: true } },
      cuentaFinanciera: { columns: { id: true, nombre: true } },
      cuentaDestino: { columns: { id: true, nombre: true } },
    },
  });
  if (!fila) throw new Error(`Movimiento ${id} no encontrado tras crearlo/editarlo.`);
  return aMovimiento(fila);
}

export async function editarMovimiento(
  cliente: ClienteDb,
  userId: string,
  id: string,
  datos: DatosNuevoMovimiento,
): Promise<Movimiento | null> {
  const actual = await cliente.db.query.movimientos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(eqCol(tabla.id, id), eqCol(tabla.userId, userId), isNullCol(tabla.eliminadoEn)),
    columns: { cuentaFinancieraId: true, cuentaDestinoId: true },
  });
  if (!actual) return null;

  await validarReferencias(cliente, userId, datos, actual);
  const periodoId = await periodoDe(cliente, userId, datos.fecha);

  const [fila] = await cliente.db
    .update(esquema.movimientos)
    .set({ ...valoresDe(datos), periodoId })
    .where(
      and(
        eq(esquema.movimientos.id, id),
        eq(esquema.movimientos.userId, userId),
        isNull(esquema.movimientos.eliminadoEn),
      ),
    )
    .returning({ id: esquema.movimientos.id });

  return fila ? await obtenerMovimiento(cliente, userId, fila.id) : null;
}

export async function eliminarMovimiento(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<boolean> {
  const [fila] = await cliente.db
    .update(esquema.movimientos)
    .set({ eliminadoEn: new Date() })
    .where(
      and(
        eq(esquema.movimientos.id, id),
        eq(esquema.movimientos.userId, userId),
        isNull(esquema.movimientos.eliminadoEn),
      ),
    )
    .returning({ id: esquema.movimientos.id });

  return fila !== undefined;
}

/**
 * Crea una copia de un movimiento existente, con la fecha y hora de ahora:
 * duplicar sirve para repetir algo rápido ("el mismo café de siempre"), no
 * para reescribir el pasado. Cae en el período abierto; si no hay uno, falla
 * como cualquier movimiento sin período.
 */
export async function duplicarMovimiento(
  cliente: ClienteDb,
  userId: string,
  id: string,
): Promise<Movimiento | null> {
  const original = await cliente.db.query.movimientos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(eqCol(tabla.id, id), eqCol(tabla.userId, userId), isNullCol(tabla.eliminadoEn)),
  });
  if (!original) return null;

  return crearMovimiento(cliente, userId, {
    tipo: original.tipo as "ingreso" | "gasto" | "neutro",
    importeCentavos: original.importeCentavos,
    descripcion: original.descripcion,
    categoriaId: original.categoriaId,
    cuentaFinancieraId: original.cuentaFinancieraId,
    cuentaDestinoId: original.cuentaDestinoId,
    fecha: new Date(),
  });
}

export { LIMITE_MAXIMO_LISTADO };

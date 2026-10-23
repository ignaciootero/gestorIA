// Lógica de negocio de los presupuestos: un límite por categoría para cada
// período, sin historial (docs/decisiones.md) — fijarlo de nuevo actualiza el
// mismo, no guarda versiones anteriores, y el mismo límite vale para todos los
// períodos. Lo que sí varía es cuánto se gastó, que se calcula al leer contra
// los movimientos reales del período que se mira.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { and, eq, isNull, sql } from "drizzle-orm";

export type PresupuestoConGasto = {
  categoriaId: number;
  nombre: string;
  presupuestadoCentavos: number;
  gastadoCentavos: number;
  /** Negativo si se superó el presupuesto. */
  restanteCentavos: number;
};

export async function listarPresupuestos(
  cliente: ClienteDb,
  userId: string,
  periodoId: number,
): Promise<PresupuestoConGasto[]> {
  const gastadoCentavos =
    sql<number>`coalesce(sum(${esquema.movimientos.importeConvertidoCentavos}), 0)::bigint`.mapWith(
      Number,
    );

  const filas = await cliente.db
    .select({
      categoriaId: esquema.categorias.id,
      nombre: esquema.categorias.nombre,
      presupuestadoCentavos: esquema.presupuestos.montoCentavos,
      gastadoCentavos,
    })
    .from(esquema.presupuestos)
    .innerJoin(esquema.categorias, eq(esquema.categorias.id, esquema.presupuestos.categoriaId))
    .leftJoin(
      esquema.movimientos,
      and(
        eq(esquema.movimientos.categoriaId, esquema.presupuestos.categoriaId),
        eq(esquema.movimientos.userId, userId),
        eq(esquema.movimientos.tipo, "gasto"),
        isNull(esquema.movimientos.eliminadoEn),
        eq(esquema.movimientos.periodoId, periodoId),
      ),
    )
    .where(and(eq(esquema.presupuestos.userId, userId), isNull(esquema.categorias.eliminadoEn)))
    .groupBy(esquema.categorias.id, esquema.categorias.nombre, esquema.presupuestos.montoCentavos)
    .orderBy(esquema.categorias.nombre);

  return filas.map((fila) => ({
    ...fila,
    restanteCentavos: fila.presupuestadoCentavos - fila.gastadoCentavos,
  }));
}

export class CategoriaInexistente extends Error {}

/** La categoría de transferencias no es un gasto: no tiene sentido ponerle un límite. */
export class CategoriaSinPresupuesto extends Error {}

/** Fija (o actualiza) el presupuesto de una categoría. Upsert: una sola fila por categoría. */
export async function fijarPresupuesto(
  cliente: ClienteDb,
  userId: string,
  categoriaId: number,
  montoCentavos: number,
): Promise<void> {
  const categoria = await cliente.db.query.categorias.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(
        eqCol(tabla.id, categoriaId),
        eqCol(tabla.userId, userId),
        isNullCol(tabla.eliminadoEn),
      ),
    columns: { id: true, sistema: true },
  });
  if (!categoria) throw new CategoriaInexistente(String(categoriaId));
  if (categoria.sistema !== null) throw new CategoriaSinPresupuesto(String(categoriaId));

  await cliente.db
    .insert(esquema.presupuestos)
    .values({ userId, categoriaId, montoCentavos })
    .onConflictDoUpdate({
      target: [esquema.presupuestos.userId, esquema.presupuestos.categoriaId],
      set: { montoCentavos, actualizadoEn: new Date() },
    });
}

export async function eliminarPresupuesto(
  cliente: ClienteDb,
  userId: string,
  categoriaId: number,
): Promise<boolean> {
  const [fila] = await cliente.db
    .delete(esquema.presupuestos)
    .where(
      and(
        eq(esquema.presupuestos.userId, userId),
        eq(esquema.presupuestos.categoriaId, categoriaId),
      ),
    )
    .returning({ id: esquema.presupuestos.id });

  return fila !== undefined;
}

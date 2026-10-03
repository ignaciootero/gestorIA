// Lógica de negocio de las categorías del módulo de ingresos y gastos.
//
// Cada usuario tiene las suyas, sin excepción para el admin (CLAUDE.md,
// Privacidad): toda consulta filtra por `userId`, que sale siempre de la
// sesión (nunca de acá).
//
// - Se identifican por un número (`id`); el nombre es único entre las activas.
// - Arrancan con un set por defecto (CATEGORIAS_POR_DEFECTO, con colores lo más
//   distintos posible entre sí) más la categoría especial de las transferencias.
// - Las nuevas toman el color más distinto de los que ya existen.
// - Una categoría con movimientos no se elimina: se reemplaza por otra (existente
//   o nueva) y todo lo histórico pasa a la categoría elegida.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  CATEGORIA_DE_TRANSFERENCIA,
  CATEGORIAS_POR_DEFECTO,
  colorMasDistinto,
  SISTEMA_TRANSFERENCIA,
} from "@gestoria/shared";
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";

export type Categoria = {
  id: number;
  nombre: string;
  color: string;
  /** Código de las categorías especiales del sistema (hoy, solo "transferencia"); null en las comunes. */
  sistema: "transferencia" | null;
  /** Cuántos movimientos (no eliminados) la usan. Con alguno, no se puede eliminar. */
  movimientos: number;
  creadoEn: Date;
};

const COLUMNAS = {
  id: esquema.categorias.id,
  nombre: esquema.categorias.nombre,
  color: esquema.categorias.color,
  sistema: esquema.categorias.sistema,
  creadoEn: esquema.categorias.creadoEn,
};

type FilaDeCategoria = {
  id: number;
  nombre: string;
  color: string;
  sistema: string | null;
  creadoEn: Date;
};

function aCategoria(fila: FilaDeCategoria, movimientos: number): Categoria {
  return {
    id: fila.id,
    nombre: fila.nombre,
    color: fila.color,
    sistema: fila.sistema === SISTEMA_TRANSFERENCIA ? SISTEMA_TRANSFERENCIA : null,
    movimientos,
    creadoEn: fila.creadoEn,
  };
}

/**
 * true si el error es la violación de una restricción única concreta (la red de
 * seguridad si dos pedidos simultáneos pasan a la vez la validación previa).
 */
function violaRestriccion(error: unknown, restriccion: string): boolean {
  const origen = (error as { cause?: unknown } | null)?.cause ?? error;
  return (
    typeof origen === "object" &&
    origen !== null &&
    (origen as { code?: unknown }).code === "23505" &&
    (origen as { constraint?: unknown }).constraint === restriccion
  );
}

// --- Set por defecto y categoría especial ---

/** Un nombre libre entre las categorías activas, agregándole un número si hace falta. */
async function nombreLibre(cliente: ClienteDb, userId: string, base: string): Promise<string> {
  const existentes = await cliente.db
    .select({ nombre: esquema.categorias.nombre })
    .from(esquema.categorias)
    .where(and(eq(esquema.categorias.userId, userId), isNull(esquema.categorias.eliminadoEn)));
  const usados = new Set(existentes.map((fila) => fila.nombre.trim().toLocaleLowerCase("es")));

  if (!usados.has(base.toLocaleLowerCase("es"))) return base;
  for (let numero = 2; ; numero += 1) {
    const candidato = `${base} (${numero})`;
    if (!usados.has(candidato.toLocaleLowerCase("es"))) return candidato;
  }
}

/**
 * Asegura que la persona tenga sus categorías: el set por defecto la primera
 * vez (si no tiene ninguna, ni activa ni eliminada: no se "resucitan" las que
 * borró) y, siempre, la categoría especial de las transferencias, que también
 * les llega a quienes ya tenían categorías de antes. No es una migración: son
 * datos normales de la cuenta (CLAUDE.md, "Categorías ... como datos").
 */
async function asegurarCategoriasPorDefecto(cliente: ClienteDb, userId: string): Promise<void> {
  const [fila] = await cliente.db
    .select({ total: count() })
    .from(esquema.categorias)
    .where(eq(esquema.categorias.userId, userId));

  if ((fila?.total ?? 0) === 0) {
    // `onConflictDoNothing`: si dos pedidos siembran a la vez, el segundo no falla.
    await cliente.db
      .insert(esquema.categorias)
      .values(CATEGORIAS_POR_DEFECTO.map(({ nombre, color }) => ({ userId, nombre, color })))
      .onConflictDoNothing();
  }

  await asegurarCategoriaDeTransferencia(cliente, userId);
}

async function asegurarCategoriaDeTransferencia(cliente: ClienteDb, userId: string): Promise<void> {
  const existente = await cliente.db.query.categorias.findFirst({
    where: () =>
      and(
        eq(esquema.categorias.userId, userId),
        eq(esquema.categorias.sistema, SISTEMA_TRANSFERENCIA),
      ),
    columns: { id: true },
  });
  if (existente) return;

  // Si la persona ya tenía una categoría común con ese nombre, se le cambia el
  // suyo: la especial se identifica por su código, y no puede ser una que ya
  // tiene ingresos o gastos.
  const conflicto = await cliente.db.query.categorias.findFirst({
    where: () =>
      and(
        eq(esquema.categorias.userId, userId),
        isNull(esquema.categorias.eliminadoEn),
        sql`lower(${esquema.categorias.nombre}) = lower(${CATEGORIA_DE_TRANSFERENCIA.nombre})`,
      ),
    columns: { id: true, nombre: true },
  });
  if (conflicto) {
    const nuevoNombre = await nombreLibre(cliente, userId, `${conflicto.nombre} (propia)`);
    await cliente.db
      .update(esquema.categorias)
      .set({ nombre: nuevoNombre })
      .where(eq(esquema.categorias.id, conflicto.id));
  }

  await cliente.db
    .insert(esquema.categorias)
    .values({
      userId,
      nombre: CATEGORIA_DE_TRANSFERENCIA.nombre,
      color: CATEGORIA_DE_TRANSFERENCIA.color,
      sistema: CATEGORIA_DE_TRANSFERENCIA.sistema,
    })
    .onConflictDoNothing();
}

// --- Consultas ---

/** Cuántos movimientos (no eliminados) usa cada categoría de la persona. */
async function movimientosPorCategoria(
  cliente: ClienteDb,
  userId: string,
): Promise<Map<number, number>> {
  const filas = await cliente.db
    .select({ categoriaId: esquema.movimientos.categoriaId, total: count() })
    .from(esquema.movimientos)
    .where(and(eq(esquema.movimientos.userId, userId), isNull(esquema.movimientos.eliminadoEn)))
    .groupBy(esquema.movimientos.categoriaId);
  return new Map(filas.map((fila) => [fila.categoriaId, fila.total]));
}

/** Las categorías activas de la persona, por nombre. */
export async function listarCategorias(cliente: ClienteDb, userId: string): Promise<Categoria[]> {
  await asegurarCategoriasPorDefecto(cliente, userId);

  const [filas, usos] = await Promise.all([
    cliente.db
      .select(COLUMNAS)
      .from(esquema.categorias)
      .where(and(eq(esquema.categorias.userId, userId), isNull(esquema.categorias.eliminadoEn)))
      .orderBy(esquema.categorias.nombre),
    movimientosPorCategoria(cliente, userId),
  ]);

  return filas.map((fila) => aCategoria(fila, usos.get(fila.id) ?? 0));
}

/** Una categoría activa de la persona, o null si no existe, es de otra persona o está eliminada. */
export async function obtenerCategoria(
  cliente: ClienteDb,
  userId: string,
  id: number,
): Promise<Categoria | null> {
  const categorias = await listarCategorias(cliente, userId);
  return categorias.find((categoria) => categoria.id === id) ?? null;
}

/** La categoría especial de las transferencias de la persona (se crea si todavía no está). */
export async function obtenerCategoriaDeTransferencia(
  cliente: ClienteDb,
  userId: string,
): Promise<Categoria> {
  const categorias = await listarCategorias(cliente, userId);
  const transferencia = categorias.find((categoria) => categoria.sistema === SISTEMA_TRANSFERENCIA);
  if (!transferencia) throw new Error("No se pudo asegurar la categoría de transferencias.");
  return transferencia;
}

// --- Crear y editar ---

export class NombreDeCategoriaEnUso extends Error {}

async function existeActivaConNombre(
  cliente: ClienteDb,
  userId: string,
  nombre: string,
  excluirId?: number,
): Promise<boolean> {
  const fila = await cliente.db.query.categorias.findFirst({
    where: () =>
      and(
        eq(esquema.categorias.userId, userId),
        isNull(esquema.categorias.eliminadoEn),
        sql`lower(${esquema.categorias.nombre}) = lower(${nombre})`,
        excluirId === undefined ? undefined : ne(esquema.categorias.id, excluirId),
      ),
    columns: { id: true },
  });
  return fila !== undefined;
}

/** El color más distinto de los de las categorías activas de la persona. */
async function colorParaCategoriaNueva(cliente: ClienteDb, userId: string): Promise<string> {
  const filas = await cliente.db
    .select({ color: esquema.categorias.color })
    .from(esquema.categorias)
    .where(and(eq(esquema.categorias.userId, userId), isNull(esquema.categorias.eliminadoEn)));
  return colorMasDistinto(filas.map((fila) => fila.color));
}

/** Sin `color`, toma el más distinto de los que ya tiene la persona. */
export async function crearCategoria(
  cliente: ClienteDb,
  userId: string,
  nombre: string,
  color?: string,
): Promise<Categoria> {
  await asegurarCategoriasPorDefecto(cliente, userId);
  if (await existeActivaConNombre(cliente, userId, nombre)) {
    throw new NombreDeCategoriaEnUso(nombre);
  }

  try {
    const [fila] = await cliente.db
      .insert(esquema.categorias)
      .values({ userId, nombre, color: color ?? (await colorParaCategoriaNueva(cliente, userId)) })
      .returning(COLUMNAS);
    if (!fila) throw new Error("No se pudo crear la categoría.");
    return aCategoria(fila, 0);
  } catch (error) {
    if (violaRestriccion(error, "categorias_usuario_nombre_unico")) {
      throw new NombreDeCategoriaEnUso(nombre);
    }
    throw error;
  }
}

/**
 * Cambia el nombre y, si viene, el color (sin `color` se conserva el actual).
 * También sirve para la categoría especial: se puede renombrar o recolorear.
 */
export async function renombrarCategoria(
  cliente: ClienteDb,
  userId: string,
  id: number,
  nombre: string,
  color?: string,
): Promise<Categoria | null> {
  if (await existeActivaConNombre(cliente, userId, nombre, id)) {
    throw new NombreDeCategoriaEnUso(nombre);
  }

  try {
    const [fila] = await cliente.db
      .update(esquema.categorias)
      .set({ nombre, ...(color === undefined ? {} : { color }) })
      .where(
        and(
          eq(esquema.categorias.id, id),
          eq(esquema.categorias.userId, userId),
          isNull(esquema.categorias.eliminadoEn),
        ),
      )
      .returning(COLUMNAS);
    return fila
      ? aCategoria(fila, (await movimientosPorCategoria(cliente, userId)).get(id) ?? 0)
      : null;
  } catch (error) {
    if (violaRestriccion(error, "categorias_usuario_nombre_unico")) {
      throw new NombreDeCategoriaEnUso(nombre);
    }
    throw error;
  }
}

// --- Eliminar y reemplazar ---

/** La categoría especial de las transferencias no se elimina ni se reemplaza. */
export class CategoriaDelSistema extends Error {}

/** Tiene movimientos: no se puede eliminar, hay que reemplazarla por otra. */
export class CategoriaConMovimientos extends Error {
  readonly cantidad: number;

  constructor(cantidad: number) {
    super(String(cantidad));
    this.cantidad = cantidad;
  }
}

/** La categoría por la que se quiere reemplazar no existe, es la misma, o es la especial. */
export class CategoriaDeReemplazoInvalida extends Error {}

/**
 * Borrado lógico, solo para una categoría sin movimientos (los eliminados no
 * cuentan: ya no se ven). Con movimientos hay que reemplazarla (ver
 * `reemplazarCategoria`). La especial de transferencias nunca se elimina. Su
 * presupuesto, si tenía, se borra con ella. Devuelve false si no existe.
 */
export async function eliminarCategoria(
  cliente: ClienteDb,
  userId: string,
  id: number,
): Promise<boolean> {
  const categoria = await obtenerCategoria(cliente, userId, id);
  if (!categoria) return false;
  if (categoria.sistema !== null) throw new CategoriaDelSistema(String(id));
  if (categoria.movimientos > 0) throw new CategoriaConMovimientos(categoria.movimientos);

  const [fila] = await cliente.db
    .update(esquema.categorias)
    .set({ eliminadoEn: new Date() })
    .where(
      and(
        eq(esquema.categorias.id, id),
        eq(esquema.categorias.userId, userId),
        isNull(esquema.categorias.eliminadoEn),
      ),
    )
    .returning({ id: esquema.categorias.id });

  if (!fila) return false;

  await cliente.db
    .delete(esquema.presupuestos)
    .where(and(eq(esquema.presupuestos.userId, userId), eq(esquema.presupuestos.categoriaId, id)));

  return true;
}

export type DatosReemplazo = {
  /** Una categoría existente a la que pasan los movimientos... */
  porCategoriaId?: number | undefined;
  /** ...o una nueva que se crea en el mismo paso (sin color, toma el más distinto). */
  nueva?: { nombre: string; color?: string | undefined } | undefined;
};

/**
 * Reemplaza una categoría por otra y la elimina. Todos sus movimientos pasan a
 * la categoría elegida (también los históricos y los eliminados lógicamente,
 * para que ninguno quede apuntando a una categoría que ya no existe). Todo en
 * una transacción: o se hace completo, o no se toca nada.
 *
 * Su presupuesto, si tenía: pasa a la categoría de destino si esta no tiene uno;
 * si ya tiene el suyo, se conserva ese y el de la reemplazada se descarta.
 *
 * Devuelve null si la categoría a reemplazar no existe (o es de otra persona).
 */
export async function reemplazarCategoria(
  cliente: ClienteDb,
  userId: string,
  id: number,
  datos: DatosReemplazo,
): Promise<{ destino: Categoria; movimientosMovidos: number } | null> {
  const origen = await obtenerCategoria(cliente, userId, id);
  if (!origen) return null;
  if (origen.sistema !== null) throw new CategoriaDelSistema(String(id));

  if (datos.nueva && (await existeActivaConNombre(cliente, userId, datos.nueva.nombre))) {
    throw new NombreDeCategoriaEnUso(datos.nueva.nombre);
  }
  const colorNuevo = datos.nueva
    ? (datos.nueva.color ?? (await colorParaCategoriaNueva(cliente, userId)))
    : undefined;

  try {
    return await cliente.db.transaction(async (tx) => {
      let destinoId: number;

      if (datos.nueva && colorNuevo) {
        const [creada] = await tx
          .insert(esquema.categorias)
          .values({ userId, nombre: datos.nueva.nombre, color: colorNuevo })
          .returning({ id: esquema.categorias.id });
        if (!creada) throw new Error("No se pudo crear la categoría de reemplazo.");
        destinoId = creada.id;
      } else {
        const elegida = datos.porCategoriaId;
        const destino =
          elegida === undefined || elegida === id
            ? undefined
            : await tx.query.categorias.findFirst({
                where: () =>
                  and(
                    eq(esquema.categorias.id, elegida),
                    eq(esquema.categorias.userId, userId),
                    isNull(esquema.categorias.eliminadoEn),
                  ),
                columns: { id: true, sistema: true },
              });
        // La especial queda afuera: solo las transferencias pueden usarla.
        if (!destino || destino.sistema !== null) throw new CategoriaDeReemplazoInvalida();
        destinoId = destino.id;
      }

      const movidos = await tx
        .update(esquema.movimientos)
        .set({ categoriaId: destinoId })
        .where(and(eq(esquema.movimientos.userId, userId), eq(esquema.movimientos.categoriaId, id)))
        .returning({ id: esquema.movimientos.id });

      // Presupuesto: pasa al destino si este no tiene uno; si no, se descarta.
      const presupuestoDestino = await tx.query.presupuestos.findFirst({
        where: () =>
          and(
            eq(esquema.presupuestos.userId, userId),
            eq(esquema.presupuestos.categoriaId, destinoId),
          ),
        columns: { id: true },
      });
      if (presupuestoDestino) {
        await tx
          .delete(esquema.presupuestos)
          .where(
            and(eq(esquema.presupuestos.userId, userId), eq(esquema.presupuestos.categoriaId, id)),
          );
      } else {
        await tx
          .update(esquema.presupuestos)
          .set({ categoriaId: destinoId })
          .where(
            and(eq(esquema.presupuestos.userId, userId), eq(esquema.presupuestos.categoriaId, id)),
          );
      }

      await tx
        .update(esquema.categorias)
        .set({ eliminadoEn: new Date() })
        .where(and(eq(esquema.categorias.id, id), eq(esquema.categorias.userId, userId)));

      const [filaDestino] = await tx
        .select(COLUMNAS)
        .from(esquema.categorias)
        .where(eq(esquema.categorias.id, destinoId));
      if (!filaDestino)
        throw new Error("No se encontró la categoría de destino tras el reemplazo.");

      const [usosDestino] = await tx
        .select({ total: count() })
        .from(esquema.movimientos)
        .where(
          and(
            eq(esquema.movimientos.userId, userId),
            eq(esquema.movimientos.categoriaId, destinoId),
            isNull(esquema.movimientos.eliminadoEn),
          ),
        );
      return {
        destino: aCategoria(filaDestino, usosDestino?.total ?? 0),
        movimientosMovidos: movidos.length,
      };
    });
  } catch (error) {
    if (violaRestriccion(error, "categorias_usuario_nombre_unico")) {
      throw new NombreDeCategoriaEnUso(datos.nueva?.nombre ?? "");
    }
    throw error;
  }
}

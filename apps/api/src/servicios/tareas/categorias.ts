// Lógica de negocio de las categorías de tareas ("Casa", "Trabajo", "Salud"...).
//
// Cada persona tiene las suyas; toda consulta filtra por `userId`, que sale siempre de la sesión.
// Son opcionales: una tarea puede no tener ninguna. Son configuración vigente, no datos con historia:
// eliminar una categoría la borra en duro.
//
// - Una categoría que todavía tiene tareas pendientes o tareas repetitivas no se elimina: hay que
//   sacársela primero (cambiándoles la categoría o eliminándolas). Lo que ya se hizo no la retiene:
//   si no, una rutina diaria la dejaría atada durante un año de historial. Esas tareas hechas pasan
//   a "sin categoría" (la base lo hace sola, `on delete set null`).
// - Cada persona arranca con unas categorías por defecto (CATEGORIAS_DE_TAREA_POR_DEFECTO), que son
//   suyas como cualquier otra. Se crean la primera vez que se miran sus categorías, no al
//   registrarse: así también las tienen las cuentas que ya existían. Una marca en el usuario
//   (`categoriasDeTareasInicialesCreadas`) evita que vuelvan a aparecer después de eliminarlas.
// - Las nuevas toman el color más distinto de los que ya existen.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  CATEGORIAS_DE_TAREA_POR_DEFECTO,
  colorMasDistinto,
  MAXIMO_DE_CATEGORIAS_DE_TAREA,
} from "@gestoria/shared";
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";

export type CategoriaDeTarea = {
  id: number;
  nombre: string;
  color: string;
  /** Tareas de uso único pendientes (no eliminadas) que la tienen. */
  tareas: number;
  /** Tareas repetitivas vigentes que la tienen. */
  repetitivas: number;
};

export class NombreDeCategoriaDeTareaEnUso extends Error {}
export class LimiteDeCategoriasDeTarea extends Error {}
/** La categoría elegida para una tarea no existe o es de otra persona. */
export class CategoriaDeTareaInvalida extends Error {}

/** Tiene tareas pendientes o repetitivas: no se puede eliminar. */
export class CategoriaDeTareaEnUso extends Error {
  readonly tareas: number;
  readonly repetitivas: number;

  constructor(tareas: number, repetitivas: number) {
    super(`${tareas} tareas y ${repetitivas} repetitivas`);
    this.tareas = tareas;
    this.repetitivas = repetitivas;
  }
}

function violaNombreUnico(error: unknown): boolean {
  const origen = (error as { cause?: unknown } | null)?.cause ?? error;
  return (
    typeof origen === "object" &&
    origen !== null &&
    (origen as { code?: unknown }).code === "23505" &&
    (origen as { constraint?: unknown }).constraint === "categorias_de_tareas_usuario_nombre_unico"
  );
}

/**
 * Le crea a la persona las categorías por defecto, una sola vez en la vida de la cuenta. Quien ya
 * tenía categorías propias no recibe ninguna (solo se le anota que ya pasó). Todo va en una
 * transacción: si dos pedidos llegan a la vez, el segundo espera al primero y ya las encuentra.
 */
async function asegurarCategoriasPorDefecto(cliente: ClienteDb, userId: string): Promise<void> {
  await cliente.db.transaction(async (tx) => {
    const reclamada = await tx
      .update(esquema.usuarios)
      .set({ categoriasDeTareasInicialesCreadas: true })
      .where(
        and(
          eq(esquema.usuarios.id, userId),
          eq(esquema.usuarios.categoriasDeTareasInicialesCreadas, false),
        ),
      )
      .returning({ id: esquema.usuarios.id });
    if (reclamada.length === 0) return;

    const [fila] = await tx
      .select({ total: count() })
      .from(esquema.categoriasDeTareas)
      .where(eq(esquema.categoriasDeTareas.userId, userId));
    if ((fila?.total ?? 0) > 0) return;

    await tx
      .insert(esquema.categoriasDeTareas)
      .values(
        CATEGORIAS_DE_TAREA_POR_DEFECTO.map(({ nombre, color }) => ({ userId, nombre, color })),
      )
      .onConflictDoNothing();
  });
}

/** Cuántas tareas pendientes de uso único y cuántas repetitivas usa cada categoría de la persona. */
async function usosPorCategoria(
  cliente: ClienteDb,
  userId: string,
): Promise<{ tareas: Map<number, number>; repetitivas: Map<number, number> }> {
  const [sueltas, repetitivas] = await Promise.all([
    cliente.db
      .select({ categoriaId: esquema.tareas.categoriaId, total: count() })
      .from(esquema.tareas)
      .where(
        and(
          eq(esquema.tareas.userId, userId),
          isNull(esquema.tareas.eliminadoEn),
          isNull(esquema.tareas.completadaEn),
          isNull(esquema.tareas.falladaEn),
          isNull(esquema.tareas.repetitivaId),
        ),
      )
      .groupBy(esquema.tareas.categoriaId),
    cliente.db
      .select({ categoriaId: esquema.tareasRepetitivas.categoriaId, total: count() })
      .from(esquema.tareasRepetitivas)
      .where(
        and(
          eq(esquema.tareasRepetitivas.userId, userId),
          isNull(esquema.tareasRepetitivas.eliminadoEn),
        ),
      )
      .groupBy(esquema.tareasRepetitivas.categoriaId),
  ]);

  const aMapa = (filas: { categoriaId: number | null; total: number }[]) =>
    new Map(
      filas.flatMap((fila) => (fila.categoriaId === null ? [] : [[fila.categoriaId, fila.total]])),
    );
  return { tareas: aMapa(sueltas), repetitivas: aMapa(repetitivas) };
}

/** Las categorías de la persona por nombre, con cuántas tareas usa cada una. */
export async function listarCategoriasDeTareas(
  cliente: ClienteDb,
  userId: string,
): Promise<CategoriaDeTarea[]> {
  await asegurarCategoriasPorDefecto(cliente, userId);
  const [filas, usos] = await Promise.all([
    cliente.db
      .select({
        id: esquema.categoriasDeTareas.id,
        nombre: esquema.categoriasDeTareas.nombre,
        color: esquema.categoriasDeTareas.color,
      })
      .from(esquema.categoriasDeTareas)
      .where(eq(esquema.categoriasDeTareas.userId, userId))
      .orderBy(sql`lower(${esquema.categoriasDeTareas.nombre})`),
    usosPorCategoria(cliente, userId),
  ]);

  return filas.map((fila) => ({
    ...fila,
    tareas: usos.tareas.get(fila.id) ?? 0,
    repetitivas: usos.repetitivas.get(fila.id) ?? 0,
  }));
}

/**
 * Comprueba que la categoría elegida para una tarea es de la persona. Sin categoría (`null` o
 * `undefined`) no hay nada que comprobar. Si no existe o es de otra persona, `CategoriaDeTareaInvalida`.
 */
export async function verificarCategoriaDeTarea(
  cliente: ClienteDb,
  userId: string,
  categoriaId: number | null | undefined,
): Promise<void> {
  if (categoriaId === null || categoriaId === undefined) return;
  const fila = await cliente.db.query.categoriasDeTareas.findFirst({
    where: () =>
      and(
        eq(esquema.categoriasDeTareas.id, categoriaId),
        eq(esquema.categoriasDeTareas.userId, userId),
      ),
    columns: { id: true },
  });
  if (!fila) throw new CategoriaDeTareaInvalida();
}

async function existeConNombre(
  cliente: ClienteDb,
  userId: string,
  nombre: string,
  excluirId?: number,
): Promise<boolean> {
  const fila = await cliente.db.query.categoriasDeTareas.findFirst({
    where: () =>
      and(
        eq(esquema.categoriasDeTareas.userId, userId),
        sql`lower(${esquema.categoriasDeTareas.nombre}) = lower(${nombre})`,
        excluirId === undefined ? undefined : ne(esquema.categoriasDeTareas.id, excluirId),
      ),
    columns: { id: true },
  });
  return fila !== undefined;
}

/** Sin `color`, toma el más distinto de los que ya tiene la persona. */
export async function crearCategoriaDeTarea(
  cliente: ClienteDb,
  userId: string,
  nombre: string,
  color?: string,
): Promise<CategoriaDeTarea> {
  await asegurarCategoriasPorDefecto(cliente, userId);
  const existentes = await cliente.db
    .select({ color: esquema.categoriasDeTareas.color })
    .from(esquema.categoriasDeTareas)
    .where(eq(esquema.categoriasDeTareas.userId, userId));

  if (existentes.length >= MAXIMO_DE_CATEGORIAS_DE_TAREA) throw new LimiteDeCategoriasDeTarea();
  if (await existeConNombre(cliente, userId, nombre)) throw new NombreDeCategoriaDeTareaEnUso();

  try {
    const [fila] = await cliente.db
      .insert(esquema.categoriasDeTareas)
      .values({
        userId,
        nombre,
        color: color ?? colorMasDistinto(existentes.map((existente) => existente.color)),
      })
      .returning({
        id: esquema.categoriasDeTareas.id,
        nombre: esquema.categoriasDeTareas.nombre,
        color: esquema.categoriasDeTareas.color,
      });
    if (!fila) throw new Error("No se pudo crear la categoría.");
    return { ...fila, tareas: 0, repetitivas: 0 };
  } catch (error) {
    if (violaNombreUnico(error)) throw new NombreDeCategoriaDeTareaEnUso();
    throw error;
  }
}

/** Cambia el nombre y, si viene, el color. Devuelve null si no existe o es de otra persona. */
export async function editarCategoriaDeTarea(
  cliente: ClienteDb,
  userId: string,
  id: number,
  nombre: string,
  color?: string,
): Promise<CategoriaDeTarea | null> {
  if (await existeConNombre(cliente, userId, nombre, id)) throw new NombreDeCategoriaDeTareaEnUso();

  try {
    const [fila] = await cliente.db
      .update(esquema.categoriasDeTareas)
      .set({ nombre, ...(color === undefined ? {} : { color }) })
      .where(
        and(eq(esquema.categoriasDeTareas.id, id), eq(esquema.categoriasDeTareas.userId, userId)),
      )
      .returning({ id: esquema.categoriasDeTareas.id });
    if (!fila) return null;
  } catch (error) {
    if (violaNombreUnico(error)) throw new NombreDeCategoriaDeTareaEnUso();
    throw error;
  }

  const categorias = await listarCategoriasDeTareas(cliente, userId);
  return categorias.find((categoria) => categoria.id === id) ?? null;
}

/**
 * Borra la categoría si ninguna tarea pendiente ni repetitiva la usa; si no, `CategoriaDeTareaEnUso`
 * con cuántas la usan. Devuelve false si no existe o es de otra persona.
 */
export async function eliminarCategoriaDeTarea(
  cliente: ClienteDb,
  userId: string,
  id: number,
): Promise<boolean> {
  const categorias = await listarCategoriasDeTareas(cliente, userId);
  const categoria = categorias.find((otra) => otra.id === id);
  if (!categoria) return false;
  if (categoria.tareas + categoria.repetitivas > 0) {
    throw new CategoriaDeTareaEnUso(categoria.tareas, categoria.repetitivas);
  }

  const filas = await cliente.db
    .delete(esquema.categoriasDeTareas)
    .where(
      and(eq(esquema.categoriasDeTareas.id, id), eq(esquema.categoriasDeTareas.userId, userId)),
    )
    .returning({ id: esquema.categoriasDeTareas.id });
  return filas.length > 0;
}

// Lógica de negocio de las tareas repetitivas ("Regar las plantas todos los días", "Pagar el
// alquiler el día 5 de cada mes").
//
// Una repetitiva es una regla, no algo que se tilda: de ella salen las tareas de cada día (ver
// tareas.ts). De la regla se guarda cuándo cae (día de la semana, del mes...) y se arman las
// tareas de los días que ya llegaron al leer (`generarTareasRepetitivas`), nunca las de días
// futuros: así no hay nada que mantener al día ni un job que tenga que correr para que la lista
// de hoy esté completa. Si la persona estuvo días sin entrar, al volver se arman los días que
// faltan (hasta DIAS_DE_TAREAS_A_ARMAR hacia atrás): quedan sin hacer en el historial.
//
// Cambiar o eliminar la regla toca solo lo que viene: las tareas ya hechas o de días pasados son
// historial y no se modifican.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  type CuandoCaeUnaTarea,
  caeEnElDiaDeTarea,
  type DatosDeTareaRepetitiva,
  DIAS_DE_ATRASO_PARA_FALLAR,
  desdeCentesimos,
  DIAS_DE_TAREAS_A_ARMAR,
  diaDeHoy,
  diasEntre,
  instanteDelDia,
  MAXIMO_DE_TAREAS_REPETITIVAS,
  ordenarDiasDeLaSemana,
  proximaOcurrenciaDeTarea,
  type RepeticionDeTarea,
  recortarHora,
  sumarDias,
} from "@gestoria/shared";
import { and, count, eq, gte, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { obtenerZonaHoraria } from "../finanzas/periodos.ts";
import { verificarCategoriaDeTarea } from "./categorias.ts";
import { columnasDeMeta } from "./meta.ts";

export type TareaRepetitiva = {
  id: string;
  titulo: string;
  notas: string | null;
  /** La categoría, si tiene (ver categorias.ts). */
  categoriaId: number | null;
  repeticion: RepeticionDeTarea;
  /** Sus tareas se dan por fallidas solas si pasa el día sin completarlas. */
  fallaSola: boolean;
  /** Sus tareas llevan un distintivo. */
  importante: boolean;
  /** Si es progresiva, la meta de cada tarea ("2"); null si se tildan. */
  meta: number | null;
  /** La unidad de la meta ("litros"), si tiene. */
  unidad: string | null;
  /** Cuándo cae, según la repetición; lo que ella no usa va en nulo. */
  diasSemana: number[] | null;
  diaDelMes: number | null;
  mes: number | null;
  /** Solo "intervalo": cada cuántos días y desde qué día se cuenta. */
  cadaDias: number | null;
  fechaInicio: string | null;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  /** La próxima vez que le toca, desde hoy inclusive. */
  proximaFecha: string;
  /** Cuántos días faltan: 0 es hoy. */
  diasRestantes: number;
};

/** La persona ya tiene el máximo de tareas repetitivas. */
export class LimiteDeTareasRepetitivas extends Error {}
/** Se quiso empezar una tarea "cada tantos días" en un día que ya pasó. */
export class InicioEnElPasado extends Error {}

type FilaDeRepetitiva = typeof esquema.tareasRepetitivas.$inferSelect;

function cuandoCae(fila: FilaDeRepetitiva): CuandoCaeUnaTarea {
  return {
    repeticion: fila.repeticion as RepeticionDeTarea,
    diasSemana: fila.diasSemana,
    diaDelMes: fila.diaDelMes,
    mes: fila.mes,
    cadaDias: fila.cadaDias,
    fechaInicio: fila.fechaInicio,
  };
}

function aTareaRepetitiva(fila: FilaDeRepetitiva, hoy: string): TareaRepetitiva {
  // Una repetitiva siempre tiene una próxima vez (a diferencia de un recordatorio de una sola vez).
  const proximaFecha = proximaOcurrenciaDeTarea(cuandoCae(fila), hoy) ?? hoy;
  return {
    id: fila.id,
    titulo: fila.titulo,
    notas: fila.notas,
    categoriaId: fila.categoriaId,
    repeticion: fila.repeticion as RepeticionDeTarea,
    fallaSola: fila.fallaSola,
    importante: fila.importante,
    meta: fila.metaCentesimos === null ? null : desdeCentesimos(fila.metaCentesimos),
    unidad: fila.unidad,
    diasSemana: fila.diasSemana === null ? null : ordenarDiasDeLaSemana(fila.diasSemana),
    diaDelMes: fila.diaDelMes,
    mes: fila.mes,
    cadaDias: fila.cadaDias,
    fechaInicio: fila.fechaInicio,
    hora: recortarHora(fila.hora),
    proximaFecha,
    diasRestantes: diasEntre(hoy, proximaFecha),
  };
}

/** Las columnas de la tabla para unos datos: cada repetición llena las suyas y deja el resto en nulo. */
function columnasDe(datos: DatosDeTareaRepetitiva, hoy: string) {
  const vacias = {
    diasSemana: null,
    diaDelMes: null,
    mes: null,
    cadaDias: null,
    fechaInicio: null,
  };
  const base = {
    titulo: datos.titulo,
    notas: datos.notas === "" ? null : datos.notas,
    repeticion: datos.repeticion,
    hora: datos.hora === "" ? null : datos.hora,
    // Sin `categoriaId` no se toca la que tenía (al crear queda en nulo).
    ...(datos.categoriaId === undefined ? {} : { categoriaId: datos.categoriaId }),
    // Igual: sin `fallaSola` no se toca (al crear queda en que no).
    ...(datos.fallaSola === undefined ? {} : { fallaSola: datos.fallaSola }),
    // Igual con `importante`.
    ...(datos.importante === undefined ? {} : { importante: datos.importante }),
    // Y con la meta (y su unidad): sin `meta` no se tocan.
    ...(columnasDeMeta(datos) ?? {}),
  };

  switch (datos.repeticion) {
    case "diaria":
      return { ...vacias, ...base };
    case "intervalo":
      return {
        ...vacias,
        ...base,
        cadaDias: datos.cadaDias,
        // En blanco es hoy.
        fechaInicio: datos.fechaInicio === "" ? hoy : datos.fechaInicio,
      };
    case "semanal":
      return { ...vacias, ...base, diasSemana: ordenarDiasDeLaSemana(datos.diasSemana) };
    case "mensual":
      return { ...vacias, ...base, diaDelMes: datos.diaDelMes };
    case "anual":
      return { ...vacias, ...base, diaDelMes: datos.diaDelMes, mes: datos.mes };
  }
}

/**
 * Una tarea "cada tantos días" no puede empezar en un día que ya pasó (sí hoy). Al editar, el inicio que la
 * regla ya tenía se acepta aunque sea viejo: es el que ancla el ciclo y no se está cambiando.
 */
function verificarInicio(datos: DatosDeTareaRepetitiva, hoy: string, inicioActual: string | null) {
  if (datos.repeticion !== "intervalo" || datos.fechaInicio === "") return;
  if (datos.fechaInicio < hoy && datos.fechaInicio !== inicioActual) throw new InicioEnElPasado();
}

/** El día más tardío de los que se pasan (los días son texto "AAAA-MM-DD": se comparan como texto). */
function elMasTardio(...dias: string[]): string {
  return dias.reduce((mayor, dia) => (dia > mayor ? dia : mayor));
}

/**
 * Deja las tareas al día: arma las de las repetitivas que faltan (`armarLasQueFaltan`) y da por fallidas las
 * que vencieron (`darPorFallidasLasVencidas`: las que piden fallar solas y las atrasadas de más de una
 * semana). Se llama antes de leer cualquier lista de tareas.
 */
export async function generarTareasRepetitivas(
  cliente: ClienteDb,
  userId: string,
  hoy: string,
): Promise<void> {
  await armarLasQueFaltan(cliente, userId, hoy);
  await darPorFallidasLasVencidas(cliente, userId, hoy);
}

/**
 * Da por fallidas, sin que la persona haga nada, dos clases de tareas pendientes:
 * - las que pidieron fallar solas (copian `fallaSola` de su repetitiva) cuando termina su día;
 * - todas, sean sueltas o de una repetitiva, cuando llevan **más de una semana** como atrasadas
 *   (DIAS_DE_ATRASO_PARA_FALLAR). La semana se cuenta desde el día siguiente al de la tarea, o desde que la
 *   persona la devolvió a pendiente (`reactivadaEn`): una que se revive tiene otra semana.
 * El momento en que "fallaron" es el final del día en que se cumplió el plazo, no ahora: así no aparecen en
 * "Fallidas hoy" ni cuentan contra el avance de hoy, y en el historial quedan en su día. Es idempotente (solo
 * toca las que siguen pendientes), así que dos pedidos a la vez no se pisan. Si la persona devuelve una a
 * pendiente, `fallaSola` se apaga y se reinicia la semana.
 */
async function darPorFallidasLasVencidas(
  cliente: ClienteDb,
  userId: string,
  hoy: string,
): Promise<void> {
  const { tareas } = esquema;
  const zona = await obtenerZonaHoraria(cliente, userId);
  // Una tarea sin reactivar vence si su día quedó a más de una semana; una reactivada, si lo hizo hace más.
  const limite = sumarDias(hoy, -DIAS_DE_ATRASO_PARA_FALLAR);
  const corteDeReactivadas = instanteDelDia(limite, zona, 0);

  const vencidas = await cliente.db
    .select({
      id: tareas.id,
      dia: tareas.dia,
      fallaSola: tareas.fallaSola,
      reactivadaEn: tareas.reactivadaEn,
    })
    .from(tareas)
    .where(
      and(
        eq(tareas.userId, userId),
        isNull(tareas.eliminadoEn),
        isNull(tareas.completadaEn),
        isNull(tareas.falladaEn),
        lt(tareas.dia, hoy),
        or(
          eq(tareas.fallaSola, true),
          and(isNull(tareas.reactivadaEn), lt(tareas.dia, limite)),
          and(isNotNull(tareas.reactivadaEn), lt(tareas.reactivadaEn, corteDeReactivadas)),
        ),
      ),
    );
  if (vencidas.length === 0) return;

  // Cuándo falló cada una: el final del día en que se cumplió el plazo (el suyo si falla sola).
  const porMomento = new Map<number, string[]>();
  for (const { id, dia, fallaSola, reactivadaEn } of vencidas) {
    const diaBase = reactivadaEn === null ? dia : diaDeHoy(zona, reactivadaEn);
    const diaDelPlazo = fallaSola ? dia : sumarDias(diaBase, DIAS_DE_ATRASO_PARA_FALLAR);
    // Un segundo antes de que empiece el día siguiente.
    const momento = instanteDelDia(sumarDias(diaDelPlazo, 1), zona, 0).getTime() - 1000;
    porMomento.set(momento, [...(porMomento.get(momento) ?? []), id]);
  }

  await cliente.db.transaction(async (tx) => {
    for (const [momento, ids] of porMomento) {
      await tx
        .update(tareas)
        .set({ falladaEn: new Date(momento) })
        .where(
          and(
            eq(tareas.userId, userId),
            inArray(tareas.id, ids),
            isNull(tareas.completadaEn),
            isNull(tareas.falladaEn),
          ),
        );
    }
  });
}

/**
 * Arma las tareas de los días que ya llegaron para cada repetitiva a la que le falten. Es barato
 * cuando no falta nada (una consulta por las que todavía no están al día de hoy) y seguro si dos
 * pedidos llegan a la vez: la base no deja que una repetitiva arme dos veces el mismo día.
 */
async function armarLasQueFaltan(cliente: ClienteDb, userId: string, hoy: string): Promise<void> {
  const faltantes = await cliente.db
    .select()
    .from(esquema.tareasRepetitivas)
    .where(
      and(
        eq(esquema.tareasRepetitivas.userId, userId),
        isNull(esquema.tareasRepetitivas.eliminadoEn),
        or(
          isNull(esquema.tareasRepetitivas.generadaHasta),
          lt(esquema.tareasRepetitivas.generadaHasta, hoy),
        ),
      ),
    );
  if (faltantes.length === 0) return;

  await cliente.db.transaction(async (tx) => {
    for (const repetitiva of faltantes) {
      const cuando = cuandoCae(repetitiva);
      const primero = elMasTardio(
        repetitiva.desde,
        sumarDias(hoy, -(DIAS_DE_TAREAS_A_ARMAR - 1)),
        repetitiva.generadaHasta ? sumarDias(repetitiva.generadaHasta, 1) : repetitiva.desde,
      );

      const filas: (typeof esquema.tareas.$inferInsert)[] = [];
      for (let dia = primero; dia <= hoy; dia = sumarDias(dia, 1)) {
        if (!caeEnElDiaDeTarea(cuando, dia)) continue;
        filas.push({
          userId,
          repetitivaId: repetitiva.id,
          titulo: repetitiva.titulo,
          notas: repetitiva.notas,
          categoriaId: repetitiva.categoriaId,
          dia,
          hora: repetitiva.hora,
          fallaSola: repetitiva.fallaSola,
          importante: repetitiva.importante,
          metaCentesimos: repetitiva.metaCentesimos,
          unidad: repetitiva.unidad,
        });
      }
      if (filas.length > 0) {
        await tx.insert(esquema.tareas).values(filas).onConflictDoNothing();
      }
      await tx
        .update(esquema.tareasRepetitivas)
        .set({ generadaHasta: hoy })
        .where(eq(esquema.tareasRepetitivas.id, repetitiva.id));
    }
  });
}

/** Las repetitivas vigentes de la persona, la que le toca antes primero. */
export async function listarTareasRepetitivas(
  cliente: ClienteDb,
  userId: string,
  ahora: Date = new Date(),
): Promise<TareaRepetitiva[]> {
  const hoy = diaDeHoy(await obtenerZonaHoraria(cliente, userId), ahora);
  const filas = await cliente.db
    .select()
    .from(esquema.tareasRepetitivas)
    .where(
      and(
        eq(esquema.tareasRepetitivas.userId, userId),
        isNull(esquema.tareasRepetitivas.eliminadoEn),
      ),
    );

  return filas
    .map((fila) => aTareaRepetitiva(fila, hoy))
    .sort(
      (a, b) =>
        a.proximaFecha.localeCompare(b.proximaFecha) ||
        (a.hora ?? "").localeCompare(b.hora ?? "") ||
        a.titulo.localeCompare(b.titulo, "es"),
    );
}

/** Crea la repetitiva y, si le toca hoy, arma ya la tarea de hoy. Empieza a regir desde hoy. */
export async function crearTareaRepetitiva(
  cliente: ClienteDb,
  userId: string,
  datos: DatosDeTareaRepetitiva,
  ahora: Date = new Date(),
): Promise<TareaRepetitiva> {
  const hoy = diaDeHoy(await obtenerZonaHoraria(cliente, userId), ahora);
  await verificarCategoriaDeTarea(cliente, userId, datos.categoriaId);
  verificarInicio(datos, hoy, null);

  const [existentes] = await cliente.db
    .select({ total: count() })
    .from(esquema.tareasRepetitivas)
    .where(
      and(
        eq(esquema.tareasRepetitivas.userId, userId),
        isNull(esquema.tareasRepetitivas.eliminadoEn),
      ),
    );
  if ((existentes?.total ?? 0) >= MAXIMO_DE_TAREAS_REPETITIVAS) {
    throw new LimiteDeTareasRepetitivas();
  }

  const [fila] = await cliente.db
    .insert(esquema.tareasRepetitivas)
    .values({ userId, desde: hoy, ...columnasDe(datos, hoy) })
    .returning();
  if (!fila) throw new Error("No se pudo crear la tarea repetitiva.");

  await generarTareasRepetitivas(cliente, userId, hoy);
  return aTareaRepetitiva(fila, hoy);
}

/**
 * Los pendientes de hoy en adelante de una repetitiva se descartan para que se armen de nuevo con
 * la regla nueva. Lo hecho y lo de días pasados es historial y no se toca. Devuelve lo que llevaba
 * anotado cada una que era progresiva y tenía algo (por día), para no perderlo al rearmarlas.
 */
async function descartarPendientesDesdeHoy(
  cliente: ClienteDb,
  userId: string,
  repetitivaId: string,
  hoy: string,
): Promise<Map<string, number>> {
  const descartadas = await cliente.db
    .delete(esquema.tareas)
    .where(
      and(
        eq(esquema.tareas.userId, userId),
        eq(esquema.tareas.repetitivaId, repetitivaId),
        gte(esquema.tareas.dia, hoy),
        isNull(esquema.tareas.completadaEn),
        isNull(esquema.tareas.falladaEn),
        isNull(esquema.tareas.eliminadoEn),
      ),
    )
    .returning({ dia: esquema.tareas.dia, progreso: esquema.tareas.progresoCentesimos });
  return new Map(
    descartadas.filter(({ progreso }) => progreso > 0).map(({ dia, progreso }) => [dia, progreso]),
  );
}

/**
 * Le devuelve a las tareas rearmadas de una repetitiva (progresiva) lo que llevaban anotado antes de
 * editarla; si con la meta nueva ya llegan, quedan completadas.
 */
async function devolverProgreso(
  cliente: ClienteDb,
  userId: string,
  repetitivaId: string,
  metaCentesimos: number | null,
  progresos: Map<string, number>,
  ahora: Date,
): Promise<void> {
  if (metaCentesimos === null) return;
  for (const [dia, progreso] of progresos) {
    await cliente.db
      .update(esquema.tareas)
      .set({
        progresoCentesimos: progreso,
        ...(progreso >= metaCentesimos ? { completadaEn: ahora } : {}),
      })
      .where(
        and(
          eq(esquema.tareas.userId, userId),
          eq(esquema.tareas.repetitivaId, repetitivaId),
          eq(esquema.tareas.dia, dia),
          isNull(esquema.tareas.completadaEn),
          isNull(esquema.tareas.falladaEn),
          isNull(esquema.tareas.eliminadoEn),
        ),
      );
  }
}

/** Cambia la regla (y la categoría: sin `categoriaId` se conserva, `null` la quita); rige desde hoy. Devuelve null si no existe, es de otra persona o está eliminada. */
export async function editarTareaRepetitiva(
  cliente: ClienteDb,
  userId: string,
  id: string,
  datos: DatosDeTareaRepetitiva,
  ahora: Date = new Date(),
): Promise<TareaRepetitiva | null> {
  const hoy = diaDeHoy(await obtenerZonaHoraria(cliente, userId), ahora);
  await verificarCategoriaDeTarea(cliente, userId, datos.categoriaId);
  const actual = await cliente.db.query.tareasRepetitivas.findFirst({
    where: () =>
      and(
        eq(esquema.tareasRepetitivas.id, id),
        eq(esquema.tareasRepetitivas.userId, userId),
        isNull(esquema.tareasRepetitivas.eliminadoEn),
      ),
  });
  if (!actual) return null;
  verificarInicio(datos, hoy, actual.fechaInicio);

  const [fila] = await cliente.db
    .update(esquema.tareasRepetitivas)
    .set({
      ...columnasDe(datos, hoy),
      // Los días anteriores a hoy no se vuelven a armar con la regla nueva.
      generadaHasta: sumarDias(hoy, -1),
    })
    .where(
      and(
        eq(esquema.tareasRepetitivas.id, id),
        eq(esquema.tareasRepetitivas.userId, userId),
        isNull(esquema.tareasRepetitivas.eliminadoEn),
      ),
    )
    .returning();
  if (!fila) return null;

  const progresos = await descartarPendientesDesdeHoy(cliente, userId, id, hoy);
  await generarTareasRepetitivas(cliente, userId, hoy);
  await devolverProgreso(cliente, userId, id, fila.metaCentesimos, progresos, ahora);
  return aTareaRepetitiva(fila, hoy);
}

/** Borrado lógico. Devuelve false si no existe, es de otra persona o ya estaba eliminada. */
export async function eliminarTareaRepetitiva(
  cliente: ClienteDb,
  userId: string,
  id: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  const hoy = diaDeHoy(await obtenerZonaHoraria(cliente, userId), ahora);
  const filas = await cliente.db
    .update(esquema.tareasRepetitivas)
    .set({ eliminadoEn: ahora })
    .where(
      and(
        eq(esquema.tareasRepetitivas.id, id),
        eq(esquema.tareasRepetitivas.userId, userId),
        isNull(esquema.tareasRepetitivas.eliminadoEn),
      ),
    )
    .returning({ id: esquema.tareasRepetitivas.id });
  if (filas.length === 0) return false;

  await descartarPendientesDesdeHoy(cliente, userId, id, hoy);
  return true;
}

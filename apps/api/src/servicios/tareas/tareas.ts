// Lógica de negocio de la lista de tareas (to-do).
//
// Una tarea es una fila con su día. Las hay de dos orígenes: las sueltas de uso único que la
// persona agrega a mano, y las que arma cada tarea repetitiva para cada día que le toca (ver
// repetitivas.ts). Una vez armadas se tratan igual: se tildan, se editan, se eliminan.
//
// Una tarea está en uno de tres estados: pendiente, completada (`completadaEn`) o fallida
// (`falladaEn`: una tarea atrasada que la persona decidió que ya no va a hacer). Nunca dos a la vez.
//
// Una tarea **progresiva** ("tomar 2 litros de agua") tiene una meta y no se tilda: se le va anotando el
// progreso (`registrarProgreso`) y se completa sola al llegar a la meta; si se corrige por debajo,
// vuelve a pendiente. Si al terminar su día no llegó, **falla sola** (siempre: nace con `fallaSola`); ver
// tareas/progreso.ts en @gestoria/shared.
//
// La lista de hoy se arma así:
// - Atrasadas: tareas pendientes de días anteriores, sean sueltas o de una repetitiva. Se arrastran
//   hasta que la persona las complete o las marque como fallidas.
// - De hoy: lo pendiente con día de hoy.
// - Hechas hoy y Fallidas hoy: lo que se tildó o se marcó como fallido hoy, aunque fuera de otro
//   día. Salen de la lista; esas secciones existen para poder deshacer un cambio por error.
// - Más adelante: tareas sueltas con un día futuro.
//
// "Hoy" es el de la zona horaria de la persona. El historial son los días anteriores a hoy.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  aCentesimos,
  type DatosDeTarea,
  desdeCentesimos,
  DIAS_DE_HISTORIAL_DE_TAREAS,
  DIAS_POR_DEFECTO_DEL_HISTORIAL,
  diaDeHoy,
  type FiltrosDeHistorial,
  instanteDelDia,
  MAXIMO_DE_META_DE_TAREA,
  MAXIMO_DE_TAREAS_EN_EL_HISTORIAL,
  MAXIMO_DE_TAREAS_PENDIENTES,
  type ProgresoDeTarea,
  recortarHora,
  sumarDias,
} from "@gestoria/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import { obtenerZonaHoraria } from "../finanzas/periodos.ts";
import { verificarCategoriaDeTarea } from "./categorias.ts";
import { columnasDeMeta } from "./meta.ts";
import { generarTareasRepetitivas } from "./repetitivas.ts";

export type Tarea = {
  id: string;
  titulo: string;
  notas: string | null;
  /** La categoría, si tiene (ver categorias.ts). */
  categoriaId: number | null;
  /** El día en que hay que hacerla. "AAAA-MM-DD". */
  dia: string;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  completada: boolean;
  /** Cuándo se tildó (ISO); null si está pendiente. */
  completadaEn: Date | null;
  /** Se marcó como fallida: estaba atrasada y ya no se va a hacer. */
  fallida: boolean;
  /** Cuándo se marcó como fallida; null si no lo está. */
  falladaEn: Date | null;
  /** Salió de una tarea repetitiva (si no, es una tarea suelta de uso único). */
  repetitiva: boolean;
  /** Lleva un distintivo; no cambia el orden de las listas. */
  importante: boolean;
  /** Si es progresiva, la meta ("2"); null si se tilda. */
  meta: number | null;
  /** La unidad de la meta ("litros"), si tiene. */
  unidad: string | null;
  /** Lo que lleva anotado (0 si no es progresiva). Puede pasarse de la meta. */
  progreso: number;
};

export type ListaDeHoy = {
  /** El día de hoy para la persona. "AAAA-MM-DD". */
  hoy: string;
  atrasadas: Tarea[];
  deHoy: Tarea[];
  hechasHoy: Tarea[];
  /** Las que se marcaron como fallidas hoy (para poder deshacerlo). */
  falladasHoy: Tarea[];
  masAdelante: Tarea[];
};

export type DiaDeHistorial = {
  dia: string;
  tareas: Tarea[];
  hechas: number;
  falladas: number;
};

export type HistorialDeTareas = {
  /** El rango que se está mostrando (ya recortado a lo que se puede ver). "AAAA-MM-DD". */
  desde: string;
  hasta: string;
  dias: DiaDeHistorial[];
  /** Había más tareas que el tope de una consulta: conviene acotar el rango. */
  hayMas: boolean;
};

/** Se quiso poner una tarea suelta en un día que ya pasó. */
export class TareaEnElPasado extends Error {}
/** Se quiso marcar como fallida una tarea de un día futuro: todavía no le toca. */
export class TareaFutura extends Error {}
/** La persona ya tiene el máximo de tareas sueltas pendientes. */
export class LimiteDeTareas extends Error {}
/** Se quiso anotar progreso en una tarea que no es progresiva (se tilda). */
export class TareaNoProgresiva extends Error {}
/** Se quiso tildar o destildar a mano una tarea progresiva (se completa sola al llegar a la meta). */
export class TareaProgresiva extends Error {}
/** Se quiso anotar progreso en una tarea fallida: primero hay que deshacer la fallida. */
export class TareaFallida extends Error {}

type FilaDeTarea = typeof esquema.tareas.$inferSelect;

function aTarea(fila: FilaDeTarea): Tarea {
  return {
    id: fila.id,
    titulo: fila.titulo,
    notas: fila.notas,
    categoriaId: fila.categoriaId,
    dia: fila.dia,
    hora: recortarHora(fila.hora),
    completada: fila.completadaEn !== null,
    completadaEn: fila.completadaEn,
    fallida: fila.falladaEn !== null,
    falladaEn: fila.falladaEn,
    repetitiva: fila.repetitivaId !== null,
    importante: fila.importante,
    meta: fila.metaCentesimos === null ? null : desdeCentesimos(fila.metaCentesimos),
    unidad: fila.unidad,
    progreso: desdeCentesimos(fila.progresoCentesimos),
  };
}


/** Primero lo de todo el día, después por hora; a igual hora, en el orden en que se agregaron. Lo importante no cambia el orden. */
function porHora(a: FilaDeTarea, b: FilaDeTarea): number {
  return (
    a.dia.localeCompare(b.dia) ||
    (a.hora ?? "").localeCompare(b.hora ?? "") ||
    a.creadoEn.getTime() - b.creadoEn.getTime()
  );
}

async function hoyDeLaPersona(cliente: ClienteDb, userId: string, ahora: Date) {
  const zona = await obtenerZonaHoraria(cliente, userId);
  return { zona, hoy: diaDeHoy(zona, ahora) };
}

const SIN_ELIMINAR = isNull(esquema.tareas.eliminadoEn);
const PENDIENTE = and(isNull(esquema.tareas.completadaEn), isNull(esquema.tareas.falladaEn));

/** La lista de hoy. Arma antes las tareas repetitivas que falten hasta hoy. */
export async function listarTareasDeHoy(
  cliente: ClienteDb,
  userId: string,
  ahora: Date = new Date(),
): Promise<ListaDeHoy> {
  const { zona, hoy } = await hoyDeLaPersona(cliente, userId, ahora);
  await generarTareasRepetitivas(cliente, userId, hoy);

  const inicioDeHoy = instanteDelDia(hoy, zona, 0);
  const inicioDeManana = instanteDelDia(sumarDias(hoy, 1), zona, 0);
  const deLaPersona = and(eq(esquema.tareas.userId, userId), SIN_ELIMINAR);

  const [pendientes, hechas, falladas, adelante] = await Promise.all([
    // Lo pendiente de hoy y de días anteriores (atrasadas, también las de repetitivas).
    cliente.db
      .select()
      .from(esquema.tareas)
      .where(and(deLaPersona, PENDIENTE, lte(esquema.tareas.dia, hoy))),
    cliente.db
      .select()
      .from(esquema.tareas)
      .where(
        and(
          deLaPersona,
          gte(esquema.tareas.completadaEn, inicioDeHoy),
          lt(esquema.tareas.completadaEn, inicioDeManana),
        ),
      )
      .orderBy(desc(esquema.tareas.completadaEn)),
    cliente.db
      .select()
      .from(esquema.tareas)
      .where(
        and(
          deLaPersona,
          gte(esquema.tareas.falladaEn, inicioDeHoy),
          lt(esquema.tareas.falladaEn, inicioDeManana),
        ),
      )
      .orderBy(desc(esquema.tareas.falladaEn)),
    cliente.db
      .select()
      .from(esquema.tareas)
      .where(and(deLaPersona, PENDIENTE, gt(esquema.tareas.dia, hoy)))
      .orderBy(asc(esquema.tareas.dia), asc(esquema.tareas.hora))
      .limit(100),
  ]);

  const ordenadas = [...pendientes].sort(porHora);
  return {
    hoy,
    atrasadas: ordenadas.filter((fila) => fila.dia < hoy).map(aTarea),
    deHoy: ordenadas.filter((fila) => fila.dia === hoy).map(aTarea),
    hechasHoy: hechas.map(aTarea),
    falladasHoy: falladas.map(aTarea),
    masAdelante: [...adelante].sort(porHora).map(aTarea),
  };
}

/** Las tareas sueltas que están pendientes (para limitar cuántas puede juntar una persona). */
async function contarSueltasPendientes(cliente: ClienteDb, userId: string): Promise<number> {
  const [fila] = await cliente.db
    .select({ total: count() })
    .from(esquema.tareas)
    .where(
      and(
        eq(esquema.tareas.userId, userId),
        SIN_ELIMINAR,
        PENDIENTE,
        isNull(esquema.tareas.repetitivaId),
      ),
    );
  return fila?.total ?? 0;
}

/** Agrega una tarea suelta. Sin día, es para hoy; no puede ser de un día que ya pasó. */
export async function crearTarea(
  cliente: ClienteDb,
  userId: string,
  datos: DatosDeTarea,
  ahora: Date = new Date(),
): Promise<Tarea> {
  const { hoy } = await hoyDeLaPersona(cliente, userId, ahora);
  const dia = datos.fecha === "" ? hoy : datos.fecha;
  if (dia < hoy) throw new TareaEnElPasado();
  await verificarCategoriaDeTarea(cliente, userId, datos.categoriaId);

  if ((await contarSueltasPendientes(cliente, userId)) >= MAXIMO_DE_TAREAS_PENDIENTES) {
    throw new LimiteDeTareas();
  }

  const [fila] = await cliente.db
    .insert(esquema.tareas)
    .values({
      userId,
      titulo: datos.titulo,
      notas: datos.notas === "" ? null : datos.notas,
      categoriaId: datos.categoriaId ?? null,
      importante: datos.importante ?? false,
      ...(columnasDeMeta(datos) ?? {}),
      // Una progresiva falla sola si al terminar su día no llegó a la meta.
      fallaSola: datos.meta !== undefined && datos.meta !== null,
      dia,
      hora: datos.hora === "" ? null : datos.hora,
    })
    .returning();
  if (!fila) throw new Error("No se pudo crear la tarea.");
  return aTarea(fila);
}

/**
 * Cambia el título, las notas, la categoría (sin `categoriaId` se conserva; `null` la quita), la hora
 * y —en una tarea suelta— el día. Una tarea que salió de una
 * repetitiva conserva su día (para cambiarlo se edita la repetitiva). Sin día (""), conserva el
 * que tenía. Un día anterior a hoy solo se acepta si es el que la tarea ya tenía (estaba atrasada).
 * Devuelve null si no existe, es de otra persona o está eliminada.
 */
export async function editarTarea(
  cliente: ClienteDb,
  userId: string,
  id: string,
  datos: DatosDeTarea,
  ahora: Date = new Date(),
): Promise<Tarea | null> {
  const { hoy } = await hoyDeLaPersona(cliente, userId, ahora);
  const actual = await cliente.db.query.tareas.findFirst({
    where: () => and(eq(esquema.tareas.id, id), eq(esquema.tareas.userId, userId), SIN_ELIMINAR),
  });
  if (!actual) return null;

  const dia = actual.repetitivaId !== null || datos.fecha === "" ? actual.dia : datos.fecha;
  if (dia < hoy && dia !== actual.dia) throw new TareaEnElPasado();
  await verificarCategoriaDeTarea(cliente, userId, datos.categoriaId);
  const meta = columnasDeMeta(datos);

  const [fila] = await cliente.db
    .update(esquema.tareas)
    .set({
      titulo: datos.titulo,
      notas: datos.notas === "" ? null : datos.notas,
      hora: datos.hora === "" ? null : datos.hora,
      ...(datos.categoriaId === undefined ? {} : { categoriaId: datos.categoriaId }),
      // Sin `importante` se conserva.
      ...(datos.importante === undefined ? {} : { importante: datos.importante }),
      ...(meta ?? {}),
      // Al volverse progresiva pasa a fallar sola. Si ya lo era, se respeta lo que tenía: una fallida que la
      // persona devolvió a pendiente no vuelve a fallar sola.
      ...(meta?.metaCentesimos != null && actual.metaCentesimos === null ? { fallaSola: true } : {}),
      ...progresoAlCambiarLaMeta(actual, meta, ahora),
      dia,
    })
    .where(and(eq(esquema.tareas.id, id), eq(esquema.tareas.userId, userId), SIN_ELIMINAR))
    .returning();
  return fila ? aTarea(fila) : null;
}

/**
 * Lo que cambia en el progreso y el estado al cambiar la meta de una tarea:
 * - deja de ser progresiva: el progreso vuelve a 0 (el estado queda como estaba);
 * - pasa a ser progresiva o cambia la meta: si estaba pendiente y lo anotado ya llega a la meta nueva,
 *   se completa; si se había completado por llegar a la meta y la nueva queda arriba, vuelve a
 *   pendiente. Lo fallido no cambia.
 */
function progresoAlCambiarLaMeta(
  actual: FilaDeTarea,
  meta: ReturnType<typeof columnasDeMeta>,
  ahora: Date,
): { progresoCentesimos?: number; completadaEn?: Date | null } {
  if (meta === null) return {};
  if (meta.metaCentesimos === null) return { progresoCentesimos: 0 };
  if (actual.falladaEn !== null) return {};
  const llega = actual.progresoCentesimos >= meta.metaCentesimos;
  if (llega && actual.completadaEn === null) return { completadaEn: ahora };
  if (!llega && actual.completadaEn !== null && actual.metaCentesimos !== null) {
    return { completadaEn: null };
  }
  return {};
}

/**
 * Anota el progreso de una tarea progresiva: suma o resta una cantidad (sin bajar de 0) o corrige el total. Si llega a la meta, se
 * completa (si ya estaba completa, no cambia cuándo); si queda por debajo, vuelve a pendiente. Se puede en
 * una tarea de hoy, atrasada o ya completada (para corregir); no en una de un día futuro (`TareaFutura`),
 * en una fallida (`TareaFallida`: primero se deshace) ni en una que se tilda (`TareaNoProgresiva`).
 * Devuelve null si no existe, es de otra persona o está eliminada.
 */
export async function registrarProgreso(
  cliente: ClienteDb,
  userId: string,
  id: string,
  cambio: ProgresoDeTarea,
  ahora: Date = new Date(),
): Promise<Tarea | null> {
  const { hoy } = await hoyDeLaPersona(cliente, userId, ahora);
  return cliente.db.transaction(async (tx) => {
    // Bloquea la fila: dos sumas a la vez (dos toques rápidos) no se pisan.
    const [actual] = await tx
      .select()
      .from(esquema.tareas)
      .where(and(eq(esquema.tareas.id, id), eq(esquema.tareas.userId, userId), SIN_ELIMINAR))
      .for("update");
    if (!actual) return null;
    if (actual.metaCentesimos === null) throw new TareaNoProgresiva();
    if (actual.falladaEn !== null) throw new TareaFallida();
    if (actual.dia > hoy) throw new TareaFutura();

    const pedido =
      "sumar" in cambio
        ? actual.progresoCentesimos + aCentesimos(cambio.sumar)
        : "restar" in cambio
          ? // Restar más de lo que hay deja en 0.
            Math.max(0, actual.progresoCentesimos - aCentesimos(cambio.restar))
          : aCentesimos(cambio.total);
    // Sumar no pasa del tope que acepta la base.
    const progreso = Math.min(pedido, aCentesimos(MAXIMO_DE_META_DE_TAREA));
    const llega = progreso >= actual.metaCentesimos;

    const [fila] = await tx
      .update(esquema.tareas)
      .set({
        progresoCentesimos: progreso,
        completadaEn: llega ? (actual.completadaEn ?? ahora) : null,
      })
      .where(eq(esquema.tareas.id, actual.id))
      .returning();
    return fila ? aTarea(fila) : null;
  });
}

/**
 * Tilda o destilda una tarea (de cualquier día, también del historial). Tildar algo ya tildado no
 * cambia cuándo se hizo. Tildar una fallida la pasa a completada. Devuelve null si no existe, es de
 * otra persona o está eliminada.
 */
export async function completarTarea(
  cliente: ClienteDb,
  userId: string,
  id: string,
  completada: boolean,
  ahora: Date = new Date(),
): Promise<Tarea | null> {
  // Una progresiva no se tilda: se completa sola al llegar a la meta (ver registrarProgreso).
  const progresiva = await cliente.db.query.tareas.findFirst({
    columns: { metaCentesimos: true },
    where: () => and(eq(esquema.tareas.id, id), eq(esquema.tareas.userId, userId), SIN_ELIMINAR),
  });
  if (progresiva && progresiva.metaCentesimos !== null) throw new TareaProgresiva();

  const [fila] = await cliente.db
    .update(esquema.tareas)
    .set({
      completadaEn: completada
        ? sql`coalesce(${esquema.tareas.completadaEn}, ${ahora.toISOString()}::timestamptz)`
        : null,
      // Una tarea completada ya no es fallida. Y si se destilda, la persona decide: no vuelve a fallar sola y
      // arranca otra semana de atraso.
      ...(completada
        ? { falladaEn: null }
        : {
            fallaSola: false,
            reactivadaEn: sql`case when ${esquema.tareas.completadaEn} is not null then ${ahora.toISOString()}::timestamptz else ${esquema.tareas.reactivadaEn} end`,
          }),
    })
    .where(and(eq(esquema.tareas.id, id), eq(esquema.tareas.userId, userId), SIN_ELIMINAR))
    .returning();
  return fila ? aTarea(fila) : null;
}

/**
 * Marca una tarea como fallida (ya no se va a hacer) o la vuelve a dejar pendiente. Puede fallar una
 * tarea atrasada o una de hoy —la persona ya sabe que no la va a hacer—; una de un día futuro todavía no
 * le toca (`TareaFutura`). Marcar como fallida algo ya fallido no cambia cuándo se marcó; si estaba
 * completada, deja de estarlo. Devolver una fallida a pendiente se puede en cualquier momento.
 * Devuelve null si no existe, es de otra persona o está eliminada.
 */
export async function fallarTarea(
  cliente: ClienteDb,
  userId: string,
  id: string,
  fallida: boolean,
  ahora: Date = new Date(),
): Promise<Tarea | null> {
  const { hoy } = await hoyDeLaPersona(cliente, userId, ahora);
  const actual = await cliente.db.query.tareas.findFirst({
    where: () => and(eq(esquema.tareas.id, id), eq(esquema.tareas.userId, userId), SIN_ELIMINAR),
  });
  if (!actual) return null;
  if (fallida && actual.dia > hoy) throw new TareaFutura();

  const [fila] = await cliente.db
    .update(esquema.tareas)
    .set(
      fallida
        ? {
            falladaEn: sql`coalesce(${esquema.tareas.falladaEn}, ${ahora.toISOString()}::timestamptz)`,
            completadaEn: null,
          }
        : // Deshacer una fallida (también una automática) no la deja volver a fallar sola y arranca otra
          // semana de atraso.
          {
            falladaEn: null,
            fallaSola: false,
            reactivadaEn: sql`case when ${esquema.tareas.falladaEn} is not null then ${ahora.toISOString()}::timestamptz else ${esquema.tareas.reactivadaEn} end`,
          },
    )
    .where(and(eq(esquema.tareas.id, id), eq(esquema.tareas.userId, userId), SIN_ELIMINAR))
    .returning();
  return fila ? aTarea(fila) : null;
}

/** Borrado lógico. Devuelve false si no existe, es de otra persona o ya estaba eliminada. */
export async function eliminarTarea(
  cliente: ClienteDb,
  userId: string,
  id: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  const filas = await cliente.db
    .update(esquema.tareas)
    .set({ eliminadoEn: ahora })
    .where(and(eq(esquema.tareas.id, id), eq(esquema.tareas.userId, userId), SIN_ELIMINAR))
    .returning({ id: esquema.tareas.id });
  return filas.length > 0;
}

/**
 * El historial: las tareas de días anteriores a hoy agrupadas por día, el más reciente primero. Sin filtros,
 * los últimos DIAS_POR_DEFECTO_DEL_HISTORIAL días. Se puede acotar por fechas, estado, categoría y
 * periodicidad (de la repetitiva de la que salió, o "unica" para las sueltas). Hoy y el futuro nunca entran,
 * ni lo que se conserva de más de un año. Trae como mucho MAXIMO_DE_TAREAS_EN_EL_HISTORIAL tareas: si hay
 * más, `hayMas` avisa que conviene acotar el rango.
 */
export async function listarHistorial(
  cliente: ClienteDb,
  userId: string,
  opciones: FiltrosDeHistorial & { ahora?: Date | undefined } = {},
): Promise<HistorialDeTareas> {
  const ahora = opciones.ahora ?? new Date();
  const { hoy } = await hoyDeLaPersona(cliente, userId, ahora);
  await generarTareasRepetitivas(cliente, userId, hoy);

  const ayer = sumarDias(hoy, -1);
  const piso = sumarDias(hoy, -DIAS_DE_HISTORIAL_DE_TAREAS);
  // El rango pedido se recorta a lo que el historial puede mostrar. Sin `desde`, son 7 días que terminan en
  // `hasta`; sin `hasta`, llega hasta ayer.
  const hasta = opciones.hasta !== undefined && opciones.hasta < ayer ? opciones.hasta : ayer;
  const pedidoDesde = opciones.desde ?? sumarDias(hasta, -(DIAS_POR_DEFECTO_DEL_HISTORIAL - 1));
  const desde = pedidoDesde > piso ? pedidoDesde : piso;

  const { tareas, tareasRepetitivas } = esquema;
  const condiciones: (SQL | undefined)[] = [
    eq(tareas.userId, userId),
    SIN_ELIMINAR,
    gte(tareas.dia, desde),
    lte(tareas.dia, hasta),
  ];
  if (opciones.estado === "pendiente") condiciones.push(PENDIENTE);
  if (opciones.estado === "completada") condiciones.push(isNotNull(tareas.completadaEn));
  if (opciones.estado === "fallida") condiciones.push(isNotNull(tareas.falladaEn));
  if (opciones.categoriaId === "sin") condiciones.push(isNull(tareas.categoriaId));
  else if (opciones.categoriaId !== undefined) {
    condiciones.push(eq(tareas.categoriaId, opciones.categoriaId));
  }
  if (opciones.repeticion === "unica") condiciones.push(isNull(tareas.repetitivaId));
  else if (opciones.repeticion !== undefined) {
    condiciones.push(eq(tareasRepetitivas.repeticion, opciones.repeticion));
  }

  // Un día de más del tope, para saber si quedó algo afuera sin tener que contarlo todo.
  const filas =
    desde > hasta
      ? []
      : await cliente.db
          .select({ tarea: tareas })
          .from(tareas)
          .leftJoin(tareasRepetitivas, eq(tareasRepetitivas.id, tareas.repetitivaId))
          .where(and(...condiciones))
          .orderBy(desc(tareas.dia))
          .limit(MAXIMO_DE_TAREAS_EN_EL_HISTORIAL + 1);

  const hayMas = filas.length > MAXIMO_DE_TAREAS_EN_EL_HISTORIAL;
  const porDia = new Map<string, FilaDeTarea[]>();
  for (const { tarea } of filas.slice(0, MAXIMO_DE_TAREAS_EN_EL_HISTORIAL)) {
    porDia.set(tarea.dia, [...(porDia.get(tarea.dia) ?? []), tarea]);
  }

  return {
    desde,
    hasta,
    hayMas,
    dias: [...porDia].map(([dia, delDia]) => {
      const ordenadas = [...delDia].sort(porHora);
      return {
        dia,
        tareas: ordenadas.map(aTarea),
        hechas: ordenadas.filter((fila) => fila.completadaEn !== null).length,
        falladas: ordenadas.filter((fila) => fila.falladaEn !== null).length,
      };
    }),
  };
}

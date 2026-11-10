// Datos de los widgets del módulo de tareas (GET /api/tareas/widgets).
//
// Devuelve datos, no frases: la web decide cómo escribirlos (mismo criterio que los widgets de
// Finanzas y Contactos). Todo filtra por la persona de la sesión.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  DIAS_DE_ATRASO_PARA_FALLAR,
  diasEntre,
  type RepeticionDeTarea,
  sumarDias,
} from "@gestoria/shared";
import { and, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { listarTareasRepetitivas } from "./repetitivas.ts";
import { listarTareasDeHoy, type Tarea } from "./tareas.ts";

/** Cuántos días muestra el gráfico de la semana (hoy incluido). */
const DIAS_DEL_GRAFICO = 7;
/** Cuántos días hacia atrás se mira para la racha y para la constancia de las rutinas. */
const DIAS_PARA_LA_RACHA = 60;
const DIAS_DE_CONSTANCIA = 14;
/** Una rutina necesita al menos esta cantidad de días en el período para entrar en el ranking. */
const MINIMO_DE_DIAS_DE_UNA_RUTINA = 3;
const CANTIDAD_EN_LISTAS = 3;
/** Cuántas categorías caben en un ranking. */
const CANTIDAD_EN_RANKING_DE_CATEGORIAS = 5;
/** Cuántos días mira "lo hecho por categoría" (hoy incluido). */
const DIAS_DE_LO_HECHO_POR_CATEGORIA = 30;
/** Cuántos días mira el cumplimiento por categoría (sin hoy, que todavía no terminó). */
const DIAS_DE_CUMPLIMIENTO_POR_CATEGORIA = 14;
/** Una categoría necesita al menos esta cantidad de tareas en el período para entrar en el cumplimiento. */
const MINIMO_DE_TAREAS_DE_UNA_CATEGORIA = 3;

/** Cuántos días hacia atrás se cuentan las tareas fallidas (hoy incluido). */
const DIAS_DE_FALLIDAS = 14;
/** Desde cuántos días de atraso se avisa que una tarea está por darse por fallida. */
const DIAS_DE_ATRASO_PARA_AVISAR = DIAS_DE_ATRASO_PARA_FALLAR - 2;

/** Una categoría para los rankings; con `id` en nulo son las tareas sin categoría. */
export type CategoriaDeWidget = { id: number | null; nombre: string | null; color: string | null };

export type WidgetsDeTareas = {
  /** El día de hoy para la persona. */
  hoy: string;
  /** Lo de hoy: las tareas de hoy que se hicieron y las que faltan (las atrasadas no cuentan; tienen su propio dato). */
  hoyHechas: number;
  hoyPendientes: number;
  /** Las de hoy que se dieron por fallidas hoy: cuentan en el total del día, como no hechas. */
  hoyFallidas: number;
  /** Las que se arrastran de días anteriores. `primeras` son las más viejas. */
  atrasadas: { total: number; primeras: { titulo: string; dia: string }[] };
  /** Lo que sigue por hacer hoy, en orden de hora (todo el día primero). */
  proximas: { titulo: string; hora: string | null }[];
  /** Tareas sueltas con un día futuro; `primera` es la que cae antes y `primeras`, las que siguen. */
  masAdelante: {
    total: number;
    primera: TareaQueViene | null;
    primeras: TareaQueViene[];
  };
  /** Los últimos 7 días, el de hoy al final: cuántas tareas hubo y cuántas se hicieron. */
  ultimosDias: { dia: string; total: number; hechas: number }[];
  /**
   * Días seguidos en los que se hizo todo, hacia atrás desde hoy (si hoy ya está todo hecho, cuenta;
   * si todavía falta algo, se cuenta desde ayer). Los días sin tareas no cortan ni suman.
   */
  racha: number;
  /** Las rutinas (tareas repetitivas) que más se cumplen, de las últimas dos semanas. */
  rutinas: { titulo: string; hechas: number; total: number }[];
  /** Cuántas tareas repetitivas vigentes tiene la persona. */
  repetitivas: number;
  /** Las tareas que se dieron por fallidas (a mano o solas) en las últimas dos semanas; `ultimas` son las más recientes. */
  fallidas: { total: number; ultimas: { titulo: string; dia: string }[] };
  /**
   * Atrasadas que están por darse por fallidas solas (llevan 5 días o más). `primera` es la más
   * vieja y `dias` cuántos faltan para que se dé por fallida.
   */
  porFallar: {
    total: number;
    primera: { titulo: string; dia: string; dias: number } | null;
  };
  /** Lo que se hizo hoy, según de qué día era: de hoy, de días anteriores o adelantadas. */
  hechasHoyPorOrigen: { deHoy: number; atrasadas: number; adelantadas: number };
  /** Las tareas repetitivas vigentes por periodicidad (solo las que tienen alguna). */
  periodicidades: { repeticion: RepeticionDeTarea; total: number }[];
  /** Cuántas repetitivas se dan por fallidas solas si pasa el día. */
  fallanSolas: number;
  /** Las de "cada varios días" que le tocan antes. */
  cadaVariosDias: { titulo: string; cadaDias: number; diasRestantes: number }[];
  /** Las tareas vistas por categoría. Cada lista viene de la que más tiene a la que menos. */
  categorias: {
    /** Cuántas categorías tiene la persona. */
    cantidad: number;
    /** Cuántas tareas de las que faltan hacer no tienen categoría (cuenta todas, no solo las del ranking). */
    sinCategoria: number;
    /** Lo que falta hacer (atrasadas, de hoy y con día futuro), por categoría. */
    pendientes: (CategoriaDeWidget & { total: number })[];
    /** Las atrasadas por categoría. */
    atrasadas: (CategoriaDeWidget & { total: number })[];
    /** Lo hecho en los últimos 30 días (hoy incluido), por categoría. */
    hechas: (CategoriaDeWidget & { total: number })[];
    /** Hechas contra total de los últimos 14 días (sin hoy), de las categorías con al menos 3 tareas. */
    cumplimiento: (CategoriaDeWidget & { hechas: number; total: number })[];
  };
};

/** Ordena de más a menos; a igual cantidad, por nombre y las sin categoría al final. */
function ordenarPorCantidad<T extends CategoriaDeWidget & { total: number }>(filas: T[]): T[] {
  return filas.sort(
    (a, b) =>
      b.total - a.total ||
      (a.id === null ? 1 : 0) - (b.id === null ? 1 : 0) ||
      (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"),
  );
}

type TareaQueViene = { titulo: string; dia: string; hora: string | null; dias: number };

function resumir(tarea: Tarea): { titulo: string; hora: string | null } {
  return { titulo: tarea.titulo, hora: tarea.hora };
}

export async function obtenerWidgetsDeTareas(
  cliente: ClienteDb,
  userId: string,
  ahora: Date = new Date(),
): Promise<WidgetsDeTareas> {
  // La lista de hoy ya arma las repetitivas que falten, así los números de abajo están al día.
  const lista = await listarTareasDeHoy(cliente, userId, ahora);
  const { hoy } = lista;

  const { tareas } = esquema;
  // Todas las tareas de cada día, hechas o no: una tarea suelta que quedó pendiente también cuenta
  // como no hecha ese día (sigue en la lista como atrasada, pero ese día no se cumplió todo).
  const delasDeLaPersona = and(eq(tareas.userId, userId), isNull(tareas.eliminadoEn));

  const [
    porDia,
    rutinas,
    repetitivas,
    deLaPersona,
    hechasPorCategoria,
    cumplimientoPorCategoria,
    fallidas,
    listaDeRepetitivas,
  ] = await Promise.all([
    cliente.db
      .select({
        dia: tareas.dia,
        total: sql<number>`count(*)`.mapWith(Number),
        hechas: sql<number>`count(${tareas.completadaEn})`.mapWith(Number),
      })
      .from(tareas)
      .where(
        and(
          delasDeLaPersona,
          gte(tareas.dia, sumarDias(hoy, -DIAS_PARA_LA_RACHA)),
          lt(tareas.dia, hoy),
        ),
      )
      .groupBy(tareas.dia)
      .orderBy(desc(tareas.dia)),
    cliente.db
      .select({
        titulo: esquema.tareasRepetitivas.titulo,
        total: sql<number>`count(*)`.mapWith(Number),
        hechas: sql<number>`count(${tareas.completadaEn})`.mapWith(Number),
      })
      .from(tareas)
      .innerJoin(esquema.tareasRepetitivas, eq(esquema.tareasRepetitivas.id, tareas.repetitivaId))
      .where(
        and(
          eq(tareas.userId, userId),
          isNull(tareas.eliminadoEn),
          isNull(esquema.tareasRepetitivas.eliminadoEn),
          gte(tareas.dia, sumarDias(hoy, -DIAS_DE_CONSTANCIA)),
          lt(tareas.dia, hoy),
        ),
      )
      .groupBy(esquema.tareasRepetitivas.id, esquema.tareasRepetitivas.titulo)
      .having(sql`count(*) >= ${MINIMO_DE_DIAS_DE_UNA_RUTINA}`)
      .orderBy(
        sql`count(${tareas.completadaEn})::float / count(*) desc`,
        sql`count(*) desc`,
        esquema.tareasRepetitivas.titulo,
      )
      .limit(CANTIDAD_EN_LISTAS),
    cliente.db
      .select({ total: sql<number>`count(*)`.mapWith(Number) })
      .from(esquema.tareasRepetitivas)
      .where(
        and(
          eq(esquema.tareasRepetitivas.userId, userId),
          isNull(esquema.tareasRepetitivas.eliminadoEn),
        ),
      ),
    cliente.db
      .select({
        id: esquema.categoriasDeTareas.id,
        nombre: esquema.categoriasDeTareas.nombre,
        color: esquema.categoriasDeTareas.color,
      })
      .from(esquema.categoriasDeTareas)
      .where(eq(esquema.categoriasDeTareas.userId, userId)),
    cliente.db
      .select({ categoriaId: tareas.categoriaId, total: sql<number>`count(*)`.mapWith(Number) })
      .from(tareas)
      .where(
        and(
          delasDeLaPersona,
          isNotNull(tareas.completadaEn),
          gte(tareas.dia, sumarDias(hoy, -(DIAS_DE_LO_HECHO_POR_CATEGORIA - 1))),
          lte(tareas.dia, hoy),
        ),
      )
      .groupBy(tareas.categoriaId),
    cliente.db
      .select({
        categoriaId: tareas.categoriaId,
        total: sql<number>`count(*)`.mapWith(Number),
        hechas: sql<number>`count(${tareas.completadaEn})`.mapWith(Number),
      })
      .from(tareas)
      .where(
        and(
          delasDeLaPersona,
          gte(tareas.dia, sumarDias(hoy, -DIAS_DE_CUMPLIMIENTO_POR_CATEGORIA)),
          lt(tareas.dia, hoy),
        ),
      )
      .groupBy(tareas.categoriaId)
      .having(sql`count(*) >= ${MINIMO_DE_TAREAS_DE_UNA_CATEGORIA}`),
    cliente.db
      .select({ titulo: tareas.titulo, dia: tareas.dia })
      .from(tareas)
      .where(
        and(
          delasDeLaPersona,
          isNotNull(tareas.falladaEn),
          gte(tareas.dia, sumarDias(hoy, -(DIAS_DE_FALLIDAS - 1))),
          lte(tareas.dia, hoy),
        ),
      )
      .orderBy(desc(tareas.dia), tareas.titulo),
    listarTareasRepetitivas(cliente, userId, ahora),
  ]);

  // Las categorías, para ponerle nombre y color a cada cuenta. Una tarea sin categoría (o con una que
  // ya no existe) va junta, como "sin categoría".
  const porId = new Map(deLaPersona.map((categoria) => [categoria.id, categoria]));
  const deCategoria = (categoriaId: number | null): CategoriaDeWidget => {
    const categoria = categoriaId === null ? undefined : porId.get(categoriaId);
    return categoria
      ? { id: categoria.id, nombre: categoria.nombre, color: categoria.color }
      : { id: null, nombre: null, color: null };
  };
  /** Cuenta tareas por categoría. */
  const contarPorCategoria = (filas: { categoriaId: number | null }[]) => {
    const cuentas = new Map<number | null, CategoriaDeWidget & { total: number }>();
    for (const fila of filas) {
      const categoria = deCategoria(fila.categoriaId);
      const actual = cuentas.get(categoria.id);
      if (actual) actual.total += 1;
      else cuentas.set(categoria.id, { ...categoria, total: 1 });
    }
    return ordenarPorCantidad([...cuentas.values()]);
  };

  // Igual que el avance de la pantalla de Hoy: lo hecho hoy (de cualquier día) contra lo que falta.
  // Solo las tareas de hoy (las atrasadas tienen su propio dato): es el mismo avance que muestra la pestaña Hoy.
  const hoyHechas = lista.hechasHoy.filter((tarea) => tarea.dia === hoy).length;
  const hoyPendientes = lista.deHoy.length;
  const hoyFallidas = lista.falladasHoy.filter((tarea) => tarea.dia === hoy).length;

  // Hoy cuenta para la racha solo si ya se hizo todo (y había algo): una dada por fallida no se hizo.
  const delDia = new Map(porDia.map((fila) => [fila.dia, fila]));
  const hoyCompleto = hoyPendientes === 0 && hoyFallidas === 0 && hoyHechas > 0;
  let racha = hoyCompleto ? 1 : 0;
  for (let atras = 1; atras <= DIAS_PARA_LA_RACHA; atras++) {
    const fila = delDia.get(sumarDias(hoy, -atras));
    if (!fila) continue; // un día sin tareas no corta la racha
    if (fila.hechas < fila.total) break;
    racha += 1;
  }

  const ultimosDias = Array.from({ length: DIAS_DEL_GRAFICO }, (_, indice) => {
    const dia = sumarDias(hoy, indice - (DIAS_DEL_GRAFICO - 1));
    if (dia === hoy) {
      return { dia, total: hoyHechas + hoyPendientes + hoyFallidas, hechas: hoyHechas };
    }
    const fila = delDia.get(dia);
    return { dia, total: fila?.total ?? 0, hechas: fila?.hechas ?? 0 };
  });

  const queViene = (tarea: Tarea): TareaQueViene => ({
    titulo: tarea.titulo,
    dia: tarea.dia,
    hora: tarea.hora,
    dias: diasEntre(hoy, tarea.dia),
  });
  const primeraAdelante = lista.masAdelante[0];

  // Las atrasadas ya vienen de la más vieja a la más nueva.
  const porFallar = lista.atrasadas.filter(
    (tarea) => diasEntre(tarea.dia, hoy) >= DIAS_DE_ATRASO_PARA_AVISAR,
  );
  const masVieja = porFallar[0];
  const hechasHoy = lista.hechasHoy;

  const porPeriodicidad = new Map<RepeticionDeTarea, number>();
  for (const repetitiva of listaDeRepetitivas) {
    porPeriodicidad.set(
      repetitiva.repeticion,
      (porPeriodicidad.get(repetitiva.repeticion) ?? 0) + 1,
    );
  }

  return {
    hoy,
    hoyHechas,
    hoyPendientes,
    hoyFallidas,
    atrasadas: {
      total: lista.atrasadas.length,
      primeras: lista.atrasadas
        .slice(0, CANTIDAD_EN_LISTAS)
        .map((tarea) => ({ titulo: tarea.titulo, dia: tarea.dia })),
    },
    proximas: lista.deHoy.slice(0, CANTIDAD_EN_LISTAS).map(resumir),
    masAdelante: {
      total: lista.masAdelante.length,
      primera: primeraAdelante ? queViene(primeraAdelante) : null,
      primeras: lista.masAdelante.slice(0, CANTIDAD_EN_LISTAS).map(queViene),
    },
    ultimosDias,
    racha,
    rutinas,
    repetitivas: repetitivas[0]?.total ?? 0,
    fallidas: {
      total: fallidas.length,
      ultimas: fallidas.slice(0, CANTIDAD_EN_LISTAS),
    },
    porFallar: {
      total: porFallar.length,
      primera: masVieja
        ? {
            titulo: masVieja.titulo,
            dia: masVieja.dia,
            // Se da por fallida cuando el atraso pasa de DIAS_DE_ATRASO_PARA_FALLAR días.
            dias: Math.max(1, DIAS_DE_ATRASO_PARA_FALLAR + 1 - diasEntre(masVieja.dia, hoy)),
          }
        : null,
    },
    hechasHoyPorOrigen: {
      deHoy: hechasHoy.filter((tarea) => tarea.dia === hoy).length,
      atrasadas: hechasHoy.filter((tarea) => tarea.dia < hoy).length,
      adelantadas: hechasHoy.filter((tarea) => tarea.dia > hoy).length,
    },
    periodicidades: [...porPeriodicidad.entries()].map(([repeticion, total]) => ({
      repeticion,
      total,
    })),
    fallanSolas: listaDeRepetitivas.filter((repetitiva) => repetitiva.fallaSola).length,
    cadaVariosDias: listaDeRepetitivas
      .filter((repetitiva) => repetitiva.repeticion === "intervalo" && repetitiva.cadaDias !== null)
      .slice(0, CANTIDAD_EN_LISTAS)
      .map((repetitiva) => ({
        titulo: repetitiva.titulo,
        cadaDias: repetitiva.cadaDias ?? 0,
        diasRestantes: repetitiva.diasRestantes,
      })),
    categorias: {
      cantidad: deLaPersona.length,
      sinCategoria: [...lista.atrasadas, ...lista.deHoy, ...lista.masAdelante].filter(
        (tarea) => deCategoria(tarea.categoriaId).id === null,
      ).length,
      pendientes: contarPorCategoria([
        ...lista.atrasadas,
        ...lista.deHoy,
        ...lista.masAdelante,
      ]).slice(0, CANTIDAD_EN_RANKING_DE_CATEGORIAS),
      atrasadas: contarPorCategoria(lista.atrasadas).slice(0, CANTIDAD_EN_RANKING_DE_CATEGORIAS),
      hechas: ordenarPorCantidad(
        hechasPorCategoria.map((fila) => ({ ...deCategoria(fila.categoriaId), total: fila.total })),
      ).slice(0, CANTIDAD_EN_RANKING_DE_CATEGORIAS),
      cumplimiento: cumplimientoPorCategoria
        .map((fila) => ({
          ...deCategoria(fila.categoriaId),
          total: fila.total,
          hechas: fila.hechas,
        }))
        .sort(
          (a, b) =>
            b.hechas / b.total - a.hechas / a.total ||
            b.total - a.total ||
            (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"),
        )
        .slice(0, CANTIDAD_EN_RANKING_DE_CATEGORIAS),
    },
  };
}

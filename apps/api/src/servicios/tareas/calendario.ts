// Lo que Tareas aporta al calendario: las tareas en el día que les toca, con su estado (pendiente,
// completada o fallida).
//
// Dos clases de tareas, que se ven igual:
// - Las que ya existen como fila (sueltas de uso único, y las que armó una repetitiva para un día
//   que ya llegó): las pendientes, las tildadas (`completado`) y las fallidas (`fallido`); la web
//   oculta las dos últimas salvo que la persona pida verlas. Las eliminadas no. Una atrasada, sea suelta
//   o de una repetitiva, se queda en el día en que había que hacerla (y además está en Atrasadas de
//   Tareas, así que el calendario muestra como pendiente lo mismo que Tareas).
// - Las que todavía no existen: una repetitiva arma sus tareas recién cuando llega el día (ver
//   repetitivas.ts), pero el calendario mira hacia adelante, así que para los días futuros se
//   calculan en qué días del rango le toca (`ocurrenciasEnRango`). Para hoy y los días pasados no
//   se inventa nada: ahí valen las filas reales, que ya cubren lo hecho, lo pendiente y lo eliminado.
//
// Antes de leer se arman las tareas de las repetitivas que falten hasta hoy, igual que la lista de hoy.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  desdeCentesimos,
  type EventoDeCalendario,
  ocurrenciasEnRango,
  progresoEnPalabras,
  proximaOcurrenciaDeTarea,
  type RangoDeEventos,
  type RepeticionDeEvento,
  type RepeticionDeTarea,
  recortarHora,
  sumarDias,
} from "@gestoria/shared";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { generarTareasRepetitivas } from "./repetitivas.ts";

/**
 * El contexto de una tarea: cuánto lleva si es progresiva ("1,5 de 2 litros"), la categoría ("Casa") y si
 * se repite.
 */
function detalleDe(
  categoria: string | null,
  repetitiva: boolean,
  progreso: string | null = null,
): string | null {
  const partes = [progreso, categoria, repetitiva ? "Se repite" : null].filter(
    (parte): parte is string => parte !== null,
  );
  return partes.length === 0 ? null : partes.join(" · ");
}

/** Las tareas (reales y por venir) dentro del rango, de la persona. `hoy` es el de su zona. */
export async function eventosDeTareas(
  cliente: ClienteDb,
  userId: string,
  rango: RangoDeEventos,
  hoy: string,
): Promise<EventoDeCalendario[]> {
  await generarTareasRepetitivas(cliente, userId, hoy);

  const { tareas, tareasRepetitivas, categoriasDeTareas } = esquema;
  const [reales, reglas] = await Promise.all([
    cliente.db
      .select({
        tarea: tareas,
        categoria: categoriasDeTareas.nombre,
        // De qué repetitiva salió, para saber cada cuánto se repite; en nulo si es una tarea suelta.
        repeticion: tareasRepetitivas.repeticion,
      })
      .from(tareas)
      .leftJoin(categoriasDeTareas, eq(categoriasDeTareas.id, tareas.categoriaId))
      .leftJoin(tareasRepetitivas, eq(tareasRepetitivas.id, tareas.repetitivaId))
      .where(
        and(
          eq(tareas.userId, userId),
          isNull(tareas.eliminadoEn),
          gte(tareas.dia, rango.desde),
          lte(tareas.dia, rango.hasta),
        ),
      ),
    // Solo hace falta mirar las repetitivas si el rango llega a días posteriores a hoy.
    rango.hasta > hoy
      ? cliente.db
          .select({ regla: tareasRepetitivas, categoria: categoriasDeTareas.nombre })
          .from(tareasRepetitivas)
          .leftJoin(categoriasDeTareas, eq(categoriasDeTareas.id, tareasRepetitivas.categoriaId))
          .where(and(eq(tareasRepetitivas.userId, userId), isNull(tareasRepetitivas.eliminadoEn)))
      : Promise.resolve([]),
  ]);

  const deLasFilas = reales.map(
    ({ tarea, categoria, repeticion }): EventoDeCalendario => ({
      id: `tarea:${tarea.id}`,
      origen: "tareas",
      titulo: tarea.titulo,
      detalle: detalleDe(
        categoria,
        tarea.repetitivaId !== null,
        tarea.metaCentesimos === null
          ? null
          : progresoEnPalabras(
              desdeCentesimos(tarea.progresoCentesimos),
              desdeCentesimos(tarea.metaCentesimos),
              tarea.unidad,
            ),
      ),
      dia: tarea.dia,
      hora: recortarHora(tarea.hora),
      // Una tarea suelta es "una sola vez"; las demás se repiten según su regla.
      repeticion: (repeticion as RepeticionDeEvento | null) ?? "unica",
      completado: tarea.completadaEn !== null,
      fallido: tarea.falladaEn !== null,
    }),
  );

  // Los días por venir: desde mañana, y nunca antes del día en que se creó la repetitiva.
  const deLasReglas = reglas.flatMap(({ regla, categoria }) => {
    const cuando = {
      repeticion: regla.repeticion as RepeticionDeTarea,
      diasSemana: regla.diasSemana,
      diaDelMes: regla.diaDelMes,
      mes: regla.mes,
      cadaDias: regla.cadaDias,
      fechaInicio: regla.fechaInicio,
    };
    const primero = [rango.desde, sumarDias(hoy, 1), regla.desde].reduce((a, b) => (b > a ? b : a));
    return ocurrenciasEnRango(
      (desde) => proximaOcurrenciaDeTarea(cuando, desde),
      primero,
      rango.hasta,
    ).map(
      (dia): EventoDeCalendario => ({
        id: `repetitiva:${regla.id}:${dia}`,
        origen: "tareas",
        titulo: regla.titulo,
        detalle: detalleDe(categoria, true),
        dia,
        hora: recortarHora(regla.hora),
        repeticion: cuando.repeticion,
        completado: false,
        fallido: false,
      }),
    );
  });

  return [...deLasFilas, ...deLasReglas];
}

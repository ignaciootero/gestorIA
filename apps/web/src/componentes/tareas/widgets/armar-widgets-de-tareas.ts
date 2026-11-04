// Convierte los datos que devuelve la API (GET /api/tareas/widgets) en la lista de widgets de
// Tareas: primero los avisos y después las cifras y gráficos.
//
// La API cuenta y ordena; acá se escribe en español de todos los días. Es una función pura para
// que sea fácil de leer y de probar: no toca el DOM ni pide nada.

import {
  describirDiasRestantes,
  formatearDiaYMes,
  NOMBRES_DE_REPETICION_DE_TAREA,
} from "@gestoria/shared";
import {
  CalendarClock,
  CalendarDays,
  CalendarSync,
  CircleCheckBig,
  CircleX,
  Flame,
  Hourglass,
  ListChecks,
  ListPlus,
  PartyPopper,
  Repeat,
  Tag,
  Tags,
  TriangleAlert,
} from "lucide-react";
import type { DatoDeWidget } from "@/componentes/widgets/tipos";
import type { CategoriaDeWidget, WidgetsDeTareas } from "@/lib/api-tareas";

function plural(cantidad: number, singular: string, pluralDe: string): string {
  return cantidad === 1 ? singular : pluralDe;
}

function armarAvisos(datos: WidgetsDeTareas): DatoDeWidget[] {
  const avisos: DatoDeWidget[] = [];
  const { atrasadas, hoyHechas, hoyPendientes, hoyFallidas } = datos;

  const hayAlgo =
    hoyHechas + hoyPendientes + hoyFallidas > 0 ||
    datos.repetitivas > 0 ||
    datos.masAdelante.total > 0 ||
    datos.ultimosDias.some((dia) => dia.total > 0);
  if (!hayAlgo) {
    avisos.push({
      id: "sin-tareas",
      tipo: "aviso",
      categoria: "texto",
      tono: "info",
      Icono: ListPlus,
      titulo: "Todavía sin tareas",
      detalle:
        "Escribí tu primera tarea arriba y apretá Enter. Si es algo que se repite, usá “Agregar tarea”.",
    });
    return avisos;
  }

  if (atrasadas.total > 0) {
    avisos.push({
      id: "tareas-atrasadas",
      tipo: "aviso",
      categoria: "texto",
      tono: "advertencia",
      Icono: TriangleAlert,
      titulo: atrasadas.total === 1 ? "Tarea atrasada" : "Tareas atrasadas",
      valor: String(atrasadas.total),
      detalle: `${atrasadas.total === 1 ? "Quedó" : "Quedaron"} de días anteriores y ${atrasadas.total === 1 ? "sigue" : "siguen"} en tu lista hasta que ${atrasadas.total === 1 ? "la hagas" : "las hagas"}.`,
      extras: atrasadas.primeras.map((tarea) => ({
        etiqueta: tarea.titulo,
        valor: `Era del ${formatearDiaYMes(tarea.dia)}`,
      })),
    });
  }

  if (datos.porFallar.total > 0 && datos.porFallar.primera) {
    const { primera, total } = datos.porFallar;
    avisos.push({
      id: "tareas-por-fallar",
      tipo: "aviso",
      categoria: "texto",
      tono: "peligro",
      Icono: Hourglass,
      titulo: total === 1 ? "Una tarea por darse por fallida" : "Tareas por darse por fallidas",
      valor: String(total),
      detalle: `Llevan casi una semana atrasadas. ${primera.titulo} se da por fallida ${primera.dias === 1 ? "mañana" : `en ${primera.dias} días`} si no la hacés o la dejás como pendiente.`,
    });
  }

  if (hoyPendientes === 0 && hoyFallidas === 0 && hoyHechas > 0) {
    avisos.push({
      id: "todo-hecho",
      tipo: "aviso",
      categoria: "texto",
      tono: "exito",
      Icono: PartyPopper,
      titulo: "¡Todo hecho por hoy!",
      valor: String(hoyHechas),
      detalle: `Hiciste ${hoyHechas === 1 ? "la única tarea" : `las ${hoyHechas} tareas`} de hoy.`,
    });
  }

  return avisos;
}

function armarCifras(datos: WidgetsDeTareas): DatoDeWidget[] {
  const {
    hoyHechas,
    hoyPendientes,
    hoyFallidas,
    proximas,
    masAdelante,
    ultimosDias,
    racha,
    rutinas,
  } = datos;
  // Una de hoy dada por fallida no se hizo: sigue en el total del día.
  const totalDeHoy = hoyHechas + hoyPendientes + hoyFallidas;
  const widgets: DatoDeWidget[] = [];

  if (hoyPendientes > 0) {
    const primera = proximas[0];
    widgets.push({
      id: "falta-hoy",
      categoria: "texto",
      tipo: "dato",
      tono: "neutro",
      Icono: ListChecks,
      titulo: "Falta hacer hoy",
      valor: String(hoyPendientes),
      detalle: primera
        ? `Lo que sigue: ${primera.titulo}${primera.hora ? ` a las ${primera.hora}` : ""}.`
        : `${hoyPendientes === 1 ? "Es una tarea atrasada" : "Son tareas atrasadas"}.`,
      extras: proximas.map((tarea) => ({
        etiqueta: tarea.titulo,
        valor: tarea.hora ?? "Todo el día",
      })),
    });
  }

  if (totalDeHoy > 0) {
    widgets.push({
      id: "avance-de-hoy",
      categoria: "grafico",
      tipo: "dato",
      tono: "neutro",
      Icono: ListChecks,
      titulo: "Avance de hoy",
      valor: `${hoyHechas} de ${totalDeHoy}`,
      detalle: `${plural(hoyHechas, "Hecha", "Hechas")} ${plural(totalDeHoy, "de la tarea", "de las tareas")} de hoy.`,
      visual: {
        tipo: "anillo",
        porcentaje: Math.round((hoyHechas / totalDeHoy) * 100),
        color: "var(--color-acento)",
      },
    });
  }

  if (masAdelante.primera) {
    const { primera } = masAdelante;
    widgets.push({
      id: "mas-adelante",
      categoria: "texto",
      tipo: "dato",
      tono: "neutro",
      Icono: CalendarClock,
      titulo: "Lo próximo",
      valor: describirDiasRestantes(primera.dias),
      detalle: `${primera.titulo}, el ${formatearDiaYMes(primera.dia)}${primera.hora ? ` a las ${primera.hora}` : ""}.`,
      extras: [{ etiqueta: "Tareas con día futuro", valor: String(masAdelante.total) }],
    });
  }

  if (racha > 0) {
    widgets.push({
      id: "racha",
      categoria: "texto",
      tipo: "dato",
      tono: racha >= 3 ? "exito" : "neutro",
      Icono: Flame,
      titulo: "Tu racha",
      valor: `${racha} ${plural(racha, "día", "días")}`,
      detalle:
        racha === 1
          ? "Hiciste todo lo que tenías en el último día con tareas."
          : `Hiciste todo lo que tenías, ${racha} días seguidos.`,
    });
  }

  if (ultimosDias.some((dia) => dia.total > 0)) {
    const hechas = ultimosDias.reduce((suma, dia) => suma + dia.hechas, 0);
    const total = ultimosDias.reduce((suma, dia) => suma + dia.total, 0);
    widgets.push({
      id: "tu-semana",
      categoria: "grafico",
      tipo: "dato",
      tono: "neutro",
      Icono: CalendarDays,
      titulo: "Tu semana",
      valor: `${hechas} de ${total}`,
      detalle:
        "Tareas hechas en los últimos 7 días. Las barras son las hechas de cada día; la última es hoy.",
      visual: { tipo: "barras", valores: ultimosDias.map((dia) => dia.hechas) },
    });
  }

  if (rutinas.length > 0) {
    widgets.push({
      id: "tus-rutinas",
      categoria: "grafico",
      tipo: "dato",
      tono: "neutro",
      Icono: Repeat,
      titulo: "Tus rutinas",
      detalle: "Las que más cumpliste en las últimas dos semanas.",
      visual: {
        tipo: "ranking",
        filas: rutinas.map((rutina) => ({
          etiqueta: rutina.titulo,
          texto: `${rutina.hechas} de ${rutina.total}`,
          proporcion: rutina.total === 0 ? 0 : rutina.hechas / rutina.total,
          color: "var(--color-acento)",
        })),
      },
    });
  }

  return widgets;
}

/**
 * Lo que sumaron las tareas fallidas, las que se dan por fallidas solas y las repetitivas "cada varios
 * días": cuántas fallaron, cuáles están por fallar, de dónde vino lo hecho hoy y cómo se reparten las
 * repetitivas según su periodicidad.
 */
function armarNovedades(datos: WidgetsDeTareas): DatoDeWidget[] {
  const { fallidas, hechasHoyPorOrigen, periodicidades, fallanSolas, cadaVariosDias } = datos;
  const widgets: DatoDeWidget[] = [];

  if (fallidas.total > 0) {
    widgets.push({
      id: "tareas-fallidas",
      categoria: "texto",
      tipo: "dato",
      tono: "peligro",
      Icono: CircleX,
      titulo: fallidas.total === 1 ? "Tarea fallida" : "Tareas fallidas",
      valor: String(fallidas.total),
      detalle:
        "En las últimas dos semanas no se hicieron: las diste por fallidas o pasó demasiado tiempo. Las ves en el historial.",
      extras: fallidas.ultimas.map((tarea) => ({
        etiqueta: tarea.titulo,
        valor: `Era del ${formatearDiaYMes(tarea.dia)}`,
      })),
    });
  }

  const { deHoy, atrasadas, adelantadas } = hechasHoyPorOrigen;
  const hechasHoy = deHoy + atrasadas + adelantadas;
  if (hechasHoy > 0) {
    const maximo = Math.max(deHoy, atrasadas, adelantadas);
    const fila = (etiqueta: string, total: number, color: string) => ({
      etiqueta,
      texto: String(total),
      proporcion: total / maximo,
      color,
    });
    widgets.push({
      id: "hecho-hoy-por-origen",
      categoria: "grafico",
      tipo: "dato",
      tono: "neutro",
      Icono: ListChecks,
      titulo: "Lo que hiciste hoy",
      detalle: `${hechasHoy} ${plural(hechasHoy, "tarea hecha", "tareas hechas")} hoy, según de qué día ${plural(hechasHoy, "era", "eran")}.`,
      visual: {
        tipo: "ranking",
        filas: [
          fila("Eran de hoy", deHoy, "var(--color-acento)"),
          fila("Estaban atrasadas", atrasadas, "var(--color-advertencia)"),
          fila("Adelantadas", adelantadas, "var(--color-exito)"),
        ].filter((una) => una.texto !== "0"),
      },
    });
  }

  if (periodicidades.length > 0) {
    const maximo = Math.max(...periodicidades.map((periodicidad) => periodicidad.total));
    const total = periodicidades.reduce((suma, periodicidad) => suma + periodicidad.total, 0);
    widgets.push({
      id: "repetitivas-por-periodicidad",
      categoria: "grafico",
      tipo: "dato",
      tono: "neutro",
      Icono: Repeat,
      titulo: "Tus repetitivas",
      detalle: `${total} ${plural(total, "tarea repetitiva", "tareas repetitivas")}${fallanSolas > 0 ? `; ${fallanSolas} se ${plural(fallanSolas, "da", "dan")} por fallida${fallanSolas === 1 ? "" : "s"} sola${fallanSolas === 1 ? "" : "s"} si pasa el día` : ""}.`,
      visual: {
        tipo: "ranking",
        // Copia y sort, no toSorted(): es de ES2023 y en navegadores un poco viejos rompe la pantalla.
        filas: [...periodicidades]
          .sort((a, b) => b.total - a.total)
          .map((periodicidad) => ({
            etiqueta: NOMBRES_DE_REPETICION_DE_TAREA[periodicidad.repeticion],
            texto: String(periodicidad.total),
            proporcion: periodicidad.total / maximo,
            color: "var(--color-acento)",
          })),
      },
    });
  }

  const proxima = cadaVariosDias[0];
  if (proxima) {
    widgets.push({
      id: "cada-varios-dias",
      categoria: "texto",
      tipo: "dato",
      tono: "neutro",
      Icono: CalendarSync,
      titulo: "Cada varios días",
      valor: describirDiasRestantes(proxima.diasRestantes),
      detalle: `Lo próximo: ${proxima.titulo}, cada ${proxima.cadaDias} días.`,
      extras: cadaVariosDias.map((tarea) => ({
        etiqueta: tarea.titulo,
        valor: describirDiasRestantes(tarea.diasRestantes),
      })),
    });
  }

  return widgets;
}

/** Cuántas tareas sin categoría hacen falta para sugerir ponerles una. */
const MINIMO_SIN_CATEGORIA_PARA_SUGERIR = 3;

/** El color de una barra de ranking: el de la categoría, o uno neutro para lo que no tiene. */
function colorDe(categoria: CategoriaDeWidget<unknown>): string {
  return categoria.color ?? "var(--color-texto-secundario)";
}

function nombreDe(categoria: CategoriaDeWidget<unknown>): string {
  return categoria.nombre ?? "Sin categoría";
}

/** Una barra por categoría, proporcional a la que más tiene. */
function filasPorCantidad(categorias: CategoriaDeWidget<{ total: number }>[]) {
  const maximo = Math.max(1, ...categorias.map((categoria) => categoria.total));
  return categorias.map((categoria) => ({
    etiqueta: nombreDe(categoria),
    texto: String(categoria.total),
    proporcion: categoria.total / maximo,
    color: colorDe(categoria),
  }));
}

/**
 * Los widgets que miran las tareas por categoría. Solo hay algo para mostrar si alguna tarea tiene
 * categoría (o, para la sugerencia, si la persona tiene categorías y le sobran tareas sin una).
 */
function armarPorCategoria(datos: WidgetsDeTareas): DatoDeWidget[] {
  const { cantidad, sinCategoria, pendientes, atrasadas, hechas, cumplimiento } = datos.categorias;
  const conNombre = (categorias: CategoriaDeWidget<unknown>[]) =>
    categorias.some((categoria) => categoria.id !== null);
  const widgets: DatoDeWidget[] = [];

  if (conNombre(pendientes)) {
    const total = pendientes.reduce((suma, categoria) => suma + categoria.total, 0);
    widgets.push({
      id: "pendientes-por-categoria",
      categoria: "grafico",
      tipo: "dato",
      tono: "neutro",
      Icono: Tags,
      titulo: "Pendientes por categoría",
      detalle: `Lo que falta hacer, atrasado, de hoy o para más adelante${total === 0 ? "" : `: ${total} en total`}.`,
      visual: { tipo: "ranking", filas: filasPorCantidad(pendientes) },
    });
  }

  const masAtrasada = atrasadas.find((categoria) => categoria.id !== null);
  if (masAtrasada && masAtrasada.id !== null) {
    widgets.push({
      id: "categoria-mas-atrasada",
      categoria: "texto",
      tipo: "dato",
      tono: "advertencia",
      Icono: TriangleAlert,
      titulo: "Lo que más se atrasa",
      valor: nombreDe(masAtrasada),
      detalle: `${masAtrasada.total} ${plural(masAtrasada.total, "tarea atrasada", "tareas atrasadas")} en esta categoría. Siguen en tu lista hasta que las hagas.`,
      extras: atrasadas.map((categoria) => ({
        etiqueta: nombreDe(categoria),
        valor: String(categoria.total),
      })),
    });
  }

  if (conNombre(hechas)) {
    const total = hechas.reduce((suma, categoria) => suma + categoria.total, 0);
    widgets.push({
      id: "hecho-por-categoria",
      categoria: "grafico",
      tipo: "dato",
      tono: "neutro",
      Icono: CircleCheckBig,
      titulo: "Dónde hiciste más",
      detalle: `Tareas hechas por categoría en los últimos 30 días${total === 0 ? "" : `: ${total} en total`}.`,
      visual: { tipo: "ranking", filas: filasPorCantidad(hechas) },
    });
  }

  if (conNombre(cumplimiento)) {
    widgets.push({
      id: "cumplimiento-por-categoria",
      categoria: "grafico",
      tipo: "dato",
      tono: "neutro",
      Icono: Tag,
      titulo: "Cumplimiento por categoría",
      detalle: "Cuánto de lo que te tocaba lo hiciste, en las últimas dos semanas.",
      visual: {
        tipo: "ranking",
        filas: cumplimiento.map((categoria) => ({
          etiqueta: nombreDe(categoria),
          texto: `${categoria.hechas} de ${categoria.total}`,
          proporcion: categoria.total === 0 ? 0 : categoria.hechas / categoria.total,
          color: colorDe(categoria),
        })),
      },
    });
  }

  if (cantidad > 0 && sinCategoria >= MINIMO_SIN_CATEGORIA_PARA_SUGERIR) {
    widgets.push({
      id: "sin-categoria",
      categoria: "texto",
      tipo: "dato",
      tono: "info",
      Icono: Tag,
      titulo: "Tareas sin categoría",
      valor: String(sinCategoria),
      detalle:
        "Tareas que faltan hacer y no tienen categoría. Elegile una al editarlas y las vas a ver ordenadas acá.",
    });
  }

  return widgets;
}

/** Los widgets de Tareas, con los avisos primero. */
export function armarWidgetsDeTareas(datos: WidgetsDeTareas): DatoDeWidget[] {
  return [
    ...armarAvisos(datos),
    ...armarCifras(datos),
    ...armarNovedades(datos),
    ...armarPorCategoria(datos),
  ];
}

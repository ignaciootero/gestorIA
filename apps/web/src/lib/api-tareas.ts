// Cliente de las rutas del módulo de tareas (apps/api/src/rutas/tareas.ts).
//
// Mismo patrón que lib/api-contactos.ts: un `pedir` genérico y una función por endpoint, con los
// tipos tal como los devuelve la API (los instantes como texto ISO; los días de calendario como
// "AAAA-MM-DD").

import type {
  DatosDeCategoriaDeTarea,
  DatosDeTarea,
  DatosDeTareaRepetitiva,
  RepeticionDeTarea,
} from "@gestoria/shared";
import { URL_API } from "./entorno";

export type { DatosDeCategoriaDeTarea, DatosDeTarea, DatosDeTareaRepetitiva };

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    credentials: "include",
    ...opciones,
    headers: { "content-type": "application/json", ...opciones?.headers },
  });

  if (!respuesta.ok) {
    throw await respuesta.json();
  }

  return respuesta.json() as Promise<T>;
}

export type Tarea = {
  id: string;
  titulo: string;
  notas: string | null;
  /** La categoría, si tiene. */
  categoriaId: number | null;
  /** El día en que hay que hacerla. "AAAA-MM-DD". */
  dia: string;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  completada: boolean;
  /** Cuándo se tildó (ISO); null si está pendiente. */
  completadaEn: string | null;
  /** Se marcó como fallida: estaba atrasada y ya no se va a hacer. */
  fallida: boolean;
  /** Cuándo se marcó como fallida (ISO); null si no lo está. */
  falladaEn: string | null;
  /** Salió de una tarea repetitiva (si no, es una tarea suelta de uso único). */
  repetitiva: boolean;
  /** Lleva un distintivo; no cambia el orden de las listas. */
  importante: boolean;
};

export type ListaDeHoy = {
  /** El día de hoy para la persona. */
  hoy: string;
  atrasadas: Tarea[];
  deHoy: Tarea[];
  hechasHoy: Tarea[];
  /** Las que se marcaron como fallidas hoy (para poder deshacerlo). */
  falladasHoy: Tarea[];
  masAdelante: Tarea[];
};

export type DiaDeHistorial = { dia: string; tareas: Tarea[]; hechas: number; falladas: number };

export type HistorialDeTareas = {
  /** El rango que se está mostrando (ya recortado a lo que se puede ver). "AAAA-MM-DD". */
  desde: string;
  hasta: string;
  dias: DiaDeHistorial[];
  /** Había más tareas que el tope de una consulta: conviene acotar el rango. */
  hayMas: boolean;
};

/** Los filtros del historial como los muestra la pantalla; en blanco es "sin filtrar". */
export type FiltrosDelHistorial = {
  desde: string;
  hasta: string;
  estado: "" | "pendiente" | "completada" | "fallida";
  /** El id de la categoría, "sin" para las que no tienen o en blanco. */
  categoriaId: string;
  repeticion: "" | "unica" | RepeticionDeTarea;
};

export type TareaRepetitiva = {
  id: string;
  /** Solo "intervalo" (cada tantos días): cada cuántos días y desde qué día se cuenta. */
  cadaDias: number | null;
  fechaInicio: string | null;
  /** Sus tareas se dan por fallidas solas si pasa el día sin completarlas. */
  fallaSola: boolean;
  /** Sus tareas llevan un distintivo. */
  importante: boolean;
  titulo: string;
  notas: string | null;
  /** La categoría, si tiene. */
  categoriaId: number | null;
  repeticion: RepeticionDeTarea;
  /** Solo las semanales: sus días, de 1 (lunes) a 7 (domingo), ordenados. */
  diasSemana: number[] | null;
  diaDelMes: number | null;
  mes: number | null;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  /** La próxima vez que le toca, desde hoy inclusive. */
  proximaFecha: string;
  /** 0 es hoy. */
  diasRestantes: number;
};

export type CategoriaDeTarea = {
  id: number;
  nombre: string;
  color: string;
  /** Tareas de uso único pendientes que la tienen. */
  tareas: number;
  /** Tareas repetitivas que la tienen. */
  repetitivas: number;
};

// --- Categorías ---

export function obtenerCategoriasDeTarea(): Promise<{ categorias: CategoriaDeTarea[] }> {
  return pedir("/api/tareas/categorias");
}

export function crearCategoriaDeTarea(nombre: string, color: string): Promise<CategoriaDeTarea> {
  return pedir("/api/tareas/categorias", {
    method: "POST",
    body: JSON.stringify({ nombre, color }),
  });
}

export function editarCategoriaDeTarea(
  id: number,
  nombre: string,
  color: string,
): Promise<CategoriaDeTarea> {
  return pedir(`/api/tareas/categorias/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nombre, color }),
  });
}

export function eliminarCategoriaDeTarea(id: number): Promise<{ ok: true }> {
  return pedir(`/api/tareas/categorias/${id}`, { method: "DELETE" });
}

// --- Tareas ---

export function obtenerTareasDeHoy(): Promise<ListaDeHoy> {
  return pedir("/api/tareas");
}

export function crearTarea(datos: DatosDeTarea): Promise<Tarea> {
  return pedir("/api/tareas", { method: "POST", body: JSON.stringify(datos) });
}

export function editarTarea(id: string, datos: DatosDeTarea): Promise<Tarea> {
  return pedir(`/api/tareas/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}

export function completarTarea(id: string, completada: boolean): Promise<Tarea> {
  return pedir(`/api/tareas/${id}/completada`, {
    method: "PATCH",
    body: JSON.stringify({ completada }),
  });
}

export function fallarTarea(id: string, fallida: boolean): Promise<Tarea> {
  return pedir(`/api/tareas/${id}/fallida`, {
    method: "PATCH",
    body: JSON.stringify({ fallida }),
  });
}

export function eliminarTarea(id: string): Promise<{ ok: true }> {
  return pedir(`/api/tareas/${id}`, { method: "DELETE" });
}

export function obtenerHistorial(filtros: FiltrosDelHistorial): Promise<HistorialDeTareas> {
  const consulta = new URLSearchParams();
  for (const [campo, valor] of Object.entries(filtros)) {
    if (valor !== "") consulta.set(campo, valor);
  }
  const texto = consulta.toString();
  return pedir(`/api/tareas/historial${texto ? `?${texto}` : ""}`);
}

// --- Tareas repetitivas ---

export function obtenerTareasRepetitivas(): Promise<{ repetitivas: TareaRepetitiva[] }> {
  return pedir("/api/tareas/repetitivas");
}

export function crearTareaRepetitiva(datos: DatosDeTareaRepetitiva): Promise<TareaRepetitiva> {
  return pedir("/api/tareas/repetitivas", { method: "POST", body: JSON.stringify(datos) });
}

export function editarTareaRepetitiva(
  id: string,
  datos: DatosDeTareaRepetitiva,
): Promise<TareaRepetitiva> {
  return pedir(`/api/tareas/repetitivas/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}

export function eliminarTareaRepetitiva(id: string): Promise<{ ok: true }> {
  return pedir(`/api/tareas/repetitivas/${id}`, { method: "DELETE" });
}

// --- Widgets ---

export type WidgetsDeTareas = {
  hoy: string;
  hoyHechas: number;
  hoyPendientes: number;
  /** Las de hoy dadas por fallidas hoy: cuentan en el total del día, como no hechas. */
  hoyFallidas: number;
  atrasadas: { total: number; primeras: { titulo: string; dia: string }[] };
  proximas: { titulo: string; hora: string | null }[];
  masAdelante: {
    total: number;
    primera: { titulo: string; dia: string; hora: string | null; dias: number } | null;
  };
  /** Los últimos 7 días, el de hoy al final. */
  ultimosDias: { dia: string; total: number; hechas: number }[];
  racha: number;
  rutinas: { titulo: string; hechas: number; total: number }[];
  repetitivas: number;
  /** Fallidas de las últimas dos semanas; `ultimas` son las más recientes. */
  fallidas: { total: number; ultimas: { titulo: string; dia: string }[] };
  /** Atrasadas que están por darse por fallidas solas; `dias` es cuántos faltan. */
  porFallar: { total: number; primera: { titulo: string; dia: string; dias: number } | null };
  /** Lo hecho hoy según de qué día era. */
  hechasHoyPorOrigen: { deHoy: number; atrasadas: number; adelantadas: number };
  /** Las repetitivas vigentes por periodicidad. */
  periodicidades: { repeticion: RepeticionDeTarea; total: number }[];
  /** Cuántas repetitivas se dan por fallidas solas si pasa el día. */
  fallanSolas: number;
  /** Las de "cada varios días" que le tocan antes. */
  cadaVariosDias: { titulo: string; cadaDias: number; diasRestantes: number }[];
  categorias: {
    cantidad: number;
    sinCategoria: number;
    pendientes: CategoriaDeWidget<{ total: number }>[];
    atrasadas: CategoriaDeWidget<{ total: number }>[];
    hechas: CategoriaDeWidget<{ total: number }>[];
    cumplimiento: CategoriaDeWidget<{ hechas: number; total: number }>[];
  };
};

/** Una categoría en un ranking; con `id` en nulo son las tareas sin categoría. */
export type CategoriaDeWidget<T> = {
  id: number | null;
  nombre: string | null;
  color: string | null;
} & T;

export function obtenerWidgetsDeTareas(): Promise<WidgetsDeTareas> {
  return pedir("/api/tareas/widgets");
}

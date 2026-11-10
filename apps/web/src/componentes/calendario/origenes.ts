// Cómo se ve y adónde lleva cada origen de un evento del calendario (Finanzas, Contactos, Tareas y los
// eventos anotados en el propio calendario).
//
// Cada origen tiene su ícono, su nombre y su color (tokens `origen-*`, ver packages/ui-tokens). El color
// ayuda a distinguirlos de un vistazo, pero nunca va solo: siempre se acompaña con el ícono y el nombre.
// Las clases de Tailwind se escriben enteras (no armadas con texto) para que se detecten al compilar.

import {
  type EstadoParaFiltrar,
  type MarcadorDeEstado,
  ORIGENES_DE_EVENTO,
  type OrigenDeEvento,
} from "@gestoria/shared";
import {
  CalendarDays,
  Check,
  createLucideIcon,
  ListChecks,
  type LucideIcon,
  Minus,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

export type EstiloDeOrigen = {
  icono: LucideIcon;
  /** La página del módulo; los manuales no tienen otra: se editan en el calendario. */
  ruta: string | null;
  /** El color pleno, para puntos. */
  punto: string;
  /** El color pleno, para íconos. */
  color: string;
  /** El color pleno, para el borde de una fila. */
  borde: string;
  /** Fondo suave y texto que se leen bien sobre él, para insignias y chips. */
  suave: string;
};

export const ESTILOS_DE_ORIGEN: Record<OrigenDeEvento, EstiloDeOrigen> = {
  manual: {
    icono: CalendarDays,
    ruta: null,
    punto: "bg-origen-manual",
    color: "text-origen-manual",
    borde: "border-origen-manual",
    suave: "bg-origen-manual-fondo text-origen-manual-texto",
  },
  finanzas: {
    icono: Wallet,
    ruta: "/finanzas",
    punto: "bg-origen-finanzas",
    color: "text-origen-finanzas",
    borde: "border-origen-finanzas",
    suave: "bg-origen-finanzas-fondo text-origen-finanzas-texto",
  },
  contactos: {
    icono: UserRound,
    ruta: "/contactos",
    punto: "bg-origen-contactos",
    color: "text-origen-contactos",
    borde: "border-origen-contactos",
    suave: "bg-origen-contactos-fondo text-origen-contactos-texto",
  },
  tareas: {
    icono: ListChecks,
    ruta: "/tareas",
    punto: "bg-origen-tareas",
    color: "text-origen-tareas",
    borde: "border-origen-tareas",
    suave: "bg-origen-tareas-fondo text-origen-tareas-texto",
  },
};

/** Los orígenes en el orden en que se muestran (chips de filtro y puntos de un día). */
export const ORDEN_DE_ORIGENES: readonly OrigenDeEvento[] = ORIGENES_DE_EVENTO;

/** Solo el signo de exclamación (el de CircleAlert de Lucide), sin el círculo: el marcador ya es un círculo. */
const Exclamacion = createLucideIcon("Exclamacion", [
  ["line", { x1: "12", x2: "12", y1: "8", y2: "12", key: "palito" }],
  ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16", key: "punto" }],
]);

/**
 * La marca de cada estado de una tarea, que va en blanco dentro del círculo del origen (ver
 * vista-de-mes.tsx). Sin marca: el pendiente (círculo lleno) y el pasado de un recordatorio (solo el borde).
 */
export const ICONOS_DE_MARCADOR: Record<
  Exclude<MarcadorDeEstado, "pendiente" | "pasado">,
  LucideIcon
> = {
  atrasada: Exclamacion,
  completada: Check,
  fallida: X,
  mixta: Minus,
};

/** Cómo se llaman los estados en el filtro (en plural: cada botón es un conjunto de eventos). */
export const NOMBRES_DE_ESTADO: Record<EstadoParaFiltrar, string> = {
  pendiente: "Pendientes",
  atrasada: "Atrasadas",
  finalizada: "Finalizadas",
  proximo: "Próximos",
  pasado: "Pasados",
  pagada: "Pagadas",
  futuro: "Futuros",
};

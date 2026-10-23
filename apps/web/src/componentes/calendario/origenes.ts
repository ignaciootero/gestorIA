// Cómo se ve y adónde lleva cada origen de un evento del calendario (Finanzas, Contactos, Tareas y los
// eventos anotados en el propio calendario).
//
// Cada origen tiene su ícono, su nombre y su color (tokens `origen-*`, ver packages/ui-tokens). El color
// ayuda a distinguirlos de un vistazo, pero nunca va solo: siempre se acompaña con el ícono y el nombre.
// Las clases de Tailwind se escriben enteras (no armadas con texto) para que se detecten al compilar.

import { ORIGENES_DE_EVENTO, type OrigenDeEvento } from "@gestoria/shared";
import { CalendarDays, ListChecks, type LucideIcon, UserRound, Wallet } from "lucide-react";

export type EstiloDeOrigen = {
  icono: LucideIcon;
  /** La página del módulo; los manuales no tienen otra: se editan en el calendario. */
  ruta: string | null;
  /** El color pleno, para puntos. */
  punto: string;
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
    borde: "border-origen-manual",
    suave: "bg-origen-manual-fondo text-origen-manual-texto",
  },
  finanzas: {
    icono: Wallet,
    ruta: "/finanzas",
    punto: "bg-origen-finanzas",
    borde: "border-origen-finanzas",
    suave: "bg-origen-finanzas-fondo text-origen-finanzas-texto",
  },
  contactos: {
    icono: UserRound,
    ruta: "/contactos",
    punto: "bg-origen-contactos",
    borde: "border-origen-contactos",
    suave: "bg-origen-contactos-fondo text-origen-contactos-texto",
  },
  tareas: {
    icono: ListChecks,
    ruta: "/tareas",
    punto: "bg-origen-tareas",
    borde: "border-origen-tareas",
    suave: "bg-origen-tareas-fondo text-origen-tareas-texto",
  },
};

/** Los orígenes en el orden en que se muestran (chips de filtro y puntos de un día). */
export const ORDEN_DE_ORIGENES: readonly OrigenDeEvento[] = ORIGENES_DE_EVENTO;

// Menú de navegación: columna izquierda del marco de la aplicación (desde `lg`).
//
// Inicio, los módulos (Finanzas, Contactos, Tareas y Calendario) y, para quien es admin, el panel
// de admin. Cada módulo nuevo suma acá su propio enlace (en ENLACES): la barra de navegación de
// abajo de las pantallas angostas (NavegacionInferior) usa la misma lista.
//
// El ancho lo pone el contenido más largo (`w-fit` en el `<nav>` + que los
// hijos se estiren a ese ancho por default de flex): todos los ítems miden lo
// mismo entre sí, pegados a la izquierda de la columna, sin ocuparla entera
// ni quedar centrados en ella.

"use client";

import type { LucideIcon } from "lucide-react";
import {
  BookUser,
  CalendarDays,
  Home,
  ListChecks,
  LogOut,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { usarCerrarSesion } from "@/lib/usar-cerrar-sesion";

export type EnlaceDeMenu = {
  href: string;
  etiqueta: string;
  Icono: LucideIcon;
  /** Si además de la ruta exacta hay que marcarlo activo en sus subrutas. */
  incluirSubrutas?: boolean;
};

export const ENLACES: EnlaceDeMenu[] = [
  { href: "/inicio", etiqueta: "Inicio", Icono: Home },
  { href: "/finanzas", etiqueta: "Finanzas", Icono: Wallet, incluirSubrutas: true },
  { href: "/contactos", etiqueta: "Contactos", Icono: BookUser, incluirSubrutas: true },
  { href: "/tareas", etiqueta: "Tareas", Icono: ListChecks, incluirSubrutas: true },
  { href: "/calendario", etiqueta: "Calendario", Icono: CalendarDays, incluirSubrutas: true },
];

const CLASE_FILA = cn(
  "flex items-center gap-3 whitespace-nowrap rounded-control px-3 py-2 text-sm font-medium",
  "transition-colors duration-(--duracion-rapida) ease-salida",
);

/** Si un enlace corresponde a la pantalla en la que se está. */
export function estaActivo(pathname: string, { href, incluirSubrutas }: EnlaceDeMenu): boolean {
  return incluirSubrutas ? pathname.startsWith(href) : pathname === href;
}

function FilaDeEnlace(enlace: EnlaceDeMenu) {
  const { href, etiqueta, Icono } = enlace;
  const pathname = usePathname();
  const activo = estaActivo(pathname, enlace);

  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={cn(
        CLASE_FILA,
        activo
          ? "bg-acento-suave text-acento-suave-texto"
          : "text-texto-secundario hover:bg-superficie-suave hover:text-texto",
      )}
    >
      <Icono aria-hidden="true" className="size-4 shrink-0" />
      {etiqueta}
    </Link>
  );
}

export function MenuDeNavegacion() {
  const { data: sesion } = useSession();
  const esAdmin = sesion?.user.role === "admin";
  const { salir, saliendo } = usarCerrarSesion();

  return (
    <nav aria-label="Navegación principal" className="flex w-fit flex-col gap-1">
      {ENLACES.map((enlace) => (
        <FilaDeEnlace key={enlace.href} {...enlace} />
      ))}
      {esAdmin ? (
        <FilaDeEnlace href="/admin" etiqueta="Administración" Icono={ShieldCheck} incluirSubrutas />
      ) : null}

      {/* Separado del resto: es una acción, no un destino, y no se quiere que
          se confunda con la navegación de arriba. */}
      <button
        type="button"
        onClick={salir}
        disabled={saliendo}
        className={cn(
          CLASE_FILA,
          "mt-3 border-t border-borde pt-3",
          "text-texto-secundario hover:bg-superficie-suave hover:text-texto",
          "disabled:pointer-events-none disabled:opacity-60",
        )}
      >
        <LogOut aria-hidden="true" className="size-4 shrink-0" />
        {saliendo ? "Saliendo…" : "Cerrar sesión"}
      </button>
    </nav>
  );
}

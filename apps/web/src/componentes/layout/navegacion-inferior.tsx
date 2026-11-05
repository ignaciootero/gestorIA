// Barra de navegación de abajo, para pantallas angostas (celular y tablet, menos de `lg`).
//
// Ahí el menú de la izquierda no entra: 220 px de un celular de 375 son más de la mitad. Abajo y
// no en un menú desplegable de la barra de arriba porque es lo que más se toca, y abajo queda al
// alcance del pulgar con el celular en una mano; además se ve siempre dónde se está, sin abrir
// nada. Son los mismos destinos que el menú (ENLACES): ícono y nombre corto, el actual resaltado.
// Administración no entra (sería un sexto destino, y solo para admins): queda en la barra de
// arriba (Navbar).
//
// Va `fixed` abajo, con el relleno de la zona segura del celular (la barra de gestos del iPhone),
// y deja un espacio del mismo alto al final del marco para que no tape el pie ni lo último de la
// pantalla.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ENLACES, estaActivo } from "@/componentes/layout/menu-de-navegacion";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";

/** Alto de la barra sin la zona segura. También lo usa el espacio que la compensa. */
const ALTO = "h-16";

export function NavegacionInferior() {
  const { data: sesion } = useSession();
  const pathname = usePathname();

  // Sin sesión (ingreso, registro) no hay a dónde ir.
  if (!sesion?.user) return null;

  return (
    <>
      {/* Lo que ocupa la barra, para que el final de la pantalla no quede debajo. */}
      <div
        aria-hidden="true"
        className={cn("shrink-0 lg:hidden", ALTO, "box-content pb-[env(safe-area-inset-bottom)]")}
      />
      <nav
        aria-label="Navegación principal"
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-fondo/90 backdrop-blur-md lg:hidden",
          "pb-[env(safe-area-inset-bottom)] shadow-flotante",
        )}
      >
        <ul className={cn("mx-auto grid max-w-lg grid-cols-5", ALTO)}>
          {ENLACES.map((enlace) => {
            const activo = estaActivo(pathname, enlace);
            const { Icono } = enlace;
            return (
              <li key={enlace.href} className="flex">
                <Link
                  href={enlace.href}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1",
                    "text-[0.6875rem] font-medium leading-none",
                    "transition-colors duration-(--duracion-rapida) ease-salida",
                    activo ? "text-acento" : "text-texto-secundario hover:text-texto",
                  )}
                >
                  {/* La pastilla detrás del ícono marca dónde se está, como en el menú. */}
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full",
                      "transition-colors duration-(--duracion-rapida) ease-salida",
                      activo && "bg-acento-suave text-acento-suave-texto",
                    )}
                  >
                    <Icono aria-hidden="true" className="size-5" />
                  </span>
                  <span className="max-w-full truncate">{enlace.etiqueta}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

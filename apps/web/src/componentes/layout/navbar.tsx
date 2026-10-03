// Barra superior, presente en todas las pantallas.
//
// A la izquierda el nombre del sistema; a la derecha el selector de tema y, si
// hay sesión abierta, quién entró y el botón de salir. Tener un solo lugar para
// esto evita que cada pantalla arme su propio encabezado y terminen distintos
// (docs/guias/usabilidad.md, Consistencia).
//
// Sin ancho máximo: usa el mismo margen (`px-4 sm:px-8`) que el marco de tres
// columnas (EstructuraDeApp) y el pie, para que el logo y el menú de abajo
// queden alineados al mismo borde en vez de que la barra quede en una franja
// centrada más angosta que el resto.

"use client";

import { LogOut, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { Logotipo } from "@/componentes/marca/logotipo";
import { SelectorDeTema } from "@/componentes/tema";
import { Boton } from "@/componentes/ui/boton";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { usarCerrarSesion } from "@/lib/usar-cerrar-sesion";

export function Navbar() {
  const { data: sesion, isPending } = useSession();
  const { salir, saliendo } = usarCerrarSesion();

  const usuario = sesion?.user;

  return (
    // `sticky` y no `fixed`: así no tapa contenido al hacer scroll ni obliga a
    // compensar la altura con un margen en cada pantalla.
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-borde bg-fondo/85 backdrop-blur-md",
        // La barra flota por encima del contenido, así que proyecta sombra
        // sobre el cuerpo (docs/guias/estetica.md, Elevación).
        "shadow-flotante",
      )}
    >
      <nav
        aria-label="Barra principal"
        className="flex h-(--alto-navbar) w-full items-center justify-between gap-4 px-4 sm:px-8"
      >
        <Link
          href={usuario ? "/inicio" : "/ingresar"}
          className={cn(
            "rounded-control will-change-transform",
            "transition-transform duration-(--duracion-rapida) ease-salida",
            "hover:-translate-y-px active:translate-y-0",
          )}
        >
          <Logotipo />
        </Link>

        <div className="flex items-center gap-2">
          {/*
            Mientras se resuelve la sesión no se muestra nada de la parte de
            usuario: es preferible un hueco breve a que aparezca "Salir" y
            desaparezca, o al revés.
          */}
          {!isPending && usuario ? (
            <>
              <span className="hidden text-sm text-texto-secundario sm:inline">
                {usuario.displayUsername ?? usuario.username ?? usuario.email}
              </span>
              {/*
                Estos accesos solo hacen falta en pantallas angostas: desde
                `md` en adelante ya están en el menú de navegación de la
                izquierda (EstructuraDeApp), que ahí se oculta. Un ícono por
                enlace funciona con uno o dos módulos; si se suman más
                conviene un menú propio en vez de seguir agregando íconos acá
                (ver docs/decisiones.md).
              */}
              <Link
                href="/finanzas"
                aria-label="Finanzas"
                className={cn(
                  "flex size-9 items-center justify-center rounded-control text-texto-secundario md:hidden",
                  "transition-colors duration-(--duracion-rapida) ease-salida",
                  "hover:bg-superficie-suave hover:text-texto",
                )}
              >
                <Wallet aria-hidden="true" className="size-4" />
              </Link>
              {usuario.role === "admin" ? (
                <Link
                  href="/admin"
                  aria-label="Panel de admin"
                  className={cn(
                    "flex size-9 items-center justify-center rounded-control text-texto-secundario md:hidden",
                    "transition-colors duration-(--duracion-rapida) ease-salida",
                    "hover:bg-superficie-suave hover:text-texto",
                  )}
                >
                  <ShieldCheck aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
              <Boton
                variante="secundario"
                tamano="chico"
                onClick={salir}
                cargando={saliendo}
                textoCargando="Saliendo"
              >
                <LogOut aria-hidden="true" className="size-4" />
                Salir
              </Boton>
            </>
          ) : null}

          <SelectorDeTema />
        </div>
      </nav>
    </header>
  );
}

// Barra superior, presente en todas las pantallas.
//
// A la izquierda el nombre del sistema; a la derecha el selector de tema y, si
// hay sesión abierta, quién entró y el botón de salir. Tener un solo lugar para
// esto evita que cada pantalla arme su propio encabezado y terminen distintos
// (docs/guias/usabilidad.md, Consistencia).

"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logotipo } from "@/componentes/marca/logotipo";
import { SelectorDeTema } from "@/componentes/tema";
import { Boton } from "@/componentes/ui/boton";
import { authCliente, useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";

export function Navbar() {
  const router = useRouter();
  const { data: sesion, isPending } = useSession();
  const [saliendo, setSaliendo] = useState(false);

  async function salir(): Promise<void> {
    setSaliendo(true);
    await authCliente.signOut();
    router.replace("/ingresar");
    router.refresh();
  }

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
        className="mx-auto flex h-18 max-w-5xl items-center justify-between gap-4 px-4 sm:px-8"
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

// Pie de página, presente en todas las pantallas.
//
// Deliberadamente escueto: es un sistema privado, no un sitio público, así que
// no hay términos, redes ni secciones que enlazar. Lo que sí aporta es dejar
// claro qué es esto y de cuándo, y en desarrollo el acceso a la guía de estilo.

import { NOMBRE_APP } from "@gestoria/shared";
import Link from "next/link";

const ANIO = new Date().getFullYear();

export function PieDePagina() {
  const enDesarrollo = process.env.NODE_ENV !== "production";

  return (
    // Superficie translúcida como la de la barra: el fondo animado pasa por
    // detrás de todo, y sin esto el pie se confundiría con él.
    <footer className="border-t border-borde bg-fondo/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-texto-secundario sm:px-8">
        <p>
          {NOMBRE_APP} · {ANIO}
        </p>

        {enDesarrollo ? (
          <Link
            href="/guia-de-estilo"
            className="rounded-control underline-offset-4 hover:underline"
          >
            Guía de estilo
          </Link>
        ) : null}
      </div>
    </footer>
  );
}

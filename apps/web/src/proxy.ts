// Redirección según haya sesión o no.
//
// En Next.js 16 esto se llama `proxy` (antes era `middleware`) y corre en el
// runtime de Node antes de cada navegación.
//
// IMPORTANTE: esto NO es el control de acceso. Acá solo se mira si existe la
// cookie de sesión, sin validarla: una cookie vencida o falsa pasa este filtro.
// Quien decide de verdad es la API, que valida la sesión contra la base en cada
// petición (CLAUDE.md, Permisos verificados en el backend). Esto está para que
// nadie vea un destello de la pantalla equivocada antes de ser redirigido.

import { type NextRequest, NextResponse } from "next/server";

/** Prefijo de las cookies de sesión, definido en apps/api/src/auth/opciones.ts. */
const PREFIJO_COOKIE = "gestion";

const RUTA_INGRESO = "/ingresar";
const RUTA_INICIO = "/inicio";

/** Rutas que se pueden ver sin sesión. */
const PUBLICAS = new Set([RUTA_INGRESO, "/correo-confirmado", "/guia-de-estilo"]);

function pareceTenerSesion(peticion: NextRequest): boolean {
  return peticion.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith(`${PREFIJO_COOKIE}.session_token`) && cookie.value.length > 0,
    );
}

export function proxy(peticion: NextRequest): NextResponse {
  const { pathname } = peticion.nextUrl;
  const conSesion = pareceTenerSesion(peticion);

  if (!conSesion && !PUBLICAS.has(pathname)) {
    const destino = peticion.nextUrl.clone();
    destino.pathname = RUTA_INGRESO;
    return NextResponse.redirect(destino);
  }

  // Quien ya entró no tiene por qué volver a ver el formulario de ingreso.
  if (conSesion && pathname === RUTA_INGRESO) {
    const destino = peticion.nextUrl.clone();
    destino.pathname = RUTA_INICIO;
    return NextResponse.redirect(destino);
  }

  return NextResponse.next();
}

export const config = {
  // Se excluyen los archivos internos de Next y los estáticos: no tiene sentido
  // correr esto para cada imagen o cada archivo de JavaScript.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

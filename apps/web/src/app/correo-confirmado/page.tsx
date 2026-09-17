// A donde llega la persona después de tocar el enlace del correo.
//
// Confirmar el correo es solo el primero de los dos requisitos, así que esta
// pantalla lo dice explícitamente en vez de dar a entender que ya puede entrar.

import { tituloDePantalla } from "@gestoria/shared";
import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: tituloDePantalla("Correo confirmado"),
  robots: { index: false, follow: false },
};

export default function PaginaCorreoConfirmado() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md rounded-tarjeta border border-borde bg-superficie p-6 sm:p-8">
        <div className="flex gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-exito" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Correo confirmado</h1>
            <p className="mt-2 text-sm text-texto-secundario">
              Listo, ya sabemos que esa dirección es tuya.
            </p>
          </div>
        </div>

        <p className="mt-6 rounded-control bg-superficie-suave p-3 text-sm">
          Falta un paso: un administrador tiene que aprobar tu cuenta. Te avisamos cuando puedas
          entrar. No hace falta que hagas nada más.
        </p>

        <Link
          href="/ingresar"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-control border border-borde-fuerte px-5 font-medium transition-colors duration-[var(--duracion-rapida)] ease-salida hover:bg-superficie-suave"
        >
          Ir a la pantalla de ingreso
        </Link>
      </div>
    </main>
  );
}

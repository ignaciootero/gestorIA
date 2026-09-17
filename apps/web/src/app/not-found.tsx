// Página no encontrada.

import Link from "next/link";

export default function NoEncontrada() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
      <p className="text-texto-secundario">
        Puede que el enlace esté mal escrito o que la página ya no exista.
      </p>
      <Link
        href="/inicio"
        className="mt-2 rounded-control bg-acento px-5 py-2.5 font-medium text-acento-texto"
      >
        Ir al inicio
      </Link>
    </main>
  );
}

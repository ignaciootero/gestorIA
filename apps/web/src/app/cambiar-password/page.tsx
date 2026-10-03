// Pantalla de cambio de contraseña. Protegida: hace falta sesión para llegar.
//
// A esta pantalla se llega sobre todo empujado: después de que un admin
// resetea una contraseña, la cuenta solo puede cambiarla, nada más
// (GuardiaDeCambioPassword en el layout raíz se encarga de mandar para acá).

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { FormularioCambioPassword } from "@/componentes/cambiar-password/formulario-cambio-password";
import { Tarjeta } from "@/componentes/ui/tarjeta";

export const metadata: Metadata = {
  title: tituloDePantalla("Cambiar contraseña"),
};

export default function PaginaDeCambioPassword() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cambiá tu contraseña</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Tenés que elegir una contraseña nueva antes de seguir usando tu cuenta.
        </p>
      </header>

      <Tarjeta className="p-6">
        <FormularioCambioPassword />
      </Tarjeta>
    </main>
  );
}

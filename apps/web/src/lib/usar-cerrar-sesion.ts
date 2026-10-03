// Hook de "cerrar sesión", compartido por el Navbar y el menú de navegación:
// los dos necesitan el mismo comportamiento (cerrar la sesión, mandar a
// /ingresar y, importante, resetear "saliendo" incluso después del
// redirect), así que vive en un solo lugar en vez de duplicarse.

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authCliente } from "@/lib/auth-cliente";

export function usarCerrarSesion(): { salir: () => Promise<void>; saliendo: boolean } {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir(): Promise<void> {
    setSaliendo(true);
    try {
      await authCliente.signOut();
      router.replace("/ingresar");
      router.refresh();
    } finally {
      // Tanto el Navbar como el menú de navegación viven en el layout raíz: no
      // se desmontan al navegar, así que siguen siendo la MISMA instancia
      // después de entrar con otra cuenta. Sin este reseteo, "saliendo"
      // quedaba en true para siempre tras la primera vez que alguien salía, y
      // el control aparecía trabado ya desde el próximo inicio de sesión.
      setSaliendo(false);
    }
  }

  return { salir, saliendo };
}

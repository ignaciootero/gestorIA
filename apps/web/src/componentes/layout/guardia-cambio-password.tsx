// Manda a /cambiar-password a quien tiene el cambio de contraseña pendiente.
//
// Vive en el layout raíz y no en cada pantalla: así vale para /inicio y para
// cualquier pantalla protegida que se sume después, sin tener que acordarse de
// repetir el control en cada una. Igual que src/proxy.ts, esto es solo para
// evitar que alguien se quede viendo una pantalla que no puede usar: quien
// manda de verdad es la API, que rechaza cualquier ruta protegida con
// `exigirSesion` mientras el aviso siga encendido (CLAUDE.md, Permisos
// verificados en el backend).

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-cliente";

const RUTA_CAMBIO_PASSWORD = "/cambiar-password";

export function GuardiaDeCambioPassword(): null {
  const pathname = usePathname();
  const router = useRouter();
  const { data: sesion } = useSession();

  useEffect(() => {
    if (sesion?.user.debeCambiarPassword && pathname !== RUTA_CAMBIO_PASSWORD) {
      router.replace(RUTA_CAMBIO_PASSWORD);
    }
  }, [sesion, pathname, router]);

  return null;
}

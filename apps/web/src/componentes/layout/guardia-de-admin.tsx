// Manda a /inicio a quien entra a /admin sin ser admin.
//
// Igual que GuardiaDeCambioPassword: esto es solo para no mostrar una pantalla
// que no le corresponde a nadie. El control de verdad está en la API, que
// exige el rol en cada ruta de /api/admin (apps/api/src/rutas/admin.ts).

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-cliente";

const RUTA_ADMIN = "/admin";
const RUTA_INICIO = "/inicio";

export function GuardiaDeAdmin(): null {
  const pathname = usePathname();
  const router = useRouter();
  const { data: sesion, isPending } = useSession();

  useEffect(() => {
    if (isPending || (pathname !== RUTA_ADMIN && !pathname.startsWith(`${RUTA_ADMIN}/`))) return;
    if (sesion && sesion.user.role !== "admin") {
      router.replace(RUTA_INICIO);
    }
  }, [sesion, isPending, pathname, router]);

  return null;
}

// Perfil de una cuenta. Protegida y solo para admins (GuardiaDeAdmin la cuida
// en el layout raíz, y la API vuelve a exigirlo en cada ruta de /api/admin).

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PerfilDeCuenta } from "@/componentes/admin/perfil-de-cuenta";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Perfil de cuenta"),
};

export default async function PaginaDePerfilDeCuenta({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <EstructuraDeApp>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PerfilDeCuenta id={id} />
      </div>
    </EstructuraDeApp>
  );
}

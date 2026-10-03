// Pantalla de admin. Protegida y solo para admins (GuardiaDeAdmin la cuida en
// el layout raíz, y la API vuelve a exigirlo en cada ruta de /api/admin).

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PanelDeAdmin } from "@/componentes/admin/panel-de-admin";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Menú de administración"),
};

export default function PaginaDeAdmin() {
  return (
    <EstructuraDeApp>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Menú de administración</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            Solicitudes de registro, cuentas y auditoría de acciones.
          </p>
        </header>

        <PanelDeAdmin />
      </div>
    </EstructuraDeApp>
  );
}

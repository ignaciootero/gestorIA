// Pantalla de admin. Protegida y solo para admins (GuardiaDeAdmin la cuida en
// el layout raíz, y la API vuelve a exigirlo en cada ruta de /api/admin).

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PanelDeAdmin } from "@/componentes/admin/panel-de-admin";
import { EncabezadoDeModulo, EntradaDeContenido } from "@/componentes/layout/encabezado-de-modulo";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Menú de administración"),
};

export default function PaginaDeAdmin() {
  return (
    <EstructuraDeApp>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <EncabezadoDeModulo
          modulo="admin"
          titulo="Menú de administración"
          descripcion="Solicitudes de registro, cuentas y auditoría de acciones."
        />

        <EntradaDeContenido>
          <PanelDeAdmin />
        </EntradaDeContenido>
      </div>
    </EstructuraDeApp>
  );
}

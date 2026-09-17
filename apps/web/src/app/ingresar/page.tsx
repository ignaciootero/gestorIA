// Pantalla de ingreso. Es la pantalla por defecto cuando no hay sesión.

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { EncabezadoDeIngreso } from "@/componentes/ingreso/encabezado";
import { PanelDeIngreso } from "@/componentes/ingreso/panel-de-ingreso";

export const metadata: Metadata = {
  title: tituloDePantalla("Entrar"),
};

export default function PaginaDeIngreso() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4 py-10 sm:p-8">
      <EncabezadoDeIngreso />
      <PanelDeIngreso />
    </main>
  );
}

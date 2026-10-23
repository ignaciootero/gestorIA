import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PanelDeFinanzas } from "@/componentes/finanzas/panel-de-finanzas";
import { ColumnaDeWidgetsDeFinanzas } from "@/componentes/finanzas/widgets/widgets-de-finanzas";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Finanzas"),
};

export default function PaginaDeFinanzas() {
  return (
    <EstructuraDeApp widgets={<ColumnaDeWidgetsDeFinanzas />}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            Ingresos, gastos, presupuestos y en qué se va la plata.
          </p>
        </header>

        <PanelDeFinanzas />
      </div>
    </EstructuraDeApp>
  );
}

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PanelDeFinanzas } from "@/componentes/finanzas/panel-de-finanzas";
import { ColumnaDeWidgetsDeFinanzas } from "@/componentes/finanzas/widgets/widgets-de-finanzas";
import { EncabezadoDeModulo, EntradaDeContenido } from "@/componentes/layout/encabezado-de-modulo";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Finanzas"),
};

export default function PaginaDeFinanzas() {
  return (
    <EstructuraDeApp widgets={<ColumnaDeWidgetsDeFinanzas />}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <EncabezadoDeModulo
          modulo="finanzas"
          titulo="Finanzas"
          descripcion="Ingresos, gastos, presupuestos y en qué se va la plata."
        />

        <EntradaDeContenido>
          <PanelDeFinanzas />
        </EntradaDeContenido>
      </div>
    </EstructuraDeApp>
  );
}

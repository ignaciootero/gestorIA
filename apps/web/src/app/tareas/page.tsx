import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";
import { PanelDeTareas } from "@/componentes/tareas/panel-de-tareas";
import { ColumnaDeWidgetsDeTareas } from "@/componentes/tareas/widgets/widgets-de-tareas";

export const metadata: Metadata = {
  title: tituloDePantalla("Tareas"),
};

export default function PaginaDeTareas() {
  return (
    <EstructuraDeApp widgets={<ColumnaDeWidgetsDeTareas />}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
          <p className="mt-1 text-sm text-texto-secundario">
            Lo que tenés que hacer hoy, lo que se repite y lo que ya hiciste.
          </p>
        </header>

        <PanelDeTareas />
      </div>
    </EstructuraDeApp>
  );
}

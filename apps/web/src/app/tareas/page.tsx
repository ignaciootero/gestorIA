import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { EncabezadoDeModulo, EntradaDeContenido } from "@/componentes/layout/encabezado-de-modulo";
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
        <EncabezadoDeModulo
          modulo="tareas"
          titulo="Tareas"
          descripcion="Lo que tenés que hacer hoy, lo que se repite y lo que ya hiciste."
        />

        <EntradaDeContenido>
          <PanelDeTareas />
        </EntradaDeContenido>
      </div>
    </EstructuraDeApp>
  );
}

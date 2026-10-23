// Pantalla de inicio.
//
// No lleva columna de widgets aparte: sus widgets son el contenido principal
// (cifras y avisos de cada módulo sobre la persona), así que usan el lugar de las
// dos columnas. Los módulos nuevos suman sus widgets en PanelDeInicio cuando se
// pidan (CLAUDE.md, Hoja de ruta, paso 7). Esta pantalla solo se ve con sesión
// iniciada.

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PanelDeInicio } from "@/componentes/inicio/panel-de-inicio";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Inicio"),
};

export default function PaginaDeInicio() {
  return (
    <EstructuraDeApp fusionada>
      <PanelDeInicio />
    </EstructuraDeApp>
  );
}

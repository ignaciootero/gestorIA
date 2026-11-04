// Pantalla de inicio: un carrusel con el resumen de cada módulo (ver PanelDeInicio).
//
// No lleva columna de widgets aparte: los resúmenes son el contenido principal y usan el lugar de las
// dos columnas. Entra entera en la ventana, sin desplazamiento vertical. Los módulos nuevos suman su
// resumen en PanelDeInicio cuando se pidan (CLAUDE.md, Hoja de ruta, paso 7). Esta pantalla solo se
// ve con sesión iniciada.

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PanelDeInicio } from "@/componentes/inicio/panel-de-inicio";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Inicio"),
};

export default function PaginaDeInicio() {
  return (
    <EstructuraDeApp fusionada pantallaFija>
      <PanelDeInicio />
    </EstructuraDeApp>
  );
}

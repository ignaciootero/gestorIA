// Pantalla de inicio.
//
// Placeholder a propósito: los módulos (gastos, contactos, calendario, tareas)
// se implementan cuando se pidan, con su alcance definido en ese momento
// (CLAUDE.md, Hoja de ruta, paso 7). Lo que sí funciona ya es que esta pantalla
// solo se ve con sesión iniciada.

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PanelDeInicio } from "@/componentes/inicio/panel-de-inicio";

export const metadata: Metadata = {
  title: tituloDePantalla("Inicio"),
};

export default function PaginaDeInicio() {
  return <PanelDeInicio />;
}

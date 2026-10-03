// Panel de admin: solicitudes, cuentas y auditoría en un solo lugar, con
// pestañas (docs/guias/estetica.md, selectores segmentados).

"use client";

import { useState } from "react";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Auditoria } from "./auditoria";
import { ListadoDeCuentas } from "./listado-de-cuentas";
import { SolicitudesPendientes } from "./solicitudes-pendientes";

type Seccion = "pendientes" | "cuentas" | "auditoria";

const SECCIONES = [
  { valor: "pendientes", etiqueta: "Solicitudes" },
  { valor: "cuentas", etiqueta: "Cuentas" },
  { valor: "auditoria", etiqueta: "Auditoría" },
] as const;

export function PanelDeAdmin() {
  const [seccion, setSeccion] = useState<Seccion>("pendientes");

  return (
    <div className="flex flex-col gap-6">
      <SelectorDeSegmentos
        id="seccion-admin"
        etiqueta="Sección del panel de admin"
        segmentos={SECCIONES}
        activo={seccion}
        onCambiar={setSeccion}
        className="mx-auto max-w-md"
      />

      <div
        role="tabpanel"
        id={`panel-seccion-admin-${seccion}`}
        aria-labelledby={`seccion-admin-${seccion}`}
      >
        {seccion === "pendientes" ? <SolicitudesPendientes /> : null}
        {seccion === "cuentas" ? <ListadoDeCuentas /> : null}
        {seccion === "auditoria" ? <Auditoria /> : null}
      </div>
    </div>
  );
}

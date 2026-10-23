import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { CalendarioCompleto } from "@/componentes/calendario/calendario-completo";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Calendario"),
};

export default function PaginaDelCalendario() {
  return (
    <EstructuraDeApp fusionada>
      <div className="flex w-full flex-1 flex-col gap-4">
        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
          {/* En una ventana baja se esconde para dejarle el lugar al calendario. */}
          <p className="mt-1 text-sm text-texto-secundario [@media(max-height:820px)]:hidden">
            Recorré los meses y los años, y elegí un día para verlo en detalle.
          </p>
        </header>

        <CalendarioCompleto />
      </div>
    </EstructuraDeApp>
  );
}

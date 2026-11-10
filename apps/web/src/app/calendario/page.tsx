import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { CalendarioCompleto } from "@/componentes/calendario/calendario-completo";
import { EncabezadoDeModulo, EntradaDeContenido } from "@/componentes/layout/encabezado-de-modulo";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Calendario"),
};

export default function PaginaDelCalendario() {
  return (
    <EstructuraDeApp fusionada>
      <div className="flex w-full flex-1 flex-col gap-4">
        <EncabezadoDeModulo
          modulo="calendario"
          titulo="Calendario"
          descripcion="Recorré los meses y los años, y elegí un día para verlo en detalle."
          // En una ventana baja se esconde para dejarle el lugar al calendario.
          claseDeLaDescripcion="[@media(max-height:820px)]:hidden"
        />

        <EntradaDeContenido className="flex min-h-0 flex-1 flex-col">
          <CalendarioCompleto />
        </EntradaDeContenido>
      </div>
    </EstructuraDeApp>
  );
}

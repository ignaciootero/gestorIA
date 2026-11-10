import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { PanelDeContactos } from "@/componentes/contactos/panel-de-contactos";
import { ColumnaDeWidgetsDeContactos } from "@/componentes/contactos/widgets/widgets-de-contactos";
import { EncabezadoDeModulo, EntradaDeContenido } from "@/componentes/layout/encabezado-de-modulo";
import { EstructuraDeApp } from "@/componentes/layout/estructura-de-app";

export const metadata: Metadata = {
  title: tituloDePantalla("Contactos"),
};

/** Un id de contacto bien formado (uuid), o undefined: lo que venga de la URL no se da por bueno. */
function idDeContacto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
    ? valor
    : undefined;
}

export default async function PaginaDeContactos({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  // "/contactos?contacto=<id>" abre la ficha de ese contacto (así llegan los enlaces desde Finanzas).
  const { contacto } = await searchParams;
  return (
    <EstructuraDeApp widgets={<ColumnaDeWidgetsDeContactos />}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <EncabezadoDeModulo
          modulo="contactos"
          titulo="Contactos"
          descripcion="Personas, empresas y servicios, con sus datos y las fechas que querés recordar."
        />

        <EntradaDeContenido>
          <PanelDeContactos fichaInicialId={idDeContacto(contacto)} />
        </EntradaDeContenido>
      </div>
    </EstructuraDeApp>
  );
}

// Layout raíz: tipografía, tema, proveedores y el marco común de la aplicación.
//
// El navbar y el pie viven acá y no en cada pantalla, para que sean iguales en
// todas y no haya que acordarse de agregarlos al crear una página nueva.

import { DESCRIPCION_APP, NOMBRE_APP } from "@gestoria/shared";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { FondoAnimado } from "@/componentes/layout/fondo-animado";
import { Navbar } from "@/componentes/layout/navbar";
import { PieDePagina } from "@/componentes/layout/pie-de-pagina";
import { Proveedores } from "@/componentes/proveedores";
import { SCRIPT_TEMA_INICIAL } from "@/componentes/tema";
import "./globals.css";

export const metadata: Metadata = {
  // El nombre de cada pantalla se arma con tituloDePantalla (packages/shared).
  title: NOMBRE_APP,
  description: DESCRIPCION_APP,
  applicationName: NOMBRE_APP,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Los dos colores para que la barra del navegador acompañe al tema.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html lang="es-UY" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        {/*
          Aplica el tema antes del primer pintado. Sin esto hay un destello
          blanco al entrar con el tema oscuro.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body>
        <Proveedores>
          {/*
            El fondo va fijo detrás de todo, cubriendo siempre la ventana
            entera. La barra y el pie quedan encima con su propia superficie
            translúcida, así que siguen leyéndose como marco y no como parte del
            fondo (docs/guias/estetica.md).
          */}
          <FondoAnimado />
          {/*
            Columna de alto completo: el contenido crece y empuja el pie hacia
            abajo, así no queda flotando en el medio en las pantallas cortas.
            `relative z-10` la pone por encima del canvas, que está en z-0.
          */}
          <div className="relative z-10 flex min-h-dvh flex-col">
            <Navbar />
            <div className="flex flex-1 flex-col">{children}</div>
            <PieDePagina />
          </div>
        </Proveedores>
      </body>
    </html>
  );
}

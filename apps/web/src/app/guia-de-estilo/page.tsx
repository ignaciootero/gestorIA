// Guía de estilo interna.
//
// Muestra los tokens y los componentes en un solo lugar, para poder revisar
// contraste y consistencia en los dos temas sin tener que recorrer la app
// (docs/guias/estetica.md, Consistencia). Todo componente nuevo se agrega acá.
//
// Solo está disponible en desarrollo: en producción devuelve 404.

import { tituloDePantalla } from "@gestoria/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuiaDeEstilo } from "@/componentes/guia-de-estilo/guia";

export const metadata: Metadata = {
  title: tituloDePantalla("Guía de estilo"),
  robots: { index: false, follow: false },
};

export default function PaginaGuiaDeEstilo() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <GuiaDeEstilo />;
}

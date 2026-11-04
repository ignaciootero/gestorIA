// Los widgets de Contactos en la columna lateral de su pantalla.
//
// Salen del mismo pedido que el resumen de Contactos de la pantalla de inicio (/api/contactos/widgets),
// así que pasar de una pantalla a la otra reutiliza lo que ya está en la caché de TanStack Query. La clave
// empieza con "contactos": cualquier cambio en el módulo (crear un contacto, agregar un
// recordatorio) la invalida y los widgets se ponen al día solos.

"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { ColumnaDeCarruseles } from "@/componentes/widgets/columna-de-carruseles";
import { obtenerWidgetsDeContactos } from "@/lib/api-contactos";
import { interpretarError } from "@/lib/mensajes-de-error";
import { armarWidgetsDeContactos } from "./armar-widgets-de-contactos";

function usarWidgetsDeContactos() {
  const consulta = useQuery({
    queryKey: ["contactos", "widgets"],
    queryFn: obtenerWidgetsDeContactos,
  });
  // Memoizado porque el carrusel reinicia su temporizador si la lista cambia de identidad.
  const widgets = useMemo(
    () => (consulta.data ? armarWidgetsDeContactos(consulta.data) : []),
    [consulta.data],
  );
  return { ...consulta, widgets };
}

function CargandoWidgets({ alto }: { alto: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="solo-lectores">Cargando los widgets</span>
      <div className={`animate-pulse rounded-tarjeta bg-superficie-suave ${alto}`} />
    </div>
  );
}

/** Los carruseles de la columna lateral de la pantalla de Contactos. */
export function ColumnaDeWidgetsDeContactos() {
  const { widgets, isPending, error } = usarWidgetsDeContactos();

  if (isPending) return <CargandoWidgets alto="h-44" />;
  if (error) {
    return (
      <Aviso tono="peligro" titulo="No pudimos cargar los widgets">
        {interpretarError(error).mensaje}
      </Aviso>
    );
  }

  return <ColumnaDeCarruseles widgets={widgets} etiqueta="Widgets de contactos" />;
}

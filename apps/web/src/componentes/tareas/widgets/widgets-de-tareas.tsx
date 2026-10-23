// Los widgets de Tareas en la columna lateral de su pantalla: un carrusel de texto arriba y uno de
// gráficos abajo, como en Finanzas y Contactos.
//
// La clave de la consulta empieza con "tareas": cualquier cambio en el módulo (agregar, tildar,
// eliminar) invalida los widgets y se ponen al día solos.

"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { ColumnaDeCarruseles } from "@/componentes/widgets/columna-de-carruseles";
import { obtenerWidgetsDeTareas } from "@/lib/api-tareas";
import { interpretarError } from "@/lib/mensajes-de-error";
import { armarWidgetsDeTareas } from "./armar-widgets-de-tareas";

export function ColumnaDeWidgetsDeTareas() {
  const { data, isPending, error } = useQuery({
    queryKey: ["tareas", "widgets"],
    queryFn: obtenerWidgetsDeTareas,
  });
  // Memoizado porque el carrusel reinicia su temporizador si la lista cambia de identidad.
  const widgets = useMemo(() => (data ? armarWidgetsDeTareas(data) : []), [data]);

  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="solo-lectores">Cargando los widgets</span>
        <div className="h-44 animate-pulse rounded-tarjeta bg-superficie-suave" />
      </div>
    );
  }
  if (error) {
    return (
      <Aviso tono="peligro" titulo="No pudimos cargar los widgets">
        {interpretarError(error).mensaje}
      </Aviso>
    );
  }

  return <ColumnaDeCarruseles widgets={widgets} etiqueta="Widgets de tareas" />;
}

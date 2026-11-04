// Los widgets de Finanzas en la columna lateral de su pantalla.
//
// Salen del mismo pedido que el resumen de Finanzas de la pantalla de inicio (/api/finanzas/widgets),
// así que pasar de una pantalla a la otra reutiliza lo que ya está en la caché de TanStack Query. La
// clave empieza con "finanzas": cualquier cambio en el módulo (cargar un movimiento, cerrar un
// período) la invalida y los widgets se ponen al día solos.

"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { ColumnaDeCarruseles } from "@/componentes/widgets/columna-de-carruseles";
import { obtenerWidgets } from "@/lib/api-finanzas";
import { interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { armarWidgetsDeFinanzas } from "./armar-widgets-de-finanzas";

function usarWidgetsDeFinanzas() {
  const consulta = useQuery({ queryKey: ["finanzas", "widgets"], queryFn: obtenerWidgets });
  // Memoizado porque el carrusel reinicia su temporizador si la lista cambia de
  // identidad: sin esto, cada render del padre le daría una lista "nueva".
  const widgets = useMemo(
    () => (consulta.data ? armarWidgetsDeFinanzas(consulta.data, zonaDelDispositivo()) : []),
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

/** Los carruseles de la columna lateral de la pantalla de Finanzas. */
export function ColumnaDeWidgetsDeFinanzas() {
  const { widgets, isPending, error } = usarWidgetsDeFinanzas();

  if (isPending) return <CargandoWidgets alto="h-44" />;
  if (error) {
    return (
      <Aviso tono="peligro" titulo="No pudimos cargar los widgets">
        {interpretarError(error).mensaje}
      </Aviso>
    );
  }

  return <ColumnaDeCarruseles widgets={widgets} etiqueta="Widgets de finanzas" />;
}

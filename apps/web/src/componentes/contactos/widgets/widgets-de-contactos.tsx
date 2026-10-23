// Los widgets de Contactos en sus dos lugares: el carrusel de la columna lateral
// (pantalla de Contactos) y la cuadrícula de la pantalla de inicio.
//
// Los dos salen del mismo pedido (GET /api/contactos/widgets), así que pasar de una
// pantalla a la otra reutiliza lo que ya está en la caché de TanStack Query. La clave
// empieza con "contactos": cualquier cambio en el módulo (crear un contacto, agregar un
// recordatorio) la invalida y los widgets se ponen al día solos.

"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { ItemAnimado, ListaAnimada } from "@/componentes/ui/lista-animada";
import { ColumnaDeCarruseles } from "@/componentes/widgets/columna-de-carruseles";
import { TarjetaDeWidget } from "@/componentes/widgets/tarjeta-de-widget";
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

/** Todos los widgets de Contactos a la vez, para la pantalla de inicio, donde sobra lugar. */
export function CuadriculaDeWidgetsDeContactos() {
  const { widgets, isPending, error } = usarWidgetsDeContactos();

  if (isPending) return <CargandoWidgets alto="h-56" />;
  if (error) {
    return (
      <Aviso tono="peligro" titulo="No pudimos cargar tus widgets de contactos">
        {interpretarError(error).mensaje}
      </Aviso>
    );
  }

  return (
    <section aria-labelledby="widgets-de-contactos" className="flex flex-col gap-3">
      <h2 id="widgets-de-contactos" className="text-lg font-medium">
        Contactos
      </h2>
      <ListaAnimada className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {widgets.map((widget) => (
          <ItemAnimado key={widget.id} className="min-h-36">
            <TarjetaDeWidget dato={widget} />
          </ItemAnimado>
        ))}
      </ListaAnimada>
    </section>
  );
}

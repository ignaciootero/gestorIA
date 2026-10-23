// Contenido del diálogo "Editar recordatorio" de la pestaña Recordatorios.
//
// Es el mismo formulario que usa la ficha del contacto. Necesita el contacto completo (su tipo, la fecha de
// nacimiento y los recordatorios que ya tiene), así que se carga acá, con la misma clave que usa la ficha.

"use client";

import { useQuery } from "@tanstack/react-query";
import { Aviso } from "@/componentes/ui/aviso";
import { obtenerContacto, type Recordatorio } from "@/lib/api-contactos";
import { interpretarError } from "@/lib/mensajes-de-error";
import { FormularioDeRecordatorio } from "./formulario-de-recordatorio";

export function EditarRecordatorio({
  recordatorio,
  cerrar,
}: {
  recordatorio: Recordatorio;
  cerrar: () => void;
}) {
  const contacto = useQuery({
    queryKey: ["contactos", "detalle", recordatorio.contactoId],
    queryFn: () => obtenerContacto(recordatorio.contactoId),
  });

  if (contacto.error)
    return <Aviso tono="peligro">{interpretarError(contacto.error).mensaje}</Aviso>;
  if (!contacto.data) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
        <span className="solo-lectores">Cargando el recordatorio</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-control bg-superficie-suave" />
        ))}
      </div>
    );
  }
  return (
    <FormularioDeRecordatorio
      contacto={contacto.data}
      recordatorio={recordatorio}
      cerrar={cerrar}
    />
  );
}

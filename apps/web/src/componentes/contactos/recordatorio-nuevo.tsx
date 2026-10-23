// Contenido del diálogo "Agregar recordatorio" de la pestaña Recordatorios.
//
// Un recordatorio siempre pertenece a un contacto, así que primero se elige de quién es y, con
// el contacto elegido, aparece el mismo formulario que usa su ficha. Se carga el contacto
// completo porque el formulario lo necesita (los recordatorios que ya tiene, su tipo y su
// fecha de nacimiento para sugerir el cumpleaños).

"use client";

import { nombreCompletoDeContacto } from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Selector } from "@/componentes/ui/selector";
import { obtenerContacto, obtenerOpcionesDeContactos } from "@/lib/api-contactos";
import { interpretarError } from "@/lib/mensajes-de-error";
import { FormularioDeRecordatorio } from "./formulario-de-recordatorio";

export function RecordatorioNuevo({ cerrar }: { cerrar: () => void }) {
  const [contactoId, setContactoId] = useState("");

  const opciones = useQuery({
    queryKey: ["contactos", "opciones"],
    queryFn: obtenerOpcionesDeContactos,
  });
  const contacto = useQuery({
    queryKey: ["contactos", "detalle", contactoId],
    queryFn: () => obtenerContacto(contactoId),
    enabled: contactoId !== "",
  });

  if (opciones.error)
    return <Aviso tono="peligro">{interpretarError(opciones.error).mensaje}</Aviso>;

  if (opciones.data?.contactos.length === 0) {
    return (
      <p className="text-sm text-texto-secundario">
        Los recordatorios son de un contacto. Primero agregá uno en la pestaña Contactos.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Selector
        etiqueta="¿De qué contacto?"
        value={contactoId}
        onChange={(evento) => setContactoId(evento.target.value)}
        disabled={opciones.isPending}
      >
        <option value="">Elegí un contacto</option>
        {opciones.data?.contactos.map((opcion) => (
          <option key={opcion.id} value={opcion.id}>
            {nombreCompletoDeContacto(opcion)}
          </option>
        ))}
      </Selector>

      {contacto.error ? (
        <Aviso tono="peligro">{interpretarError(contacto.error).mensaje}</Aviso>
      ) : null}

      {contactoId !== "" && contacto.data ? (
        // `key`: al cambiar de contacto el formulario arranca limpio, con sus propias sugerencias.
        <FormularioDeRecordatorio key={contacto.data.id} contacto={contacto.data} cerrar={cerrar} />
      ) : null}
    </div>
  );
}

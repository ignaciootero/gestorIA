// Ficha de un contacto: todos sus datos, sus recordatorios y las acciones (marcar como
// favorito, editar, eliminar). Se muestra dentro de un diálogo (ver PanelDeContactos).
//
// Los teléfonos, correos y el sitio web son enlaces (`tel:`, `mailto:` y web) para que
// un toque llame, escriba o abra la página. El sitio web solo se vuelve enlace si
// `aEnlaceWeb` lo reconoce como http o https: un texto con otro esquema (`javascript:`)
// se muestra como texto y nunca como enlace.

"use client";

import {
  aEnlaceWeb,
  describirDiasRestantes,
  describirProgramacion,
  diaDeHoy,
  enlaceDeMapa,
  formatearDiaDeCalendario,
  nombreCompletoDeContacto,
} from "@gestoria/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellPlus,
  Briefcase,
  Cake,
  Clock,
  FileText,
  Globe,
  IdCard,
  type LucideIcon,
  Mail,
  MapPin,
  MapPinned,
  NotebookText,
  Pencil,
  Phone,
  Star,
  Trash2,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { DistintivoImportante } from "@/componentes/ui/distintivo-importante";
import { Insignia } from "@/componentes/ui/insignia";
import {
  type Contacto,
  eliminarRecordatorio,
  marcarFavorito,
  obtenerContacto,
  type Recordatorio,
} from "@/lib/api-contactos";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { AvatarDeContacto } from "./avatar-de-contacto";
import { FormularioDeRecordatorio } from "./formulario-de-recordatorio";
import { SeccionDePlata } from "./seccion-de-plata";

const CLASE_ENLACE =
  "rounded-sm text-acento underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * Una fila de la ficha: ícono, qué dato es y su valor. El `<dt>` y el `<dd>` tienen que ser
 * hijos directos del grupo (un `<div>` dentro del `<dl>`), por eso el ícono ocupa una columna
 * propia de la grilla en vez de envolverlos.
 */
function Dato({
  Icono,
  titulo,
  children,
}: {
  Icono: LucideIcon;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 text-sm">
      <Icono aria-hidden="true" className="row-span-2 mt-0.5 size-4 text-texto-secundario" />
      <dt className="text-xs text-texto-secundario">{titulo}</dt>
      <dd className="break-words text-texto">{children}</dd>
    </div>
  );
}

/** Los años que tiene hoy quien nació en `nacimiento` ("AAAA-MM-DD"). */
function edadHoy(nacimiento: string): number {
  const hoy = diaDeHoy(zonaDelDispositivo());
  const anios = Number(hoy.slice(0, 4)) - Number(nacimiento.slice(0, 4));
  return hoy.slice(5) < nacimiento.slice(5) ? anios - 1 : anios;
}

function FilaDeRecordatorio({
  recordatorio,
  alEditar,
  alEliminar,
  eliminando,
}: {
  recordatorio: Recordatorio;
  alEditar: () => void;
  alEliminar: () => void;
  eliminando: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium text-texto">
          <span className="truncate">{recordatorio.titulo}</span>
          {recordatorio.importante ? <DistintivoImportante /> : null}
        </p>
        <p className="text-xs text-texto-secundario">
          {describirProgramacion(recordatorio, recordatorio.hora)}
          {" · "}
          {recordatorio.diasRestantes === 0
            ? "hoy"
            : `${describirDiasRestantes(recordatorio.diasRestantes)} (${formatearDiaDeCalendario(recordatorio.proximaFecha)})`}
        </p>
      </div>
      {confirmando ? (
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-texto-secundario">¿Eliminar?</span>
          <Boton tamano="chico" variante="sutil" onClick={() => setConfirmando(false)}>
            No
          </Boton>
          <Boton
            tamano="chico"
            variante="peligro"
            cargando={eliminando}
            textoCargando="Eliminando"
            onClick={alEliminar}
          >
            Sí
          </Boton>
        </div>
      ) : (
        <div className="flex shrink-0 gap-1">
          <Boton
            tamano="chico"
            variante="sutil"
            aria-label={`Editar el recordatorio ${recordatorio.titulo}`}
            onClick={alEditar}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </Boton>
          <Boton
            tamano="chico"
            variante="sutil"
            aria-label={`Eliminar el recordatorio ${recordatorio.titulo}`}
            onClick={() => setConfirmando(true)}
          >
            <Trash2 aria-hidden="true" className="size-4 text-peligro" />
          </Boton>
        </div>
      )}
    </li>
  );
}

function SeccionDeRecordatorios({ contacto }: { contacto: Contacto }) {
  const queryClient = useQueryClient();
  const [formulario, setFormulario] = useState<"nuevo" | Recordatorio | null>(null);

  const eliminar = useMutation({
    mutationFn: (id: string) => eliminarRecordatorio(contacto.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contactos"] }),
  });

  return (
    <section aria-labelledby="recordatorios-del-contacto" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="recordatorios-del-contacto" className="text-sm font-medium text-texto">
          Recordatorios
        </h3>
        {formulario === null ? (
          <Boton tamano="chico" variante="secundario" onClick={() => setFormulario("nuevo")}>
            <BellPlus aria-hidden="true" className="size-4" />
            Agregar
          </Boton>
        ) : null}
      </div>

      {formulario !== null ? (
        <div className="rounded-control border border-borde bg-superficie-suave p-3">
          <FormularioDeRecordatorio
            contacto={contacto}
            recordatorio={formulario === "nuevo" ? undefined : formulario}
            cerrar={() => setFormulario(null)}
          />
        </div>
      ) : null}

      {eliminar.isError ? (
        <Aviso tono="peligro">{interpretarError(eliminar.error).mensaje}</Aviso>
      ) : null}

      {contacto.recordatorios.length === 0 ? (
        formulario === null ? (
          <p className="text-sm text-texto-secundario">
            No tiene recordatorios. Agregá uno para que la aplicación te avise —por ejemplo, su
            cumpleaños.
          </p>
        ) : null
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {contacto.recordatorios.map((recordatorio) => (
            <FilaDeRecordatorio
              key={recordatorio.id}
              recordatorio={recordatorio}
              alEditar={() => setFormulario(recordatorio)}
              alEliminar={() => eliminar.mutate(recordatorio.id)}
              eliminando={eliminar.isPending && eliminar.variables === recordatorio.id}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function FichaDeContacto({
  id,
  alEditar,
  alEliminar,
  cerrar,
}: {
  id: string;
  alEditar: (contacto: Contacto) => void;
  alEliminar: (contacto: Contacto) => void;
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    data: contacto,
    isPending,
    error,
  } = useQuery({
    queryKey: ["contactos", "detalle", id],
    queryFn: () => obtenerContacto(id),
  });

  const favorito = useMutation({
    mutationFn: (valor: boolean) => marcarFavorito(id, valor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contactos"] }),
  });

  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
        <span className="solo-lectores">Cargando el contacto</span>
        <div className="h-16 animate-pulse rounded-control bg-superficie-suave" />
        <div className="h-32 animate-pulse rounded-control bg-superficie-suave" />
      </div>
    );
  }

  if (error) {
    return (
      <>
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
        <div className="flex justify-end">
          <Boton variante="sutil" onClick={cerrar}>
            Cerrar
          </Boton>
        </div>
      </>
    );
  }

  const enlaceWeb = contacto.sitioWeb ? aEnlaceWeb(contacto.sitioWeb) : null;

  return (
    <>
      <div className="flex items-center gap-3">
        <AvatarDeContacto contacto={contacto} className="size-12 text-base" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="break-words text-lg font-semibold leading-tight text-texto">
            {nombreCompletoDeContacto(contacto)}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <Insignia tono="neutral">
              {contacto.tipo === "persona" ? "Persona" : "Empresa o servicio"}
            </Insignia>
            {contacto.rubro ? <Insignia tono="info">{contacto.rubro}</Insignia> : null}
            {contacto.etiquetas.map((etiqueta) => (
              <span
                key={etiqueta.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-borde px-2 py-0.5 text-xs text-texto"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: etiqueta.color }}
                />
                {etiqueta.nombre}
              </span>
            ))}
          </div>
        </div>
      </div>

      <dl className="flex flex-col gap-3">
        {contacto.telefonos.length > 0 ? (
          <Dato Icono={Phone} titulo="Teléfonos">
            <ul className="flex flex-col gap-0.5">
              {contacto.telefonos.map((telefono) => (
                <li key={telefono.id}>
                  <a
                    href={`tel:${telefono.numero.replace(/[^\d+]/g, "")}`}
                    className={cn(CLASE_ENLACE, "numeros-tabulares")}
                  >
                    {telefono.numero}
                  </a>{" "}
                  <span className="text-xs text-texto-secundario">
                    {telefono.tipo === "celular" ? "Celular" : "Fijo"}
                  </span>
                </li>
              ))}
            </ul>
          </Dato>
        ) : null}

        {contacto.correos.length > 0 ? (
          <Dato Icono={Mail} titulo="Correos">
            <ul className="flex flex-col gap-0.5">
              {contacto.correos.map((correo) => (
                <li key={correo}>
                  <a href={`mailto:${correo}`} className={CLASE_ENLACE}>
                    {correo}
                  </a>
                </li>
              ))}
            </ul>
          </Dato>
        ) : null}

        {contacto.sitioWeb ? (
          <Dato Icono={Globe} titulo="Sitio web">
            {enlaceWeb ? (
              <a
                href={enlaceWeb}
                target="_blank"
                rel="noopener noreferrer"
                className={CLASE_ENLACE}
              >
                {contacto.sitioWeb}
              </a>
            ) : (
              contacto.sitioWeb
            )}
          </Dato>
        ) : null}

        {contacto.fechaNacimiento ? (
          <Dato Icono={Cake} titulo="Fecha de nacimiento">
            {formatearDiaDeCalendario(contacto.fechaNacimiento)} ·{" "}
            {edadHoy(contacto.fechaNacimiento)} años
          </Dato>
        ) : null}

        {contacto.direccion ? (
          <Dato Icono={MapPin} titulo="Dirección">
            {contacto.direccion}
            {/* Abre OpenStreetMap con la dirección buscada: un enlace común, sin mandar nada desde acá. */}
            <a
              href={enlaceDeMapa(contacto.direccion)}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className={cn(CLASE_ENLACE, "mt-1 flex w-fit items-center gap-1 text-xs")}
            >
              <MapPinned aria-hidden="true" className="size-3.5" />
              Ver en el mapa
            </a>
          </Dato>
        ) : null}

        {contacto.horario ? (
          <Dato Icono={Clock} titulo="Horario de atención">
            {contacto.horario}
          </Dato>
        ) : null}

        {contacto.documento ? (
          <Dato Icono={IdCard} titulo="RUT o documento">
            {contacto.documento}
          </Dato>
        ) : null}

        {contacto.personaDeContacto ? (
          <Dato Icono={Briefcase} titulo="Persona de contacto">
            {contacto.personaDeContacto}
          </Dato>
        ) : null}

        {contacto.notas ? (
          <Dato Icono={NotebookText} titulo="Notas">
            <span className="whitespace-pre-wrap">{contacto.notas}</span>
          </Dato>
        ) : null}

        {contacto.telefonos.length === 0 &&
        contacto.correos.length === 0 &&
        !contacto.direccion &&
        !contacto.notas &&
        !contacto.fechaNacimiento &&
        !contacto.sitioWeb ? (
          <Dato Icono={FileText} titulo="Datos">
            Todavía no cargaste datos de este contacto. Tocá “Editar” para agregarlos.
          </Dato>
        ) : null}
      </dl>

      <SeccionDePlata contacto={contacto} />

      <SeccionDeRecordatorios contacto={contacto} />

      {favorito.isError ? (
        <Aviso tono="peligro">{interpretarError(favorito.error).mensaje}</Aviso>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-4">
        <Boton
          variante="secundario"
          aria-pressed={contacto.favorito}
          cargando={favorito.isPending}
          textoCargando="Guardando"
          onClick={() => favorito.mutate(!contacto.favorito)}
        >
          <Star
            aria-hidden="true"
            className={cn("size-4", contacto.favorito && "fill-current text-advertencia")}
          />
          {contacto.favorito ? "Es favorito" : "Marcar como favorito"}
        </Boton>
        <div className="flex gap-2">
          <Boton variante="sutil" onClick={() => alEliminar(contacto)}>
            <Trash2 aria-hidden="true" className="size-4 text-peligro" />
            Eliminar
          </Boton>
          <Boton variante="secundario" onClick={() => alEditar(contacto)}>
            <Pencil aria-hidden="true" className="size-4" />
            Editar
          </Boton>
          <Boton variante="sutil" onClick={cerrar}>
            Cerrar
          </Boton>
        </div>
      </div>
    </>
  );
}

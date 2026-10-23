// Listado de contactos: buscar por texto, filtrar por tipo, favoritos o etiqueta, y abrir
// la ficha de uno. Los favoritos van primero y después el orden es por nombre.
//
// La búsqueda espera a que se deje de escribir (300 ms) y mientras llega la respuesta se
// sigue viendo la lista anterior, en vez de parpadear en blanco. Marcar un favorito se ve
// al instante (actualización optimista) y se revierte con un mensaje si el servidor falla.

"use client";

import { nombreCompletoDeContacto } from "@gestoria/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookUser, Plus, Search, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Selector } from "@/componentes/ui/selector";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  marcarFavorito,
  obtenerContactos,
  obtenerEtiquetas,
  type ResumenDeContacto,
} from "@/lib/api-contactos";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { AvatarDeContacto } from "./avatar-de-contacto";

const POR_PAGINA = 20;

const FILTROS = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "favoritos", etiqueta: "Favoritos" },
  { valor: "personas", etiqueta: "Personas" },
  { valor: "empresas", etiqueta: "Empresas" },
] as const;
type Filtro = (typeof FILTROS)[number]["valor"];

type Pagina = { contactos: ResumenDeContacto[]; total: number };

/** Lo que va debajo del nombre: el rubro y el teléfono, o lo primero que haya para comunicarse. */
function subtituloDe(contacto: ResumenDeContacto): string {
  const telefono = contacto.telefonos[0]?.numero;
  const partes =
    contacto.tipo === "empresa"
      ? [contacto.rubro, telefono ?? contacto.correos[0]]
      : [telefono ?? contacto.correos[0]];
  const texto = partes.filter(Boolean).join(" · ");
  return texto === "" ? "Sin teléfono ni correo" : texto;
}

export function ListadoDeContactos({
  alAbrir,
  alAgregar,
}: {
  alAbrir: (id: string) => void;
  alAgregar: () => void;
}) {
  const queryClient = useQueryClient();
  const [busquedaEscrita, setBusquedaEscrita] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(busquedaEscrita);
      setPagina(0);
    }, 300);
    return () => clearTimeout(espera);
  }, [busquedaEscrita]);

  const filtros = {
    busqueda,
    tipo:
      filtro === "personas"
        ? ("persona" as const)
        : filtro === "empresas"
          ? ("empresa" as const)
          : undefined,
    favoritos: filtro === "favoritos" ? true : undefined,
    etiquetaId: etiquetaId === "" ? undefined : Number(etiquetaId),
  };

  const etiquetas = useQuery({ queryKey: ["contactos", "etiquetas"], queryFn: obtenerEtiquetas });
  const { data, isPending, error } = useQuery({
    queryKey: ["contactos", "lista", { ...filtros, pagina }],
    queryFn: () => obtenerContactos({ ...filtros, limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
    placeholderData: keepPreviousData,
  });

  const hayFiltros = busqueda !== "" || filtro !== "todos" || etiquetaId !== "";

  const favorito = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: boolean }) => marcarFavorito(id, valor),
    onMutate: async ({ id, valor }) => {
      await queryClient.cancelQueries({ queryKey: ["contactos", "lista"] });
      const anteriores = queryClient.getQueriesData<Pagina>({ queryKey: ["contactos", "lista"] });
      queryClient.setQueriesData<Pagina>({ queryKey: ["contactos", "lista"] }, (actual) =>
        actual
          ? {
              ...actual,
              contactos: actual.contactos.map((contacto) =>
                contacto.id === id ? { ...contacto, favorito: valor } : contacto,
              ),
            }
          : actual,
      );
      return { anteriores };
    },
    onError: (_error, _variables, contexto) => {
      for (const [clave, valor] of contexto?.anteriores ?? [])
        queryClient.setQueryData(clave, valor);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["contactos"] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3 p-4">
        <Campo
          etiqueta="Buscar"
          icono={Search}
          placeholder="Nombre, teléfono, correo o rubro"
          value={busquedaEscrita}
          onChange={(evento) => setBusquedaEscrita(evento.target.value)}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectorDeSegmentos
            id="filtro-de-contactos"
            etiqueta="Filtrar contactos"
            modo="filtro"
            segmentos={FILTROS}
            activo={filtro}
            onCambiar={(valor) => {
              setFiltro(valor);
              setPagina(0);
            }}
            className="sm:flex-1 [&>button]:px-2 sm:[&>button]:px-4"
          />
          {(etiquetas.data?.etiquetas.length ?? 0) > 0 ? (
            <div className="sm:w-56">
              <Selector
                etiqueta="Etiqueta"
                value={etiquetaId}
                onChange={(evento) => {
                  setEtiquetaId(evento.target.value);
                  setPagina(0);
                }}
              >
                <option value="">Todas</option>
                {etiquetas.data?.etiquetas.map((etiqueta) => (
                  <option key={etiqueta.id} value={etiqueta.id}>
                    {etiqueta.nombre}
                  </option>
                ))}
              </Selector>
            </div>
          ) : null}
        </div>
      </Tarjeta>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando contactos</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : data.contactos.length === 0 ? (
        <Tarjeta className="flex flex-col items-center gap-3 p-8 text-center">
          <BookUser aria-hidden="true" className="size-8 text-texto-secundario" />
          {hayFiltros ? (
            <p className="text-sm text-texto-secundario">
              Ningún contacto coincide con la búsqueda.
            </p>
          ) : (
            <>
              <h2 className="text-base font-medium text-texto">Todavía no tenés contactos</h2>
              <p className="max-w-md text-sm text-texto-secundario">
                Guardá a las personas y a las empresas o servicios que usás —con sus teléfonos,
                correos y fechas para recordar— y encontralos rápido cuando los necesites.
              </p>
              <Boton onClick={alAgregar}>
                <Plus aria-hidden="true" className="size-4" />
                Agregar mi primer contacto
              </Boton>
            </>
          )}
        </Tarjeta>
      ) : (
        <Tarjeta>
          <ul className="flex flex-col divide-y divide-borde">
            {data.contactos.map((contacto) => (
              <li
                key={contacto.id}
                className="flex items-center gap-2 px-4 py-2 transition-colors duration-(--duracion-rapida) ease-salida hover:bg-superficie-suave"
              >
                <button
                  type="button"
                  onClick={() => alAbrir(contacto.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-control py-1 text-left"
                >
                  <AvatarDeContacto contacto={contacto} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-texto">
                      {nombreCompletoDeContacto(contacto)}
                    </span>
                    <span className="block truncate text-sm text-texto-secundario">
                      {subtituloDe(contacto)}
                    </span>
                  </span>
                </button>

                {contacto.etiquetas.length > 0 ? (
                  <span className="hidden shrink-0 items-center gap-1.5 md:flex">
                    {contacto.etiquetas.slice(0, 2).map((etiqueta) => (
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
                    {contacto.etiquetas.length > 2 ? (
                      <span className="text-xs text-texto-secundario">
                        +{contacto.etiquetas.length - 2}
                      </span>
                    ) : null}
                  </span>
                ) : null}

                <button
                  type="button"
                  aria-pressed={contacto.favorito}
                  aria-label={
                    contacto.favorito
                      ? `Quitar a ${nombreCompletoDeContacto(contacto)} de favoritos`
                      : `Marcar a ${nombreCompletoDeContacto(contacto)} como favorito`
                  }
                  onClick={() => favorito.mutate({ id: contacto.id, valor: !contacto.favorito })}
                  className="flex size-11 shrink-0 items-center justify-center rounded-control text-texto-secundario transition-colors duration-(--duracion-rapida) ease-salida hover:bg-superficie-suave hover:text-texto"
                >
                  <Star
                    aria-hidden="true"
                    className={cn("size-5", contacto.favorito && "fill-current text-advertencia")}
                  />
                </button>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}

      {favorito.isError ? (
        <Aviso tono="peligro">
          No pudimos guardar el favorito. {interpretarError(favorito.error).mensaje}
        </Aviso>
      ) : null}

      {data && data.total > POR_PAGINA ? (
        <div className="flex items-center justify-between text-sm text-texto-secundario">
          <span>
            {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, data.total)} de{" "}
            {data.total}
          </span>
          <div className="flex gap-2">
            <Boton
              tamano="chico"
              variante="sutil"
              disabled={pagina === 0}
              onClick={() => setPagina((actual) => actual - 1)}
            >
              Anterior
            </Boton>
            <Boton
              tamano="chico"
              variante="sutil"
              disabled={(pagina + 1) * POR_PAGINA >= data.total}
              onClick={() => setPagina((actual) => actual + 1)}
            >
              Siguiente
            </Boton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Pestaña "Etiquetas" de Contactos: crear, renombrar, recolorear y eliminar las
// etiquetas con las que se agrupan los contactos ("Familia", "Proveedores"...).
//
// Cada etiqueta nueva propone el color más distinto de las que ya existen, que se puede
// cambiar. Eliminar una etiqueta se la quita a sus contactos, pero no los toca: por eso
// el diálogo de confirmación lo dice con la cantidad.

"use client";

import {
  colorMasDistinto,
  esquemaColorCategoria,
  LARGO_MAXIMO_NOMBRE_DE_ETIQUETA,
} from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { CampoColor } from "@/componentes/ui/campo-de-color";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  crearEtiqueta,
  type Etiqueta,
  editarEtiqueta,
  eliminarEtiqueta,
  obtenerEtiquetas,
} from "@/lib/api-contactos";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

const esquemaFormulario = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribí un nombre para la etiqueta.")
    .max(
      LARGO_MAXIMO_NOMBRE_DE_ETIQUETA,
      `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE_DE_ETIQUETA} caracteres.`,
    ),
  color: esquemaColorCategoria,
});
type DatosFormulario = z.infer<typeof esquemaFormulario>;

function FormularioDeEtiqueta({
  etiqueta,
  existentes,
  cerrar,
}: {
  etiqueta?: Etiqueta | undefined;
  /** Las que ya tiene la persona, para elegirle un color distinto a la nueva. */
  existentes: Etiqueta[];
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosFormulario>({
    resolver: zodResolver(esquemaFormulario),
    defaultValues: {
      nombre: etiqueta?.nombre ?? "",
      color: etiqueta?.color ?? colorMasDistinto(existentes.map((otra) => otra.color)),
    },
  });

  const mutacion = useMutation({
    mutationFn: (datos: DatosFormulario) =>
      etiqueta
        ? editarEtiqueta(etiqueta.id, datos.nombre, datos.color)
        : crearEtiqueta(datos.nombre, datos.color),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contactos"] });
      cerrar();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((datos) => mutacion.mutate(datos))}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex items-end gap-3">
        <Campo
          {...register("nombre")}
          etiqueta="Nombre"
          autoFocus
          error={errors.nombre?.message}
          className="flex-1"
        />
        <CampoColor {...register("color")} etiqueta="Color" />
      </div>

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cerrar}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={isSubmitting || mutacion.isPending}
          textoCargando="Guardando"
        >
          {etiqueta ? "Guardar cambios" : "Crear etiqueta"}
        </Boton>
      </div>
    </form>
  );
}

export function SeccionDeEtiquetas() {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["contactos", "etiquetas"],
    queryFn: obtenerEtiquetas,
  });

  const [formulario, setFormulario] = useState<"nueva" | Etiqueta | null>(null);
  const [aEliminar, setAEliminar] = useState<Etiqueta | null>(null);

  const eliminar = useMutation({
    mutationFn: eliminarEtiqueta,
    onSuccess: () => {
      setAEliminar(null);
      void queryClient.invalidateQueries({ queryKey: ["contactos"] });
    },
  });

  const etiquetas = data?.etiquetas ?? [];

  return (
    <Tarjeta className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-texto">Etiquetas</h2>
        <Boton tamano="chico" variante="secundario" onClick={() => setFormulario("nueva")}>
          <Plus aria-hidden="true" className="size-4" />
          Nueva
        </Boton>
      </div>

      <p className="text-sm text-texto-secundario">
        Sirven para agrupar contactos —por ejemplo “Familia” o “Proveedores”— y encontrarlos más
        rápido. Un contacto puede tener varias.
      </p>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando etiquetas</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-control bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : etiquetas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Tag aria-hidden="true" className="size-8 text-texto-secundario" />
          <p className="max-w-sm text-sm text-texto-secundario">
            Todavía no tenés etiquetas. Creá la primera para empezar a agrupar tus contactos.
          </p>
          <Boton onClick={() => setFormulario("nueva")}>
            <Plus aria-hidden="true" className="size-4" />
            Crear una etiqueta
          </Boton>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {etiquetas.map((etiqueta) => (
            <li key={etiqueta.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm text-texto">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: etiqueta.color }}
                />
                <span className="truncate">{etiqueta.nombre}</span>
                <span className="shrink-0 text-xs text-texto-secundario">
                  {etiqueta.contactos === 1 ? "1 contacto" : `${etiqueta.contactos} contactos`}
                </span>
              </span>
              <div className="flex shrink-0 gap-1">
                <Boton
                  tamano="chico"
                  variante="sutil"
                  aria-label={`Editar ${etiqueta.nombre}`}
                  onClick={() => setFormulario(etiqueta)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Boton>
                <Boton
                  tamano="chico"
                  variante="sutil"
                  aria-label={`Eliminar ${etiqueta.nombre}`}
                  onClick={() => setAEliminar(etiqueta)}
                >
                  <Trash2 aria-hidden="true" className="size-4 text-peligro" />
                </Boton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialogo
        abierto={formulario !== null}
        onCerrar={() => setFormulario(null)}
        titulo={formulario === "nueva" ? "Nueva etiqueta" : "Editar etiqueta"}
        icono={formulario === "nueva" ? Plus : Pencil}
      >
        {formulario !== null ? (
          <FormularioDeEtiqueta
            etiqueta={formulario === "nueva" ? undefined : formulario}
            existentes={etiquetas}
            cerrar={() => setFormulario(null)}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={aEliminar !== null}
        onCerrar={() => setAEliminar(null)}
        titulo="Eliminar etiqueta"
        icono={Trash2}
        tono="peligro"
      >
        {aEliminar ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina la etiqueta “{aEliminar.nombre}”.{" "}
              {aEliminar.contactos === 0
                ? "No la tiene ningún contacto."
                : `Se la quitamos a ${aEliminar.contactos === 1 ? "1 contacto" : `${aEliminar.contactos} contactos`}; los contactos no se borran.`}
            </p>
            {eliminar.isError ? <Aviso tono="peligro">{mensajeDe(eliminar.error)}</Aviso> : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => setAEliminar(null)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate(aEliminar.id)}
              >
                Eliminar
              </Boton>
            </div>
          </>
        ) : null}
      </Dialogo>
    </Tarjeta>
  );
}

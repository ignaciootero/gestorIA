// Pestaña "Categorías" de Tareas: crear, renombrar, recolorear y eliminar las categorías con las
// que se agrupan las tareas ("Casa", "Trabajo", "Salud"...). Son opcionales: una tarea puede no
// tener ninguna.
//
// Cada categoría nueva propone el color más distinto de las que ya existen, que se puede cambiar.
// Una categoría con tareas pendientes o repetitivas no se elimina: el diálogo lo explica y dice
// cuántas son, en vez de dejar apretar un botón que va a fallar. (El servidor lo vuelve a verificar.)

"use client";

import {
  colorMasDistinto,
  esquemaColorCategoria,
  LARGO_MAXIMO_NOMBRE_DE_CATEGORIA_DE_TAREA,
} from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  type CategoriaDeTarea,
  crearCategoriaDeTarea,
  editarCategoriaDeTarea,
  eliminarCategoriaDeTarea,
} from "@/lib/api-tareas";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";
import { useCategoriasDeTarea } from "./categorias";

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

function cantidad(numero: number, singular: string, plural: string): string {
  return numero === 1 ? `1 ${singular}` : `${numero} ${plural}`;
}

/** Lo que la retiene: "2 tareas pendientes y 1 repetitiva", o "Sin tareas". */
function describirUsos(categoria: CategoriaDeTarea): string {
  const partes = [
    ...(categoria.tareas > 0
      ? [cantidad(categoria.tareas, "tarea pendiente", "tareas pendientes")]
      : []),
    ...(categoria.repetitivas > 0
      ? [cantidad(categoria.repetitivas, "repetitiva", "repetitivas")]
      : []),
  ];
  return partes.length === 0 ? "Sin tareas" : partes.join(" y ");
}

const esquemaFormulario = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribí un nombre para la categoría.")
    .max(
      LARGO_MAXIMO_NOMBRE_DE_CATEGORIA_DE_TAREA,
      `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE_DE_CATEGORIA_DE_TAREA} caracteres.`,
    ),
  color: esquemaColorCategoria,
});
type DatosFormulario = z.infer<typeof esquemaFormulario>;

function FormularioDeCategoria({
  categoria,
  existentes,
  cerrar,
}: {
  categoria?: CategoriaDeTarea | undefined;
  /** Las que ya tiene la persona, para proponerle un color distinto a la nueva. */
  existentes: CategoriaDeTarea[];
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
      nombre: categoria?.nombre ?? "",
      color: categoria?.color ?? colorMasDistinto(existentes.map((otra) => otra.color)),
    },
  });

  const mutacion = useMutation({
    mutationFn: (datos: DatosFormulario) =>
      categoria
        ? editarCategoriaDeTarea(categoria.id, datos.nombre, datos.color)
        : crearCategoriaDeTarea(datos.nombre, datos.color),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tareas"] });
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

      {categoria ? null : (
        <p className="text-xs text-texto-secundario">
          Te propusimos el color más distinto de tus otras categorías. Podés cambiarlo.
        </p>
      )}

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
          {categoria ? "Guardar cambios" : "Crear categoría"}
        </Boton>
      </div>
    </form>
  );
}

export function SeccionDeCategoriasDeTarea() {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useCategoriasDeTarea();

  const [formulario, setFormulario] = useState<"nueva" | CategoriaDeTarea | null>(null);
  const [aEliminar, setAEliminar] = useState<CategoriaDeTarea | null>(null);

  const eliminar = useMutation({
    mutationFn: eliminarCategoriaDeTarea,
    onSuccess: () => {
      setAEliminar(null);
      void queryClient.invalidateQueries({ queryKey: ["tareas"] });
    },
  });

  const categorias = data?.categorias ?? [];
  const aEliminarEnUso = aEliminar !== null && aEliminar.tareas + aEliminar.repetitivas > 0;

  return (
    <Tarjeta className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-texto">Categorías</h2>
        <Boton tamano="chico" variante="secundario" onClick={() => setFormulario("nueva")}>
          <Plus aria-hidden="true" className="size-4" />
          Nueva
        </Boton>
      </div>

      <p className="text-sm text-texto-secundario">
        Sirven para ordenar tus tareas —por ejemplo “Casa” o “Trabajo”— y se eligen al agregar o
        editar una tarea. Son opcionales. Para eliminar una, primero no tiene que tener tareas
        pendientes ni repetitivas.
      </p>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando categorías</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-control bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : categorias.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Tag aria-hidden="true" className="size-8 text-texto-secundario" />
          <p className="max-w-sm text-sm text-texto-secundario">
            Todavía no tenés categorías. Creá la primera para empezar a ordenar tus tareas.
          </p>
          <Boton onClick={() => setFormulario("nueva")}>
            <Plus aria-hidden="true" className="size-4" />
            Crear una categoría
          </Boton>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {categorias.map((categoria) => (
            <li key={categoria.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm text-texto">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: categoria.color }}
                />
                <span className="truncate">{categoria.nombre}</span>
                <span className="shrink-0 text-xs text-texto-secundario">
                  {describirUsos(categoria)}
                </span>
              </span>
              <div className="flex shrink-0 gap-1">
                <Boton
                  tamano="chico"
                  variante="sutil"
                  aria-label={`Editar ${categoria.nombre}`}
                  onClick={() => setFormulario(categoria)}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Boton>
                <Boton
                  tamano="chico"
                  variante="sutil"
                  aria-label={`Eliminar ${categoria.nombre}`}
                  onClick={() => {
                    eliminar.reset();
                    setAEliminar(categoria);
                  }}
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
        titulo={formulario === "nueva" ? "Nueva categoría" : "Editar categoría"}
        icono={formulario === "nueva" ? Plus : Pencil}
      >
        {formulario !== null ? (
          <FormularioDeCategoria
            categoria={formulario === "nueva" ? undefined : formulario}
            existentes={categorias}
            cerrar={() => setFormulario(null)}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={aEliminar !== null}
        onCerrar={() => setAEliminar(null)}
        titulo="Eliminar categoría"
        icono={Trash2}
        tono="peligro"
      >
        {aEliminar ? (
          <>
            {aEliminarEnUso ? (
              <p className="text-sm text-texto-secundario">
                No se puede eliminar “{aEliminar.nombre}” porque la usan {describirUsos(aEliminar)}.
                Cambiales la categoría o eliminalas primero.
              </p>
            ) : (
              <p className="text-sm text-texto-secundario">
                Se elimina la categoría “{aEliminar.nombre}”. Ninguna tarea pendiente la usa; las
                que ya hiciste quedan sin categoría.
              </p>
            )}
            {eliminar.isError ? <Aviso tono="peligro">{mensajeDe(eliminar.error)}</Aviso> : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => setAEliminar(null)}>
                {aEliminarEnUso ? "Entendido" : "Cancelar"}
              </Boton>
              {aEliminarEnUso ? null : (
                <Boton
                  variante="peligro"
                  cargando={eliminar.isPending}
                  textoCargando="Eliminando"
                  onClick={() => eliminar.mutate(aEliminar.id)}
                >
                  Eliminar
                </Boton>
              )}
            </div>
          </>
        ) : null}
      </Dialogo>
    </Tarjeta>
  );
}

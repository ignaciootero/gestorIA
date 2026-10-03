// Sección de categorías de la pestaña "Cuentas": crear, editar, eliminar y
// reemplazar.
//
// - Cada categoría nueva propone el color más distinto de los que ya existen
//   (`colorMasDistinto`), que se puede cambiar.
// - La categoría especial de transferencias no se lista: no es una categoría que la
//   persona administre (no se puede eliminar ni reemplazar) y verla mezclada con
//   las suyas confundía. Las transferencias se cargan con una casilla en el
//   formulario de movimientos.
// - Una categoría con movimientos no se puede eliminar: el botón de eliminar abre
//   un diálogo que lo explica y deja reemplazarla por otra categoría (existente o
//   nueva); todos sus movimientos, también los históricos, pasan a la elegida.
//   Sin movimientos se elimina directamente, con una confirmación.

"use client";

import { colorMasDistinto, esquemaColorCategoria, esquemaNombreCategoria } from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Replace, Trash2 } from "lucide-react";
import { type InputHTMLAttributes, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Selector } from "@/componentes/ui/selector";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  type Categoria,
  crearCategoria,
  eliminarCategoria,
  obtenerCategorias,
  reemplazarCategoria,
  renombrarCategoria,
} from "@/lib/api-finanzas";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

function invalidarFinanzas(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
}

/** Igual que Campo, pero para un `<input type="color">`. */
function CampoColor({
  etiqueta,
  ...resto
}: { etiqueta: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {etiqueta}
      </label>
      <input
        id={id}
        type="color"
        className="h-11 w-16 cursor-pointer rounded-control border border-borde-fuerte bg-superficie p-1"
        {...resto}
      />
    </div>
  );
}

// --- Crear / editar ---

// Esquema propio del formulario, sin `.optional()` en el color: el de
// @gestoria/shared (esquemaCrearCategoria) lo deja opcional para que un llamado
// programático pueda omitirlo, pero acá el formulario siempre manda los dos
// campos (arranca con el color más distinto ya elegido).
const esquemaFormularioCategoria = z.object({
  nombre: esquemaNombreCategoria,
  color: esquemaColorCategoria,
});
type DatosFormularioCategoria = z.infer<typeof esquemaFormularioCategoria>;

function FormularioCategoria({
  categoria,
  existentes,
  cerrar,
}: {
  categoria?: Categoria | undefined;
  /** Las categorías que ya tiene la persona, para elegirle un color distinto a la nueva. */
  existentes: Categoria[];
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DatosFormularioCategoria>({
    resolver: zodResolver(esquemaFormularioCategoria),
    defaultValues: {
      nombre: categoria?.nombre ?? "",
      color: categoria?.color ?? colorMasDistinto(existentes.map((otra) => otra.color)),
    },
  });

  const mutacion = useMutation({
    mutationFn: (datos: DatosFormularioCategoria) =>
      categoria
        ? renombrarCategoria(categoria.id, datos.nombre, datos.color)
        : crearCategoria(datos.nombre, datos.color),
    onSuccess: () => {
      invalidarFinanzas(queryClient);
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

// --- Reemplazar ---

const NUEVA = "nueva";

function FormularioReemplazo({
  categoria,
  otras,
  todas,
  cerrar,
}: {
  categoria: Categoria;
  /** Las categorías por las que se la puede reemplazar: las demás comunes. */
  otras: Categoria[];
  /** Todas las de la persona, para elegirle un color distinto a una categoría nueva. */
  todas: Categoria[];
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [destino, setDestino] = useState<string>(otras[0] ? String(otras[0].id) : NUEVA);
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(() => colorMasDistinto(todas.map((otra) => otra.color)));
  const [intentado, setIntentado] = useState(false);

  const esNueva = destino === NUEVA;
  const nombreValido = esquemaNombreCategoria.safeParse(nombre);
  const errorDeNombre =
    esNueva && intentado && !nombreValido.success
      ? nombreValido.error.issues[0]?.message
      : undefined;

  const mutacion = useMutation({
    mutationFn: () =>
      reemplazarCategoria(
        categoria.id,
        esNueva ? { nueva: { nombre: nombre.trim(), color } } : { porCategoriaId: Number(destino) },
      ),
    onSuccess: () => {
      invalidarFinanzas(queryClient);
      cerrar();
    },
  });

  const movimientos =
    categoria.movimientos === 1 ? "1 movimiento" : `${categoria.movimientos} movimientos`;

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        setIntentado(true);
        if (esNueva && !nombreValido.success) return;
        mutacion.mutate();
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-texto-secundario">
        "{categoria.nombre}" tiene {movimientos}, así que no se puede eliminar. Podés reemplazarla:
        todos sus movimientos —también los de períodos anteriores— pasan a la categoría que elijas,
        y después se elimina "{categoria.nombre}". Si tenía presupuesto, pasa a la categoría elegida
        (salvo que ya tenga uno propio).
      </p>

      <Selector
        etiqueta="Reemplazar por"
        value={destino}
        onChange={(evento) => setDestino(evento.target.value)}
      >
        {otras.map((otra) => (
          <option key={otra.id} value={otra.id}>
            {otra.nombre}
          </option>
        ))}
        <option value={NUEVA}>Una categoría nueva…</option>
      </Selector>

      {esNueva ? (
        <div className="flex items-end gap-3">
          <Campo
            etiqueta="Nombre de la categoría nueva"
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            autoFocus
            error={errorDeNombre}
            className="flex-1"
          />
          <CampoColor
            etiqueta="Color"
            value={color}
            onChange={(evento) => setColor(evento.target.value)}
          />
        </div>
      ) : null}

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cerrar}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          variante="peligro"
          cargando={mutacion.isPending}
          textoCargando="Reemplazando"
        >
          Reemplazar y eliminar
        </Boton>
      </div>
    </form>
  );
}

// --- Sección ---

export function SeccionDeCategorias() {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "categorias"],
    queryFn: obtenerCategorias,
  });

  const [formulario, setFormulario] = useState<"nueva" | Categoria | null>(null);
  const [aEliminar, setAEliminar] = useState<Categoria | null>(null);
  const [aReemplazar, setAReemplazar] = useState<Categoria | null>(null);

  const eliminar = useMutation({
    mutationFn: eliminarCategoria,
    onSuccess: () => {
      setAEliminar(null);
      invalidarFinanzas(queryClient);
    },
  });

  // `categorias` incluye la especial de transferencias (sirve para validar nombres
  // repetidos); `visibles` es lo que se lista.
  const categorias = data?.categorias ?? [];
  const visibles = categorias.filter((categoria) => categoria.sistema === null);

  return (
    <Tarjeta className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-texto">Categorías</h2>
        <Boton tamano="chico" variante="secundario" onClick={() => setFormulario("nueva")}>
          <Plus aria-hidden="true" className="size-4" />
          Nueva
        </Boton>
      </div>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando categorías</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-control bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : visibles.length === 0 ? (
        <p className="py-4 text-center text-sm text-texto-secundario">
          Todavía no tenés categorías.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {visibles.map((categoria) => (
            <li key={categoria.id} className="group flex items-center justify-between gap-2 py-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-2 text-sm text-texto">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoria.color }}
                  />
                  <span className="truncate">{categoria.nombre}</span>
                </span>
              </div>
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
                  // Con movimientos no se elimina: se explica y se ofrece reemplazarla.
                  onClick={() =>
                    categoria.movimientos > 0 ? setAReemplazar(categoria) : setAEliminar(categoria)
                  }
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
          <FormularioCategoria
            categoria={formulario === "nueva" ? undefined : formulario}
            existentes={categorias}
            cerrar={() => setFormulario(null)}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={aReemplazar !== null}
        onCerrar={() => setAReemplazar(null)}
        titulo="No se puede eliminar"
        icono={Replace}
        tono="advertencia"
      >
        {aReemplazar ? (
          <FormularioReemplazo
            categoria={aReemplazar}
            otras={categorias.filter((c) => c.id !== aReemplazar.id && c.sistema === null)}
            todas={categorias}
            cerrar={() => setAReemplazar(null)}
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
            <p className="text-sm text-texto-secundario">
              Se elimina "{aEliminar.nombre}". No tiene movimientos, así que no se pierde ninguno.
              Si tenía presupuesto, también se elimina.
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

// Presupuestos: un límite por categoría, con una barra que muestra cuánto se
// gastó en el período elegido y un aviso claro (texto, no solo color) cuando se
// acerca o supera el límite (docs/guias/estetica.md, "ningún significado depende solo
// del color").

"use client";

import { esquemaPresupuesto, formatearMonto, MONEDA_POR_DEFECTO } from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { CampoDeImporte } from "@/componentes/ui/campo-de-importe";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Selector } from "@/componentes/ui/selector";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  eliminarPresupuesto,
  fijarPresupuesto,
  obtenerCategorias,
  obtenerPresupuestos,
  type Periodo,
  type Presupuesto,
} from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";

const UMBRAL_ADVERTENCIA = 0.8;

function estadoDe(presupuesto: Presupuesto): {
  proporcion: number;
  tono: "exito" | "advertencia" | "peligro";
} {
  const proporcion =
    presupuesto.presupuestadoCentavos <= 0
      ? presupuesto.gastadoCentavos > 0
        ? 1
        : 0
      : presupuesto.gastadoCentavos / presupuesto.presupuestadoCentavos;

  if (proporcion > 1) return { proporcion, tono: "peligro" };
  if (proporcion >= UMBRAL_ADVERTENCIA) return { proporcion, tono: "advertencia" };
  return { proporcion, tono: "exito" };
}

const COLOR_BARRA = {
  exito: "bg-exito",
  advertencia: "bg-advertencia",
  peligro: "bg-peligro",
} as const;

function FilaDePresupuesto({
  presupuesto,
  moneda,
  onEditar,
  onEliminar,
}: {
  presupuesto: Presupuesto;
  moneda: string;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const { proporcion, tono } = estadoDe(presupuesto);
  const porcentaje = Math.round(proporcion * 100);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-texto">{presupuesto.nombre}</span>
        <div className="flex shrink-0 gap-1">
          <Boton
            tamano="chico"
            variante="sutil"
            aria-label={`Editar presupuesto de ${presupuesto.nombre}`}
            onClick={onEditar}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </Boton>
          <Boton
            tamano="chico"
            variante="sutil"
            aria-label={`Eliminar presupuesto de ${presupuesto.nombre}`}
            onClick={onEliminar}
          >
            <Trash2 aria-hidden="true" className="size-4 text-peligro" />
          </Boton>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.min(porcentaje, 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${porcentaje}% del presupuesto de ${presupuesto.nombre}`}
        className="h-2 overflow-hidden rounded-full bg-superficie-suave"
      >
        <div
          className={cn("h-full rounded-full transition-[width]", COLOR_BARRA[tono])}
          style={{ width: `${Math.min(proporcion, 1) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-texto-secundario">
        <span>
          {formatearMonto(presupuesto.gastadoCentavos, moneda)} de{" "}
          {formatearMonto(presupuesto.presupuestadoCentavos, moneda)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 font-medium",
            tono === "peligro" && "text-peligro",
            tono === "advertencia" && "text-advertencia",
          )}
        >
          {tono !== "exito" ? <AlertTriangle aria-hidden="true" className="size-3.5" /> : null}
          {presupuesto.restanteCentavos < 0
            ? `Superado por ${formatearMonto(-presupuesto.restanteCentavos, moneda)}`
            : `${porcentaje}% usado`}
        </span>
      </div>
    </li>
  );
}

function FormularioPresupuesto({
  presupuesto,
  categoriasDisponibles,
  cerrar,
}: {
  presupuesto?: Presupuesto | undefined;
  categoriasDisponibles: { id: number; nombre: string }[];
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const [categoriaId, setCategoriaId] = useState<number>(
    presupuesto?.categoriaId ?? categoriasDisponibles[0]?.id ?? 0,
  );

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ monto: number }>({
    resolver: zodResolver(esquemaPresupuesto),
    ...(presupuesto ? { defaultValues: { monto: presupuesto.presupuestadoCentavos / 100 } } : {}),
  });

  const mutacion = useMutation({
    mutationFn: (datos: { monto: number }) => fijarPresupuesto(categoriaId, datos.monto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      cerrar();
    },
  });

  if (!presupuesto && categoriasDisponibles.length === 0) {
    return (
      <Aviso tono="advertencia">
        Ya tenés un presupuesto fijado para todas tus categorías. Editá uno existente o creá una
        categoría nueva primero.
      </Aviso>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((datos) => mutacion.mutate(datos))}
      noValidate
      className="flex flex-col gap-4"
    >
      {presupuesto ? (
        <p className="text-sm text-texto-secundario">
          Categoría: <span className="font-medium text-texto">{presupuesto.nombre}</span>
        </p>
      ) : (
        <Selector
          etiqueta="Categoría"
          value={categoriaId}
          onChange={(evento) => setCategoriaId(Number(evento.target.value))}
        >
          {categoriasDisponibles.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </Selector>
      )}

      <Controller
        control={control}
        name="monto"
        render={({ field }) => (
          <CampoDeImporte
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            etiqueta="Límite por período"
            ayuda="El mismo límite vale para todos tus períodos."
            autoFocus={presupuesto !== undefined}
            error={errors.monto?.message}
          />
        )}
      />

      {mutacion.isError ? (
        <Aviso tono="peligro">{interpretarError(mutacion.error).mensaje}</Aviso>
      ) : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cerrar}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={isSubmitting || mutacion.isPending}
          textoCargando="Guardando"
        >
          {presupuesto ? "Guardar cambios" : "Fijar presupuesto"}
        </Boton>
      </div>
    </form>
  );
}

export function PresupuestosDeFinanzas({ periodo }: { periodo: Periodo }) {
  const queryClient = useQueryClient();
  const { data: sesion } = useSession();
  const moneda = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;

  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "presupuestos", periodo.id],
    queryFn: () => obtenerPresupuestos(periodo.id),
  });
  const categorias = useQuery({ queryKey: ["finanzas", "categorias"], queryFn: obtenerCategorias });

  const [formulario, setFormulario] = useState<"nuevo" | Presupuesto | null>(null);
  const [aEliminar, setAEliminar] = useState<Presupuesto | null>(null);

  const eliminar = useMutation({
    mutationFn: eliminarPresupuesto,
    onSuccess: () => {
      setAEliminar(null);
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
    },
  });

  const categoriasSinPresupuesto = (categorias.data?.categorias ?? []).filter(
    // La categoría de transferencias no es un gasto: no admite presupuesto.
    (categoria) =>
      categoria.sistema === null &&
      !data?.presupuestos.some((presupuesto) => presupuesto.categoriaId === categoria.id),
  );

  return (
    <Tarjeta className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-texto">Presupuestos de {periodo.nombre}</h2>
        <Boton tamano="chico" variante="secundario" onClick={() => setFormulario("nuevo")}>
          <Plus aria-hidden="true" className="size-4" />
          Nuevo
        </Boton>
      </div>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando presupuestos</span>
          {[0, 1].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : data.presupuestos.length === 0 ? (
        <p className="py-6 text-center text-sm text-texto-secundario">
          Todavía no fijaste ningún presupuesto. Fijá uno para ver cuánto te queda en cada
          categoría.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {data.presupuestos.map((presupuesto) => (
            <FilaDePresupuesto
              key={presupuesto.categoriaId}
              presupuesto={presupuesto}
              moneda={moneda}
              onEditar={() => setFormulario(presupuesto)}
              onEliminar={() => setAEliminar(presupuesto)}
            />
          ))}
        </ul>
      )}

      <Dialogo
        abierto={formulario !== null}
        onCerrar={() => setFormulario(null)}
        titulo={formulario === "nuevo" ? "Nuevo presupuesto" : "Editar presupuesto"}
        icono={formulario === "nuevo" ? Plus : Pencil}
      >
        {formulario !== null ? (
          <FormularioPresupuesto
            presupuesto={formulario === "nuevo" ? undefined : formulario}
            categoriasDisponibles={categoriasSinPresupuesto}
            cerrar={() => setFormulario(null)}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={aEliminar !== null}
        onCerrar={() => setAEliminar(null)}
        titulo="Eliminar presupuesto"
        icono={Trash2}
        tono="peligro"
      >
        {aEliminar ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina el presupuesto de "{aEliminar.nombre}". Los movimientos no se tocan.
            </p>
            {eliminar.isError ? (
              <Aviso tono="peligro">{interpretarError(eliminar.error).mensaje}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => setAEliminar(null)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate(aEliminar.categoriaId)}
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

// Pestaña "Repetitivas": las tareas que se agregan solas a la lista cuando les toca (todos los días,
// cada lunes, el día 5 de cada mes...). Acá se editan o se eliminan; no se tildan: lo que se tilda
// es la tarea de cada día, que aparece en "Hoy". Se muestran agrupadas por periodicidad (diarias,
// semanales, mensuales y anuales) y se pueden filtrar por periodicidad o buscar por texto.

"use client";

import { describirDiasRestantes, formatearCantidad } from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Repeat, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { DistintivoImportante } from "@/componentes/ui/distintivo-importante";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { obtenerTareasRepetitivas, type TareaRepetitiva } from "@/lib/api-tareas";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import {
  agruparRepetitivas,
  describirRepeticion,
  diaCorto,
  type FiltroDeRepeticion,
} from "./ayudas";
import { EtiquetaDeCategoria } from "./categorias";

const FILTROS = [
  { valor: "todas", etiqueta: "Todas" },
  { valor: "diaria", etiqueta: "Diarias" },
  { valor: "intervalo", etiqueta: "Cada varios días" },
  { valor: "semanal", etiqueta: "Semanales" },
  { valor: "mensual", etiqueta: "Mensuales" },
  { valor: "anual", etiqueta: "Anuales" },
] as const;

const CLASE_BOTON_DE_ICONO = cn(
  "inline-flex size-9 shrink-0 items-center justify-center rounded-control text-texto-secundario",
  "transition-colors duration-(--duracion-rapida) ease-salida",
  "hover:bg-superficie-suave hover:text-texto",
  "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
);

export function ListaDeRepetitivas({
  alAgregar,
  alEditar,
  alEliminar,
}: {
  alAgregar: () => void;
  alEditar: (repetitiva: TareaRepetitiva) => void;
  alEliminar: (repetitiva: TareaRepetitiva) => void;
}) {
  const [filtro, setFiltro] = useState<FiltroDeRepeticion>("todas");
  const [busqueda, setBusqueda] = useState("");
  const { data, isPending, error } = useQuery({
    queryKey: ["tareas", "repetitivas"],
    queryFn: obtenerTareasRepetitivas,
  });

  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
        <span className="solo-lectores">Cargando tareas repetitivas</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-tarjeta bg-superficie-suave" />
        ))}
      </div>
    );
  }
  if (error) return <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>;

  if (data.repetitivas.length === 0) {
    return (
      <Tarjeta className="flex flex-col items-center gap-3 p-8 text-center">
        <Repeat aria-hidden="true" className="size-8 text-texto-secundario" />
        <h2 className="text-base font-medium text-texto">No tenés tareas repetitivas</h2>
        <p className="max-w-md text-sm text-texto-secundario">
          Sirven para lo que hacés siempre: tomar una pastilla todos los días, sacar la basura los
          martes, pagar el alquiler el día 5. Se agregan solas a tu lista el día que les toca; si
          algún día no las hacés, quedan en el historial.
        </p>
        <Boton variante="secundario" onClick={alAgregar}>
          <Repeat aria-hidden="true" className="size-4" />
          Agregar una tarea repetitiva
        </Boton>
      </Tarjeta>
    );
  }

  const grupos = agruparRepetitivas(data.repetitivas, filtro, busqueda);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="solo-lectores">Tareas repetitivas</h2>
      <div className="flex flex-col gap-3">
        <Campo
          etiqueta="Buscar"
          icono={Search}
          placeholder="Título o notas"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
        <SelectorDeSegmentos
          id="filtro-de-repetitivas"
          etiqueta="Filtrar por periodicidad"
          modo="filtro"
          segmentos={FILTROS}
          activo={filtro}
          onCambiar={setFiltro}
          className="[&>button]:px-1 [&>button]:text-xs sm:[&>button]:px-4 sm:[&>button]:text-sm"
        />
      </div>

      {grupos.length === 0 ? (
        <Tarjeta className="p-6 text-center">
          <p role="status" className="text-sm text-texto-secundario">
            Ninguna tarea repetitiva coincide con lo que buscás.
          </p>
        </Tarjeta>
      ) : (
        grupos.map((grupo) => (
          <section key={grupo.valor} aria-label={grupo.titulo} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium text-texto">
              <Repeat aria-hidden="true" className="size-4" />
              {grupo.titulo}{" "}
              <span className="numeros-tabulares font-normal">({grupo.repetitivas.length})</span>
            </h3>
            <Tarjeta>
              <ul className="flex flex-col divide-y divide-borde">
                {grupo.repetitivas.map((repetitiva) => (
                  <FilaDeRepetitiva
                    key={repetitiva.id}
                    repetitiva={repetitiva}
                    alEditar={alEditar}
                    alEliminar={alEliminar}
                  />
                ))}
              </ul>
            </Tarjeta>
          </section>
        ))
      )}
    </div>
  );
}

function FilaDeRepetitiva({
  repetitiva,
  alEditar,
  alEliminar,
}: {
  repetitiva: TareaRepetitiva;
  alEditar: (repetitiva: TareaRepetitiva) => void;
  alEliminar: (repetitiva: TareaRepetitiva) => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-acento-suave text-acento-suave-texto"
      >
        <Repeat className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium text-texto">
          <span className="truncate">{repetitiva.titulo}</span>
          {repetitiva.importante ? <DistintivoImportante /> : null}
        </p>
        <p className="truncate text-sm text-texto-secundario">
          {describirRepeticion(repetitiva)}
          {repetitiva.meta !== null
            ? ` · Meta: ${formatearCantidad(repetitiva.meta)}${repetitiva.unidad ? ` ${repetitiva.unidad}` : ""}`
            : ""}
          {repetitiva.fallaSola ? " · Se da por fallida si pasa el día" : ""}
          {repetitiva.notas ? ` · ${repetitiva.notas}` : ""}
        </p>
        {repetitiva.categoriaId !== null ? (
          <EtiquetaDeCategoria
            categoriaId={repetitiva.categoriaId}
            className="mt-0.5 text-texto-secundario"
          />
        ) : null}
      </div>
      <p className="numeros-tabulares hidden shrink-0 text-right text-sm sm:block">
        <span className="block font-medium text-texto">
          {describirDiasRestantes(repetitiva.diasRestantes)}
        </span>
        <span className="block text-xs text-texto-secundario">
          {diaCorto(repetitiva.proximaFecha)}
        </span>
      </p>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          className={CLASE_BOTON_DE_ICONO}
          aria-label={`Editar: ${repetitiva.titulo}`}
          onClick={() => alEditar(repetitiva)}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          className={cn(CLASE_BOTON_DE_ICONO, "hover:bg-peligro-fondo hover:text-peligro")}
          aria-label={`Eliminar: ${repetitiva.titulo}`}
          onClick={() => alEliminar(repetitiva)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
    </li>
  );
}

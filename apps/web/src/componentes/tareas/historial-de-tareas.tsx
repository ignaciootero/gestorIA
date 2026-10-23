// Pestaña "Historial": los días anteriores con lo que se hizo, lo que se marcó como fallido y lo que
// sigue pendiente, el más reciente primero. Por defecto, los 7 días anteriores a hoy. Arriba hay una tarjeta
// de filtros (estado, período —con atajos y fechas desde / hasta—, categoría y periodicidad) que se piden al
// servidor. Cada día lleva una barra de progreso partida en completadas, pendientes y fallidas.
//
// Si una tarea se hizo pero se olvidó tildar, se puede tildar acá; una pendiente se puede marcar como
// fallida (la cruz, al lado de la casilla) y una fallida —que se muestra con una cruz roja en lugar de la
// casilla— puede volver a quedar pendiente.

"use client";

import {
  DIAS_POR_DEFECTO_DEL_HISTORIAL,
  diaDeHoy,
  ESTADOS_DE_TAREA,
  NOMBRES_DE_ESTADO_DE_TAREA,
  sumarDias,
} from "@gestoria/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilterX, History, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Casilla } from "@/componentes/ui/casilla";
import { Selector } from "@/componentes/ui/selector";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  completarTarea,
  type FiltrosDelHistorial,
  fallarTarea,
  obtenerHistorial,
  type Tarea,
} from "@/lib/api-tareas";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { usarAvisoDeFallida } from "./aviso-de-fallida";
import { diaCorto, GRUPOS_DE_REPETICION, nombreDeDia } from "./ayudas";
import { EtiquetaDeCategoria, useCategoriasDeTarea } from "./categorias";
import { BotonDeFallida } from "./fila-de-tarea";

const SIN_FILTROS: FiltrosDelHistorial = {
  desde: "",
  hasta: "",
  estado: "",
  categoriaId: "",
  repeticion: "",
};

const SEGMENTOS_DE_ESTADO = [
  { valor: "", etiqueta: "Todos" },
  ...ESTADOS_DE_TAREA.map((estado) => ({
    valor: estado,
    etiqueta: NOMBRES_DE_ESTADO_DE_TAREA[estado],
  })),
] as const;

/** Atajos de período: cuántos días hacia atrás desde hoy (el día de hoy no entra al historial). */
const ATAJOS_DE_PERIODO = [
  { dias: DIAS_POR_DEFECTO_DEL_HISTORIAL, etiqueta: `${DIAS_POR_DEFECTO_DEL_HISTORIAL} días` },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
  { dias: 365, etiqueta: "Todo el año" },
] as const;

export function HistorialDeTareas() {
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState<FiltrosDelHistorial>(SIN_FILTROS);
  const categorias = useCategoriasDeTarea();
  const hoy = diaDeHoy(zonaDelDispositivo());

  // Un rango al revés no se pide: se avisa junto al campo.
  const rangoAlReves =
    filtros.desde !== "" && filtros.hasta !== "" && filtros.desde > filtros.hasta;
  const cantidadDeFiltros = Object.values(filtros).filter((valor) => valor !== "").length;

  const { data, isPending, error } = useQuery({
    queryKey: ["tareas", "historial", filtros],
    queryFn: () => obtenerHistorial(filtros),
    enabled: !rangoAlReves,
    // Al cambiar un filtro se sigue viendo lo anterior hasta que llega lo nuevo (sin parpadeo).
    placeholderData: keepPreviousData,
  });

  const tildar = useMutation({
    mutationFn: ({ tarea, completada }: { tarea: Tarea; completada: boolean }) =>
      completarTarea(tarea.id, completada),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tareas"] }),
  });
  const fallar = useMutation({
    mutationFn: ({ tarea, fallida }: { tarea: Tarea; fallida: boolean }) =>
      fallarTarea(tarea.id, fallida),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tareas"] }),
  });

  // Antes de dar una tarea por fallida se explica qué significa (hasta que la persona pide no verlo más).
  const { pedir: pedirFallida, aviso: avisoDeFallida } = usarAvisoDeFallida((tarea) =>
    fallar.mutate({ tarea, fallida: true }),
  );

  function cambiar<K extends keyof FiltrosDelHistorial>(campo: K, valor: FiltrosDelHistorial[K]) {
    setFiltros((actuales) => ({ ...actuales, [campo]: valor }));
  }

  /** Un atajo de período deja esa cantidad de días hacia atrás; el primero es el período por defecto. */
  function elegirAtajo(dias: number) {
    setFiltros((actuales) => ({
      ...actuales,
      desde: dias === DIAS_POR_DEFECTO_DEL_HISTORIAL ? "" : sumarDias(hoy, -dias),
      hasta: "",
    }));
  }
  const atajoActivo = (dias: number) =>
    filtros.hasta === "" &&
    (dias === DIAS_POR_DEFECTO_DEL_HISTORIAL
      ? filtros.desde === ""
      : filtros.desde === sumarDias(hoy, -dias));

  const tarjetaDeFiltros = (
    <Tarjeta className="p-4 sm:p-5">
      <form
        aria-label="Filtros del historial"
        onSubmit={(evento) => evento.preventDefault()}
        className="flex flex-col gap-4"
      >
        {/* Alto fijo (el del botón): al poner un filtro aparece "Limpiar filtros" y el encabezado no cambia de tamaño. */}
        <div className="flex h-9 items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-texto">
            <SlidersHorizontal aria-hidden="true" className="size-4 text-texto-secundario" />
            Filtros
            {cantidadDeFiltros > 0 ? (
              <span className="numeros-tabulares rounded-full bg-acento px-1.5 text-[10px] leading-4 font-semibold text-acento-texto">
                {cantidadDeFiltros}
                <span className="solo-lectores">
                  {cantidadDeFiltros === 1 ? " filtro puesto" : " filtros puestos"}
                </span>
              </span>
            ) : null}
          </h2>
          {cantidadDeFiltros > 0 ? (
            <Boton variante="sutil" tamano="chico" onClick={() => setFiltros(SIN_FILTROS)}>
              <FilterX aria-hidden="true" className="size-4" />
              Limpiar filtros
            </Boton>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-texto">Estado</span>
          <SelectorDeSegmentos
            id="historial-estado"
            etiqueta="Estado"
            modo="filtro"
            segmentos={SEGMENTOS_DE_ESTADO}
            activo={filtros.estado}
            onCambiar={(valor) => cambiar("estado", valor)}
            className="grid-cols-4 [&>button]:px-1 text-xs sm:[&>button]:px-3 sm:text-sm"
          />
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 text-sm font-medium text-texto">Período</legend>
          <fieldset className="flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
            <legend className="solo-lectores">Atajos de período</legend>
            {ATAJOS_DE_PERIODO.map((atajo) => {
              const activo = atajoActivo(atajo.dias);
              return (
                <button
                  key={atajo.dias}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => elegirAtajo(atajo.dias)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium",
                    "transition-colors duration-(--duracion-rapida) ease-salida",
                    "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
                    "active:scale-(--anim-escala-presion) motion-reduce:active:scale-100",
                    activo
                      ? "border-transparent bg-acento-suave text-acento-suave-texto"
                      : "border-borde-fuerte bg-superficie text-texto-secundario hover:bg-superficie-suave hover:text-texto",
                  )}
                >
                  {atajo.etiqueta}
                </button>
              );
            })}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              type="date"
              etiqueta="Desde"
              value={filtros.desde}
              onChange={(evento) => cambiar("desde", evento.target.value)}
            />
            <Campo
              type="date"
              etiqueta="Hasta"
              value={filtros.hasta}
              onChange={(evento) => cambiar("hasta", evento.target.value)}
              error={
                rangoAlReves ? "La fecha final no puede ser anterior a la inicial." : undefined
              }
            />
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Selector
            etiqueta="Categoría"
            value={filtros.categoriaId}
            onChange={(evento) => cambiar("categoriaId", evento.target.value)}
          >
            <option value="">Todas</option>
            <option value="sin">Sin categoría</option>
            {(categorias.data?.categorias ?? []).map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </Selector>
          <Selector
            etiqueta="Periodicidad"
            value={filtros.repeticion}
            onChange={(evento) =>
              cambiar("repeticion", evento.target.value as FiltrosDelHistorial["repeticion"])
            }
          >
            <option value="">Todas</option>
            <option value="unica">Una sola vez</option>
            {GRUPOS_DE_REPETICION.map((grupo) => (
              <option key={grupo.valor} value={grupo.valor}>
                {grupo.titulo}
              </option>
            ))}
          </Selector>
        </div>

        <p role="status" className="border-t border-borde pt-3 text-sm text-texto-secundario">
          {data
            ? `Del ${diaCorto(data.desde)} al ${diaCorto(data.hasta)}`
            : "Cargando el historial"}
          {filtros.desde === "" && filtros.hasta === ""
            ? ` (por defecto, los últimos ${DIAS_POR_DEFECTO_DEL_HISTORIAL} días)`
            : ""}
        </p>
      </form>
    </Tarjeta>
  );

  if (isPending && !rangoAlReves) {
    return (
      <div className="flex flex-col gap-5">
        {tarjetaDeFiltros}
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
          <span className="solo-lectores">Cargando el historial</span>
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      </div>
    );
  }

  const dias = rangoAlReves ? [] : (data?.dias ?? []);

  return (
    <div className="flex flex-col gap-5">
      {tarjetaDeFiltros}

      {error ? <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso> : null}
      {avisoDeFallida}

      {tildar.isError || fallar.isError ? (
        <Aviso tono="peligro">{interpretarError(tildar.error ?? fallar.error).mensaje}</Aviso>
      ) : null}
      {data?.hayMas ? (
        <Aviso tono="advertencia">
          Hay más tareas de las que se pueden mostrar de una vez. Acotá las fechas o los filtros
          para ver el resto.
        </Aviso>
      ) : null}

      {dias.length === 0 && !error ? (
        <Tarjeta className="flex flex-col items-center gap-3 p-8 text-center">
          <History aria-hidden="true" className="size-8 text-texto-secundario" />
          {cantidadDeFiltros > 0 ? (
            <>
              <h2 className="text-base font-medium text-texto">No hay tareas con esos filtros</h2>
              <p className="max-w-md text-sm text-texto-secundario">
                Probá con otras fechas o sacá algún filtro.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-base font-medium text-texto">Todavía no hay historial</h2>
              <p className="max-w-md text-sm text-texto-secundario">
                Acá vas a ver, día por día, lo que hiciste, lo que diste por fallido y lo que quedó
                pendiente. Empieza a llenarse mañana, con las tareas de hoy.
              </p>
            </>
          )}
        </Tarjeta>
      ) : null}

      {dias.map((dia) => (
        <section key={dia.dia} aria-label={nombreDeDia(dia.dia)} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-medium text-texto">{nombreDeDia(dia.dia)}</h2>
            <p className="numeros-tabulares text-sm text-texto-secundario">
              {dia.hechas} de {dia.tareas.length} hechas
              {dia.falladas > 0
                ? `, ${dia.falladas} ${dia.falladas === 1 ? "fallida" : "fallidas"}`
                : ""}
            </p>
          </div>
          {/* Filtrando por un estado, todo lo que se ve es de ese estado: la barra no dice nada. */}
          {filtros.estado === "" ? (
            <BarraDelDia
              completadas={dia.hechas}
              falladas={dia.falladas}
              total={dia.tareas.length}
            />
          ) : null}
          <Tarjeta>
            <ul className="flex flex-col divide-y divide-borde">
              {dia.tareas.map((tarea) => (
                <li key={tarea.id} className="flex items-center gap-3 px-4 py-2">
                  {tarea.fallida ? (
                    // Una fallida no se tilda: en lugar de la casilla va la cruz activada (llena de rojo), con el
                    // mismo aspecto que la casilla marcada de una completada. Tocarla la vuelve a dejar pendiente.
                    <span className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                      <BotonDeFallida
                        activa
                        titulo={tarea.titulo}
                        alFallar={() => fallar.mutate({ tarea, fallida: false })}
                      />
                      <span className="truncate font-medium text-texto-secundario line-through">
                        {tarea.titulo}
                      </span>
                    </span>
                  ) : (
                    <Casilla
                      forma="circular"
                      tachar
                      marcada={tarea.completada}
                      onCambio={(completada) => tildar.mutate({ tarea, completada })}
                      className="min-w-0 flex-1"
                      nombre={tarea.titulo}
                      junto={
                        tarea.completada ? undefined : (
                          <BotonDeFallida
                            titulo={tarea.titulo}
                            alFallar={() => pedirFallida(tarea)}
                          />
                        )
                      }
                      etiqueta={<span className="font-medium">{tarea.titulo}</span>}
                    />
                  )}
                  <EtiquetaDeCategoria
                    categoriaId={tarea.categoriaId}
                    className="shrink-0 text-texto-secundario"
                  />
                  {tarea.fallida ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-peligro">
                      Fallida
                    </span>
                  ) : (
                    <span className="numeros-tabulares shrink-0 text-sm text-texto-secundario">
                      {tarea.completada ? (tarea.hora ?? "") : "Atrasada"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Tarjeta>
        </section>
      ))}
    </div>
  );
}

/**
 * La barra de progreso de un día: un tramo por cada estado, en proporción —completadas, pendientes y
 * fallidas—. El color no va solo: el nombre accesible dice los números y el encabezado del día también.
 */
function BarraDelDia({
  completadas,
  falladas,
  total,
}: {
  completadas: number;
  falladas: number;
  total: number;
}) {
  const pendientes = Math.max(total - completadas - falladas, 0);
  const tramos = [
    { cantidad: completadas, clase: "bg-exito", nombre: "completadas" },
    { cantidad: pendientes, clase: "bg-borde-fuerte", nombre: "pendientes" },
    { cantidad: falladas, clase: "bg-peligro", nombre: "fallidas" },
  ];
  const descripcion = tramos.map((tramo) => `${tramo.cantidad} ${tramo.nombre}`).join(", ");

  return (
    <div
      role="img"
      aria-label={`Progreso del día: ${descripcion}`}
      title={descripcion}
      className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-superficie-suave"
    >
      {tramos
        .filter((tramo) => tramo.cantidad > 0)
        .map((tramo) => (
          <span
            key={tramo.nombre}
            data-tramo={tramo.nombre}
            style={{ flexGrow: tramo.cantidad }}
            className={cn(
              "h-full basis-0 transition-[flex-grow] duration-(--duracion-normal)",
              tramo.clase,
            )}
          />
        ))}
    </div>
  );
}

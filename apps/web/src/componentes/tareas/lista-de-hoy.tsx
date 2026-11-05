// Pestaña "Hoy": lo que hay que hacer, en el orden en que importa.
//
// Arriba un avance del día y un campo para agregar una tarea en un paso (escribir y Enter). Abajo,
// por secciones: atrasadas (de días anteriores que siguen sin hacerse, sueltas o de una repetitiva; la
// sección arranca cerrada para que no tape lo de hoy, con la cantidad a la vista), las
// de hoy, lo que viene más adelante y lo ya cerrado hoy. De una atrasada se puede salir de dos formas:
// tildarla (la hiciste) o marcarla como fallida (ya no se va a hacer); si no, sigue ahí. Tildar o fallar
// una tarea la saca de la lista; "Hechas hoy" y "Fallidas hoy" quedan plegadas por si hay que deshacer
// un cambio por error.
//
// Tildar actualiza la lista al instante (actualización optimista) y, si el servidor falla, la deja
// como estaba y avisa (docs/guias/rendimiento.md, velocidad percibida).

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarClock,
  ChevronDown,
  History,
  ListChecks,
  type LucideIcon,
  PartyPopper,
  Plus,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { ItemAnimado, ListaAnimada } from "@/componentes/ui/lista-animada";
import { Plegable } from "@/componentes/ui/plegable";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  completarTarea,
  crearTarea,
  fallarTarea,
  type ListaDeHoy as Lista,
  obtenerTareasDeHoy,
  type Tarea,
} from "@/lib/api-tareas";
import { cn } from "@/lib/clases";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";
import { usarAvisoDeFallida } from "./aviso-de-fallida";
import { conTareaCompletada, conTareaFallida } from "./ayudas";
import { FilaDeTarea } from "./fila-de-tarea";

const CLAVE = ["tareas", "hoy"] as const;

type PropsListaDeHoy = {
  alEditar: (tarea: Tarea) => void;
  alEliminar: (tarea: Tarea) => void;
};

export function ListaDeHoy({ alEditar, alEliminar }: PropsListaDeHoy) {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  const { data, isPending, error } = useQuery({ queryKey: CLAVE, queryFn: obtenerTareasDeHoy });

  const completar = useMutation({
    mutationFn: ({ tarea, completada }: { tarea: Tarea; completada: boolean }) =>
      completarTarea(tarea.id, completada),
    onMutate: async ({ tarea, completada }) => {
      await queryClient.cancelQueries({ queryKey: CLAVE });
      const anterior = queryClient.getQueryData<Lista>(CLAVE);
      if (anterior) {
        queryClient.setQueryData<Lista>(
          CLAVE,
          conTareaCompletada(anterior, tarea.id, completada, new Date()),
        );
      }
      return { anterior };
    },
    onError: (_error, _variables, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(CLAVE, contexto.anterior);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tareas"] }),
  });

  const fallar = useMutation({
    mutationFn: ({ tarea, fallida }: { tarea: Tarea; fallida: boolean }) =>
      fallarTarea(tarea.id, fallida),
    onMutate: async ({ tarea, fallida }) => {
      await queryClient.cancelQueries({ queryKey: CLAVE });
      const anterior = queryClient.getQueryData<Lista>(CLAVE);
      if (anterior) {
        queryClient.setQueryData<Lista>(
          CLAVE,
          conTareaFallida(anterior, tarea.id, fallida, new Date()),
        );
      }
      return { anterior };
    },
    onError: (_error, _variables, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(CLAVE, contexto.anterior);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tareas"] }),
  });

  // Antes de dar una tarea por fallida se explica qué significa (hasta que la persona pide no verlo más).
  const { pedir: pedirFallida, aviso: avisoDeFallida } = usarAvisoDeFallida((tarea) =>
    fallar.mutate({ tarea, fallida: true }),
  );

  const agregarRapido = useMutation({
    mutationFn: (texto: string) => crearTarea({ titulo: texto, notas: "", fecha: "", hora: "" }),
    onSuccess: async () => {
      setTitulo("");
      await queryClient.invalidateQueries({ queryKey: ["tareas"] });
      campo.current?.focus();
    },
  });

  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
        <span className="solo-lectores">Cargando tus tareas</span>
        <div className="h-24 animate-pulse rounded-tarjeta bg-superficie-suave" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-tarjeta bg-superficie-suave" />
        ))}
      </div>
    );
  }
  if (error) return <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>;

  // El avance del día es solo de las tareas de hoy: las atrasadas no cuentan (ni lo que se hizo hoy de
  // un día anterior), así completar una vieja no infla el porcentaje ni dejar una pendiente lo baja.
  // Una de hoy que se dio por fallida no se hizo, pero tampoco falta: sigue en el total, como no hecha.
  const pendientes = data.deHoy.length;
  const hechas = data.hechasHoy.filter((tarea) => tarea.dia === data.hoy).length;
  const fallidas = data.falladasHoy.filter((tarea) => tarea.dia === data.hoy).length;
  const total = pendientes + hechas + fallidas;
  const sinNada = pendientes === 0;
  const porcentaje = total === 0 ? 0 : Math.round((hechas / total) * 100);

  function alCompletar(tarea: Tarea, completada: boolean) {
    completar.mutate({ tarea, completada });
  }

  function alFallar(tarea: Tarea, fallida: boolean) {
    if (fallida) pedirFallida(tarea);
    else fallar.mutate({ tarea, fallida });
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const texto = titulo.trim();
    if (texto === "" || agregarRapido.isPending) return;
    agregarRapido.mutate(texto);
  }

  return (
    <div className="flex flex-col gap-6">
      <Tarjeta className="flex flex-col gap-4 p-4" brillo>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-texto">Hoy</h2>
            <p className="numeros-tabulares text-sm text-texto-secundario" aria-live="polite">
              {total === 0
                ? "Todavía no tenés tareas para hoy."
                : pendientes === 0
                  ? fallidas > 0
                    ? `${hechas} hechas y ${fallidas} ${fallidas === 1 ? "fallida" : "fallidas"}`
                    : hechas === 1
                      ? "Hiciste la única tarea de hoy."
                      : `Hiciste las ${hechas} tareas de hoy.`
                  : `${hechas} de ${total} hechas`}
            </p>
          </div>
          {total > 0 ? (
            <p className="flex flex-col items-end leading-tight">
              <span className="numeros-tabulares text-2xl font-semibold text-acento">
                <span aria-hidden="true">{porcentaje}%</span>
                <span className="solo-lectores">{porcentaje} por ciento</span>
              </span>
              <span className="text-xs text-texto-secundario">del día completado</span>
            </p>
          ) : null}
        </div>

        {total > 0 ? (
          <div
            role="progressbar"
            aria-label="Avance de hoy"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={hechas}
            className="h-1.5 overflow-hidden rounded-full bg-superficie-suave"
          >
            <div
              className="h-full origin-left rounded-full bg-acento transition-transform duration-(--duracion-lenta) ease-salida motion-reduce:transition-none"
              style={{ transform: `scaleX(${hechas / total})` }}
            />
          </div>
        ) : null}

        <form onSubmit={enviar} className="flex gap-2" aria-label="Agregar una tarea para hoy">
          <input
            ref={campo}
            value={titulo}
            onChange={(evento) => setTitulo(evento.target.value)}
            aria-label="Agregar una tarea para hoy"
            placeholder="Nueva tarea para hoy"
            maxLength={120}
            className={cn(
              "h-11 min-w-0 flex-1 rounded-control border border-borde-fuerte bg-superficie px-3 text-base text-texto shadow-sutil",
              "placeholder:text-texto-secundario",
              "transition-[border-color,box-shadow] duration-(--duracion-rapida) ease-salida",
              "hover:border-acento/40 focus:border-acento",
              "focus-visible:shadow-(--anillo-foco) focus-visible:outline-none",
            )}
          />
          <Boton
            type="submit"
            cargando={agregarRapido.isPending}
            textoCargando="Agregando"
            disabled={titulo.trim() === ""}
          >
            <Plus aria-hidden="true" className="size-4" />
            Agregar
          </Boton>
        </form>
        {agregarRapido.isError ? (
          <Aviso tono="peligro">
            {detalleDeValidacion(agregarRapido.error) ??
              interpretarError(agregarRapido.error).mensaje}
          </Aviso>
        ) : null}
      </Tarjeta>

      {completar.isError || fallar.isError ? (
        <Aviso tono="peligro">
          No pudimos guardar el cambio y dejamos la tarea como estaba.{" "}
          {interpretarError(completar.error ?? fallar.error).mensaje}
        </Aviso>
      ) : null}

      {sinNada ? <EstadoDeDia hechas={hechas} alAgregar={() => campo.current?.focus()} /> : null}

      {avisoDeFallida}

      <Seccion
        titulo="Atrasadas"
        tono="peligro"
        plegada
        ayuda="De días anteriores. Siguen acá hasta que las hagas o las marques como fallidas; pasada una semana se marcan solas."
        tareas={data.atrasadas}
        hoy={data.hoy}
        alCompletar={alCompletar}
        alFallar={alFallar}
        alEditar={alEditar}
        alEliminar={alEliminar}
      />
      <Seccion
        titulo="Para hoy"
        tareas={data.deHoy}
        hoy={data.hoy}
        alCompletar={alCompletar}
        alFallar={alFallar}
        alEditar={alEditar}
        alEliminar={alEliminar}
      />

      <Seccion
        titulo="Hechas hoy"
        tono="suave"
        plegada
        tareas={data.hechasHoy}
        subdivisiones={[
          {
            titulo: "Eran de hoy",
            icono: CalendarCheck,
            tareas: data.hechasHoy.filter((tarea) => tarea.dia === data.hoy),
          },
          {
            titulo: "Estaban atrasadas",
            icono: History,
            tareas: data.hechasHoy.filter((tarea) => tarea.dia < data.hoy),
          },
          {
            titulo: "Adelantadas",
            icono: CalendarClock,
            tareas: data.hechasHoy.filter((tarea) => tarea.dia > data.hoy),
          },
        ]}
        hoy={data.hoy}
        alCompletar={alCompletar}
      />
      <Seccion
        titulo="Fallidas hoy"
        tono="suave"
        plegada
        tareas={data.falladasHoy}
        hoy={data.hoy}
        alCompletar={alCompletar}
        alFallar={alFallar}
      />

      <Seccion
        titulo="Más adelante"
        icono={CalendarClock}
        tareas={data.masAdelante}
        hoy={data.hoy}
        alCompletar={alCompletar}
        alEditar={alEditar}
        alEliminar={alEliminar}
      />
    </div>
  );
}

function Seccion({
  titulo,
  tono,
  plegada = false,
  subdivisiones,
  ayuda,
  icono: Icono = ListChecks,
  tareas,
  hoy,
  alCompletar,
  alFallar,
  alEditar,
  alEliminar,
}: {
  titulo: string;
  tono?: "peligro" | "suave";
  /** Arranca cerrada: se muestra el título con la cantidad y se abre al tocarlo. */
  plegada?: boolean;
  /**
   * Divide la lista en grupos con su propio subtítulo (los vacíos no se muestran). `tareas` sigue siendo el
   * total, para el título y para saber si la sección existe.
   */
  subdivisiones?: { titulo: string; icono: LucideIcon; tareas: Tarea[] }[];
  ayuda?: string;
  icono?: typeof ListChecks;
  tareas: Tarea[];
  hoy: string;
  alCompletar: (tarea: Tarea, completada: boolean) => void;
  alFallar?: (tarea: Tarea, fallida: boolean) => void;
  alEditar?: (tarea: Tarea) => void;
  alEliminar?: (tarea: Tarea) => void;
}) {
  const [abierta, setAbierta] = useState(!plegada);
  const idDeLaLista = useId();
  if (tareas.length === 0) return null;

  const colorDelTitulo =
    tono === "peligro"
      ? "text-peligro"
      : tono === "suave"
        ? "text-texto-secundario hover:text-texto"
        : "text-texto";
  const cantidad = <span className="numeros-tabulares font-normal">({tareas.length})</span>;

  /** Una tarjeta con las filas de una lista de tareas. */
  const tarjetaDe = (delGrupo: Tarea[]) => (
    <Tarjeta>
      {/* Dentro de una sección plegable no hay cascada de entrada: se anima el conjunto (Plegable). */}
      <ListaAnimada entrada={!plegada} className="divide-y divide-borde">
        {delGrupo.map((tarea) => (
          <ItemAnimado key={tarea.id}>
            <FilaDeTarea
              tarea={tarea}
              hoy={hoy}
              alCompletar={alCompletar}
              alFallar={alFallar}
              alEditar={alEditar}
              alEliminar={alEliminar}
              // En Hoy la casilla y la cruz de lo pendiente aparecen al apuntar; lo hecho o fallido muestra su estado.
              acciones="al-apuntar"
            />
          </ItemAnimado>
        ))}
      </ListaAnimada>
    </Tarjeta>
  );

  // Con subdivisión, cada grupo es un bloque propio —un subtítulo con su ícono y cantidad, y su tarjeta—,
  // separado de los demás, para que se lea de un vistazo de dónde viene cada tarea.
  const lista = subdivisiones ? (
    <div className="ml-2 flex flex-col gap-5 border-l-2 border-borde pl-4">
      {subdivisiones
        .filter((grupo) => grupo.tareas.length > 0)
        .map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-2">
            <h4 className="flex items-center gap-2 pl-1 text-sm font-medium text-texto">
              <grupo.icono aria-hidden="true" className="size-4 text-texto-secundario" />
              {grupo.titulo}
              <span className="numeros-tabulares rounded-full bg-superficie-suave px-2 text-xs leading-5 font-medium text-texto-secundario">
                {grupo.tareas.length}
              </span>
            </h4>
            {tarjetaDe(grupo.tareas)}
          </div>
        ))}
    </div>
  ) : (
    tarjetaDe(tareas)
  );

  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <div>
        <h3 className={cn("text-sm font-medium", colorDelTitulo)}>
          {plegada ? (
            <button
              type="button"
              aria-expanded={abierta}
              aria-controls={idDeLaLista}
              onClick={() => setAbierta((actual) => !actual)}
              className="-mx-1 flex w-fit items-center gap-1.5 rounded-control px-1 transition-colors duration-(--duracion-rapida) ease-salida focus-visible:shadow-(--anillo-foco) focus-visible:outline-none"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform duration-(--duracion-normal) ease-salida motion-reduce:transition-none",
                  !abierta && "-rotate-90",
                )}
              />
              {titulo} {cantidad}
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              <Icono aria-hidden="true" className="size-4" />
              {titulo} {cantidad}
            </span>
          )}
        </h3>
        {ayuda ? <p className="text-xs text-texto-secundario">{ayuda}</p> : null}
      </div>
      {plegada ? (
        <Plegable abierto={abierta} id={idDeLaLista}>
          {lista}
        </Plegable>
      ) : (
        lista
      )}
    </section>
  );
}

function EstadoDeDia({ hechas, alAgregar }: { hechas: number; alAgregar: () => void }) {
  return (
    <Tarjeta className="flex flex-col items-center gap-3 p-8 text-center">
      {hechas > 0 ? (
        <PartyPopper aria-hidden="true" className="size-8 text-acento" />
      ) : (
        <ListChecks aria-hidden="true" className="size-8 text-texto-secundario" />
      )}
      <h3 className="text-base font-medium text-texto">
        {hechas > 0 ? "¡No queda nada para hoy!" : "No tenés tareas para hoy"}
      </h3>
      <p className="max-w-md text-sm text-texto-secundario">
        {hechas > 0
          ? "Hiciste todo lo de hoy. Podés agregar algo más o descansar."
          : "Para una tarea rápida, escribila en el campo «Nueva tarea para hoy». Si necesitás elegir otro día, una hora o que se repita (por ejemplo, todos los meses), usá el botón «Agregar tarea»."}
      </p>
      <Boton variante="secundario" onClick={alAgregar}>
        <Plus aria-hidden="true" className="size-4" />
        Escribir una tarea
      </Boton>
    </Tarjeta>
  );
}

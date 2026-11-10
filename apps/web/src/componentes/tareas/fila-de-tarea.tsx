// Una fila de la lista de tareas: casilla para tildarla, el título y, debajo, lo que ayuda a
// ubicarla (la hora, de qué día era si está atrasada, si se repite, las notas).
//
// Al tildar, la fila no desaparece de golpe: el tilde se dibuja y el título se tacha, se espera un
// instante para que se vea y recién ahí se avisa que está hecha (la lista la saca con su
// animación de salida). Así tachar se siente como tachar y no como un botón que borra. Si se
// destilda durante esa espera, se cancela. Con la preferencia de reducir movimiento la espera es
// mínima.
//
// Una tarea pendiente tiene dos salidas, una al lado de la otra: la casilla (la hiciste) y la cruz (ya no la vas a
// hacer). En la pantalla de Hoy ambas pueden quedar ocultas y aparecer al apuntar a la fila (`acciones="al-apuntar"`,
// como los botones de editar y eliminar); una tarea ya completada o fallida muestra siempre su estado final: la
// casilla marcada en verde o la cruz activada en rojo, y tocarla la devuelve a pendiente.
//
// Una tarea progresiva ("tomar 2 litros de agua") no tiene casilla: en su lugar va un aro, siempre visible,
// que se llena con el porcentaje cubierto, y debajo del título, cuánto lleva ("1,5 de 2 litros · 75 %").
// Al apuntar a la fila aparece, junto a editar y eliminar, el botón para sumar o restar (ver
// progreso-de-tarea.tsx). Se completa sola al llegar a la meta.

"use client";

import {
  type ProgresoDeTarea,
  progresoEnPalabras,
  proporcionDelProgreso,
} from "@gestoria/shared";
import { CirclePlus, Pencil, Repeat, Trash2, X, XCircle } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Casilla } from "@/componentes/ui/casilla";
import { DistintivoImportante } from "@/componentes/ui/distintivo-importante";
import type { Tarea } from "@/lib/api-tareas";
import { cn } from "@/lib/clases";
import { diaCorto, diaDeOrigen, nombreDeDia } from "./ayudas";
import { EtiquetaDeCategoria } from "./categorias";
import { AnilloDeProgreso, PanelDeProgreso } from "./progreso-de-tarea";

/** Cuánto se ve el tachado antes de que la tarea salga de la lista. */
const ESPERA_ANTES_DE_SACARLA_MS = 420;
/** Con la preferencia de reducir movimiento no hay tachado animado que esperar. */
const ESPERA_SIN_MOVIMIENTO_MS = 120;

const CLASE_BOTON_DE_ICONO = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-texto-secundario",
  "transition-colors duration-(--duracion-rapida) ease-salida",
  "hover:bg-superficie-suave hover:text-texto",
  "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
);

/**
 * La cruz de "fallida": un círculo con una equis, la pareja de la casilla de completar (un círculo con un tilde).
 * - Sin `activa`: marca la tarea como fallida (una atrasada o una de hoy). Va justo a la derecha de la casilla. El
 *   círculo se ve siempre; al apuntarlo, la cruz y el círculo se pintan de rojo.
 * - Con `activa`: la tarea ya está fallida. El círculo queda lleno de rojo, como la casilla queda llena de verde
 *   cuando está completada, y tocarlo la vuelve a dejar pendiente.
 */
export function BotonDeFallida({
  titulo,
  alFallar,
  activa = false,
  className,
}: {
  titulo: string;
  alFallar: () => void;
  activa?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={alFallar}
      aria-label={activa ? `Volver a dejar pendiente: ${titulo}` : `Marcar como fallida: ${titulo}`}
      title={
        activa
          ? "Fallida: tocá para volver a dejarla pendiente"
          : "Marcar como fallida: ya no se va a hacer"
      }
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border",
        "transition-colors duration-(--duracion-rapida) ease-salida",
        "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
        activa
          ? "border-peligro bg-peligro text-peligro-fondo"
          : "border-borde-fuerte text-texto-secundario hover:border-peligro hover:bg-peligro-fondo hover:text-peligro",
        className,
      )}
    >
      <X aria-hidden="true" className="size-3.5" />
    </button>
  );
}

type PropsFilaDeTarea = {
  tarea: Tarea;
  /** El día de hoy, para decir "era para el martes" en las atrasadas. */
  hoy: string;
  alCompletar: (tarea: Tarea, completada: boolean) => void;
  /** Marcar como fallida una atrasada o de hoy, o volver a dejar pendiente una fallida. Sin esto no se ofrece. */
  alFallar?: ((tarea: Tarea, fallida: boolean) => void) | undefined;
  alEditar?: ((tarea: Tarea) => void) | undefined;
  alEliminar?: ((tarea: Tarea) => void) | undefined;
  /** Anotar el progreso de una tarea progresiva. Sin esto, solo se muestra cuánto lleva. */
  alAnotarProgreso?: ((tarea: Tarea, cambio: ProgresoDeTarea) => void) | undefined;
  /**
   * Cuándo se ven la casilla y la cruz de una tarea pendiente: "siempre" (por defecto) o "al-apuntar", que con mouse
   * las oculta hasta apuntar a la fila o navegar con el teclado (en pantallas táctiles se ven siempre). Una tarea ya
   * completada o fallida muestra siempre su estado final.
   */
  acciones?: "siempre" | "al-apuntar";
};

export function FilaDeTarea({
  tarea,
  hoy,
  alCompletar,
  alFallar,
  alEditar,
  alEliminar,
  alAnotarProgreso,
  acciones = "siempre",
}: PropsFilaDeTarea) {
  const [marcando, setMarcando] = useState(false);
  const [anotando, setAnotando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducirMovimiento = useReducedMotion();

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  function cambiar(marcada: boolean) {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;

    if (marcada && !tarea.completada) {
      setMarcando(true);
      temporizador.current = setTimeout(
        () => {
          temporizador.current = null;
          alCompletar(tarea, true);
        },
        reducirMovimiento ? ESPERA_SIN_MOVIMIENTO_MS : ESPERA_ANTES_DE_SACARLA_MS,
      );
      return;
    }
    setMarcando(false);
    if (tarea.completada) alCompletar(tarea, false);
  }

  const pendiente = !tarea.completada && !tarea.fallida;
  const atrasada = tarea.dia < hoy && pendiente;
  // Se puede dar por fallida una atrasada o una de hoy; una de un día futuro todavía no le toca.
  const puedeFallar = tarea.dia <= hoy && pendiente;
  // Solo lo pendiente se oculta: lo ya hecho o fallido muestra siempre cómo quedó.
  const reveladaAlApuntar = acciones === "al-apuntar" && pendiente;
  const progresiva = tarea.meta !== null;
  // Se anota en lo de hoy o atrasado (también para corregir una ya completa); no en una fallida ni futura.
  const puedeAnotar = progresiva && alAnotarProgreso !== undefined && !tarea.fallida && tarea.dia <= hoy;
  const detalles = [
    progresiva
      ? `${progresoEnPalabras(tarea.progreso, tarea.meta ?? 0, tarea.unidad)} · ${Math.round(
          proporcionDelProgreso(tarea.progreso, tarea.meta ?? 0) * 100,
        )} %`
      : null,
    tarea.hora,
    // De qué día era, con el día concreto: para una atrasada, una que se acaba de hacer o una fallida.
    tarea.dia < hoy ? `Era para ${diaDeOrigen(tarea.dia, hoy)}` : null,
    tarea.dia > hoy ? `${nombreDeDia(tarea.dia, hoy)} (${diaCorto(tarea.dia)})` : null,
  ].filter((detalle): detalle is string => detalle !== null);
  const hayDetalles =
    detalles.length > 0 ||
    tarea.fallida ||
    tarea.importante ||
    tarea.repetitiva ||
    tarea.notas ||
    tarea.categoriaId !== null;

  const debajo = hayDetalles ? (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-texto-secundario">
      {detalles.map((detalle, indice) => (
        <span
          key={detalle}
          className={cn(
            "numeros-tabulares",
            atrasada && indice === detalles.length - 1 && "text-peligro",
          )}
        >
          {detalle}
        </span>
      ))}
      {tarea.importante ? <DistintivoImportante /> : null}
      {tarea.fallida ? (
        <span className="inline-flex items-center gap-1 font-medium text-peligro">
          <XCircle aria-hidden="true" className="size-3.5" />
          Fallida
        </span>
      ) : null}
      <EtiquetaDeCategoria categoriaId={tarea.categoriaId} />
      {tarea.repetitiva ? (
        <span className="inline-flex items-center gap-1">
          <Repeat aria-hidden="true" className="size-3.5" />
          Se repite
        </span>
      ) : null}
      {tarea.notas ? <span className="min-w-0 truncate">{tarea.notas}</span> : null}
    </span>
  ) : undefined;

  return (
    <div
      data-importante={tarea.importante ? "" : undefined}
      // Una importante lleva una franja de color a la izquierda; las demás, el mismo espacio sin color.
      className={cn(
        "group flex items-center gap-1 border-l-2 py-1.5 pr-4 pl-[calc(1rem-2px)]",
        tarea.importante ? "border-advertencia" : "border-transparent",
      )}
    >
      {progresiva && !tarea.fallida ? (
        // Una progresiva no se tilda: el aro muestra cuánto lleva y abre el campo para anotar. Si se puede dar
        // por fallida, la cruz va a su derecha, como con la casilla.
        <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 text-sm">
          <span className="row-span-3 flex items-center gap-1 self-start pt-0.5">
            <AnilloDeProgreso
              tarea={tarea}
              abierto={anotando}
              alTocar={puedeAnotar ? () => setAnotando((abierto) => !abierto) : undefined}
            />
            {alFallar && puedeFallar ? (
              <BotonDeFallida titulo={tarea.titulo} alFallar={() => alFallar(tarea, true)} />
            ) : null}
          </span>
          <span
            className={cn(
              "justify-self-start font-medium",
              tarea.completada ? "text-texto-secundario line-through" : "text-texto",
            )}
          >
            {tarea.titulo}
          </span>
          {debajo ? <span className="col-start-2">{debajo}</span> : null}
          {anotando && puedeAnotar && alAnotarProgreso ? (
            <span className="col-start-2">
              <PanelDeProgreso
                tarea={tarea}
                alCerrar={() => setAnotando(false)}
                alAnotar={(cambio) => alAnotarProgreso(tarea, cambio)}
              />
            </span>
          ) : null}
        </div>
      ) : tarea.fallida ? (
        // Una fallida no se tilda: en lugar de la casilla va la cruz activada (llena de rojo), como una completada
        // lleva la casilla marcada. Tocarla la vuelve a dejar pendiente.
        <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 text-sm">
          <span className="row-span-2 self-center">
            {alFallar ? (
              <BotonDeFallida
                activa
                titulo={tarea.titulo}
                alFallar={() => alFallar(tarea, false)}
              />
            ) : (
              <span
                aria-hidden="true"
                className="inline-flex size-6 items-center justify-center rounded-full border border-peligro bg-peligro text-peligro-fondo"
              >
                <X className="size-3.5" />
              </span>
            )}
          </span>
          <span className="justify-self-start font-medium text-texto-secundario line-through">
            {tarea.titulo}
          </span>
          {debajo ? <span className="col-start-2 row-start-2">{debajo}</span> : null}
        </div>
      ) : (
        // La casilla queda centrada en la altura de la fila. Si se puede dar por fallida, la cruz va
        // justo a su derecha: son las dos salidas (hacerla o darla por perdida).
        <Casilla
          forma="circular"
          tachar
          reveladaAlApuntar={reveladaAlApuntar}
          marcada={tarea.completada || marcando}
          onCambio={cambiar}
          nombre={tarea.titulo}
          className="min-w-0 flex-1"
          junto={
            alFallar && puedeFallar ? (
              <BotonDeFallida titulo={tarea.titulo} alFallar={() => alFallar(tarea, true)} />
            ) : undefined
          }
          etiqueta={<span className="font-medium">{tarea.titulo}</span>}
          debajo={debajo}
        />
      )}

      {/* Las acciones se ven siempre en pantallas táctiles y, con mouse, al apuntar a la fila o
          navegar con el teclado. */}
      <div
        className={cn(
          "flex shrink-0 items-center transition-opacity duration-(--duracion-rapida) ease-salida",
          "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
          "[@media(hover:hover)]:group-focus-within:opacity-100",
        )}
      >
        {puedeAnotar ? (
          <button
            type="button"
            className={cn(CLASE_BOTON_DE_ICONO, "hover:bg-exito-fondo hover:text-exito")}
            aria-label={`Sumar o restar: ${tarea.titulo}`}
            aria-expanded={anotando}
            title="Sumar o restar"
            onClick={() => setAnotando((abierto) => !abierto)}
          >
            <CirclePlus aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        {alEditar ? (
          <button
            type="button"
            className={CLASE_BOTON_DE_ICONO}
            aria-label={`Editar: ${tarea.titulo}`}
            onClick={() => alEditar(tarea)}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        {alEliminar ? (
          <button
            type="button"
            className={cn(CLASE_BOTON_DE_ICONO, "hover:bg-peligro-fondo hover:text-peligro")}
            aria-label={`Eliminar: ${tarea.titulo}`}
            onClick={() => alEliminar(tarea)}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

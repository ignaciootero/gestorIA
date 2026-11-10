// Los eventos del día elegido: lo que viene de Finanzas, Contactos y Tareas más lo que se anotó a
// mano, ordenado por hora (primero lo de todo el día), y el botón para agregar un evento.
//
// Cada evento dice de dónde viene con un texto, un ícono y el color de su origen (borde de la fila e
// insignia; el color nunca va solo): "Finanzas" para el vencimiento de una deuda, "Contactos" para un
// recordatorio, "Tareas" para una tarea pendiente y "Calendario" para los que se agregan acá. Los de los
// otros módulos se cambian en su módulo, así que llevan un enlace para ir a verlos; los manuales se pueden
// editar y eliminar desde la lista.
//
// La lista ya viene filtrada por origen (ver filtro-de-origenes.tsx); acá solo se avisa cuántos eventos del
// día quedaron ocultos por ese filtro, para que "no hay nada" no se confunda con "lo ocultaste".
//
// Los formularios y la confirmación viven en diálogos que se montan solo mientras están abiertos, así
// cada apertura arranca con un formulario nuevo (mismo patrón que PanelDeTareas).

"use client";

import {
  type EventoDeCalendario,
  esEventoPasado,
  estadoDeEvento,
  NOMBRES_DE_ORIGEN,
} from "@gestoria/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarOff,
  CalendarPlus,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { eliminarEvento } from "@/lib/api-calendario";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { FormularioDeEvento, type ModoDeFormularioDeEvento } from "./formulario-de-evento";
import { ESTILOS_DE_ORIGEN } from "./origenes";

const CLASE_BOTON_DE_ICONO = cn(
  "inline-flex size-9 shrink-0 items-center justify-center rounded-control text-texto-secundario",
  "transition-colors duration-(--duracion-rapida) ease-salida",
  "hover:bg-superficie-suave hover:text-texto",
  "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
);

type Dialogos =
  | { tipo: "formulario"; modo: ModoDeFormularioDeEvento }
  | { tipo: "eliminar"; evento: EventoDeCalendario };

type PropsEventosDelDia = {
  dia: string;
  /** Hoy, para saber qué tareas están atrasadas. */
  hoy: string;
  /** Los eventos de un rango que incluye el día, ya filtrados por origen; acá se muestran solo los de `dia`. */
  eventos: EventoDeCalendario[] | undefined;
  /** Cuántos eventos de este día se ocultaron con el filtro de orígenes. */
  ocultosPorElFiltro: number;
  cargando: boolean;
  error: unknown;
  /** Se llama cuando se guardó un evento manual (nuevo o editado). */
  alGuardarEvento?: ((dia: string) => void) | undefined;
};

export function EventosDelDia({
  dia,
  hoy,
  eventos,
  ocultosPorElFiltro,
  cargando,
  error,
  alGuardarEvento,
}: PropsEventosDelDia) {
  const queryClient = useQueryClient();
  const [dialogo, setDialogo] = useState<Dialogos | null>(null);

  const eliminar = useMutation({
    mutationFn: (evento: EventoDeCalendario) => eliminarEvento(evento.id),
    onSuccess: async () => {
      setDialogo(null);
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
    },
  });

  const delDia = (eventos ?? []).filter((evento) => evento.dia === dia);

  function cerrarDialogo() {
    setDialogo(null);
  }

  /** Lo que hace cada <dialog> al cerrarse: limpiar el estado, pero solo si sigue siendo el suyo. */
  function alCerrarseEl(tipo: Dialogos["tipo"]) {
    return () => setDialogo((actual) => (actual?.tipo === tipo ? null : actual));
  }

  return (
    <section aria-label="Eventos del día" className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-texto">
          Eventos del día
          {eventos ? (
            <span className="numeros-tabulares font-normal text-texto-secundario">
              {" "}
              ({delDia.length})
            </span>
          ) : null}
        </h3>
        <Boton
          variante="secundario"
          tamano="chico"
          onClick={() => setDialogo({ tipo: "formulario", modo: { tipo: "nuevo", dia } })}
        >
          <CalendarPlus aria-hidden="true" className="size-4" />
          Agregar evento
        </Boton>
      </div>

      {ocultosPorElFiltro > 0 && delDia.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-texto-secundario">
          <EyeOff aria-hidden="true" className="size-3.5 shrink-0" />
          {ocultosPorElFiltro === 1
            ? "1 evento oculto por el filtro"
            : `${ocultosPorElFiltro} eventos ocultos por el filtro`}
        </p>
      ) : null}

      {error ? (
        <Aviso tono="peligro">
          No pudimos cargar los eventos. {interpretarError(error).mensaje}
        </Aviso>
      ) : cargando && !eventos ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando los eventos del día</span>
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      ) : delDia.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-tarjeta border border-dashed border-borde-fuerte px-4 py-6 text-center">
          {ocultosPorElFiltro > 0 ? (
            <>
              <EyeOff aria-hidden="true" className="size-6 text-texto-secundario" />
              <p className="text-sm font-medium text-texto">
                {ocultosPorElFiltro === 1
                  ? "Hay 1 evento oculto por el filtro"
                  : `Hay ${ocultosPorElFiltro} eventos ocultos por el filtro`}
              </p>
              <p className="text-xs text-texto-secundario">
                Prendé su origen o revisá “Más filtros” para verlos.
              </p>
            </>
          ) : (
            <>
              <CalendarOff aria-hidden="true" className="size-6 text-texto-secundario" />
              <p className="text-sm font-medium text-texto">Sin eventos para este día</p>
              <p className="text-xs text-texto-secundario">
                Acá aparecen los vencimientos de deudas, los recordatorios de contactos, las tareas
                pendientes y los eventos que agregues.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="-mx-1 min-h-0 flex-1 divide-y divide-borde overflow-y-auto px-1">
          {delDia.map((evento) => (
            <FilaDeEvento
              key={evento.id}
              evento={evento}
              hoy={hoy}
              alEditar={() =>
                setDialogo({
                  tipo: "formulario",
                  modo: {
                    tipo: "editar",
                    id: evento.id,
                    datos: {
                      titulo: evento.titulo,
                      notas: evento.detalle ?? "",
                      fecha: evento.dia,
                      hora: evento.hora ?? "",
                    },
                  },
                })
              }
              alEliminar={() => {
                eliminar.reset();
                setDialogo({ tipo: "eliminar", evento });
              }}
            />
          ))}
        </ul>
      )}

      <Dialogo
        abierto={dialogo?.tipo === "formulario"}
        onCerrar={alCerrarseEl("formulario")}
        titulo={
          dialogo?.tipo === "formulario" && dialogo.modo.tipo === "editar"
            ? "Editar evento"
            : "Agregar evento"
        }
        icono={dialogo?.tipo === "formulario" && dialogo.modo.tipo === "editar" ? Pencil : Plus}
        className="max-h-full max-w-xl overflow-y-auto"
      >
        {dialogo?.tipo === "formulario" ? (
          <FormularioDeEvento
            modo={dialogo.modo}
            cerrar={cerrarDialogo}
            alGuardar={alGuardarEvento}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "eliminar"}
        onCerrar={alCerrarseEl("eliminar")}
        titulo="Eliminar evento"
        icono={Trash2}
        tono="peligro"
      >
        {dialogo?.tipo === "eliminar" ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina “{dialogo.evento.titulo}” del calendario.
            </p>
            {eliminar.isError ? (
              <Aviso tono="peligro">{interpretarError(eliminar.error).mensaje}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={cerrarDialogo}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate(dialogo.evento)}
              >
                Eliminar
              </Boton>
            </div>
          </>
        ) : null}
      </Dialogo>
    </section>
  );
}

function FilaDeEvento({
  evento,
  hoy,
  alEditar,
  alEliminar,
}: {
  evento: EventoDeCalendario;
  hoy: string;
  alEditar: () => void;
  alEliminar: () => void;
}) {
  const { icono: Icono, ruta, borde, suave } = ESTILOS_DE_ORIGEN[evento.origen];
  const origen = NOMBRES_DE_ORIGEN[evento.origen];
  const estado = estadoDeEvento(evento, hoy);
  // Un recordatorio o un evento propio de un día anterior: no se tilda, simplemente pasó.
  const pasado = esEventoPasado(evento, hoy);

  return (
    <li
      data-origen={evento.origen}
      data-completado={evento.completado}
      data-fallido={evento.fallido}
      className="py-1.5"
    >
      {/* El borde de la izquierda lleva el color del origen: de un vistazo se ve de dónde viene cada uno. */}
      <div className={cn("flex items-start gap-3 border-l-4 py-1 pr-1 pl-3", borde)}>
        {/* La hora va a la izquierda, en una columna fija: así se lee el orden de un vistazo. */}
        <p
          className={cn(
            "w-14 shrink-0 pt-0.5 text-sm",
            evento.hora
              ? "numeros-tabulares font-medium text-texto"
              : "text-xs text-texto-secundario",
          )}
        >
          {evento.hora ?? "Todo el día"}
        </p>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p
            className={cn(
              "text-sm font-medium wrap-break-word",
              // Lo ya hecho se ve tachado y más apagado que lo que falta.
              evento.completado || evento.fallido || pasado
                ? "text-texto-secundario line-through"
                : "text-texto",
            )}
          >
            {evento.titulo}
          </p>
          {evento.detalle ? (
            <p className="text-xs wrap-break-word text-texto-secundario">{evento.detalle}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                suave,
              )}
            >
              <Icono aria-hidden="true" className="size-3 shrink-0" />
              {origen}
            </span>
            {estado === "pendiente" && !pasado ? null : (
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-borde-fuerte px-2 py-0.5 text-xs font-medium text-texto-secundario">
                {evento.fallido ? (
                  <CircleX aria-hidden="true" className="size-3 shrink-0" />
                ) : estado === "atrasada" ? (
                  <CircleAlert aria-hidden="true" className="size-3 shrink-0" />
                ) : pasado ? (
                  <Circle aria-hidden="true" className="size-3 shrink-0" />
                ) : (
                  <CircleCheck aria-hidden="true" className="size-3 shrink-0" />
                )}
                {evento.fallido
                  ? "Fallida"
                  : estado === "atrasada"
                    ? "Atrasada"
                    : pasado
                      ? "Pasado"
                      : evento.origen === "finanzas"
                        ? "Pagada"
                        : "Completada"}
              </span>
            )}
          </div>
        </div>

        {ruta ? (
          <Link
            href={ruta}
            className={CLASE_BOTON_DE_ICONO}
            aria-label={`Ver en ${origen}: ${evento.titulo}`}
          >
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              className={CLASE_BOTON_DE_ICONO}
              aria-label={`Editar: ${evento.titulo}`}
              onClick={alEditar}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              className={cn(CLASE_BOTON_DE_ICONO, "hover:bg-peligro-fondo hover:text-peligro")}
              aria-label={`Eliminar: ${evento.titulo}`}
              onClick={alEliminar}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

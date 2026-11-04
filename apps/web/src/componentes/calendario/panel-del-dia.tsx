// El panel del día elegido: el número grande, cuándo cae respecto de hoy y a qué semana y día del
// año corresponde, con atajos para moverse (día anterior, día siguiente, ir a una fecha).
//
// Abajo van los eventos de ese día (ver eventos-del-dia.tsx). El contenido de arriba se desliza un
// poco al cambiar de día, hacia el lado en que se va, para que se note que es otro día y no la misma
// pantalla.

"use client";

import {
  ANIO_MAXIMO_DEL_CALENDARIO,
  ANIO_MINIMO_DEL_CALENDARIO,
  describirDiaCompleto,
  diaIsoDeLaSemana,
  diasEntre,
  type EventoDeCalendario,
  esDiaReal,
  NOMBRES_DE_DIA_DE_LA_SEMANA,
  nombreDeMesDelCalendario,
  numeroDeSemana,
} from "@gestoria/shared";
import { CURVA_SALIDA, DURACION_MS } from "@gestoria/ui-tokens";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { cn } from "@/lib/clases";
import { EventosDelDia } from "./eventos-del-dia";

/** El rango de años que acepta el calendario. */
export const ANIO_MINIMO = ANIO_MINIMO_DEL_CALENDARIO;
export const ANIO_MAXIMO = ANIO_MAXIMO_DEL_CALENDARIO;

/** "Hoy", "Mañana", "Ayer", "En 12 días", "Hace 3 días". */
function cuandoEs(dias: number): string {
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  if (dias === -1) return "Ayer";
  return dias > 0 ? `En ${dias} días` : `Hace ${-dias} días`;
}

const CLASE_BOTON_DE_ICONO = cn(
  "inline-flex size-10 items-center justify-center rounded-control border border-borde-fuerte bg-superficie text-texto shadow-sutil",
  "transition-colors duration-(--duracion-rapida) ease-salida",
  "hover:border-acento/40 hover:bg-superficie-suave",
  "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
  "disabled:pointer-events-none disabled:opacity-50",
);

type PropsPanelDelDia = {
  dia: string;
  hoy: string;
  /** 1 si se va hacia adelante en el tiempo y -1 si se va hacia atrás. */
  direccion: 1 | -1;
  alElegir: (dia: string) => void;
  alAnterior: () => void;
  alSiguiente: () => void;
  /** Los eventos del mes que se está viendo (ya filtrados por origen); el panel muestra los del día elegido. */
  eventos: EventoDeCalendario[] | undefined;
  /** Cuántos eventos del día elegido se ocultaron con el filtro de orígenes. */
  ocultosPorElFiltro: number;
  cargandoEventos: boolean;
  errorDeEventos: unknown;
  /** Se llama cuando se guardó un evento manual. */
  alGuardarEvento?: (() => void) | undefined;
};

export function PanelDelDia({
  dia,
  hoy,
  direccion,
  alElegir,
  alAnterior,
  alSiguiente,
  eventos,
  ocultosPorElFiltro,
  cargandoEventos,
  errorDeEventos,
  alGuardarEvento,
}: PropsPanelDelDia) {
  const reducirMovimiento = useReducedMotion() === true;
  const [anioTexto, mesTexto, numeroTexto] = dia.split("-");
  const mes = Number(mesTexto);
  const dias = diasEntre(hoy, dia);
  const diaDelAnio = diasEntre(`${anioTexto}-01-01`, dia) + 1;
  const diaDeLaSemana = NOMBRES_DE_DIA_DE_LA_SEMANA[diaIsoDeLaSemana(dia) - 1];
  const desplazamiento = reducirMovimiento ? 0 : 18;

  return (
    <Tarjeta className="flex h-full flex-col gap-5 p-5" brillo>
      {/* El anuncio para lectores de pantalla: el día elegido, dicho completo. */}
      <p className="solo-lectores" aria-live="polite">
        Día elegido: {describirDiaCompleto(dia)}
      </p>

      <div className="relative overflow-hidden">
        <AnimatePresence initial={false} custom={direccion} mode="popLayout">
          <motion.div
            key={dia}
            custom={direccion}
            variants={{
              entra: (d: number) => ({ x: d * desplazamiento, opacity: 0 }),
              centro: {
                x: 0,
                opacity: 1,
                transition: {
                  duration: reducirMovimiento ? 0 : DURACION_MS.normal / 1000,
                  ease: CURVA_SALIDA,
                },
              },
              sale: (d: number) => ({
                x: -d * desplazamiento,
                opacity: 0,
                transition: {
                  duration: reducirMovimiento ? 0 : DURACION_MS.rapida / 1000,
                  ease: CURVA_SALIDA,
                },
              }),
            }}
            initial="entra"
            animate="centro"
            exit="sale"
            aria-hidden="true"
            className="flex flex-col gap-1"
          >
            <p className="text-sm font-medium capitalize text-acento-suave-texto">
              {diaDeLaSemana}
            </p>
            <p className="numeros-tabulares text-7xl [@media(max-height:820px)]:text-5xl leading-none font-semibold tracking-tight text-texto">
              {Number(numeroTexto)}
            </p>
            <p className="text-base text-texto-secundario">
              {nombreDeMesDelCalendario(mes).toLocaleLowerCase("es")} de {anioTexto}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap gap-2">
        <Insignia tono={dias === 0 ? "info" : "neutral"}>{cuandoEs(dias)}</Insignia>
        <Insignia>Semana {numeroDeSemana(dia)}</Insignia>
        <Insignia className="numeros-tabulares">Día {diaDelAnio} del año</Insignia>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={CLASE_BOTON_DE_ICONO}
          aria-label="Día anterior"
          onClick={alAnterior}
          disabled={dia <= `${ANIO_MINIMO}-01-01`}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          className={CLASE_BOTON_DE_ICONO}
          aria-label="Día siguiente"
          onClick={alSiguiente}
          disabled={dia >= `${ANIO_MAXIMO}-12-31`}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>

        <label className="ml-auto flex min-w-0 flex-col gap-1 text-xs font-medium text-texto-secundario">
          Ir a una fecha
          <input
            type="date"
            value={dia}
            min={`${ANIO_MINIMO}-01-01`}
            max={`${ANIO_MAXIMO}-12-31`}
            onChange={(evento) => {
              const elegido = evento.target.value;
              // Mientras se tipea, el campo puede estar a medias o vacío: solo cuenta una fecha entera.
              if (esDiaReal(elegido) && Number(elegido.slice(0, 4)) >= ANIO_MINIMO)
                alElegir(elegido);
            }}
            className={cn(
              "h-10 min-w-0 rounded-control border border-borde-fuerte bg-superficie px-2 text-sm text-texto shadow-sutil",
              "transition-[border-color,box-shadow] duration-(--duracion-rapida) ease-salida",
              "hover:border-acento/40 focus:border-acento",
              "focus-visible:shadow-(--anillo-foco) focus-visible:outline-none",
            )}
          />
        </label>
      </div>

      <EventosDelDia
        dia={dia}
        hoy={hoy}
        eventos={eventos}
        ocultosPorElFiltro={ocultosPorElFiltro}
        cargando={cargandoEventos}
        error={errorDeEventos}
        alGuardarEvento={alGuardarEvento}
      />
    </Tarjeta>
  );
}

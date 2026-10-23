// Los doce meses de un año, cada uno como un mini calendario. Tocar un mes lo abre en la vista de
// mes. Sirve para saltar lejos sin apretar "siguiente" muchas veces y para ver de un vistazo en qué
// día de la semana cae cada fecha del año.
//
// Cada mes es un solo botón (con su nombre como etiqueta): los números chicos son decorativos y
// no entran al orden de Tab, así que con teclado se recorren doce botones y no trescientos días.
// Los meses entran en cascada, como el resto de las listas (docs/guias/estetica.md).

"use client";

import {
  esElMismoMes,
  type MesDeCalendario,
  mesDe,
  nombreDelMesConAnio,
  nombreDeMesDelCalendario,
  semanasDelMes,
} from "@gestoria/shared";
import { CURVA_SALIDA, DURACION_MS, ESCALONADO_S } from "@gestoria/ui-tokens";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { cn } from "@/lib/clases";

const MESES_DEL_ANIO = Array.from({ length: 12 }, (_, indice) => indice + 1);

const VARIANTES_CONTENEDOR: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: ESCALONADO_S } },
};

function variantesDeMes(sinMovimiento: boolean): Variants {
  return {
    oculto: { opacity: 0, y: sinMovimiento ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: sinMovimiento ? 0 : DURACION_MS.normal / 1000, ease: CURVA_SALIDA },
    },
  };
}

type PropsVistaDeAnio = {
  anio: number;
  /** El mes que se estaba mirando: queda resaltado. */
  mesActual: MesDeCalendario;
  /** El día elegido. */
  dia: string;
  hoy: string;
  alElegirMes: (mes: MesDeCalendario) => void;
};

export function VistaDeAnio({ anio, mesActual, dia, hoy, alElegirMes }: PropsVistaDeAnio) {
  const reducirMovimiento = useReducedMotion() === true;

  return (
    <motion.div
      initial="oculto"
      animate="visible"
      variants={VARIANTES_CONTENEDOR}
      className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {MESES_DEL_ANIO.map((numero) => {
        const mes = { anio, mes: numero };
        const esElActual = esElMismoMes(mes, mesActual);
        const esElDeHoy = esElMismoMes(mes, mesDe(hoy));

        return (
          <motion.div key={numero} variants={variantesDeMes(reducirMovimiento)} className="h-full">
            <button
              type="button"
              aria-label={nombreDelMesConAnio(mes)}
              aria-current={esElDeHoy ? "date" : undefined}
              onClick={() => alElegirMes(mes)}
              className={cn(
                "group flex h-full w-full flex-col gap-1 rounded-tarjeta border p-2.5 text-left",
                "transition-colors duration-(--anim-duracion) ease-(--anim-curva)",
                "hover:bg-superficie-suave focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
                esElActual ? "border-acento bg-acento-suave/40" : "border-borde bg-superficie",
              )}
            >
              <span
                className={cn(
                  "text-sm font-medium",
                  esElDeHoy ? "text-acento-suave-texto" : "text-texto",
                )}
              >
                {nombreDeMesDelCalendario(numero)}
              </span>
              <MiniMes mes={mes} dia={dia} hoy={hoy} />
            </button>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

/** El dibujo chico de un mes: solo números, sin interacción. */
function MiniMes({ mes, dia, hoy }: { mes: MesDeCalendario; dia: string; hoy: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid flex-1 grid-cols-7 content-evenly gap-px text-center text-[0.625rem] leading-4 xl:text-xs"
    >
      {semanasDelMes(mes)
        .flat()
        .map((otroDia) => {
          const delMes = mesDe(otroDia).mes === mes.mes;
          return (
            <span
              key={otroDia}
              className={cn(
                "numeros-tabulares rounded-full",
                delMes ? "text-texto" : "invisible",
                otroDia === dia && "bg-acento font-semibold text-acento-texto",
                otroDia === hoy &&
                  otroDia !== dia &&
                  "font-semibold text-acento-suave-texto ring-1 ring-acento",
              )}
            >
              {Number(otroDia.slice(8, 10))}
            </span>
          );
        })}
    </span>
  );
}

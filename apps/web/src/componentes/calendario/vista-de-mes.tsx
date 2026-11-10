// La grilla de un mes: seis semanas de lunes a domingo, con el día de hoy marcado y un día elegido.
//
// Se mueve como una sola cosa para quien usa teclado (el patrón de "grilla" de accesibilidad): una
// sola casilla recibe el foco con Tab —la del día elegido— y adentro se navega con las flechas.
// - Izquierda y derecha: un día. Arriba y abajo: una semana.
// - Inicio y Fin: el lunes y el domingo de esa semana.
// - Re Pág y Av Pág: un mes (con Mayús, un año).
// Elegir y enfocar es lo mismo: moverse con el teclado cambia el día elegido, y si se sale del mes
// visible, el calendario pasa solo al mes que corresponde.
//
// Animaciones: la pastilla del día elegido se desliza de un día a otro (resorte) y al cambiar de
// mes la grilla entera se desplaza hacia el lado al que se va. En una pantalla táctil también se
// cambia de mes deslizando el dedo hacia los costados. Con la preferencia de reducir movimiento,
// todo cambia sin desplazarse.

"use client";

import {
  DIAS_POR_SEMANA,
  describirDiaCompleto,
  diaIsoDeLaSemana,
  type EventoDeCalendario,
  esEventoPasado,
  estadoDeEvento,
  type MesDeCalendario,
  marcadorDeEventos,
  mesDe,
  mismoDiaEnOtroMes,
  NOMBRES_DE_ORIGEN,
  nombreDelMesConAnio,
  type OrigenDeEvento,
  semanasDelMes,
  sumarDias,
  sumarMeses,
} from "@gestoria/shared";
import { CURVA_SALIDA, DURACION_MS, RESORTE } from "@gestoria/ui-tokens";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { cn } from "@/lib/clases";
import { ESTILOS_DE_ORIGEN, ICONOS_DE_MARCADOR, ORDEN_DE_ORIGENES } from "./origenes";

const NOMBRES_DE_COLUMNA = [
  { corto: "L", medio: "lun", completo: "lunes" },
  { corto: "M", medio: "mar", completo: "martes" },
  { corto: "X", medio: "mié", completo: "miércoles" },
  { corto: "J", medio: "jue", completo: "jueves" },
  { corto: "V", medio: "vie", completo: "viernes" },
  { corto: "S", medio: "sáb", completo: "sábado" },
  { corto: "D", medio: "dom", completo: "domingo" },
] as const;

/** Cuánto se corre la grilla al cambiar de mes. */
const DESPLAZAMIENTO_PX = 36;
/** Cuánto hay que deslizar el dedo para que cuente como "cambiar de mes". */
const UMBRAL_DE_DESLIZAMIENTO_PX = 56;

function variantesDeMes(sinMovimiento: boolean): Variants {
  const distancia = sinMovimiento ? 0 : DESPLAZAMIENTO_PX;
  const duracion = sinMovimiento ? 0 : DURACION_MS.normal / 1000;
  return {
    entra: (direccion: number) => ({ x: direccion * distancia, opacity: 0 }),
    centro: { x: 0, opacity: 1, transition: { duration: duracion, ease: CURVA_SALIDA } },
    sale: (direccion: number) => ({
      x: -direccion * distancia,
      opacity: 0,
      // Las salidas van más rápido que las entradas.
      transition: { duration: sinMovimiento ? 0 : DURACION_MS.rapida / 1000, ease: CURVA_SALIDA },
    }),
  };
}

type PropsVistaDeMes = {
  mes: MesDeCalendario;
  /** El día elegido. */
  dia: string;
  hoy: string;
  /** 1 si se va hacia adelante en el tiempo y -1 si se va hacia atrás: para el sentido del desplazamiento. */
  direccion: 1 | -1;
  /** Los eventos de cada día del mes, para marcar con puntos los días que tienen algo. */
  eventosPorDia: ReadonlyMap<string, readonly EventoDeCalendario[]>;
  alElegir: (dia: string) => void;
  alCambiarDeMes: (cantidad: number) => void;
};

export function VistaDeMes({
  mes,
  dia,
  hoy,
  direccion,
  eventosPorDia,
  alElegir,
  alCambiarDeMes,
}: PropsVistaDeMes) {
  const reducirMovimiento = useReducedMotion() === true;
  const clave = `${mes.anio}-${mes.mes}`;
  const pideFoco = useRef(false);

  // Si el día se eligió con el teclado, el foco se queda en su casilla aunque la grilla cambie de mes.
  useEffect(() => {
    if (!pideFoco.current) return;
    pideFoco.current = false;
    document
      .querySelector<HTMLButtonElement>(`[data-grilla="${clave}"] [data-dia="${dia}"]`)
      ?.focus();
  }, [dia, clave]);

  function alTeclear(evento: KeyboardEvent<HTMLDivElement>) {
    const { key, shiftKey } = evento;
    let destino: string | null = null;

    if (key === "ArrowLeft") destino = sumarDias(dia, -1);
    else if (key === "ArrowRight") destino = sumarDias(dia, 1);
    else if (key === "ArrowUp") destino = sumarDias(dia, -DIAS_POR_SEMANA);
    else if (key === "ArrowDown") destino = sumarDias(dia, DIAS_POR_SEMANA);
    else if (key === "Home") destino = sumarDias(dia, -(diaIsoDeLaSemana(dia) - 1));
    else if (key === "End") destino = sumarDias(dia, DIAS_POR_SEMANA - diaIsoDeLaSemana(dia));
    else if (key === "PageUp" || key === "PageDown") {
      const pasos = (key === "PageUp" ? -1 : 1) * (shiftKey ? 12 : 1);
      destino = mismoDiaEnOtroMes(dia, sumarMeses(mesDe(dia), pasos));
    }

    if (destino === null) return;
    evento.preventDefault();
    pideFoco.current = true;
    alElegir(destino);
  }

  const semanas = semanasDelMes(mes);

  return (
    <div className="relative min-h-0 flex-1">
      <AnimatePresence initial={false} custom={direccion} mode="popLayout">
        <motion.div
          key={clave}
          custom={direccion}
          variants={variantesDeMes(reducirMovimiento)}
          initial="entra"
          animate="centro"
          exit="sale"
          // Deslizar el dedo hacia los costados cambia de mes; el scroll vertical sigue andando.
          onPanEnd={(_evento, info) => {
            if (Math.abs(info.offset.x) < UMBRAL_DE_DESLIZAMIENTO_PX) return;
            if (Math.abs(info.offset.x) < Math.abs(info.offset.y)) return;
            alCambiarDeMes(info.offset.x < 0 ? 1 : -1);
          }}
          style={{ touchAction: "pan-y" }}
          data-grilla={clave}
          className="h-full"
        >
          <table
            aria-label={nombreDelMesConAnio(mes)}
            onKeyDown={alTeclear}
            className="h-full w-full table-fixed border-separate border-spacing-1"
          >
            <thead>
              <tr>
                {NOMBRES_DE_COLUMNA.map((columna, indice) => (
                  <th
                    key={columna.completo}
                    scope="col"
                    className={cn(
                      "py-1 text-xs font-medium uppercase tracking-wide xl:text-sm",
                      indice >= 5 ? "text-texto-secundario" : "text-texto",
                    )}
                  >
                    <span aria-hidden="true" className="sm:hidden">
                      {columna.corto}
                    </span>
                    <span aria-hidden="true" className="hidden sm:inline">
                      {columna.medio}
                    </span>
                    <span className="solo-lectores">{columna.completo}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((semana) => (
                <tr key={semana[0]}>
                  {semana.map((otroDia) => (
                    <CeldaDeDia
                      key={otroDia}
                      dia={otroDia}
                      mes={mes}
                      elegido={otroDia === dia}
                      esHoy={otroDia === hoy}
                      hoy={hoy}
                      eventos={eventosPorDia.get(otroDia) ?? []}
                      clavePastilla={clave}
                      alElegir={alElegir}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function CeldaDeDia({
  dia,
  mes,
  elegido,
  esHoy,
  hoy,
  eventos,
  clavePastilla,
  alElegir,
}: {
  dia: string;
  mes: MesDeCalendario;
  elegido: boolean;
  esHoy: boolean;
  /** Para saber qué tareas están atrasadas. */
  hoy: string;
  /** Los eventos del día (ya filtrados). Se marcan con un punto por origen y se dicen en el nombre accesible. */
  eventos: readonly EventoDeCalendario[];
  /** Distinta por mes: la pastilla se desliza dentro de un mes, no entre dos grillas que se cruzan. */
  clavePastilla: string;
  alElegir: (dia: string) => void;
}) {
  const reducirMovimiento = useReducedMotion();
  const delMes = mesDe(dia).mes === mes.mes;
  const numero = Number(dia.slice(8, 10));
  // Los orígenes que tienen algo ese día: un punto por cada uno, sin importar cuántos eventos tenga. Así de
  // un vistazo se ve de qué hay algo, y un día con diez tareas no se llena de puntos.
  const origenes = ORDEN_DE_ORIGENES.filter((origen) =>
    eventos.some((evento) => evento.origen === origen),
  );
  const cantidad = eventos.length;
  const completados = eventos.filter(
    (evento) => evento.completado && evento.origen !== "contactos",
  ).length;
  const pasados = eventos.filter((evento) => esEventoPasado(evento, hoy)).length;
  const fallidos = eventos.filter((evento) => evento.fallido).length;
  const atrasados = eventos.filter((evento) => estadoDeEvento(evento, hoy) === "atrasada").length;
  // Lo que marca el punto de un origen: un punto lleno si falta algo, o un ícono según lo más urgente que
  // haya (ver marcadorDeEventos).
  const marcadorDe = (origen: OrigenDeEvento) =>
    marcadorDeEventos(
      eventos.filter((evento) => evento.origen === origen),
      hoy,
    );

  return (
    // El borde casi invisible separa las casillas sin recargar la grilla.
    <td
      className={cn(
        "relative h-12 rounded-xl border border-borde/50 p-0 sm:h-14",
        // Los días de otro mes llevan además un fondo grisáceo: se ve de un golpe cuáles son del mes.
        !delMes && "bg-borde/60",
      )}
    >
      <button
        type="button"
        data-dia={dia}
        // Una sola casilla entra en el orden de Tab; adentro se navega con las flechas.
        tabIndex={elegido ? 0 : -1}
        aria-label={`${describirDiaCompleto(dia)}${esHoy ? ", hoy" : ""}${
          cantidad > 0
            ? `, ${cantidad} ${cantidad === 1 ? "evento" : "eventos"}: ${origenes
                .map((origen) => NOMBRES_DE_ORIGEN[origen])
                .join(", ")}${completados > 0 ? ` (${completados} completados)` : ""}${
                pasados > 0 ? ` (${pasados} ${pasados === 1 ? "pasado" : "pasados"})` : ""
              }${
                fallidos > 0 ? ` (${fallidos} ${fallidos === 1 ? "fallido" : "fallidos"})` : ""
              }${atrasados > 0 ? ` (${atrasados} ${atrasados === 1 ? "atrasado" : "atrasados"})` : ""}`
            : ""
        }`}
        aria-pressed={elegido}
        aria-current={esHoy ? "date" : undefined}
        onClick={() => alElegir(dia)}
        className={cn(
          "group absolute inset-0 grid place-items-center rounded-xl text-sm sm:text-base xl:text-lg",
          "transition-colors duration-(--anim-duracion) ease-(--anim-curva)",
          "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
          "active:scale-(--anim-escala-presion) motion-reduce:active:scale-100",
          elegido
            ? "text-acento-texto"
            : cn(
                delMes ? "hover:bg-superficie-suave" : "hover:bg-borde",
                // Los días de otro mes se ven más apagados, para que no se confundan con los del mes.
                delMes ? "text-texto" : "text-texto-secundario",
              ),
        )}
      >
        {elegido ? (
          <motion.span
            layoutId={`pastilla-${clavePastilla}`}
            transition={reducirMovimiento ? { duration: 0 } : RESORTE.firme}
            aria-hidden="true"
            className="absolute inset-0 rounded-xl bg-acento shadow-sutil"
          />
        ) : null}
        {/* El día de hoy tiene un aro; si además está elegido, queda el aro sobre la pastilla. */}
        {esHoy ? (
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-0.5 rounded-[0.65rem] border-2",
              elegido ? "border-acento-texto/60" : "border-acento",
            )}
          />
        ) : null}
        <span
          className={cn(
            "numeros-tabulares relative",
            (elegido || esHoy) && "font-semibold",
            esHoy && !elegido && "text-acento-suave-texto",
          )}
        >
          {numero}
        </span>
        {/* Un punto del color de cada origen que tiene algo ese día (uno solo por origen, sean uno o diez
            eventos) y, si son varios eventos, cuántos hay. La lista completa y los detalles están en el panel
            del día; el nombre accesible de la casilla lo dice con palabras. */}
        {cantidad > 1 ? (
          <span
            aria-hidden="true"
            className={cn(
              "numeros-tabulares absolute top-1 right-1.5 text-[10px] leading-none font-semibold",
              elegido ? "text-acento-texto" : "text-texto-secundario",
            )}
          >
            {cantidad}
          </span>
        ) : null}
        {cantidad > 0 ? (
          <span
            aria-hidden="true"
            data-eventos={cantidad}
            className={cn(
              "absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-0.5 sm:gap-1",
              !delMes && !elegido && "opacity-50",
            )}
          >
            {origenes.map((origen) => {
              const estado = marcadorDe(origen);
              const Icono =
                estado === "pendiente" || estado === "pasado" ? null : ICONOS_DE_MARCADOR[estado];
              return (
                <span
                  key={origen}
                  data-origen={origen}
                  data-estado={estado}
                  // "completado" acá es que todo lo de ese origen en el día está cerrado (hecho, fallido o pasado).
                  data-completado={estado !== "pendiente" && estado !== "atrasada"}
                  className={cn(
                    // Un círculo pleno del color del origen; el pendiente es solo el círculo y los demás llevan
                    // adentro una marca blanca (tick, cruz, barra o exclamación), que se distingue mejor que un contorno.
                    "grid size-3 place-items-center rounded-full ring-1 sm:size-3.5",
                    // Un recordatorio ya pasado es el círculo vacío: solo el borde.
                    estado === "pasado"
                      ? cn("border-2 bg-transparent", ESTILOS_DE_ORIGEN[origen].borde)
                      : ESTILOS_DE_ORIGEN[origen].punto,
                    // El anillo separa la marca del fondo (la pastilla del día elegido, o la superficie).
                    elegido ? "ring-acento-texto" : "ring-superficie",
                  )}
                >
                  {Icono ? (
                    <Icono
                      aria-hidden="true"
                      strokeWidth={4}
                      className="size-2 text-superficie sm:size-2.5"
                    />
                  ) : null}
                </span>
              );
            })}
          </span>
        ) : null}
      </button>
    </td>
  );
}

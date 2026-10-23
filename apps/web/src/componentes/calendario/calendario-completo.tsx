// El calendario: un mes para mirar y moverse, un año para saltar lejos, y el panel del día elegido.
//
// Muestra los eventos de todos los módulos (deudas por vencer, recordatorios de contactos, tareas)
// y los que se anotan a mano: los pide al servidor para el mes que se ve y marca con puntos los
// días que tienen algo. Se puede recorrer de todas las formas razonables:
// - Con el mouse o el dedo: tocar un día, los botones de mes anterior/siguiente, deslizar hacia los
//   costados para cambiar de mes, tocar el título o "Año" para ver los doce meses.
// - Con el teclado: las flechas, Inicio/Fin y Re Pág/Av Pág dentro del mes (ver vista-de-mes.tsx).
// - Yendo directo a una fecha (el campo del panel) o a hoy (botón "Hoy").
//
// "Hoy" es el del dispositivo, y se calcula recién después de montarse (en el servidor no se
// conoce la zona de quien mira): hasta entonces se reserva el lugar con un esqueleto del mismo
// tamaño, así la pantalla no salta. Se vuelve a calcular cada minuto, para que a medianoche el
// marcador de hoy pase solo al día nuevo.

"use client";

import {
  DIAS_POR_SEMANA,
  diaDeHoy,
  type EventoDeCalendario,
  esElMismoMes,
  type MesDeCalendario,
  mesDe,
  mesesEntre,
  mismoDiaEnOtroMes,
  nombreDelMesConAnio,
  pasaElFiltro,
  primerDiaDelMes,
  semanasDelMes,
  sumarDias,
  sumarMeses,
} from "@gestoria/shared";
import { CURVA_SALIDA, DURACION_MS } from "@gestoria/ui-tokens";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boton } from "@/componentes/ui/boton";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { obtenerEventos } from "@/lib/api-calendario";
import { cn } from "@/lib/clases";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { FiltroDeOrigenes } from "./filtro-de-origenes";
import { FiltrosAvanzados } from "./filtros-avanzados";
import { ANIO_MAXIMO, ANIO_MINIMO, PanelDelDia } from "./panel-del-dia";
import { useFiltroDeEventos } from "./usar-filtro-de-eventos";
import { VistaDeAnio } from "./vista-de-anio";
import { VistaDeMes } from "./vista-de-mes";

type Vista = "mes" | "anio";

const VISTAS = [
  { valor: "mes", etiqueta: "Mes" },
  { valor: "anio", etiqueta: "Año" },
] as const;

const CLASE_BOTON_DE_ICONO = cn(
  "inline-flex size-10 items-center justify-center rounded-control border border-borde-fuerte bg-superficie text-texto shadow-sutil",
  "transition-colors duration-(--duracion-rapida) ease-salida",
  "hover:border-acento/40 hover:bg-superficie-suave",
  "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
  "disabled:pointer-events-none disabled:opacity-50",
);

/** Dentro de los años que acepta el calendario. */
function enRango(mes: MesDeCalendario): boolean {
  return mes.anio >= ANIO_MINIMO && mes.anio <= ANIO_MAXIMO;
}

/**
 * Los días que se piden al servidor para un mes: las seis semanas que se dibujan (con los días de los
 * meses vecinos), sin salirse de los años que acepta el calendario.
 */
function rangoDelMes(mes: MesDeCalendario): { desde: string; hasta: string } {
  const semanas = semanasDelMes(mes);
  const primero = semanas[0]?.[0] ?? primerDiaDelMes(mes);
  const ultimo = semanas[semanas.length - 1]?.[DIAS_POR_SEMANA - 1] ?? primerDiaDelMes(mes);
  return {
    desde: primero < `${ANIO_MINIMO}-01-01` ? `${ANIO_MINIMO}-01-01` : primero,
    hasta: ultimo > `${ANIO_MAXIMO}-12-31` ? `${ANIO_MAXIMO}-12-31` : ultimo,
  };
}

export function CalendarioCompleto() {
  const reducirMovimiento = useReducedMotion() === true;
  const [hoy, setHoy] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("mes");
  const [dia, setDia] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<1 | -1>(1);

  // Los eventos del mes que se ve, de todos los módulos. Al cambiar de mes se sigue mostrando lo del
  // anterior hasta que llega lo nuevo, así la grilla no parpadea.
  const rango = dia === null ? null : rangoDelMes(mesDe(dia));
  const eventos = useQuery({
    queryKey: ["calendario", "eventos", rango?.desde, rango?.hasta],
    queryFn: () => obtenerEventos(rango?.desde ?? "", rango?.hasta ?? ""),
    enabled: rango !== null,
    placeholderData: keepPreviousData,
  });

  // El filtro (por origen y, para Tareas y Contactos, por repetición) se aplica acá, sobre lo que ya llegó:
  // cambiarlo es instantáneo y no vuelve a pedir nada. Se recuerda en este navegador.
  const {
    filtro,
    alternarOrigen,
    alternarRepeticion,
    alternarCompletados,
    mostrarOrigen,
    mostrarTodo,
  } = useFiltroDeEventos();

  const visibles = useMemo(
    () => eventos.data?.filter((evento) => pasaElFiltro(evento, filtro)),
    [eventos.data, filtro],
  );
  const eventosPorDia = useMemo(() => {
    const porDia = new Map<string, EventoDeCalendario[]>();
    for (const evento of visibles ?? []) {
      porDia.set(evento.dia, [...(porDia.get(evento.dia) ?? []), evento]);
    }
    return porDia;
  }, [visibles]);
  const ocultosDelDia =
    dia === null
      ? 0
      : (eventos.data ?? []).filter((e) => e.dia === dia && !pasaElFiltro(e, filtro)).length;

  // Recién montado se sabe qué día es hoy; desde ahí se vuelve a mirar cada minuto.
  useEffect(() => {
    const calcular = () => setHoy(diaDeHoy(zonaDelDispositivo()));
    calcular();
    setDia((actual) => actual ?? diaDeHoy(zonaDelDispositivo()));
    const intervalo = setInterval(calcular, 60_000);
    return () => clearInterval(intervalo);
  }, []);

  const elegirDia = useCallback(
    (nuevo: string) => {
      if (dia === null) return;
      if (!enRango(mesDe(nuevo))) return;
      const meses = mesesEntre(mesDe(dia), mesDe(nuevo));
      setDireccion(meses !== 0 ? (meses > 0 ? 1 : -1) : nuevo > dia ? 1 : -1);
      setDia(nuevo);
    },
    [dia],
  );

  if (hoy === null || dia === null) {
    return <EsqueletoDelCalendario />;
  }

  const mes = mesDe(dia);

  /** Pasa a otro mes, conservando el número de día si ese mes lo tiene. */
  function cambiarDeMes(cantidad: number) {
    if (dia === null) return;
    const destino = sumarMeses(mesDe(dia), cantidad);
    if (!enRango(destino)) return;
    setDireccion(cantidad > 0 ? 1 : -1);
    setDia(mismoDiaEnOtroMes(dia, destino));
  }

  function irAHoy() {
    if (hoy !== null) elegirDia(hoy);
    setVista("mes");
  }

  function abrirMes(elegido: MesDeCalendario) {
    elegirDia(mismoDiaEnOtroMes(dia ?? "", elegido));
    setVista("mes");
  }

  const mesDeHoy = mesDe(hoy);
  const verHoy = !(vista === "mes" ? dia === hoy : esElMismoMes(mes, mesDeHoy));
  const pasoDeTiempo = vista === "mes" ? 1 : 12;
  const unidad = vista === "mes" ? "mes" : "año";
  const titulo = vista === "mes" ? nombreDelMesConAnio(mes) : String(mes.anio);

  return (
    <div className="grid flex-1 gap-6 xl:max-h-[40rem] xl:grid-cols-[minmax(0,1fr)_30rem]">
      <Tarjeta className="flex min-h-[30rem] flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
          <div className="relative h-10 min-w-0 flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={direccion} mode="popLayout">
              <motion.h2
                key={titulo}
                custom={direccion}
                variants={{
                  entra: (d: number) => ({ y: reducirMovimiento ? 0 : d * 14, opacity: 0 }),
                  centro: {
                    y: 0,
                    opacity: 1,
                    transition: {
                      duration: reducirMovimiento ? 0 : DURACION_MS.normal / 1000,
                      ease: CURVA_SALIDA,
                    },
                  },
                  sale: (d: number) => ({
                    y: reducirMovimiento ? 0 : -d * 14,
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
                className="absolute inset-0 truncate text-2xl leading-10 font-semibold tracking-tight text-texto"
              >
                {titulo}
              </motion.h2>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-2">
            <AnimatePresence initial={false}>
              {verHoy ? (
                <motion.div
                  initial={{ opacity: 0, scale: reducirMovimiento ? 1 : 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: reducirMovimiento ? 1 : 0.9 }}
                  transition={{
                    duration: reducirMovimiento ? 0 : DURACION_MS.rapida / 1000,
                    ease: CURVA_SALIDA,
                  }}
                >
                  <Boton variante="secundario" tamano="chico" onClick={irAHoy}>
                    <CalendarCheck aria-hidden="true" className="size-4" />
                    Hoy
                  </Boton>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <button
              type="button"
              className={CLASE_BOTON_DE_ICONO}
              aria-label={`${unidad === "mes" ? "Mes" : "Año"} anterior`}
              onClick={() => cambiarDeMes(-pasoDeTiempo)}
              disabled={!enRango(sumarMeses(mes, -pasoDeTiempo))}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              className={CLASE_BOTON_DE_ICONO}
              aria-label={`${unidad === "mes" ? "Mes" : "Año"} siguiente`}
              onClick={() => cambiarDeMes(pasoDeTiempo)}
              disabled={!enRango(sumarMeses(mes, pasoDeTiempo))}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <SelectorDeSegmentos
            id="vista-del-calendario"
            etiqueta="Vista del calendario"
            modo="filtro"
            segmentos={VISTAS}
            activo={vista}
            onCambiar={setVista}
            className="w-48"
          />
          <FiltroDeOrigenes ocultos={filtro.origenesOcultos} alAlternar={alternarOrigen} />
        </div>
        <FiltrosAvanzados
          filtro={filtro}
          alAlternarRepeticion={alternarRepeticion}
          alAlternarCompletados={alternarCompletados}
          alMostrarTodo={mostrarTodo}
        />
        {vista === "mes" ? <LeyendaDePuntos /> : null}

        {/* Pasar de mes a año (y al revés) es un zoom: se acerca o se aleja. */}
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={vista}
            initial={{ opacity: 0, scale: reducirMovimiento ? 1 : vista === "anio" ? 1.04 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reducirMovimiento ? 1 : vista === "anio" ? 0.96 : 1.04 }}
            transition={{
              duration: reducirMovimiento ? 0 : DURACION_MS.normal / 1000,
              ease: CURVA_SALIDA,
            }}
            // Ocupa todo el alto que sobra: el calendario crece con la ventana.
            className="flex min-h-0 flex-1 flex-col"
          >
            {vista === "mes" ? (
              <VistaDeMes
                mes={mes}
                dia={dia}
                hoy={hoy}
                direccion={direccion}
                eventosPorDia={eventosPorDia}
                alElegir={elegirDia}
                alCambiarDeMes={cambiarDeMes}
              />
            ) : (
              <VistaDeAnio
                anio={mes.anio}
                mesActual={mes}
                dia={dia}
                hoy={hoy}
                alElegirMes={abrirMes}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </Tarjeta>

      {/* A partir de xl el panel va a la derecha y mide lo mismo que el calendario (`absolute inset-0`):
          si no, una lista larga de eventos lo estiraría y empujaría todo hacia abajo. Es la lista
          la que se desplaza por adentro. Por debajo de xl va debajo y crece con lo que tenga. */}
      <div className="relative">
        <div className="xl:absolute xl:inset-0">
          <PanelDelDia
            dia={dia}
            hoy={hoy}
            direccion={direccion}
            alElegir={elegirDia}
            alAnterior={() => elegirDia(sumarDias(dia, -1))}
            alSiguiente={() => elegirDia(sumarDias(dia, 1))}
            eventos={visibles}
            ocultosPorElFiltro={ocultosDelDia}
            cargandoEventos={eventos.isPending}
            errorDeEventos={eventos.isError ? eventos.error : null}
            alGuardarEvento={() => mostrarOrigen("manual")}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Explica los puntos de los días: uno por cada origen que tiene algo ese día, del color de ese origen, sin
 * importar cuántos eventos sean. Es decorativa (`aria-hidden`): para los lectores de pantalla, cada día dice
 * cuántos eventos tiene y de qué orígenes en su nombre.
 */
function LeyendaDePuntos() {
  return (
    <p aria-hidden="true" className="-mt-1 text-xs text-texto-secundario">
      Un punto por cada origen que tiene algo ese día (vacío si ya está todo completado o fallido);
      el número, cuántos eventos hay.
    </p>
  );
}

/** Reserva el lugar del calendario mientras se resuelve qué día es hoy. */
function EsqueletoDelCalendario() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="grid flex-1 gap-6 xl:max-h-[40rem] xl:grid-cols-[minmax(0,1fr)_30rem]"
    >
      <span className="solo-lectores">Cargando el calendario</span>
      <div className="min-h-[30rem] animate-pulse rounded-tarjeta bg-superficie-suave" />
      <div className="h-80 animate-pulse rounded-tarjeta bg-superficie-suave" />
    </div>
  );
}

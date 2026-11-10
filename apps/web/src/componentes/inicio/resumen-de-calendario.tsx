// Resumen del Calendario en la pantalla de inicio. Tiene varias variantes, y la pantalla elige una
// al azar en cada visita (lib/eleccion-del-inicio.ts):
// - "general": cuántos eventos hay hoy, lo próximo que viene y una agenda de los próximos siete
//   días (un punto por evento, del color del módulo que lo trae).
// - "dia": el día más cargado de la semana, con lo que hay ese día.
// - "modulos": de dónde viene lo de la semana (Finanzas, Contactos, Tareas o propio), en una dona.
// Una variante sin eventos en la semana cede su lugar a la general.
//
// Junta lo mismo que el calendario (los eventos propios y lo que aportan Finanzas, Contactos y
// Tareas) y cuenta solo **lo que falta**: sin tareas ya hechas o fallidas ni recordatorios pasados.
// No usa el filtro guardado del calendario (eso es una forma de mirar el mes); acá se ve todo lo
// pendiente. El pedido es el mismo del calendario (GET /api/calendario/eventos) con la clave
// "calendario", así que cualquier cambio en un evento lo pone al día.

"use client";

import {
  compararEventos,
  diasEntre,
  type EventoDeCalendario,
  estadoParaFiltrar,
  NOMBRES_DE_ORIGEN,
  ORIGENES_DE_EVENTO,
  sumarDias,
} from "@gestoria/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ESTILOS_DE_ORIGEN } from "@/componentes/calendario/origenes";
import { cn } from "@/lib/clases";
import {
  Agenda,
  BarrasConEtiquetas,
  BloqueDeGrafico,
  cuandoEs,
  Destacado,
  Dona,
  diaCortoDeLaSemana,
  ErrorDeResumen,
  EsqueletoDeResumen,
  type IdentidadDeModulo,
  ListaBreve,
  plural,
  Resumen,
  type ResumenArmado,
} from "./piezas-de-resumen";

/** Cuántos días mira el resumen, hoy incluido. */
export const DIAS_DEL_RESUMEN_DEL_CALENDARIO = 7;

/** Cuántos eventos se listan: el resto se cuenta con "y N más". */
const EVENTOS_EN_LA_LISTA = 4;

/** Lo que todavía falta: sin lo hecho, lo fallido ni los recordatorios pasados. */
export function pendientes(eventos: readonly EventoDeCalendario[], hoy: string): EventoDeCalendario[] {
  return eventos
    .filter((evento) => {
      const estado = estadoParaFiltrar(evento, hoy);
      return estado !== "finalizada" && estado !== "pasado";
    })
    .sort(compararEventos);
}

/** Las variantes del resumen; la primera es la general (ver el comentario de arriba). */
export const VARIANTES_DEL_CALENDARIO = ["general", "dia", "modulos"] as const;
export type VarianteDelCalendario = (typeof VARIANTES_DEL_CALENDARIO)[number];

type Contexto = {
  modulo: IdentidadDeModulo;
  hoy: string;
  /** Lo pendiente de la semana, en orden. */
  eventos: EventoDeCalendario[];
  /** Los siete días, hoy primero. */
  dias: string[];
  /** Cuántos eventos hay cada día (en el orden de `dias`). */
  porDia: number[];
};

/** Un evento en una fila de la lista: su origen como marca, título y cuándo. */
function filaDeEvento(evento: EventoDeCalendario, hoy: string, conDia = true) {
  const { icono: Icono, color } = ESTILOS_DE_ORIGEN[evento.origen];
  const cuando = conDia ? cuandoEs(diasEntre(hoy, evento.dia), evento.dia) : null;
  return {
    id: evento.id,
    principal: evento.titulo,
    secundario: [cuando, evento.hora ?? (conDia ? null : "Todo el día")]
      .filter((parte) => parte)
      .join(" · "),
    marca: (
      <span className="flex shrink-0 items-center">
        <Icono aria-hidden="true" className={cn("size-4", color)} />
        <span className="solo-lectores">{NOMBRES_DE_ORIGEN[evento.origen]}: </span>
      </span>
    ),
  };
}

/** Las barras de la semana, con una resaltada (hoy, o el día más cargado). */
function GraficoDeLaSemana({
  contexto,
  resaltada,
  titulo,
  pie,
}: {
  contexto: Contexto;
  resaltada: number;
  titulo: string;
  pie: string;
}) {
  const { dias, porDia, modulo } = contexto;
  return (
    <BloqueDeGrafico
      titulo={titulo}
      descripcion={dias
        .map((dia, indice) => `${diaCortoDeLaSemana(dia)}: ${porDia[indice] ?? 0}`)
        .join(", ")}
      pie={pie}
    >
      <BarrasConEtiquetas
        color={modulo.punto}
        columnas={dias.map((dia, indice) => ({
          etiqueta: indice === 0 ? "hoy" : diaCortoDeLaSemana(dia),
          valor: porDia[indice] ?? 0,
          texto: String(porDia[indice] ?? 0),
          resaltada: indice === resaltada,
        }))}
      />
    </BloqueDeGrafico>
  );
}

/** La semana como agenda: un punto por evento, del color del módulo que lo trae. */
function AgendaDeLaSemana({ contexto }: { contexto: Contexto }) {
  const { dias, eventos, porDia } = contexto;
  return (
    <BloqueDeGrafico
      titulo="Próximos 7 días"
      descripcion={dias
        .map((dia, indice) => `${diaCortoDeLaSemana(dia)}: ${porDia[indice] ?? 0}`)
        .join(", ")}
      pie="Cada punto es una cosa, del color del módulo que la trae."
    >
      <Agenda
        dias={dias.map((dia, indice) => ({
          etiqueta: indice === 0 ? "hoy" : diaCortoDeLaSemana(dia),
          puntos: eventos
            .filter((evento) => evento.dia === dia)
            .map((evento) => `var(--color-origen-${evento.origen})`),
          resaltada: indice === 0,
        }))}
      />
    </BloqueDeGrafico>
  );
}

function general(contexto: Contexto): ResumenArmado {
  const { eventos, porDia, hoy } = contexto;
  const deHoy = porDia[0] ?? 0;
  const enLaSemana = eventos.length;

  return {
    texto: (
      <>
        <Destacado
          etiqueta="Eventos de hoy"
          valor={deHoy === 0 ? "Ninguno" : String(deHoy)}
          detalle={
            enLaSemana === deHoy
              ? deHoy === 0
                ? "Tampoco hay nada en los próximos días."
                : "No hay nada más en los próximos días."
              : `Y ${enLaSemana - deHoy} ${plural(enLaSemana - deHoy, "más", "más")} en los próximos ${DIAS_DEL_RESUMEN_DEL_CALENDARIO - 1} días.`
          }
        />
        <ListaBreve
          titulo="Lo que viene"
          vacio="No hay nada en los próximos días."
          filas={eventos.slice(0, EVENTOS_EN_LA_LISTA).map((evento) => filaDeEvento(evento, hoy))}
          resto={Math.max(0, enLaSemana - EVENTOS_EN_LA_LISTA)}
        />
      </>
    ),
    grafico: enLaSemana > 0 ? <AgendaDeLaSemana contexto={contexto} /> : null,
  };
}

/** El día más cargado de la semana. Necesita algún evento. */
function diaMasCargado(contexto: Contexto): ResumenArmado | null {
  const { eventos, dias, porDia, hoy } = contexto;
  if (eventos.length === 0) return null;

  const mayor = Math.max(...porDia);
  // A igual cantidad, el más cercano.
  const indice = porDia.indexOf(mayor);
  const dia = dias[indice] ?? hoy;
  const delDia = eventos.filter((evento) => evento.dia === dia);
  const cuando = cuandoEs(diasEntre(hoy, dia), dia);
  // "Hoy", "Mañana" o el día de la semana: en el detalle va en minúscula ("el jueves").
  const enLaFrase =
    indice <= 1 ? cuando.toLocaleLowerCase("es") : `el ${cuando.toLocaleLowerCase("es")}`;

  return {
    texto: (
      <>
        <Destacado
          etiqueta="Tu día más cargado"
          valor={cuando}
          detalle={`${enLaFrase.charAt(0).toLocaleUpperCase("es")}${enLaFrase.slice(1)} ${plural(mayor, "tenés una cosa", `tenés ${mayor} cosas`)}, de ${eventos.length} en la semana.`}
        />
        <ListaBreve
          titulo={indice <= 1 ? `Lo de ${enLaFrase}` : `Lo del ${cuando.toLocaleLowerCase("es")}`}
          vacio="No hay nada ese día."
          filas={delDia
            .slice(0, EVENTOS_EN_LA_LISTA)
            .map((evento) => filaDeEvento(evento, hoy, false))}
          resto={Math.max(0, delDia.length - EVENTOS_EN_LA_LISTA)}
        />
      </>
    ),
    grafico: (
      <GraficoDeLaSemana
        contexto={contexto}
        resaltada={indice}
        titulo="La semana, día por día"
        pie="La barra resaltada es el día con más cosas."
      />
    ),
  };
}

/** De dónde viene lo de la semana. Necesita algún evento. */
function porModulo({ eventos, hoy }: Contexto): ResumenArmado | null {
  if (eventos.length === 0) return null;

  const cuentas = ORIGENES_DE_EVENTO.map((origen) => ({
    origen,
    total: eventos.filter((evento) => evento.origen === origen).length,
  }))
    .filter((cuenta) => cuenta.total > 0)
    .sort((a, b) => b.total - a.total);
  const [mas] = cuentas;
  // Lo próximo de cada origen, en el orden del ranking.
  const proximos = cuentas
    .map((cuenta) => eventos.find((evento) => evento.origen === cuenta.origen))
    .filter((evento) => evento !== undefined);

  return {
    texto: (
      <>
        <Destacado
          etiqueta="En los próximos 7 días"
          valor={`${eventos.length} ${plural(eventos.length, "cosa", "cosas")}`}
          detalle={
            mas && cuentas.length > 1
              ? `La mayoría ${mas.origen === "manual" ? "son eventos tuyos" : `viene de ${NOMBRES_DE_ORIGEN[mas.origen]}`} (${mas.total}).`
              : mas
                ? `${mas.origen === "manual" ? "Todos son eventos tuyos" : `Todo viene de ${NOMBRES_DE_ORIGEN[mas.origen]}`}.`
                : undefined
          }
        />
        <ListaBreve
          titulo="Lo próximo de cada uno"
          vacio="No hay nada en los próximos días."
          filas={proximos.map((evento) => filaDeEvento(evento, hoy))}
        />
      </>
    ),
    grafico: (
      <BloqueDeGrafico
        titulo="De dónde viene"
        descripcion={cuentas
          .map((cuenta) => `${NOMBRES_DE_ORIGEN[cuenta.origen]}: ${cuenta.total}`)
          .join(", ")}
      >
        <Dona
          porciones={cuentas.map((cuenta) => ({
            etiqueta: NOMBRES_DE_ORIGEN[cuenta.origen],
            valor: cuenta.total,
            texto: String(cuenta.total),
            color: `var(--color-origen-${cuenta.origen})`,
          }))}
          centro={String(eventos.length)}
          detalleDelCentro={plural(eventos.length, "cosa", "cosas")}
        />
      </BloqueDeGrafico>
    ),
  };
}

const ARMADORES: Record<VarianteDelCalendario, (contexto: Contexto) => ResumenArmado | null> = {
  general,
  dia: diaMasCargado,
  modulos: porModulo,
};

export function ResumenDeCalendario({
  modulo,
  consulta,
  hoy,
  variante = "general",
}: {
  modulo: IdentidadDeModulo;
  consulta: UseQueryResult<EventoDeCalendario[]>;
  hoy: string;
  variante?: VarianteDelCalendario;
}) {
  if (consulta.isPending) return <EsqueletoDeResumen modulo={modulo} />;
  if (consulta.isError) return <ErrorDeResumen modulo={modulo} error={consulta.error} />;

  const eventos = pendientes(consulta.data, hoy);
  const dias = Array.from({ length: DIAS_DEL_RESUMEN_DEL_CALENDARIO }, (_, indice) =>
    sumarDias(hoy, indice),
  );
  const porDia = dias.map((dia) => eventos.filter((evento) => evento.dia === dia).length);
  const contexto = { modulo, hoy, eventos, dias, porDia };

  // Si la elegida no tiene qué mostrar, va la general (que siempre tiene algo).
  const elegida = ARMADORES[variante](contexto);
  const { texto, grafico } = elegida ?? general(contexto);
  return (
    <Resumen
      modulo={modulo}
      variante={elegida ? variante : "general"}
      texto={texto}
      grafico={grafico}
    />
  );
}

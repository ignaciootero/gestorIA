// Resumen del Calendario en la pantalla de inicio: cuántos eventos hay hoy, lo próximo que viene y
// cuántos caen en cada uno de los próximos siete días.
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
  sumarDias,
} from "@gestoria/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ESTILOS_DE_ORIGEN } from "@/componentes/calendario/origenes";
import { cn } from "@/lib/clases";
import {
  BarrasConEtiquetas,
  BloqueDeGrafico,
  cuandoEs,
  Destacado,
  diaCortoDeLaSemana,
  ErrorDeResumen,
  EsqueletoDeResumen,
  type IdentidadDeModulo,
  ListaBreve,
  plural,
  Resumen,
} from "./piezas-de-resumen";

/** Cuántos días mira el resumen, hoy incluido. */
export const DIAS_DEL_RESUMEN_DEL_CALENDARIO = 7;

/** Cuántos eventos se listan: el resto se cuenta con "y N más". */
const EVENTOS_EN_LA_LISTA = 4;

/** Lo que todavía falta: sin lo hecho, lo fallido ni los recordatorios pasados. */
function pendientes(eventos: readonly EventoDeCalendario[], hoy: string): EventoDeCalendario[] {
  return eventos
    .filter((evento) => {
      const estado = estadoParaFiltrar(evento, hoy);
      return estado !== "finalizada" && estado !== "pasado";
    })
    .sort(compararEventos);
}

export function ResumenDeCalendario({
  modulo,
  consulta,
  hoy,
}: {
  modulo: IdentidadDeModulo;
  consulta: UseQueryResult<EventoDeCalendario[]>;
  hoy: string;
}) {
  if (consulta.isPending) return <EsqueletoDeResumen modulo={modulo} />;
  if (consulta.isError) return <ErrorDeResumen modulo={modulo} error={consulta.error} />;

  const eventos = pendientes(consulta.data, hoy);
  const dias = Array.from({ length: DIAS_DEL_RESUMEN_DEL_CALENDARIO }, (_, indice) =>
    sumarDias(hoy, indice),
  );
  const porDia = dias.map((dia) => eventos.filter((evento) => evento.dia === dia).length);
  const deHoy = porDia[0] ?? 0;
  const enLaSemana = eventos.length;

  return (
    <Resumen
      modulo={modulo}
      texto={
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
            filas={eventos.slice(0, EVENTOS_EN_LA_LISTA).map((evento) => {
              const { icono: Icono, color } = ESTILOS_DE_ORIGEN[evento.origen];
              return {
                id: evento.id,
                principal: evento.titulo,
                secundario: `${cuandoEs(diasEntre(hoy, evento.dia), evento.dia)}${evento.hora ? ` · ${evento.hora}` : ""}`,
                marca: (
                  <span className="flex shrink-0 items-center">
                    <Icono aria-hidden="true" className={cn("size-4", color)} />
                    <span className="solo-lectores">{NOMBRES_DE_ORIGEN[evento.origen]}: </span>
                  </span>
                ),
              };
            })}
            resto={Math.max(0, enLaSemana - EVENTOS_EN_LA_LISTA)}
          />
        </>
      }
      grafico={
        enLaSemana > 0 ? (
          <BloqueDeGrafico
            titulo="Próximos 7 días"
            descripcion={dias
              .map((dia, indice) => `${diaCortoDeLaSemana(dia)}: ${porDia[indice] ?? 0}`)
              .join(", ")}
            pie="Cada barra son los eventos de ese día, de todos los módulos."
          >
            <BarrasConEtiquetas
              color={modulo.punto}
              columnas={dias.map((dia, indice) => ({
                etiqueta: indice === 0 ? "hoy" : diaCortoDeLaSemana(dia),
                valor: porDia[indice] ?? 0,
                texto: String(porDia[indice] ?? 0),
                resaltada: indice === 0,
              }))}
            />
          </BloqueDeGrafico>
        ) : null
      }
    />
  );
}

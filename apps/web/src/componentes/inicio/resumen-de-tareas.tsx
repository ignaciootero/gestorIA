// Resumen de Tareas en la pantalla de inicio: cuánto de lo de hoy ya se hizo (con un anillo de
// avance), lo que falta hoy y cómo vinieron los últimos siete días. Si hay tareas atrasadas, un aviso.
//
// Sale del mismo pedido que los widgets de Tareas (GET /api/tareas/widgets), con la misma clave de
// caché.

"use client";

import { describirDiasRestantes } from "@gestoria/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { Anillo } from "@/componentes/widgets/visuales";
import type { WidgetsDeTareas } from "@/lib/api-tareas";
import {
  BarrasConEtiquetas,
  BloqueDeGrafico,
  Destacado,
  diaCortoDeLaSemana,
  ErrorDeResumen,
  EsqueletoDeResumen,
  type IdentidadDeModulo,
  LineaDeAviso,
  ListaBreve,
  plural,
  Resumen,
} from "./piezas-de-resumen";

/** Qué decir debajo de "3 de 5". */
function detalleDeHoy(datos: WidgetsDeTareas, total: number): string {
  const partes: string[] = [];
  if (total === 0) partes.push("No hay tareas para hoy.");
  else if (datos.hoyPendientes === 0) partes.push("Ya no te queda nada para hoy.");
  else partes.push(`Te ${plural(datos.hoyPendientes, "falta", "faltan")} ${datos.hoyPendientes}.`);
  if (datos.racha > 1) partes.push(`Llevás ${datos.racha} días seguidos al día.`);
  return partes.join(" ");
}

export function ResumenDeTareas({
  modulo,
  consulta,
}: {
  modulo: IdentidadDeModulo;
  consulta: UseQueryResult<WidgetsDeTareas>;
}) {
  if (consulta.isPending) return <EsqueletoDeResumen modulo={modulo} />;
  if (consulta.isError) return <ErrorDeResumen modulo={modulo} error={consulta.error} />;

  const datos = consulta.data;
  const total = datos.hoyHechas + datos.hoyPendientes + datos.hoyFallidas;
  const porcentaje = total > 0 ? (datos.hoyHechas / total) * 100 : 0;
  const { primera } = datos.masAdelante;
  const conTareas = datos.ultimosDias.some((dia) => dia.total > 0);

  return (
    <Resumen
      modulo={modulo}
      texto={
        <>
          <Destacado
            etiqueta="Hechas hoy"
            valor={total > 0 ? `${datos.hoyHechas} de ${total}` : "Nada para hoy"}
            detalle={detalleDeHoy(datos, total)}
            adorno={
              total > 0 ? (
                <Anillo porcentaje={porcentaje} color="var(--color-origen-tareas)" grande />
              ) : undefined
            }
          />
          {datos.atrasadas.total > 0 ? (
            <LineaDeAviso tono="advertencia">
              {datos.atrasadas.total === 1
                ? "Tenés una tarea atrasada"
                : `Tenés ${datos.atrasadas.total} tareas atrasadas`}
              {datos.porFallar.primera
                ? `: "${datos.porFallar.primera.titulo}" se da por fallida ${describirDiasRestantes(datos.porFallar.primera.dias)}.`
                : "."}
            </LineaDeAviso>
          ) : null}
          <ListaBreve
            titulo="Lo que falta hoy"
            vacio={
              primera
                ? `La próxima es "${primera.titulo}", ${describirDiasRestantes(primera.dias)}.`
                : "No tenés tareas pendientes."
            }
            filas={datos.proximas.map((tarea, posicion) => ({
              id: `${posicion}-${tarea.titulo}`,
              principal: tarea.titulo,
              secundario: tarea.hora ?? "Todo el día",
            }))}
            resto={Math.max(0, datos.hoyPendientes - datos.proximas.length)}
          />
        </>
      }
      grafico={
        conTareas ? (
          <BloqueDeGrafico
            titulo="Últimos 7 días"
            descripcion={datos.ultimosDias
              .map((dia) => `${diaCortoDeLaSemana(dia.dia)}: ${dia.hechas} de ${dia.total} hechas`)
              .join(", ")}
            pie="Cada barra son las tareas hechas de las que había ese día."
          >
            <BarrasConEtiquetas
              color={modulo.punto}
              columnas={datos.ultimosDias.map((dia, posicion) => ({
                etiqueta:
                  posicion === datos.ultimosDias.length - 1 ? "hoy" : diaCortoDeLaSemana(dia.dia),
                valor: dia.hechas,
                total: dia.total,
                texto: `${dia.hechas}/${dia.total}`,
                resaltada: posicion === datos.ultimosDias.length - 1,
              }))}
            />
          </BloqueDeGrafico>
        ) : null
      }
    />
  );
}

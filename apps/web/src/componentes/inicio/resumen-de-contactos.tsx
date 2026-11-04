// Resumen de Contactos en la pantalla de inicio: el próximo cumpleaños, los recordatorios que vienen
// y cuántos caen en cada una de las próximas cuatro semanas. Si hay recordatorios hoy, un aviso.
//
// Sale del mismo pedido que los widgets de Contactos (GET /api/contactos/widgets), con la misma
// clave de caché.

"use client";

import {
  describirDiasRestantes,
  edadQueCumple,
  formatearDiaYMes,
  nombreCompletoDeContacto,
} from "@gestoria/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { WidgetsDeContactos } from "@/lib/api-contactos";
import {
  BarrasConEtiquetas,
  BloqueDeGrafico,
  cuandoEs,
  Destacado,
  ErrorDeResumen,
  EsqueletoDeResumen,
  type IdentidadDeModulo,
  LineaDeAviso,
  ListaBreve,
  plural,
  Resumen,
} from "./piezas-de-resumen";

/** Cuántos recordatorios se listan: el resto se cuenta con "y N más". */
const RECORDATORIOS_EN_LA_LISTA = 4;

const ETIQUETAS_DE_SEMANA = ["Esta semana", "En 1 sem.", "En 2 sem.", "En 3 sem."];

export function ResumenDeContactos({
  modulo,
  consulta,
}: {
  modulo: IdentidadDeModulo;
  consulta: UseQueryResult<WidgetsDeContactos>;
}) {
  if (consulta.isPending) return <EsqueletoDeResumen modulo={modulo} />;
  if (consulta.isError) return <ErrorDeResumen modulo={modulo} error={consulta.error} />;

  const datos = consulta.data;
  const { totales, recordatorios, proximoCumpleanos: cumple } = datos;
  const cantidad = totales.personas + totales.empresas;
  const deHoy = recordatorios.proximos.filter((recordatorio) => recordatorio.dias === 0);
  const enLaLista = recordatorios.proximos.slice(0, RECORDATORIOS_EN_LA_LISTA);

  return (
    <Resumen
      modulo={modulo}
      texto={
        <>
          {cumple ? (
            <Destacado
              etiqueta="Próximo cumpleaños"
              valor={nombreCompletoDeContacto(cumple)}
              detalle={`Cumple ${edadQueCumple(cumple.nacimiento, cumple.fecha)} el ${formatearDiaYMes(cumple.fecha)} (${describirDiasRestantes(cumple.dias)}).`}
            />
          ) : (
            <Destacado
              etiqueta="Contactos"
              valor={String(cantidad)}
              detalle={
                cantidad === 0
                  ? "Agregá tu primer contacto: una persona, una empresa o un servicio que uses."
                  : `${totales.personas} ${plural(totales.personas, "persona", "personas")} y ${totales.empresas} ${plural(totales.empresas, "empresa", "empresas")}.`
              }
            />
          )}
          {deHoy.length > 0 ? (
            <LineaDeAviso tono="advertencia">
              {plural(recordatorios.hoy, "Recordatorio de hoy", "Recordatorios de hoy")}:{" "}
              {deHoy
                .map(
                  (recordatorio) =>
                    `${recordatorio.titulo}${recordatorio.hora ? ` a las ${recordatorio.hora}` : ""} (${nombreCompletoDeContacto(recordatorio.contacto)})`,
                )
                .join(", ")}
              {recordatorios.hoy > deHoy.length ? ` y ${recordatorios.hoy - deHoy.length} más` : ""}
              .
            </LineaDeAviso>
          ) : null}
          <ListaBreve
            titulo="Próximos recordatorios"
            vacio="No hay recordatorios en los próximos días."
            filas={enLaLista.map((recordatorio, posicion) => ({
              id: `${posicion}-${recordatorio.titulo}`,
              principal: `${recordatorio.titulo} · ${nombreCompletoDeContacto(recordatorio.contacto)}`,
              secundario: `${cuandoEs(recordatorio.dias, recordatorio.fecha)}${recordatorio.hora ? ` · ${recordatorio.hora}` : ""}`,
            }))}
            resto={Math.max(
              0,
              recordatorios.proximos30 -
                enLaLista.filter((recordatorio) => recordatorio.dias < 30).length,
            )}
          />
        </>
      }
      grafico={
        recordatorios.proximos30 > 0 ? (
          <BloqueDeGrafico
            titulo={`${recordatorios.proximos30} ${plural(recordatorios.proximos30, "recordatorio", "recordatorios")} en 30 días`}
            descripcion={recordatorios.porSemana
              .map((total, semana) => `${ETIQUETAS_DE_SEMANA[semana] ?? ""}: ${total}`)
              .join(", ")}
            pie="Cada barra es una semana, empezando hoy."
          >
            <BarrasConEtiquetas
              color={modulo.punto}
              columnas={recordatorios.porSemana.map((total, semana) => ({
                etiqueta: ETIQUETAS_DE_SEMANA[semana] ?? "",
                valor: total,
                texto: String(total),
                resaltada: semana === 0,
              }))}
            />
          </BloqueDeGrafico>
        ) : null
      }
    />
  );
}

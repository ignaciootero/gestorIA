// Resumen de Finanzas en la pantalla de inicio: cuánta plata hay, cómo va el período (lo que entró
// contra lo que salió) y en qué se va la mayor parte. Si hay algo que atender, un solo aviso: el
// más grave (una cuenta en rojo, un presupuesto superado, uno por agotarse o que falta un período).
//
// Sale del mismo pedido que los widgets de Finanzas (GET /api/finanzas/widgets), con la misma clave
// de caché: entrar a Finanzas después no vuelve a pedir nada.

"use client";

import { formatearMonto } from "@gestoria/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { VisualDelWidget } from "@/componentes/widgets/visuales";
import { totalesEnPalabras } from "@/lib/api-deudas";
import type { WidgetsDeFinanzas } from "@/lib/api-finanzas";
import {
  BarrasConEtiquetas,
  BloqueDeGrafico,
  Destacado,
  ErrorDeResumen,
  EsqueletoDeResumen,
  type IdentidadDeModulo,
  LineaDeAviso,
  ListaBreve,
  Resumen,
} from "./piezas-de-resumen";

/** El aviso más grave, si hay alguno. */
function avisoPrincipal(
  datos: WidgetsDeFinanzas,
): { tono: "peligro" | "advertencia" | "info"; texto: string } | null {
  const { monedaBase: moneda, periodo } = datos;
  const [enRojo] = datos.cuentasEnNegativo;
  if (enRojo) {
    return {
      tono: "peligro",
      texto: `${enRojo.nombre} está en negativo: ${formatearMonto(enRojo.saldoCentavos, enRojo.moneda)}.`,
    };
  }
  const [superado] = periodo?.presupuestos.superados ?? [];
  if (superado) {
    return {
      tono: "peligro",
      texto: `Te pasaste ${formatearMonto(superado.diferenciaCentavos, moneda)} del presupuesto de ${superado.nombre}.`,
    };
  }
  const [porAgotarse] = periodo?.presupuestos.porAgotarse ?? [];
  if (porAgotarse) {
    return {
      tono: "advertencia",
      texto: `Te quedan ${formatearMonto(porAgotarse.diferenciaCentavos, moneda)} del presupuesto de ${porAgotarse.nombre}.`,
    };
  }
  if (datos.disponible.monedasSinCotizacion.length > 0) {
    return {
      tono: "advertencia",
      texto: `No hay cotización de ${datos.disponible.monedasSinCotizacion.join(", ")}: esas cuentas no suman al disponible.`,
    };
  }
  if (!periodo) {
    return { tono: "info", texto: "Abrí tu primer período para empezar a registrar movimientos." };
  }
  if (!periodo.abierto) {
    return { tono: "info", texto: `${periodo.nombre} está cerrado: abrí uno nuevo para seguir.` };
  }
  return null;
}

/** Un monto corto para arriba de una barra, sin moneda ni centésimos: "65,0 mil". */
function formatearMontoCorto(centavos: number): string {
  return new Intl.NumberFormat("es-UY", { notation: "compact", maximumFractionDigits: 1 }).format(
    centavos / 100,
  );
}

/** "Te deben … · Debés …", o null si no hay deudas pendientes. */
function deudasEnPalabras(datos: WidgetsDeFinanzas): string | null {
  const partes = [
    datos.deudas.meDeben.length > 0 ? `Te deben ${totalesEnPalabras(datos.deudas.meDeben)}` : null,
    datos.deudas.debo.length > 0 ? `Debés ${totalesEnPalabras(datos.deudas.debo)}` : null,
  ].filter((parte) => parte !== null);
  return partes.length > 0 ? partes.join(" · ") : null;
}

export function ResumenDeFinanzas({
  modulo,
  consulta,
}: {
  modulo: IdentidadDeModulo;
  consulta: UseQueryResult<WidgetsDeFinanzas>;
}) {
  if (consulta.isPending) return <EsqueletoDeResumen modulo={modulo} />;
  if (consulta.isError) return <ErrorDeResumen modulo={modulo} error={consulta.error} />;

  const datos = consulta.data;
  const { monedaBase: moneda, periodo } = datos;
  const aviso = avisoPrincipal(datos);
  const deudas = deudasEnPalabras(datos);
  const totalDeGastos = periodo?.gastosCentavos ?? 0;
  const evolucion = periodo?.evolucion ?? [];

  return (
    <Resumen
      modulo={modulo}
      texto={
        <>
          <Destacado
            etiqueta="Disponible"
            valor={formatearMonto(datos.disponible.centavos, moneda)}
            detalle={
              <>
                {datos.disponible.esEstimado
                  ? "En todas tus cuentas, con las otras monedas a la cotización de hoy."
                  : "En todas tus cuentas."}
                {deudas ? (
                  <>
                    <br />
                    {deudas}.
                  </>
                ) : null}
              </>
            }
          />
          {aviso ? <LineaDeAviso tono={aviso.tono}>{aviso.texto}</LineaDeAviso> : null}
          <ListaBreve
            titulo="Donde más gastás"
            vacio="Cuando cargues gastos, acá vas a ver en qué se va la mayor parte."
            filas={(periodo?.categoriasPrincipales ?? []).map((categoria) => ({
              id: categoria.nombre,
              principal: categoria.nombre,
              secundario:
                totalDeGastos > 0
                  ? `${formatearMonto(categoria.totalCentavos, moneda)} · ${Math.round((categoria.totalCentavos / totalDeGastos) * 100)}%`
                  : formatearMonto(categoria.totalCentavos, moneda),
              marca: (
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: categoria.color }}
                />
              ),
            }))}
          />
        </>
      }
      grafico={
        periodo ? (
          <BloqueDeGrafico
            titulo={`Balance de ${periodo.nombre}: ${formatearMonto(periodo.balanceCentavos, moneda)}`}
            descripcion={`Entró ${formatearMonto(periodo.ingresosCentavos, moneda)} y salió ${formatearMonto(periodo.gastosCentavos, moneda)}.${evolucion.length > 1 ? ` Gasto de los últimos períodos: ${evolucion.map((p) => `${p.nombre}, ${formatearMonto(p.gastosCentavos, moneda)}`).join("; ")}.` : ""}`}
            pie={
              periodo.balanceCentavos >= 0
                ? "Entró más de lo que salió."
                : "Salió más de lo que entró."
            }
          >
            <VisualDelWidget
              visual={{
                tipo: "comparacion",
                filas: [
                  {
                    etiqueta: "Entró",
                    texto: formatearMonto(periodo.ingresosCentavos, moneda),
                    valor: periodo.ingresosCentavos,
                    color: "ingreso",
                  },
                  {
                    etiqueta: "Salió",
                    texto: formatearMonto(periodo.gastosCentavos, moneda),
                    valor: periodo.gastosCentavos,
                    color: "gasto",
                  },
                ],
              }}
            />
            {evolucion.length > 1 ? (
              // En pantallas angostas no entra: queda lo que entró y lo que salió.
              <div className="hidden min-h-0 flex-1 flex-col md:flex">
                <p className="mt-5 mb-2 text-xs text-texto-secundario">
                  Gasto de los últimos períodos
                </p>
                <BarrasConEtiquetas
                  color={modulo.punto}
                  columnas={evolucion.map((anterior, posicion) => ({
                    // Sin el año, que se repite en todos ("Octubre 2026" → "Octubre").
                    etiqueta: anterior.nombre.replace(/s+d{4}$/, ""),
                    valor: anterior.gastosCentavos,
                    texto: formatearMontoCorto(anterior.gastosCentavos),
                    resaltada: posicion === evolucion.length - 1,
                  }))}
                />
              </div>
            ) : null}
          </BloqueDeGrafico>
        ) : null
      }
    />
  );
}

// Resumen de Finanzas en la pantalla de inicio. Tiene varias variantes, y la pantalla elige una al
// azar en cada visita (lib/eleccion-del-inicio.ts):
// - "general": cuánta plata hay, lo que entró y salió en el período y, en una dona, en qué se va.
// - "anterior": cuánto se lleva gastado contra el período anterior a la misma altura.
// - "ritmo": cuánto se gasta por día, lo que más pesó y el gasto de los últimos días contra el
//   promedio.
// - "presupuestos": cómo va cada presupuesto.
// Una variante sin datos para mostrar (sin período, sin presupuestos) cede su lugar a la general.
// En todas, si hay algo que atender, un solo aviso: el más grave (una cuenta en rojo, un
// presupuesto superado, uno por agotarse o que falta un período).
//
// Sale del mismo pedido que los widgets de Finanzas (GET /api/finanzas/widgets), con la misma clave
// de caché: entrar a Finanzas después no vuelve a pedir nada.

"use client";

import { formatearMonto, sumarDias } from "@gestoria/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { VisualDelWidget } from "@/componentes/widgets/visuales";
import { totalesEnPalabras } from "@/lib/api-deudas";
import type { WidgetsDeFinanzas } from "@/lib/api-finanzas";
import {
  BarrasConEtiquetas,
  BloqueDeGrafico,
  Destacado,
  Dona,
  diaCortoDeLaSemana,
  ErrorDeResumen,
  EsqueletoDeResumen,
  type IdentidadDeModulo,
  LineaConArea,
  LineaDeAviso,
  ListaBreve,
  plural,
  Resumen,
  type ResumenArmado,
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

/** Las variantes del resumen; la primera es la general (ver el comentario de arriba). */
export const VARIANTES_DE_FINANZAS = ["general", "anterior", "ritmo", "presupuestos"] as const;
export type VarianteDeFinanzas = (typeof VARIANTES_DE_FINANZAS)[number];

type Contexto = { datos: WidgetsDeFinanzas; modulo: IdentidadDeModulo; hoy: string };

/** El aviso del resumen, igual en todas las variantes: lo más grave, si hay algo. */
function Aviso({ datos }: { datos: WidgetsDeFinanzas }) {
  const aviso = avisoPrincipal(datos);
  return aviso ? <LineaDeAviso tono={aviso.tono}>{aviso.texto}</LineaDeAviso> : null;
}

/** Un porcentaje con signo: "+12 %", "−8 %", "igual". */
function variacion(actual: number, antes: number): string | null {
  if (antes <= 0) return null;
  const porcentaje = Math.round(((actual - antes) / antes) * 100);
  if (porcentaje === 0) return "Igual";
  return `${porcentaje > 0 ? "+" : "−"}${Math.abs(porcentaje)} %`;
}

/** Cuántas categorías se muestran en la dona; el resto va junto en "Otras". */
const CATEGORIAS_EN_LA_DONA = 3;

/** En qué se fue la plata del período, como dona; null si todavía no hay gastos. */
function donaDeGastos(datos: WidgetsDeFinanzas): ResumenArmado["grafico"] {
  const { periodo } = datos;
  if (!periodo || periodo.gastosCentavos <= 0) return null;
  const principales = periodo.categoriasPrincipales.slice(0, CATEGORIAS_EN_LA_DONA);
  const otras =
    periodo.gastosCentavos - principales.reduce((suma, una) => suma + una.totalCentavos, 0);
  const porcentaje = (centavos: number) =>
    `${Math.round((centavos / periodo.gastosCentavos) * 100)} %`;
  const porciones = [
    ...principales.map((categoria) => ({
      etiqueta: categoria.nombre,
      valor: categoria.totalCentavos,
      texto: porcentaje(categoria.totalCentavos),
      color: categoria.color,
    })),
    ...(otras > 0
      ? [
          {
            etiqueta: "Otras",
            valor: otras,
            texto: porcentaje(otras),
            color: "var(--color-texto-secundario)",
          },
        ]
      : []),
  ];

  return (
    <BloqueDeGrafico
      titulo={`En qué se fue la plata en ${periodo.nombre}`}
      descripcion={porciones
        .map((porcion) => `${porcion.etiqueta}: ${porcion.texto}`)
        .join(", ")}
      pie={
        periodo.categoriaPrincipal
          ? `${periodo.categoriaPrincipal.nombre} se lleva ${periodo.categoriaPrincipal.porcentajeDelGasto} % de lo gastado.`
          : undefined
      }
    >
      <Dona
        porciones={porciones}
        centro={formatearMontoCorto(periodo.gastosCentavos)}
        detalleDelCentro="gastado"
      />
    </BloqueDeGrafico>
  );
}

function general({ datos }: Contexto): ResumenArmado {
  const { monedaBase: moneda, periodo } = datos;
  const deudas = deudasEnPalabras(datos);

  return {
    texto: (
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
        <Aviso datos={datos} />
        <ListaBreve
          titulo={periodo ? `${periodo.nombre}, hasta hoy` : "El período"}
          vacio="Abrí un período para ver lo que entra y lo que sale."
          filas={
            periodo
              ? [
                  {
                    id: "entro",
                    principal: "Entró",
                    secundario: formatearMonto(periodo.ingresosCentavos, moneda),
                    marca: <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-exito" />,
                  },
                  {
                    id: "salio",
                    principal: "Salió",
                    secundario: formatearMonto(periodo.gastosCentavos, moneda),
                    marca: <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-peligro" />,
                  },
                  {
                    id: "balance",
                    principal: periodo.balanceCentavos >= 0 ? "Te sobra" : "Te falta",
                    secundario: formatearMonto(Math.abs(periodo.balanceCentavos), moneda),
                  },
                ]
              : []
          }
        />
      </>
    ),
    // Sin gastos todavía, lo que entró contra lo que salió (que igual dice algo).
    grafico:
      donaDeGastos(datos) ??
      (periodo ? (
        <BloqueDeGrafico
          titulo={`Balance de ${periodo.nombre}: ${formatearMonto(periodo.balanceCentavos, moneda)}`}
          descripcion={`Entró ${formatearMonto(periodo.ingresosCentavos, moneda)} y salió ${formatearMonto(periodo.gastosCentavos, moneda)}.`}
          pie="Cuando cargues gastos, acá vas a ver en qué se va la plata."
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
        </BloqueDeGrafico>
      ) : null),
  };
}

/** Lo gastado contra el período anterior a la misma altura. Necesita un período anterior. */
function contraElAnterior({ datos, modulo }: Contexto): ResumenArmado | null {
  const { monedaBase: moneda, periodo } = datos;
  const anterior = periodo?.anterior;
  if (!periodo || !anterior) return null;

  const cambio = variacion(periodo.gastosCentavos, anterior.gastosAlMismoDiaCentavos);
  const gastado = formatearMonto(periodo.gastosCentavos, moneda);
  const antes = formatearMonto(anterior.gastosAlMismoDiaCentavos, moneda);
  // Los últimos períodos, del más nuevo al más viejo, con su balance.
  const balances = [...periodo.evolucion].reverse().slice(0, 4);

  return {
    texto: (
      <>
        <Destacado
          etiqueta={`Gasto contra ${anterior.nombre}`}
          valor={cambio ?? gastado}
          detalle={`Llevás ${gastado} en ${periodo.diasTranscurridos} ${plural(periodo.diasTranscurridos, "día", "días")}; a esta altura de ${anterior.nombre} llevabas ${antes}.`}
        />
        <Aviso datos={datos} />
        <ListaBreve
          titulo="Balance de cada período"
          vacio="Todavía no hay períodos anteriores."
          filas={balances.map((uno) => ({
            id: uno.nombre,
            principal: uno.nombre,
            secundario: formatearMonto(uno.ingresosCentavos - uno.gastosCentavos, moneda),
          }))}
        />
      </>
    ),
    grafico: periodo.ritmo ? (
      <BloqueDeGrafico
        titulo="Gasto acumulado, día por día"
        descripcion={`Llevás ${gastado}; a esta altura de ${anterior.nombre} llevabas ${antes}.`}
        pie={`La línea punteada es ${anterior.nombre}.`}
      >
        <VisualDelWidget
          grande
          visual={{
            tipo: "linea",
            series: [
              { valores: periodo.ritmo.actualCentavos },
              { valores: periodo.ritmo.anteriorCentavos, referencia: true },
            ],
          }}
        />
      </BloqueDeGrafico>
    ) : periodo.evolucion.length > 1 ? (
      <BloqueDeGrafico
        titulo="Gasto de los últimos períodos"
        descripcion={periodo.evolucion
          .map((uno) => `${uno.nombre}, ${formatearMonto(uno.gastosCentavos, moneda)}`)
          .join("; ")}
      >
        <BarrasConEtiquetas
          color={modulo.punto}
          columnas={periodo.evolucion.map((uno, posicion) => ({
            etiqueta: uno.nombre.replace(/\s+\d{4}$/, ""),
            valor: uno.gastosCentavos,
            texto: formatearMontoCorto(uno.gastosCentavos),
            resaltada: posicion === periodo.evolucion.length - 1,
          }))}
        />
      </BloqueDeGrafico>
    ) : null,
  };
}

/** Cuánto se gasta por día y lo que más pesó. Necesita un período con gastos. */
function ritmo({ datos, modulo, hoy }: Contexto): ResumenArmado | null {
  const { monedaBase: moneda, periodo } = datos;
  if (!periodo || periodo.gastosCentavos <= 0) return null;

  const filas = [
    periodo.gastoMasGrande
      ? {
          id: "mas-grande",
          principal: `El más grande: ${periodo.gastoMasGrande.descripcion || periodo.gastoMasGrande.categoria}`,
          secundario: formatearMonto(periodo.gastoMasGrande.importeCentavos, moneda),
        }
      : null,
    periodo.categoriaPrincipal
      ? {
          id: "categoria",
          principal: `Donde más: ${periodo.categoriaPrincipal.nombre}`,
          secundario: `${periodo.categoriaPrincipal.porcentajeDelGasto} % del gasto`,
        }
      : null,
    periodo.diasDesdeElUltimoMovimiento !== null
      ? {
          id: "ultimo",
          principal: "Último movimiento cargado",
          secundario:
            periodo.diasDesdeElUltimoMovimiento === 0
              ? "hoy"
              : `hace ${periodo.diasDesdeElUltimoMovimiento} ${plural(periodo.diasDesdeElUltimoMovimiento, "día", "días")}`,
        }
      : null,
  ].filter((fila) => fila !== null);

  const diario = periodo.gastoDiarioCentavos;
  // Con el período abierto, el último día del gráfico es hoy; cerrado, no se sabe qué días son.
  const etiquetaDe = (posicion: number) => {
    if (!periodo.abierto) return "";
    const atras = diario.length - 1 - posicion;
    return atras === 0 ? "hoy" : diaCortoDeLaSemana(sumarDias(hoy, -atras));
  };

  return {
    texto: (
      <>
        <Destacado
          etiqueta="Gastás por día"
          valor={formatearMonto(periodo.promedioPorDiaCentavos, moneda)}
          detalle={`En promedio, en ${periodo.diasTranscurridos} ${plural(periodo.diasTranscurridos, "día", "días")} de ${periodo.nombre} (${periodo.cantidadDeMovimientos} ${plural(periodo.cantidadDeMovimientos, "movimiento", "movimientos")}).`}
        />
        <Aviso datos={datos} />
        <ListaBreve titulo="Lo que más pesó" vacio="Todavía no hay gastos." filas={filas} />
      </>
    ),
    grafico:
      diario.length > 1 ? (
        <BloqueDeGrafico
          titulo="Gasto de los últimos días"
          descripcion={diario
            .map(
              (centavos, posicion) =>
                `${etiquetaDe(posicion) || `Día ${posicion + 1}`}: ${formatearMonto(centavos, moneda)}`,
            )
            .join(", ")}
          pie="La línea punteada es tu promedio por día."
        >
          <LineaConArea
            valores={diario}
            referencia={periodo.promedioPorDiaCentavos}
            etiquetas={diario.map((_, posicion) => etiquetaDe(posicion))}
            color={modulo.color}
          />
        </BloqueDeGrafico>
      ) : null,
  };
}

/** El color de un presupuesto según cuánto se usó: en orden, por agotarse o pasado. */
function colorDelPresupuesto(usado: number): string {
  if (usado > 100) return "var(--color-peligro)";
  if (usado >= 80) return "var(--color-advertencia)";
  return "var(--color-exito)";
}

/** Cómo va cada presupuesto. Necesita al menos uno con límite. */
function presupuestos({ datos }: Contexto): ResumenArmado | null {
  const { monedaBase: moneda, periodo } = datos;
  const lista = periodo?.presupuestos.lista ?? [];
  const total = periodo?.presupuestos.total;
  if (!periodo || lista.length === 0 || !total) return null;

  const enOrden = lista.filter((presupuesto) => presupuesto.usadoPorcentaje < 80).length;

  return {
    texto: (
      <>
        <Destacado
          etiqueta={`Presupuestos de ${periodo.nombre}`}
          valor={`${enOrden} de ${lista.length} en orden`}
          detalle={`Gastaste ${formatearMonto(total.gastadoCentavos, moneda)} de ${formatearMonto(total.presupuestadoCentavos, moneda)} presupuestados.`}
        />
        <Aviso datos={datos} />
        <ListaBreve
          titulo="Lo que te queda"
          vacio="No hay presupuestos."
          filas={lista.slice(0, 4).map((presupuesto) => {
            const queda = presupuesto.presupuestadoCentavos - presupuesto.gastadoCentavos;
            return {
              id: presupuesto.nombre,
              principal: presupuesto.nombre,
              secundario:
                queda >= 0
                  ? `quedan ${formatearMonto(queda, moneda)}`
                  : `pasado por ${formatearMonto(-queda, moneda)}`,
            };
          })}
          resto={Math.max(0, lista.length - 4)}
        />
      </>
    ),
    grafico: (
      <BloqueDeGrafico
        titulo="Cuánto usaste de cada uno"
        descripcion={lista
          .map((presupuesto) => `${presupuesto.nombre}: ${presupuesto.usadoPorcentaje} %`)
          .join(", ")}
        pie="Verde va bien, amarillo está por agotarse y rojo ya se pasó."
      >
        <VisualDelWidget
          grande
          visual={{
            tipo: "ranking",
            filas: lista.map((presupuesto) => ({
              etiqueta: presupuesto.nombre,
              texto: `${presupuesto.usadoPorcentaje} %`,
              proporcion: Math.min(1, presupuesto.usadoPorcentaje / 100),
              color: colorDelPresupuesto(presupuesto.usadoPorcentaje),
            })),
          }}
        />
      </BloqueDeGrafico>
    ),
  };
}

const ARMADORES: Record<VarianteDeFinanzas, (contexto: Contexto) => ResumenArmado | null> = {
  general,
  anterior: contraElAnterior,
  ritmo,
  presupuestos,
};

export function ResumenDeFinanzas({
  modulo,
  consulta,
  hoy,
  variante = "general",
}: {
  modulo: IdentidadDeModulo;
  consulta: UseQueryResult<WidgetsDeFinanzas>;
  hoy: string;
  variante?: VarianteDeFinanzas;
}) {
  if (consulta.isPending) return <EsqueletoDeResumen modulo={modulo} />;
  if (consulta.isError) return <ErrorDeResumen modulo={modulo} error={consulta.error} />;

  const contexto = { datos: consulta.data, modulo, hoy };
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

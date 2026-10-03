// Los gráficos del módulo de ingresos y gastos, con Recharts.
//
// Archivo aparte y sin datos propios (reciben todo por props): quien los usa
// (estadisticas-de-finanzas.tsx) los carga con `next/dynamic` y `ssr: false`,
// para que Recharts no entre en el paquete inicial de las otras pestañas
// (docs/guias/rendimiento.md, "carga diferida de componentes pesados").
//
// Mismo color por significado que el resto del módulo: verde para ingresos,
// rojo para gastos (igual que las flechas del listado de movimientos). Los
// gastos por categoría usan, en cambio, el color propio de cada categoría.

"use client";

import { formatearMonto } from "@gestoria/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  GastoPorCategoria,
  PeriodoDeEvolucion,
  PuntoDeCategoria,
  TipoDeEvolucion,
} from "@/lib/api-finanzas";

const COLOR_INGRESO = "var(--color-exito)";
const COLOR_GASTO = "var(--color-peligro)";

/** Los valores siempre son centésimos (number); de ahí el formateo a moneda. */
function formateadorDeTooltip(moneda: string) {
  return (valor: number | string | ReadonlyArray<number | string> | undefined): string =>
    formatearMonto(typeof valor === "number" ? valor : 0, moneda);
}

export function GraficoEvolucion({
  datos,
  moneda,
}: {
  datos: PeriodoDeEvolucion[];
  moneda: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={datos} margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borde)" vertical={false} />
        <XAxis dataKey="nombre" tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }} />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
          tickFormatter={(valor: number) => formatearMonto(valor, moneda)}
          width={80}
        />
        <Tooltip
          formatter={formateadorDeTooltip(moneda)}
          contentStyle={{
            background: "var(--color-superficie)",
            border: "1px solid var(--color-borde)",
            borderRadius: "var(--radio-control)",
            fontSize: 13,
          }}
        />
        {/* Sin formatter: cada <Bar> ya tiene su `name` ("Ingresos"/"Gastos"),
            y Recharts lo usa tal cual para la leyenda. */}
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Bar
          dataKey="ingresosCentavos"
          name="Ingresos"
          fill={COLOR_INGRESO}
          radius={[4, 4, 0, 0]}
        />
        <Bar dataKey="gastosCentavos" name="Gastos" fill={COLOR_GASTO} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Un porcentaje (12,5 es 12,5 %) con el formato de la región: "12,5 %". */
function formatearPorcentaje(porcentaje: number): string {
  return new Intl.NumberFormat("es-UY", { style: "percent", maximumFractionDigits: 1 }).format(
    porcentaje / 100,
  );
}

/**
 * La evolución de una categoría período a período, en dos gráficas en una: barras con
 * el valor bruto (eje izquierdo, en plata) y una línea con ese valor como porcentaje de
 * los ingresos del período (eje derecho). Se mira lo gastado o lo ingresado, según el
 * `tipo`: una categoría puede tener las dos cosas, y más de una que de otra según el mes.
 * Con gastos, si la categoría tiene presupuesto, una línea punteada marca su límite. En
 * un período sin ingresos no hay porcentaje: la línea se corta en vez de inventar un valor.
 */
export function GraficoEvolucionDeCategoria({
  datos,
  tipo,
  color,
  nombreDeCategoria,
  presupuestoCentavos,
  moneda,
}: {
  datos: PuntoDeCategoria[];
  tipo: TipoDeEvolucion;
  color: string;
  nombreDeCategoria: string;
  presupuestoCentavos: number | null;
  moneda: string;
}) {
  const nombreDeBarras =
    tipo === "gasto" ? `Gastado en ${nombreDeCategoria}` : `Ingresado en ${nombreDeCategoria}`;
  const nombreDelPorcentaje =
    tipo === "gasto" ? "% de los ingresos del período" : "% del total de ingresos del período";

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={datos} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borde)" vertical={false} />
        <XAxis dataKey="nombre" tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }} />
        <YAxis
          yAxisId="monto"
          tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
          tickFormatter={(valor: number) => formatearMonto(valor, moneda)}
          width={80}
          domain={[0, "auto"]}
        />
        <YAxis
          yAxisId="porcentaje"
          orientation="right"
          tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
          tickFormatter={(valor: number) => formatearPorcentaje(valor)}
          width={56}
          domain={[0, "auto"]}
        />
        <Tooltip
          formatter={(valor, nombre) =>
            nombre === nombreDelPorcentaje
              ? formatearPorcentaje(typeof valor === "number" ? valor : 0)
              : formatearMonto(typeof valor === "number" ? valor : 0, moneda)
          }
          contentStyle={{
            background: "var(--color-superficie)",
            border: "1px solid var(--color-borde)",
            borderRadius: "var(--radio-control)",
            fontSize: 13,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        {presupuestoCentavos === null ? null : (
          <ReferenceLine
            yAxisId="monto"
            y={presupuestoCentavos}
            stroke="var(--color-texto-secundario)"
            strokeDasharray="6 4"
            ifOverflow="extendDomain"
            label={{
              value: "Presupuesto",
              position: "insideTopRight",
              fontSize: 12,
              fill: "var(--color-texto-secundario)",
            }}
          />
        )}
        <Bar
          yAxisId="monto"
          dataKey="totalCentavos"
          name={nombreDeBarras}
          fill={color}
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="porcentaje"
          type="monotone"
          dataKey="porcentajeDeIngresos"
          name={nombreDelPorcentaje}
          stroke="var(--color-acento)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "var(--color-acento)" }}
          activeDot={{ r: 6 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function GraficoGastosPorCategoria({
  datos,
  moneda,
}: {
  datos: GastoPorCategoria[];
  moneda: string;
}) {
  const alto = Math.max(datos.length * 36, 120);

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={8}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borde)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
          tickFormatter={(valor: number) => formatearMonto(valor, moneda)}
        />
        <YAxis
          type="category"
          dataKey="nombre"
          tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
          width={100}
        />
        <Tooltip
          formatter={formateadorDeTooltip(moneda)}
          contentStyle={{
            background: "var(--color-superficie)",
            border: "1px solid var(--color-borde)",
            borderRadius: "var(--radio-control)",
            fontSize: 13,
          }}
        />
        <Bar dataKey="totalCentavos" name="Gastado" radius={[0, 4, 4, 0]}>
          {datos.map((categoria) => (
            <Cell key={categoria.categoriaId} fill={categoria.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

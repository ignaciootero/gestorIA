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

import { formatearMonto, formatearPorcentaje } from "@gestoria/shared";
import type { ReactNode } from "react";
import type { BarShapeProps } from "recharts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Rectangle,
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
  PuntoDeRitmo,
} from "@/lib/api-finanzas";

const COLOR_INGRESO = "var(--color-exito)";
const COLOR_GASTO = "var(--color-peligro)";

/** Los valores siempre son centésimos (number); de ahí el formateo a moneda. */
function formateadorDeTooltip(moneda: string) {
  return (valor: number | string | ReadonlyArray<number | string> | undefined): string =>
    formatearMonto(typeof valor === "number" ? valor : 0, moneda);
}

/** Un nombre de período largo ("Julio 2026 (viaje a Colonia)") taparía a los vecinos en el eje. */
function acortarNombre(nombre: string): string {
  return nombre.length > 12 ? `${nombre.slice(0, 11).trimEnd()}…` : nombre;
}

const ESTILO_DEL_TOOLTIP = {
  background: "var(--color-superficie)",
  border: "1px solid var(--color-borde)",
  borderRadius: "var(--radio-control)",
  fontSize: 13,
};

const COLOR_DE_LA_MARCA = "var(--color-texto)";
/** Relleno del tramo "gastado de más": rojo con rayas, para que no dependa solo del color. */
const ID_DE_RAYAS = "rayas-de-deficit";
const RELLENO_DE_RAYAS = `url(#${ID_DE_RAYAS})`;
/** Lo mismo que el patrón del gráfico, para el cuadradito de la leyenda (que es HTML). */
const RAYAS_DE_LA_LEYENDA = `repeating-linear-gradient(45deg, ${COLOR_GASTO} 0 3px, var(--color-superficie) 3px 5px)`;

/** Un período con lo que ingresó y gastó partido en los tres tramos de la barra. */
type FilaDeEvolucion = PeriodoDeEvolucion & {
  /** Lo gastado hasta donde alcanzó lo que entró. */
  cubiertoCentavos: number;
  /** Lo que entró y no se gastó. */
  sobroCentavos: number;
  /** Lo gastado por encima de lo que entró. */
  deMasCentavos: number;
};

/**
 * Parte cada período en tramos que se apilan: lo gastado (hasta lo que entró), lo que
 * sobró y lo gastado de más. Nunca hay "sobró" y "de más" a la vez, así que la altura de
 * la barra es la mayor de las dos cifras (lo que entró o lo que salió).
 */
function conTramos(periodo: PeriodoDeEvolucion): FilaDeEvolucion {
  const cubiertoCentavos = Math.min(periodo.gastosCentavos, periodo.ingresosCentavos);
  return {
    ...periodo,
    cubiertoCentavos,
    sobroCentavos: periodo.ingresosCentavos - cubiertoCentavos,
    deMasCentavos: periodo.gastosCentavos - cubiertoCentavos,
  };
}

type Tramo = "cubierto" | "sobro" | "deMas";

const RELLENO_DE_TRAMO: Record<Tramo, string> = {
  cubierto: COLOR_GASTO,
  sobro: COLOR_INGRESO,
  deMas: RELLENO_DE_RAYAS,
};

/** El tramo de más arriba de la barra: el que lleva las esquinas redondeadas. */
function tramoDeArriba(fila: FilaDeEvolucion): Tramo {
  if (fila.deMasCentavos > 0) return "deMas";
  return fila.sobroCentavos > 0 ? "sobro" : "cubierto";
}

/**
 * Dibuja un tramo de la barra y, en el borde que corresponde, la marca de lo que entró: una
 * raya negra a lo ancho de la barra. Esa altura es justo donde termina lo ingresado: el
 * borde de arriba de lo que sobró, o el de abajo de lo gastado de más, o el de arriba de lo
 * gastado si no sobró ni faltó nada. Cada período lleva una sola marca, que la dibuja el tramo
 * que queda más arriba de los que la tocan para que nadie la tape.
 */
function formaDeTramo(tramo: Tramo) {
  return function FormaDelTramo({ x, y, width, height, payload }: BarShapeProps) {
    const fila = payload as FilaDeEvolucion;
    const yDeLaMarca =
      tramo === "deMas" && fila.deMasCentavos > 0
        ? y + height
        : tramo === "sobro" && fila.sobroCentavos > 0
          ? y
          : tramo === "cubierto" && fila.sobroCentavos === 0 && fila.deMasCentavos === 0
            ? y
            : null;

    return (
      <g>
        {height > 0 ? (
          <Rectangle
            x={x}
            y={y}
            width={width}
            height={height}
            fill={RELLENO_DE_TRAMO[tramo]}
            radius={tramoDeArriba(fila) === tramo ? [4, 4, 0, 0] : 0}
          />
        ) : null}
        {yDeLaMarca === null ? null : (
          <line
            x1={x - 3}
            x2={x + width + 3}
            y1={yDeLaMarca}
            y2={yDeLaMarca}
            stroke={COLOR_DE_LA_MARCA}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )}
      </g>
    );
  };
}

const FormaDelTramoCubierto = formaDeTramo("cubierto");
const FormaDelTramoSobro = formaDeTramo("sobro");
const FormaDelTramoDeMas = formaDeTramo("deMas");

/** Lo que muestra el globito al apuntar a un período: las tres cifras que importan, con palabras. */
function GlobitoDelPeriodo({
  fila,
  moneda,
}: {
  fila: FilaDeEvolucion | undefined;
  moneda: string;
}) {
  if (fila === undefined) return null;
  const resultado =
    fila.balanceCentavos > 0
      ? "Sobró plata"
      : fila.balanceCentavos < 0
        ? "Gastaste de más"
        : "Quedó parejo";

  return (
    <div style={{ ...ESTILO_DEL_TOOLTIP, padding: "8px 12px" }}>
      <p className="font-medium">{fila.nombre}</p>
      <p>Entró: {formatearMonto(fila.ingresosCentavos, moneda)}</p>
      <p>Salió: {formatearMonto(fila.gastosCentavos, moneda)}</p>
      <p className="font-medium">
        {resultado}: {formatearMonto(Math.abs(fila.balanceCentavos), moneda)}
      </p>
    </div>
  );
}

function ItemDeLeyenda({ marca, texto }: { marca: ReactNode; texto: string }) {
  return (
    <li className="flex items-center gap-1.5">
      {marca}
      {texto}
    </li>
  );
}

/**
 * Ingresos y gastos de cada período en una sola barra: lo rojo es lo gastado y, si sobró
 * plata, lo verde completa hasta lo que entró. Una raya negra marca hasta dónde llegó lo
 * ingresado: si el gasto la pasa, el tramo de arriba (rojo rayado) es lo gastado de más.
 *
 * Es una sola barra por período, desde cero, y su altura es la mayor de las dos cifras: un
 * déficit grande no estira el eje hacia abajo ni aprieta al resto (a diferencia de dibujar el
 * balance como una serie con valores negativos). Los colores son un refuerzo: el rayado y la
 * leyenda lo dicen sin color, y la lista de balances de debajo (ver estadisticas-de-finanzas.tsx)
 * lo repite con texto. Los nombres de período largos se acortan en el eje (completos en el globito).
 */
export function GraficoEvolucion({
  datos,
  moneda,
}: {
  datos: PeriodoDeEvolucion[];
  moneda: string;
}) {
  const filas = datos.map(conTramos);

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={filas} margin={{ left: 8, right: 8, top: 8, bottom: 0 }} maxBarSize={56}>
          <defs>
            <pattern
              id={ID_DE_RAYAS}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width={6} height={6} fill={COLOR_GASTO} />
              <line x1={0} y1={0} x2={0} y2={6} stroke="var(--color-superficie)" strokeWidth={2} />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borde)" vertical={false} />
          <XAxis
            dataKey="nombre"
            tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
            tickFormatter={acortarNombre}
            // Todas las etiquetas, inclinadas: con las derechas, en una pantalla angosta
            // Recharts oculta las que se tocan y desaparecen períodos del eje.
            interval={0}
            angle={-30}
            textAnchor="end"
            height={52}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
            tickFormatter={(valor: number) => formatearMonto(valor, moneda)}
            width={80}
          />
          <Tooltip
            // El resaltado de la barra apuntada: suave, no el gris por defecto de Recharts.
            cursor={{ fill: "var(--color-superficie-suave)" }}
            content={({ payload }) => (
              <GlobitoDelPeriodo fila={payload?.[0]?.payload as FilaDeEvolucion} moneda={moneda} />
            )}
          />
          <Bar dataKey="cubiertoCentavos" stackId="periodo" shape={FormaDelTramoCubierto} />
          <Bar dataKey="sobroCentavos" stackId="periodo" shape={FormaDelTramoSobro} />
          <Bar dataKey="deMasCentavos" stackId="periodo" shape={FormaDelTramoDeMas} />
        </BarChart>
      </ResponsiveContainer>

      <ul
        aria-label="Cómo leer el gráfico"
        className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-texto-secundario"
      >
        <ItemDeLeyenda
          marca={
            <span
              aria-hidden="true"
              className="size-3 rounded-sm"
              style={{ backgroundColor: COLOR_GASTO }}
            />
          }
          texto="Gastado"
        />
        <ItemDeLeyenda
          marca={
            <span
              aria-hidden="true"
              className="size-3 rounded-sm"
              style={{ backgroundColor: COLOR_INGRESO }}
            />
          }
          texto="Sobró plata"
        />
        <ItemDeLeyenda
          marca={
            <span
              aria-hidden="true"
              className="size-3 rounded-sm"
              style={{ backgroundImage: RAYAS_DE_LA_LEYENDA }}
            />
          }
          texto="Gastado de más"
        />
        <ItemDeLeyenda
          marca={
            <span
              aria-hidden="true"
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: COLOR_DE_LA_MARCA }}
            />
          }
          texto="Hasta acá llegó lo que entró"
        />
      </ul>
    </div>
  );
}

/**
 * Lo gastado en una categoría período a período, en dos gráficas en una: barras con el
 * valor bruto (eje izquierdo, en plata) y una línea con ese valor como porcentaje de los
 * ingresos del período (eje derecho). Si la categoría tiene presupuesto, una línea punteada
 * marca su límite. En un período sin ingresos no hay porcentaje: la línea se corta en vez
 * de inventar un valor.
 */
export function GraficoEvolucionDeCategoria({
  datos,
  color,
  nombreDeCategoria,
  presupuestoCentavos,
  moneda,
}: {
  datos: PuntoDeCategoria[];
  color: string;
  nombreDeCategoria: string;
  presupuestoCentavos: number | null;
  moneda: string;
}) {
  const nombreDeBarras = `Gastado en ${nombreDeCategoria}`;
  const nombreDelPorcentaje = "% de los ingresos del período";

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

/**
 * Lo gastado acumulado día a día desde la apertura del período, contra el período
 * anterior (si lo hay). Cada línea termina en el último día de su período: la actual, en
 * el día en que va (o en el último, si está cerrado); la anterior, en el suyo.
 */
export function GraficoRitmoDeGasto({
  puntos,
  nombreAnterior,
  moneda,
}: {
  puntos: PuntoDeRitmo[];
  /** Null si no hay período anterior: entonces se dibuja una sola línea. */
  nombreAnterior: string | null;
  moneda: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={puntos} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-borde)" vertical={false} />
        <XAxis
          dataKey="dia"
          tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--color-texto-secundario)" }}
          tickFormatter={(valor: number) => formatearMonto(valor, moneda)}
          width={80}
          domain={[0, "auto"]}
        />
        <Tooltip
          labelFormatter={(dia) => `Día ${dia}`}
          formatter={formateadorDeTooltip(moneda)}
          contentStyle={{
            background: "var(--color-superficie)",
            border: "1px solid var(--color-borde)",
            borderRadius: "var(--radio-control)",
            fontSize: 13,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        {nombreAnterior === null ? null : (
          <Line
            type="monotone"
            dataKey="anteriorCentavos"
            name={nombreAnterior}
            stroke="var(--color-texto-secundario)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="actualCentavos"
          name="Este período"
          stroke="var(--color-acento)"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 6 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

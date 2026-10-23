// Mini gráficos de los widgets: una línea, barras, una comparación, un anillo, una
// barra de avance y un ranking.
//
// Están hechos a mano con SVG y divs en vez de con la librería de gráficos del
// módulo (Recharts): a este tamaño no hace falta ejes, leyendas ni tooltips, y
// traer una librería de gráficos a cada pantalla que muestra widgets es peso de
// más (docs/guias/rendimiento.md). Los colores salen de los mismos tokens que los
// gráficos grandes: verde para ingresos, rojo para gastos, acento para lo demás.
//
// Son decorativos para los lectores de pantalla (`aria-hidden`): lo que muestran
// también lo dice el texto de la tarjeta. Y solo se anima lo que ya se anima en el
// resto de la interfaz: nada en estos gráficos se mueve.

import { cn } from "@/lib/clases";
import type { ColorDeVisual, VisualDeWidget } from "./tipos";

const FONDO_DE_COLOR: Record<ColorDeVisual, string> = {
  ingreso: "bg-exito",
  gasto: "bg-peligro",
  acento: "bg-acento",
  suave: "bg-texto-secundario/40",
};

/** Una porción de 0 a 100, sin pasarse ni dar negativa. */
function acotar(porcentaje: number): number {
  return Math.min(100, Math.max(0, porcentaje));
}

// --- Línea ---

const ANCHO_LINEA = 200;
const ALTO_LINEA = 40;
const MARGEN_LINEA = 3;

/** Los tramos seguidos con dato de una serie, como trazos "M x y L x y ...". */
function trazosDeLinea(
  valores: readonly (number | null)[],
  maximo: number,
  cantidad: number,
): string[] {
  const trazos: string[] = [];
  let actual = "";
  valores.forEach((valor, posicion) => {
    if (valor === null) {
      if (actual) trazos.push(actual);
      actual = "";
      return;
    }
    const x = (posicion / (cantidad - 1)) * ANCHO_LINEA;
    const y = ALTO_LINEA - MARGEN_LINEA - (valor / maximo) * (ALTO_LINEA - MARGEN_LINEA * 2);
    actual += `${actual ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  if (actual) trazos.push(actual);
  return trazos;
}

function Linea({
  series,
  grande,
}: {
  series: Extract<VisualDeWidget, { tipo: "linea" }>["series"];
  grande: boolean;
}) {
  const cantidad = Math.max(...series.map((serie) => serie.valores.length), 0);
  if (cantidad < 2) return null;
  const maximo = Math.max(
    1,
    ...series.flatMap((serie) => serie.valores.map((valor) => valor ?? 0)),
  );

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${ANCHO_LINEA} ${ALTO_LINEA}`}
      preserveAspectRatio="none"
      className={cn("w-full overflow-visible", grande ? "min-h-16 flex-1" : "h-10")}
    >
      <line
        x1={0}
        x2={ANCHO_LINEA}
        y1={ALTO_LINEA - 0.5}
        y2={ALTO_LINEA - 0.5}
        className="stroke-borde"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {/* La referencia primero, para que la serie principal quede encima. */}
      {[...series]
        .sort((a, b) => Number(b.referencia ?? false) - Number(a.referencia ?? false))
        .map((serie, orden) =>
          trazosDeLinea(serie.valores, maximo, cantidad).map((trazo) => (
            <path
              key={`${orden}-${trazo}`}
              d={trazo}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              strokeDasharray={serie.referencia ? "3 4" : undefined}
              className={serie.referencia ? "stroke-texto-secundario" : "stroke-acento"}
            />
          )),
        )}
    </svg>
  );
}

// --- Barras ---

function Barras({ valores, grande }: { valores: readonly number[]; grande: boolean }) {
  const maximo = Math.max(1, ...valores);

  return (
    <div
      aria-hidden="true"
      className={cn("flex items-end gap-1", grande ? "min-h-16 flex-1" : "h-10")}
    >
      {valores.map((valor, posicion) => (
        <div
          // La posición es la identidad: son días o períodos en orden fijo.
          key={posicion}
          className={cn(
            "min-h-0.5 flex-1 rounded-sm",
            posicion === valores.length - 1 ? "bg-acento" : "bg-acento/35",
          )}
          style={{ height: `${Math.max(2, (valor / maximo) * 100)}%` }}
        />
      ))}
    </div>
  );
}

// --- Comparación ---

function Comparacion({
  filas,
  grande,
}: {
  filas: Extract<VisualDeWidget, { tipo: "comparacion" }>["filas"];
  grande: boolean;
}) {
  const maximo = Math.max(1, ...filas.map((fila) => fila.valor));

  return (
    <div
      aria-hidden="true"
      className={cn("flex flex-col", grande ? "flex-1 justify-evenly" : "gap-1.5")}
    >
      {filas.map((fila) => (
        <div
          key={fila.etiqueta}
          className={cn(
            "grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-2",
            grande ? "text-sm" : "text-xs",
          )}
        >
          <span className="text-texto-secundario">{fila.etiqueta}</span>
          <div
            className={cn(
              "overflow-hidden rounded-full bg-superficie-suave",
              grande ? "h-3.5" : "h-2",
            )}
          >
            <div
              className={cn("h-full rounded-full", FONDO_DE_COLOR[fila.color])}
              style={{ width: `${acotar((fila.valor / maximo) * 100)}%` }}
            />
          </div>
          <span className="numeros-tabulares text-right text-texto">{fila.texto}</span>
        </div>
      ))}
    </div>
  );
}

// --- Anillo ---

const RADIO_DEL_ANILLO = 22;
const LARGO_DEL_ANILLO = 2 * Math.PI * RADIO_DEL_ANILLO;

/** Un porcentaje como anillo con el número adentro. El color es el de la categoría, que viene de los datos. */
export function Anillo({
  porcentaje,
  color,
  grande = false,
}: {
  porcentaje: number;
  color: string;
  grande?: boolean;
}) {
  const lleno = (acotar(porcentaje) / 100) * LARGO_DEL_ANILLO;

  return (
    <div aria-hidden="true" className={cn("relative shrink-0", grande ? "size-24" : "size-16")}>
      <svg aria-hidden="true" viewBox="0 0 56 56" className="size-full -rotate-90">
        <circle
          cx={28}
          cy={28}
          r={RADIO_DEL_ANILLO}
          fill="none"
          strokeWidth={7}
          className="stroke-superficie-suave"
        />
        <circle
          cx={28}
          cy={28}
          r={RADIO_DEL_ANILLO}
          fill="none"
          strokeWidth={7}
          strokeLinecap="butt"
          stroke={color}
          strokeDasharray={`${lleno.toFixed(1)} ${LARGO_DEL_ANILLO.toFixed(1)}`}
        />
      </svg>
      <span
        className={cn(
          "numeros-tabulares absolute inset-0 flex items-center justify-center font-semibold text-texto",
          grande ? "text-base" : "text-xs",
        )}
      >
        {Math.round(acotar(porcentaje))}%
      </span>
    </div>
  );
}

// --- Progreso ---

function Progreso({ porcentaje, grande }: { porcentaje: number; grande: boolean }) {
  const color = porcentaje > 100 ? "bg-peligro" : porcentaje >= 80 ? "bg-advertencia" : "bg-acento";

  return (
    <div
      aria-hidden="true"
      className={cn("overflow-hidden rounded-full bg-superficie-suave", grande ? "h-5" : "h-2.5")}
    >
      <div
        className={cn("h-full rounded-full", color)}
        style={{ width: `${acotar(porcentaje)}%` }}
      />
    </div>
  );
}

// --- Ranking ---

function Ranking({
  filas,
  grande,
}: {
  filas: Extract<VisualDeWidget, { tipo: "ranking" }>["filas"];
  grande: boolean;
}) {
  // Con una o dos filas, la letra y las barras crecen para no dejar el alto de la tarjeta vacío.
  const pocas = grande && filas.length <= 2;

  return (
    // Acá el texto sí es la información (nombre y monto), así que no se oculta: lo
    // único decorativo es la barra de cada fila.
    <ul className={cn("flex flex-col", grande ? "flex-1 justify-evenly" : "gap-2")}>
      {filas.map((fila) => (
        <li key={fila.etiqueta} className="flex flex-col gap-1">
          <div
            className={cn(
              "flex items-baseline justify-between gap-2",
              grande ? (pocas ? "text-base" : "text-sm") : "text-xs",
            )}
          >
            <span className="min-w-0 break-words font-medium text-texto">{fila.etiqueta}</span>
            <span className="numeros-tabulares shrink-0 text-texto-secundario">{fila.texto}</span>
          </div>
          <div
            aria-hidden="true"
            className={cn(
              "overflow-hidden rounded-full bg-superficie-suave",
              grande ? (pocas ? "h-3" : "h-2") : "h-1.5",
            )}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${acotar(fila.proporcion * 100)}%`, backgroundColor: fila.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** El gráfico de un widget, salvo el anillo, que la tarjeta ubica al costado de la cifra. */
export function VisualDelWidget({
  visual,
  grande = false,
}: {
  visual: Exclude<VisualDeWidget, { tipo: "anillo" }>;
  /** Versión de la columna lateral, más alta y con letra más grande. */
  grande?: boolean;
}) {
  switch (visual.tipo) {
    case "linea":
      return <Linea series={visual.series} grande={grande} />;
    case "barras":
      return <Barras valores={visual.valores} grande={grande} />;
    case "comparacion":
      return <Comparacion filas={visual.filas} grande={grande} />;
    case "progreso":
      return <Progreso porcentaje={visual.porcentaje} grande={grande} />;
    case "ranking":
      return <Ranking filas={visual.filas} grande={grande} />;
  }
}

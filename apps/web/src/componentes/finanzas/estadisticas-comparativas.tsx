// Las estadísticas que ayudan a entender "cómo voy": datos rápidos del período, el ritmo
// de gasto contra el período anterior y qué categorías subieron o bajaron.
//
// Reciben los datos ya calculados por la API (estadisticasComparativas): acá solo se
// dicen con palabras y se dibujan. En todos el significado va en texto e ícono además
// del color (docs/guias/estetica.md: ningún significado depende solo del color).
// El gráfico del ritmo se carga de forma diferida, como los demás (ver graficos-finanzas.tsx).

"use client";

import { formatearFecha, formatearMonto, formatearPorcentaje } from "@gestoria/shared";
import {
  ArrowDownRight,
  CalendarDays,
  ListOrdered,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import type {
  DatosRapidos,
  Periodo,
  RitmoDeGasto,
  VariacionPorCategoria,
} from "@/lib/api-finanzas";
import { cn } from "@/lib/clases";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { EsqueletoDeGrafico } from "./esqueleto-de-grafico";

const GraficoRitmoDeGasto = dynamic(
  () => import("./graficos-finanzas").then((modulo) => modulo.GraficoRitmoDeGasto),
  { ssr: false, loading: () => <EsqueletoDeGrafico alto={260} /> },
);

function dias(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "día" : "días"}`;
}

function DatoRapido({
  titulo,
  Icono,
  valor,
  nota,
}: {
  titulo: string;
  Icono: typeof CalendarDays;
  valor: ReactNode;
  nota: ReactNode;
}) {
  return (
    <Tarjeta className="flex min-w-0 flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-sm text-texto-secundario">
        <Icono aria-hidden="true" className="size-4 shrink-0" />
        {titulo}
      </div>
      <p className="truncate text-2xl font-semibold tabular-nums tracking-tight">{valor}</p>
      <p className="truncate text-xs text-texto-secundario">{nota}</p>
    </Tarjeta>
  );
}

/** Tres números sueltos del período, para ubicarse de un vistazo. */
export function DatosRapidosDelPeriodo({
  datos,
  diasTranscurridos,
  moneda,
}: {
  datos: DatosRapidos;
  diasTranscurridos: number;
  moneda: string;
}) {
  const { gastoMasGrande } = datos;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <DatoRapido
        titulo="Gasto promedio por día"
        Icono={CalendarDays}
        valor={formatearMonto(datos.promedioPorDiaCentavos, moneda)}
        nota={`En ${dias(diasTranscurridos)} del período`}
      />
      <DatoRapido
        titulo="Gasto más grande"
        Icono={ArrowDownRight}
        valor={gastoMasGrande ? formatearMonto(gastoMasGrande.importeCentavos, moneda) : "—"}
        nota={
          gastoMasGrande ? (
            <span title={gastoMasGrande.descripcion}>
              {gastoMasGrande.descripcion} · {gastoMasGrande.categoria} ·{" "}
              {formatearFecha(gastoMasGrande.fecha, zonaDelDispositivo())}
            </span>
          ) : (
            "Todavía no hay gastos"
          )
        }
      />
      <DatoRapido
        titulo="Movimientos"
        Icono={ListOrdered}
        valor={datos.cantidadDeMovimientos}
        nota="Ingresos y gastos del período"
      />
    </div>
  );
}

/**
 * La comparación del ritmo dicha con palabras: cuánto se lleva gastado y cómo se compara
 * con lo que se llevaba a esta misma altura (mismo número de día) del período anterior.
 */
function ResumenDelRitmo({
  ritmo,
  abierto,
  moneda,
}: {
  ritmo: RitmoDeGasto;
  abierto: boolean;
  moneda: string;
}) {
  const gastado = formatearMonto(ritmo.acumuladoCentavos, moneda);
  const llevado = abierto ? `Llevás ${gastado} gastados` : `Gastaste ${gastado}`;
  const { anterior } = ritmo;

  if (anterior === null) {
    return (
      <p className="text-sm text-texto">
        {llevado} en {dias(ritmo.diasTranscurridos)}. Es tu primer período: cuando tengas otro, vas
        a poder comparar el ritmo.
      </p>
    );
  }

  const diferencia = ritmo.acumuladoCentavos - anterior.acumuladoAlMismoDiaCentavos;
  const monto = formatearMonto(Math.abs(diferencia), moneda);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-texto">
        {llevado} en {dias(ritmo.diasTranscurridos)}. En {anterior.nombre}, a esta altura,{" "}
        {abierto ? "llevabas" : "habías gastado"}{" "}
        {formatearMonto(anterior.acumuladoAlMismoDiaCentavos, moneda)}.
      </p>
      <div>
        {diferencia > 0 ? (
          <Insignia tono="peligro" icono={TrendingUp}>
            {monto} más que en {anterior.nombre}
          </Insignia>
        ) : diferencia < 0 ? (
          <Insignia tono="exito" icono={TrendingDown}>
            {monto} menos que en {anterior.nombre}
          </Insignia>
        ) : (
          <Insignia icono={Minus}>Igual que en {anterior.nombre}</Insignia>
        )}
      </div>
    </div>
  );
}

/** Cuánto va gastado en el período, día a día, contra el período anterior. */
export function RitmoDeGastoDelPeriodo({
  ritmo,
  periodo,
  moneda,
}: {
  ritmo: RitmoDeGasto;
  periodo: Periodo;
  moneda: string;
}) {
  const hayGastos = ritmo.puntos.some(
    (punto) => (punto.actualCentavos ?? 0) > 0 || (punto.anteriorCentavos ?? 0) > 0,
  );

  return (
    <Tarjeta className="p-4">
      <h2 className="text-sm font-medium text-texto">Ritmo de gasto en {periodo.nombre}</h2>
      <p className="mb-3 text-xs text-texto-secundario">
        Lo gastado sumando día a día desde que abrió el período
        {ritmo.anterior ? `, comparado con ${ritmo.anterior.nombre}` : ""}. Cada período arranca en
        el día 1.
      </p>
      <ResumenDelRitmo ritmo={ritmo} abierto={periodo.abierto} moneda={moneda} />
      <div className="mt-4">
        {hayGastos ? (
          <GraficoRitmoDeGasto
            puntos={ritmo.puntos}
            nombreAnterior={ritmo.anterior?.nombre ?? null}
            moneda={moneda}
          />
        ) : (
          <p className="py-6 text-center text-sm text-texto-secundario">
            Todavía no registraste gastos en este período.
          </p>
        )}
      </div>
    </Tarjeta>
  );
}

/**
 * Qué categorías subieron o bajaron respecto del período anterior, de la que más cambió a
 * la que menos. Cada una es una barra que sale del centro: a la derecha, gastaste más; a la
 * izquierda, gastaste menos. La barra mide la diferencia en plata, y el texto dice el monto
 * y el porcentaje (una categoría que antes no tenía gastos es "nueva", sin porcentaje).
 */
export function VariacionPorCategoriaDelPeriodo({
  variacion,
  moneda,
}: {
  variacion: VariacionPorCategoria | null;
  moneda: string;
}) {
  return (
    <Tarjeta className="p-4">
      <h2 className="text-sm font-medium text-texto">Qué subió y qué bajó</h2>
      <CuerpoDeLaVariacion variacion={variacion} moneda={moneda} />
    </Tarjeta>
  );
}

function CuerpoDeLaVariacion({
  variacion,
  moneda,
}: {
  variacion: VariacionPorCategoria | null;
  moneda: string;
}) {
  if (variacion === null) {
    return (
      <p className="py-6 text-center text-sm text-texto-secundario">
        Es tu primer período. Cuando tengas otro, acá vas a ver en qué categorías gastaste más o
        menos que antes.
      </p>
    );
  }

  const { categorias, periodoAnterior } = variacion;
  const descripcion = `Gastos de cada categoría comparados con ${periodoAnterior}, de la que más cambió a la que menos.`;

  if (categorias.length === 0) {
    return (
      <>
        <p className="mb-3 text-xs text-texto-secundario">{descripcion}</p>
        <p className="py-6 text-center text-sm text-texto-secundario">
          No hay cambios: tus gastos por categoría quedaron igual que en {periodoAnterior}.
        </p>
      </>
    );
  }

  const mayorDiferencia = Math.max(...categorias.map((c) => Math.abs(c.diferenciaCentavos)));

  return (
    <>
      <p className="mb-3 text-xs text-texto-secundario">{descripcion}</p>
      <div aria-hidden="true" className="mb-2 flex justify-between text-xs text-texto-secundario">
        <span>← Gastaste menos</span>
        <span>Gastaste más →</span>
      </div>
      <ul
        aria-label={`Variación de gastos por categoría respecto de ${periodoAnterior}`}
        className="flex flex-col gap-4"
      >
        {categorias.map((categoria) => {
          const sube = categoria.diferenciaCentavos > 0;
          const Icono = sube ? TrendingUp : TrendingDown;
          const diferencia = formatearMonto(Math.abs(categoria.diferenciaCentavos), moneda);
          const texto =
            categoria.porcentaje === null
              ? `Nueva: ${diferencia}`
              : `${sube ? "Subió" : "Bajó"} ${diferencia} (${formatearPorcentaje(Math.abs(categoria.porcentaje))})`;

          return (
            <li key={categoria.categoriaId} className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-sm text-texto">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: categoria.color }}
                  />
                  <span className="truncate">{categoria.nombre}</span>
                </span>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums",
                    sube ? "text-peligro" : "text-exito",
                  )}
                >
                  <Icono aria-hidden="true" className="size-4" />
                  {texto}
                </span>
              </div>
              <div aria-hidden="true" className="relative h-2 rounded-full bg-superficie-suave">
                <span className="absolute inset-y-0 left-1/2 w-px bg-borde" />
                <span
                  className={cn(
                    "absolute inset-y-0 rounded-full",
                    sube ? "left-1/2 bg-peligro" : "right-1/2 bg-exito",
                  )}
                  style={{
                    width: `${(Math.abs(categoria.diferenciaCentavos) / mayorDiferencia) * 50}%`,
                  }}
                />
              </div>
              <p className="text-xs tabular-nums text-texto-secundario">
                {formatearMonto(categoria.anteriorCentavos, moneda)} →{" "}
                {formatearMonto(categoria.actualCentavos, moneda)}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

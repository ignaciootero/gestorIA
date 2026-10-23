// Estadísticas: datos rápidos del período (siempre arriba) y cinco bloques que se
// presentan en orden aleatorio: la evolución de ingresos/gastos (y su balance) de los
// últimos períodos, el ritmo de gasto y qué categorías subieron o bajaron contra el
// período anterior (estos dos en estadisticas-comparativas.tsx), la evolución de lo
// gastado en una categoría y los gastos por categoría del período.
//
// El orden se sortea una vez cada vez que se entra a la pestaña (o se cambia de período) y
// no cambia mientras se está en ella, ni siquiera al actualizarse los datos: que algo se
// mueva mientras se lee sería peor que el problema que resuelve. Se hace para que ningún
// bloque quede siempre al final, donde es más fácil no llegar a verlo.
// Los gráficos en sí viven en graficos-finanzas.tsx y se cargan de forma diferida
// (ver ese archivo): acá solo se piden los datos y se arma la pantalla alrededor.

"use client";

import { elegirAlAzar, MONEDA_POR_DEFECTO, mezclar } from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import { type ReactNode, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Insignia } from "@/componentes/ui/insignia";
import { Selector } from "@/componentes/ui/selector";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  type Categoria,
  obtenerCategorias,
  obtenerEstadisticas,
  obtenerEvolucionDeCategoria,
  type Periodo,
  type PeriodoDeEvolucion,
} from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { interpretarError } from "@/lib/mensajes-de-error";
import { EsqueletoDeGrafico } from "./esqueleto-de-grafico";
import {
  DatosRapidosDelPeriodo,
  RitmoDeGastoDelPeriodo,
  VariacionPorCategoriaDelPeriodo,
} from "./estadisticas-comparativas";
import { Saldo } from "./saldo";

const GraficoEvolucion = dynamic(
  () => import("./graficos-finanzas").then((modulo) => modulo.GraficoEvolucion),
  { ssr: false, loading: () => <EsqueletoDeGrafico alto={260} /> },
);

const GraficoEvolucionDeCategoria = dynamic(
  () => import("./graficos-finanzas").then((modulo) => modulo.GraficoEvolucionDeCategoria),
  { ssr: false, loading: () => <EsqueletoDeGrafico alto={300} /> },
);

const GraficoGastosPorCategoria = dynamic(
  () => import("./graficos-finanzas").then((modulo) => modulo.GraficoGastosPorCategoria),
  { ssr: false, loading: () => <EsqueletoDeGrafico alto={160} /> },
);

/**
 * El resultado de cada período dicho con palabras: lo que sobró o lo que faltó. Acompaña
 * al gráfico para que el balance no dependa de distinguir verde de rojo (ni de apuntar con
 * el mouse a un punto). Un período sin ingresos ni gastos se dice así, no "en cero".
 */
function BalancePorPeriodo({
  periodos,
  moneda,
}: {
  periodos: PeriodoDeEvolucion[];
  moneda: string;
}) {
  return (
    <ul aria-label="Balance de cada período" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {periodos.map((periodo) => (
        <li
          key={periodo.periodoId}
          className="flex flex-col gap-1 rounded-control border border-borde p-3"
        >
          <span className="text-xs text-texto-secundario">{periodo.nombre}</span>
          <Saldo
            centavos={periodo.balanceCentavos}
            moneda={moneda}
            className="text-sm font-medium tabular-nums"
          />
          <span>
            {periodo.balanceCentavos > 0 ? (
              <Insignia tono="exito" icono={TrendingUp}>
                Sobró plata
              </Insignia>
            ) : periodo.balanceCentavos < 0 ? (
              <Insignia tono="peligro" icono={TrendingDown}>
                Gastaste de más
              </Insignia>
            ) : (
              <Insignia icono={Minus}>
                {periodo.ingresosCentavos === 0 && periodo.gastosCentavos === 0
                  ? "Sin movimientos"
                  : "Quedó parejo"}
              </Insignia>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Lo gastado en una categoría período a período. La categoría se elige en un selector (al
 * abrir, una al azar entre las que tuvieron gastos en el período, para ir descubriendo todas
 * y no mirar siempre la misma).
 */
function EvolucionDeUnaCategoria({
  periodo,
  categorias,
  propuestas,
  moneda,
}: {
  periodo: Periodo;
  categorias: Categoria[];
  /** Las categorías entre las que se sortea la que se muestra al abrir (las que tienen gastos). */
  propuestas: number[];
  moneda: string;
}) {
  const [elegida, setElegida] = useState<number | null>(null);
  // Se sortea una sola vez: un valor al azar calculado en cada render cambiaría la
  // categoría en cada actualización.
  const [sorteada] = useState(() =>
    elegirAlAzar(propuestas.filter((id) => categorias.some((categoria) => categoria.id === id))),
  );
  // Una elegida que ya no está en la lista (se eliminó o reemplazó) vuelve a la sorteada;
  // si ninguna tuvo gastos, a la primera de la lista.
  const categoria =
    categorias.find((candidata) => candidata.id === elegida) ??
    categorias.find((candidata) => candidata.id === sorteada) ??
    categorias[0];

  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "estadisticas", "categoria", periodo.id, categoria?.id],
    queryFn: () => obtenerEvolucionDeCategoria(periodo.id, categoria?.id ?? 0),
    enabled: categoria !== undefined,
  });

  if (categoria === undefined) {
    return (
      <p className="py-6 text-center text-sm text-texto-secundario">
        Todavía no tenés categorías para mirar.
      </p>
    );
  }

  const hayMovimientos = data?.periodos.some((punto) => punto.totalCentavos > 0) ?? false;

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full sm:max-w-xs">
        <Selector
          etiqueta="Categoría"
          value={categoria.id}
          onChange={(evento) => setElegida(Number(evento.target.value))}
        >
          {categorias.map((opcion) => (
            <option key={opcion.id} value={opcion.id}>
              {opcion.nombre}
            </option>
          ))}
        </Selector>
      </div>

      {error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : isPending ? (
        <div className="h-64 animate-pulse rounded-control bg-superficie-suave" />
      ) : hayMovimientos ? (
        <GraficoEvolucionDeCategoria
          datos={data.periodos}
          color={categoria.color}
          nombreDeCategoria={categoria.nombre}
          presupuestoCentavos={data.presupuestoCentavos}
          moneda={moneda}
        />
      ) : (
        <p className="py-6 text-center text-sm text-texto-secundario">
          No hay gastos en {categoria.nombre} en los últimos períodos.
        </p>
      )}
    </div>
  );
}

/** Los bloques que se presentan en orden aleatorio, con el nombre con el que se anuncian. */
const BLOQUES = {
  evolucion: "Ingresos y gastos de los últimos períodos",
  ritmo: "Ritmo de gasto",
  variacion: "Qué subió y qué bajó",
  categoria: "Evolución de gastos por categoría",
  gastos: "Gastos por categoría",
} as const;

type Bloque = keyof typeof BLOQUES;

const IDS_DE_BLOQUES = Object.keys(BLOQUES) as Bloque[];

export function EstadisticasDeFinanzas({ periodo }: { periodo: Periodo }) {
  const [orden] = useState(() => mezclar(IDS_DE_BLOQUES));
  const { data: sesion } = useSession();
  const moneda = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;

  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "estadisticas", periodo.id],
    queryFn: () => obtenerEstadisticas(periodo.id),
  });

  const categorias = useQuery({ queryKey: ["finanzas", "categorias"], queryFn: obtenerCategorias });

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-28 animate-pulse rounded-tarjeta bg-superficie-suave" />
        <div className="h-64 animate-pulse rounded-tarjeta bg-superficie-suave" />
        <div className="h-64 animate-pulse rounded-tarjeta bg-superficie-suave" />
        <div className="h-40 animate-pulse rounded-tarjeta bg-superficie-suave" />
      </div>
    );
  }

  if (error) {
    return <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>;
  }

  const bloques: Record<Bloque, ReactNode> = {
    evolucion: (
      <Tarjeta className="p-4">
        <h2 className="text-sm font-medium text-texto">
          Ingresos y gastos de los últimos períodos
        </h2>
        <p className="mb-3 text-xs text-texto-secundario">
          Cada barra es un período: lo rojo es lo gastado y, si sobró plata, lo verde completa lo
          que entró. Si lo gastado pasa la raya negra (lo que entró), el tramo rayado es lo gastado
          de más.
        </p>
        <GraficoEvolucion datos={data.evolucionPorPeriodo} moneda={moneda} />
        <BalancePorPeriodo periodos={data.evolucionPorPeriodo} moneda={moneda} />
      </Tarjeta>
    ),
    ritmo: <RitmoDeGastoDelPeriodo ritmo={data.ritmoDeGasto} periodo={periodo} moneda={moneda} />,
    variacion: (
      <VariacionPorCategoriaDelPeriodo variacion={data.variacionPorCategoria} moneda={moneda} />
    ),
    categoria: (
      <Tarjeta className="p-4">
        <h2 className="text-sm font-medium text-texto">Evolución de gastos por categoría</h2>
        <p className="mb-3 text-xs text-texto-secundario">
          Elegí una categoría para ver lo gastado en ella. Barras: el monto en pesos. Línea: ese
          monto como porcentaje de los ingresos de cada período.
        </p>
        {categorias.isPending ? (
          <div className="h-64 animate-pulse rounded-control bg-superficie-suave" />
        ) : categorias.error ? (
          <Aviso tono="peligro">{interpretarError(categorias.error).mensaje}</Aviso>
        ) : (
          <EvolucionDeUnaCategoria
            // Al cambiar de período se vuelve a sortear la categoría.
            key={periodo.id}
            periodo={periodo}
            // La categoría interna de transferencias no es para mirar gastos.
            categorias={categorias.data.categorias.filter(
              (categoria) => categoria.sistema === null,
            )}
            propuestas={data.gastosPorCategoria.map((gasto) => gasto.categoriaId)}
            moneda={moneda}
          />
        )}
      </Tarjeta>
    ),
    gastos: (
      <Tarjeta className="p-4">
        <h2 className="mb-3 text-sm font-medium text-texto">
          Gastos por categoría en {periodo.nombre}
        </h2>
        {data.gastosPorCategoria.length === 0 ? (
          <p className="py-6 text-center text-sm text-texto-secundario">
            Todavía no registraste gastos en este período.
          </p>
        ) : (
          <GraficoGastosPorCategoria datos={data.gastosPorCategoria} moneda={moneda} />
        )}
      </Tarjeta>
    ),
  };

  return (
    <div className="flex flex-col gap-4">
      <DatosRapidosDelPeriodo
        datos={data.datosRapidos}
        diasTranscurridos={data.ritmoDeGasto.diasTranscurridos}
        moneda={moneda}
      />

      {/* Cada bloque es una región con nombre: se puede saltar de uno a otro con un lector
          de pantalla y ubicarlo sin depender de dónde cayó en el sorteo. */}
      {orden.map((id) => (
        <section key={id} aria-label={BLOQUES[id]}>
          {bloques[id]}
        </section>
      ))}
    </div>
  );
}

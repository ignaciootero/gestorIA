// Estadísticas: gastos por categoría del período, la evolución de ingresos/gastos
// de los últimos períodos y la evolución de una categoría a elección (de lo
// gastado o de lo ingresado en ella).
// Los gráficos en sí viven en graficos-finanzas.tsx y se cargan de forma diferida
// (ver ese archivo): acá solo se piden los datos y se arma la pantalla alrededor.

"use client";

import { MONEDA_POR_DEFECTO } from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Selector } from "@/componentes/ui/selector";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  type Categoria,
  obtenerCategorias,
  obtenerEstadisticas,
  obtenerEvolucionDeCategoria,
  type Periodo,
  type TipoDeEvolucion,
} from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { interpretarError } from "@/lib/mensajes-de-error";

function EsqueletoDeGrafico({ alto }: { alto: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="animate-pulse rounded-control bg-superficie-suave"
      style={{ height: alto }}
    >
      <span className="solo-lectores">Cargando gráfico</span>
    </div>
  );
}

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

const TIPOS_DE_EVOLUCION = [
  { valor: "gasto", etiqueta: "Gastos" },
  { valor: "ingreso", etiqueta: "Ingresos" },
] as const;

/**
 * Lo gastado o ingresado en una categoría período a período. La categoría se elige en
 * un selector (por defecto, la que más se gastó en el período que se está mirando) y
 * además se elige si mirar los gastos o los ingresos: una misma categoría puede tener
 * ambos, y más de uno que del otro según el mes.
 */
function EvolucionDeUnaCategoria({
  periodo,
  categorias,
  porDefecto,
  moneda,
}: {
  periodo: Periodo;
  categorias: Categoria[];
  /** La categoría que se propone si la persona todavía no eligió ninguna. */
  porDefecto: number | undefined;
  moneda: string;
}) {
  const [elegida, setElegida] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipoDeEvolucion>("gasto");
  // Una elegida que ya no está en la lista (se eliminó o reemplazó) vuelve a la propuesta.
  const categoria =
    categorias.find((candidata) => candidata.id === elegida) ??
    categorias.find((candidata) => candidata.id === porDefecto) ??
    categorias[0];

  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "estadisticas", "categoria", periodo.id, categoria?.id, tipo],
    queryFn: () => obtenerEvolucionDeCategoria(periodo.id, categoria?.id ?? 0, tipo),
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
        <SelectorDeSegmentos
          id="tipo-de-evolucion"
          etiqueta="Qué mirar"
          modo="filtro"
          segmentos={TIPOS_DE_EVOLUCION}
          activo={tipo}
          onCambiar={setTipo}
        />
      </div>

      {error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : isPending ? (
        <div className="h-64 animate-pulse rounded-control bg-superficie-suave" />
      ) : hayMovimientos ? (
        <GraficoEvolucionDeCategoria
          datos={data.periodos}
          tipo={tipo}
          color={categoria.color}
          nombreDeCategoria={categoria.nombre}
          presupuestoCentavos={data.presupuestoCentavos}
          moneda={moneda}
        />
      ) : (
        <p className="py-6 text-center text-sm text-texto-secundario">
          No hay {tipo === "gasto" ? "gastos" : "ingresos"} en {categoria.nombre} en los últimos
          períodos.
        </p>
      )}
    </div>
  );
}

export function EstadisticasDeFinanzas({ periodo }: { periodo: Periodo }) {
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
        <div className="h-64 animate-pulse rounded-tarjeta bg-superficie-suave" />
        <div className="h-64 animate-pulse rounded-tarjeta bg-superficie-suave" />
        <div className="h-40 animate-pulse rounded-tarjeta bg-superficie-suave" />
      </div>
    );
  }

  if (error) {
    return <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="p-4">
        <h2 className="mb-3 text-sm font-medium text-texto">
          Ingresos y gastos de los últimos períodos
        </h2>
        <GraficoEvolucion datos={data.evolucionPorPeriodo} moneda={moneda} />
      </Tarjeta>

      <Tarjeta className="p-4">
        <h2 className="text-sm font-medium text-texto">Evolución de categorías</h2>
        <p className="mb-3 text-xs text-texto-secundario">
          Elegí una categoría y si querés ver lo gastado o lo ingresado en ella. Barras: el monto en
          pesos. Línea: ese monto como porcentaje de los ingresos de cada período.
        </p>
        {categorias.isPending ? (
          <div className="h-64 animate-pulse rounded-control bg-superficie-suave" />
        ) : categorias.error ? (
          <Aviso tono="peligro">{interpretarError(categorias.error).mensaje}</Aviso>
        ) : (
          <EvolucionDeUnaCategoria
            // Al cambiar de período se vuelve a proponer la categoría más gastada.
            key={periodo.id}
            periodo={periodo}
            // La categoría interna de transferencias no es para mirar gastos.
            categorias={categorias.data.categorias.filter(
              (categoria) => categoria.sistema === null,
            )}
            porDefecto={data.gastosPorCategoria[0]?.categoriaId}
            moneda={moneda}
          />
        )}
      </Tarjeta>

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
    </div>
  );
}

// Resumen del período: lo primero que se ve al entrar al módulo. El objetivo
// es que en pocos segundos quede claro cuánto entró, cuánto salió, cuánto queda
// y en qué se gastó últimamente (pedido del usuario: "entender su situación
// financiera en pocos segundos").

"use client";

import { formatearFechaHora, formatearMonto, MONEDA_POR_DEFECTO } from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Scale, Wallet } from "lucide-react";
import { Aviso } from "@/componentes/ui/aviso";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { type Movimiento, obtenerResumen, type Periodo, type Resumen } from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { cuentasDeMovimiento, IconoDeMovimiento, MontoDeMovimiento } from "./estilo-de-movimiento";

function TarjetaDeTotal({
  titulo,
  centavos,
  moneda,
  Icono,
  tono,
  nota,
}: {
  titulo: string;
  centavos: number;
  moneda: string;
  Icono: typeof Wallet;
  tono?: "exito" | "peligro";
  nota?: string | undefined;
}) {
  return (
    <Tarjeta className="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2 text-sm text-texto-secundario">
        <Icono aria-hidden="true" className="size-4" />
        {titulo}
      </div>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums tracking-tight",
          tono === "exito" && "text-exito",
          tono === "peligro" && "text-peligro",
        )}
      >
        {formatearMonto(centavos, moneda)}
      </p>
      {nota ? <p className="text-xs text-texto-secundario">{nota}</p> : null}
    </Tarjeta>
  );
}

/** "Período anterior (Agosto): $ 500,00", o nada si este es el primero. */
function notaDelAnterior(
  anterior: Resumen["periodoAnterior"],
  campo: "ingresosCentavos" | "gastosCentavos",
  moneda: string,
): string | undefined {
  if (anterior === null) return undefined;
  return `Período anterior (${anterior.nombre}): ${formatearMonto(anterior[campo], moneda)}`;
}

function FilaDeMovimiento({ movimiento, moneda }: { movimiento: Movimiento; moneda: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-borde py-2.5 last:border-0">
      <div className="flex min-w-0 items-center gap-2.5">
        <IconoDeMovimiento tipo={movimiento.tipo} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-texto">{movimiento.descripcion}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-texto-secundario">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: movimiento.categoria.color }}
            />
            {movimiento.categoria.nombre} · {cuentasDeMovimiento(movimiento)} ·{" "}
            {formatearFechaHora(movimiento.fecha, zonaDelDispositivo())}
          </p>
        </div>
      </div>
      <MontoDeMovimiento movimiento={movimiento} monedaBase={moneda} />
    </li>
  );
}

export function ResumenDeFinanzas({ periodo }: { periodo: Periodo }) {
  const { data: sesion } = useSession();
  const moneda = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;

  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "resumen", periodo.id],
    queryFn: () => obtenerResumen(periodo.id),
  });

  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
        <span className="solo-lectores">Cargando el resumen</span>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-tarjeta bg-superficie-suave" />
      </div>
    );
  }

  if (error) {
    return <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TarjetaDeTotal
          titulo="Balance del período"
          centavos={data.balanceCentavos}
          moneda={moneda}
          Icono={Scale}
          tono={data.balanceCentavos >= 0 ? "exito" : "peligro"}
        />
        <TarjetaDeTotal
          titulo="Ingresos"
          centavos={data.ingresosCentavos}
          moneda={moneda}
          Icono={ArrowUpRight}
          nota={notaDelAnterior(data.periodoAnterior, "ingresosCentavos", moneda)}
        />
        <TarjetaDeTotal
          titulo="Gastos"
          centavos={data.gastosCentavos}
          moneda={moneda}
          Icono={ArrowDownRight}
          nota={notaDelAnterior(data.periodoAnterior, "gastosCentavos", moneda)}
        />
        <TarjetaDeTotal
          titulo="Disponible"
          centavos={data.disponibleCentavos}
          moneda={moneda}
          Icono={Wallet}
          {...(data.disponibleCentavos < 0 ? { tono: "peligro" as const } : {})}
          nota={
            data.disponibleEsEstimado
              ? "Suma de tus cuentas, con las de otras monedas a la cotización de hoy (estimado)"
              : "Suma de tus cuentas"
          }
        />
      </div>

      {data.monedasSinCotizacion.length > 0 ? (
        <Aviso tono="advertencia">
          No pudimos traer la cotización de {data.monedasSinCotizacion.join(", ")}: las cuentas en
          esa moneda no están sumadas al disponible. Probá de nuevo en un rato.
        </Aviso>
      ) : null}

      <Tarjeta className="p-4">
        <h2 className="mb-1 text-sm font-medium text-texto">
          Últimos movimientos de {periodo.nombre}
        </h2>
        {data.ultimosMovimientos.length === 0 ? (
          <p className="py-6 text-center text-sm text-texto-secundario">
            Todavía no hay movimientos en {periodo.nombre}.
          </p>
        ) : (
          <ul>
            {data.ultimosMovimientos.map((movimiento) => (
              <FilaDeMovimiento key={movimiento.id} movimiento={movimiento} moneda={moneda} />
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

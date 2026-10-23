// Historial de una cuenta: sus movimientos, sus ajustes manuales de saldo y la
// carga inicial, juntos y del más nuevo al más viejo (la carga inicial, al final).
//
// Los casos se distinguen a simple vista y sin depender solo del color
// (docs/guias/estetica.md): una insignia "Movimiento" (ingreso o gasto, que
// cuenta en el período; verde si es un ingreso y roja si es un gasto, siempre con
// su flecha; la línea de abajo dice a qué período pertenece), "Transferencia",
// "Ajuste manual" (la persona dijo cuánto tenía en la cuenta; no es un ingreso ni
// un gasto y no pertenece a ningún período) y "Carga inicial" (el saldo con el
// que se creó la cuenta). El monto de cada renglón es su efecto sobre el saldo,
// con signo.

"use client";

import {
  decirCotizacion,
  formatearFechaHora,
  formatearMonto,
  formatearTasa,
  MONEDA_POR_DEFECTO,
} from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Flag,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import {
  type CuentaFinanciera,
  type ItemDeHistorial,
  obtenerHistorialDeCuenta,
} from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { Saldo } from "./saldo";

const POR_PAGINA = 10;

/**
 * Qué dice de la conversión un movimiento entre monedas distintas (ver equivalenciaDeMovimiento
 * en estilo-de-movimiento.tsx): la cotización usada y, en un ingreso o gasto, a cuánto equivale.
 */
function textoDeCambio(item: ItemDeHistorial, monedaBase: string): string | null {
  if (item.origen !== "movimiento") return null;
  const { cambio } = item;
  const destino = item.tipo === "neutro" ? cambio.monedaDeDestino : monedaBase;
  if (destino === null || destino === cambio.monedaDeOrigen) return null;

  const dicha = decirCotizacion(cambio.monedaDeOrigen, destino, cambio.tipoDeCambio);
  const tasa = `1 ${dicha.unidad} = ${formatearTasa(dicha.valor)} ${dicha.otra}`;
  const quien = cambio.manual ? " (la fijaste vos)" : "";
  return item.tipo === "neutro"
    ? `Cotización: ${tasa}${quien}`
    : `Equivale a ${formatearMonto(cambio.convertidoCentavos, destino)} · ${tasa}${quien}`;
}

function FilaDeHistorial({
  item,
  moneda,
  monedaBase,
}: {
  /** La moneda de la cuenta: en ella está el monto de cada renglón. */
  moneda: string;
  monedaBase: string;
  item: ItemDeHistorial;
}) {
  const sube = item.montoCentavos >= 0;
  const cambio = textoDeCambio(item, monedaBase);

  return (
    <li className="flex items-start justify-between gap-3 border-b border-borde py-3 last:border-0">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {item.origen === "saldo_inicial" ? (
            <Insignia tono="neutral" icono={Flag}>
              Carga inicial
            </Insignia>
          ) : item.origen === "ajuste" ? (
            <Insignia tono="info" icono={SlidersHorizontal}>
              Ajuste manual
            </Insignia>
          ) : item.tipo === "neutro" ? (
            <Insignia tono="advertencia" icono={ArrowLeftRight}>
              Transferencia
            </Insignia>
          ) : (
            <Insignia
              tono={item.tipo === "ingreso" ? "exito" : "peligro"}
              icono={item.tipo === "ingreso" ? ArrowUpRight : ArrowDownRight}
            >
              Movimiento
            </Insignia>
          )}
          <span className="min-w-0 truncate text-sm font-medium text-texto">
            {item.origen === "saldo_inicial"
              ? "Saldo con el que se creó la cuenta"
              : item.origen === "ajuste"
                ? `Saldo indicado: ${formatearMonto(item.saldoIndicadoCentavos, moneda)}`
                : item.transferencia
                  ? `${item.descripcion}: ${item.transferencia.desde} → ${item.transferencia.hacia}`
                  : item.descripcion}
          </span>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-texto-secundario">
          {item.origen === "movimiento" ? (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.categoria.color }}
            />
          ) : null}
          {formatearFechaHora(item.fecha, zonaDelDispositivo())}
          {item.origen === "movimiento"
            ? ` · ${item.categoria.nombre} · Período: ${item.periodo.nombre}`
            : item.origen === "saldo_inicial"
              ? " · Al crear la cuenta"
              : " · No es un ingreso ni un gasto"}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <p
          className={cn(
            "text-sm font-medium tabular-nums",
            // Una transferencia no es ingreso ni gasto: se queda en amarillo (ámbar), con su signo.
            item.origen === "movimiento" && item.tipo === "neutro"
              ? "text-advertencia"
              : sube
                ? "text-exito"
                : "text-peligro",
          )}
        >
          {sube ? "+" : "-"}
          {formatearMonto(Math.abs(item.montoCentavos), moneda)}
        </p>
        {cambio ? (
          <p className="text-right text-xs tabular-nums text-texto-secundario">{cambio}</p>
        ) : null}
      </div>
    </li>
  );
}

export function HistorialDeCuenta({ cuenta }: { cuenta: CuentaFinanciera }) {
  const { data: sesion } = useSession();
  const monedaBase = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;
  const moneda = cuenta.moneda;
  const [pagina, setPagina] = useState(0);

  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "historial-de-cuenta", cuenta.id, pagina],
    queryFn: () =>
      obtenerHistorialDeCuenta(cuenta.id, { limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 text-sm">
        <p className="text-texto-secundario">
          Saldo actual:{" "}
          <Saldo
            centavos={cuenta.saldoCentavos}
            moneda={moneda}
            className={cn("font-medium tabular-nums", cuenta.saldoCentavos >= 0 && "text-texto")}
          />
        </p>
      </div>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando el historial</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-control bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-texto-secundario">
          Esta cuenta todavía no tiene movimientos, ajustes de saldo ni carga inicial.
        </p>
      ) : (
        <>
          <ul>
            {data.items.map((item) => (
              <FilaDeHistorial
                key={`${item.origen}-${item.id}`}
                item={item}
                moneda={moneda}
                monedaBase={monedaBase}
              />
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm text-texto-secundario">
            <span>
              {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, data.total)} de{" "}
              {data.total}
            </span>
            <div className="flex gap-2">
              <Boton
                tamano="chico"
                variante="sutil"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Boton>
              <Boton
                tamano="chico"
                variante="sutil"
                disabled={(pagina + 1) * POR_PAGINA >= data.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

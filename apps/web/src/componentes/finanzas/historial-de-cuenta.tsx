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

import { formatearFechaHora, formatearMonto, MONEDA_POR_DEFECTO } from "@gestoria/shared";
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

function FilaDeHistorial({ item, moneda }: { item: ItemDeHistorial; moneda: string }) {
  const sube = item.montoCentavos >= 0;

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

      <p
        className={cn(
          "shrink-0 text-sm font-medium tabular-nums",
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
    </li>
  );
}

export function HistorialDeCuenta({ cuenta }: { cuenta: CuentaFinanciera }) {
  const { data: sesion } = useSession();
  const moneda = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;
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
              <FilaDeHistorial key={`${item.origen}-${item.id}`} item={item} moneda={moneda} />
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

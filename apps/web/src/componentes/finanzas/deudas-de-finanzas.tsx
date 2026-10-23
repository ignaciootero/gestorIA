// Pestaña "Deudas" de Finanzas: la plata que le deben a la persona y la que ella debe, con cada
// contacto. Se registran, se van saldando con pagos parciales y se ve cuánto falta.
//
// Es un registro aparte de los movimientos: no mueve los saldos de las cuentas ni entra en los
// totales. Los totales de arriba se dan por moneda y nunca se mezclan monedas.

"use client";

import {
  formatearDiaDeCalendario,
  formatearMonto,
  NOMBRES_DE_SENTIDO,
  type SentidoDeDeuda,
} from "@gestoria/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  History,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  type Deuda,
  type EstadoDeDeuda,
  eliminarDeuda,
  eliminarPago,
  nombreDeLaDeuda,
  obtenerDeuda,
  obtenerDeudas,
  obtenerResumenDeDeudas,
  type TotalPorMoneda,
  totalesEnPalabras,
} from "@/lib/api-deudas";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { FormularioDeDeuda, FormularioDePago, FormularioEditarDeuda } from "./formulario-de-deuda";
import { AvatarDeLaDeuda, QuienDeLaDeuda } from "./quien-de-la-deuda";

const POR_PAGINA = 20;

const ESTADOS = [
  { valor: "pendientes", etiqueta: "Pendientes" },
  { valor: "saldadas", etiqueta: "Saldadas" },
  { valor: "todas", etiqueta: "Todas" },
] as const;

const SENTIDOS = [
  { valor: "", etiqueta: "Todas" },
  { valor: "me_deben", etiqueta: "Me deben" },
  { valor: "debo", etiqueta: "Debo" },
] as const;

/** Qué diálogo está abierto. Uno solo a la vez. */
type Dialogos =
  | { tipo: "nueva" }
  | { tipo: "pago"; deuda: Deuda }
  | { tipo: "editar"; deuda: Deuda }
  | { tipo: "eliminar"; deuda: Deuda };

function ResumenDeTotales() {
  const { data } = useQuery({
    queryKey: ["finanzas", "deudas", "resumen"],
    queryFn: obtenerResumenDeDeudas,
  });
  if (!data) return null;

  const tarjeta = (titulo: string, Icono: typeof ArrowDownLeft, totales: TotalPorMoneda[]) => (
    <Tarjeta className="flex items-center gap-3 p-4">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-acento-suave text-acento-suave-texto"
      >
        <Icono className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-texto-secundario">{titulo}</p>
        <p className="numeros-tabulares break-words text-lg font-semibold text-texto">
          {totales.length === 0 ? "Nada" : totalesEnPalabras(totales)}
        </p>
      </div>
    </Tarjeta>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tarjeta("Te deben", ArrowDownLeft, data.meDeben)}
      {tarjeta("Debés", ArrowUpRight, data.debo)}
    </div>
  );
}

function DetalleDePagos({ deuda }: { deuda: Deuda }) {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "deudas", "detalle", deuda.id],
    queryFn: () => obtenerDeuda(deuda.id),
  });
  const [aQuitar, setAQuitar] = useState<string | null>(null);

  const quitar = useMutation({
    mutationFn: (pagoId: string) => eliminarPago(deuda.id, pagoId),
    onSuccess: async () => {
      setAQuitar(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finanzas"] }),
        queryClient.invalidateQueries({ queryKey: ["contactos"] }),
      ]);
    },
  });

  if (isPending) return <div className="h-10 animate-pulse rounded-control bg-superficie-suave" />;
  if (error) return <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>;
  if (data.pagos.length === 0) {
    return <p className="text-sm text-texto-secundario">Todavía no hay pagos registrados.</p>;
  }

  return (
    <>
      <ul className="flex flex-col divide-y divide-borde">
        {data.pagos.map((pago) => (
          <li key={pago.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="flex min-w-0 flex-col">
              <span className="numeros-tabulares text-texto">
                {formatearMonto(pago.montoCentavos, deuda.moneda)}{" "}
                <span className="text-texto-secundario">
                  · {formatearDiaDeCalendario(pago.fecha)}
                </span>
              </span>
              {pago.movimiento ? (
                <span className="text-xs text-texto-secundario">
                  Generó {pago.movimiento.tipo === "ingreso" ? "un ingreso en" : "un gasto desde"}{" "}
                  {pago.movimiento.cuenta}
                </span>
              ) : null}
            </span>
            {aQuitar === pago.id ? (
              <span className="flex flex-wrap items-center justify-end gap-1">
                <span className="text-xs text-texto-secundario">
                  {pago.movimiento
                    ? `¿Quitar? Se elimina también su ${pago.movimiento.tipo === "ingreso" ? "ingreso" : "gasto"}.`
                    : "¿Quitar?"}
                </span>
                <Boton tamano="chico" variante="sutil" onClick={() => setAQuitar(null)}>
                  No
                </Boton>
                <Boton
                  tamano="chico"
                  variante="peligro"
                  cargando={quitar.isPending}
                  textoCargando="Quitando"
                  onClick={() => quitar.mutate(pago.id)}
                >
                  Sí
                </Boton>
              </span>
            ) : (
              <Boton
                tamano="chico"
                variante="sutil"
                aria-label={`Quitar el pago de ${formatearMonto(pago.montoCentavos, deuda.moneda)}`}
                onClick={() => setAQuitar(pago.id)}
              >
                <Trash2 aria-hidden="true" className="size-4 text-peligro" />
              </Boton>
            )}
          </li>
        ))}
      </ul>
      {quitar.isError ? (
        <Aviso tono="peligro">{interpretarError(quitar.error).mensaje}</Aviso>
      ) : null}
    </>
  );
}

/** Una deuda: con quién, de qué, cuánto falta y las acciones. */
export function FilaDeDeuda({
  deuda,
  alPagar,
  alEditar,
  alEliminar,
}: {
  deuda: Deuda;
  alPagar: () => void;
  alEditar: () => void;
  alEliminar: () => void;
}) {
  const [verPagos, setVerPagos] = useState(false);
  const esCobro = deuda.sentido === "me_deben";
  const avance = Math.min(100, Math.round((deuda.pagadoCentavos / deuda.montoCentavos) * 100));

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-start gap-3">
        <AvatarDeLaDeuda deuda={deuda} />
        <div className="min-w-0 flex-1">
          <p className="break-words font-medium text-texto">{deuda.concepto}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-texto-secundario">
            <QuienDeLaDeuda deuda={deuda} />
            <span>· desde {formatearDiaDeCalendario(deuda.fecha)}</span>
            {deuda.fechaLimite ? (
              <span>· vence el {formatearDiaDeCalendario(deuda.fechaLimite)}</span>
            ) : null}
          </p>
        </div>
        <Insignia
          tono={deuda.saldada ? "exito" : esCobro ? "info" : "advertencia"}
          icono={esCobro ? ArrowDownLeft : ArrowUpRight}
        >
          {deuda.saldada ? "Saldada" : NOMBRES_DE_SENTIDO[deuda.sentido]}
        </Insignia>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="numeros-tabulares font-semibold text-texto">
            {deuda.saldada
              ? formatearMonto(deuda.montoCentavos, deuda.moneda)
              : `Falta ${formatearMonto(deuda.pendienteCentavos, deuda.moneda)}`}
          </span>
          <span className="numeros-tabulares text-texto-secundario">
            {deuda.saldada
              ? "pagada completa"
              : `de ${formatearMonto(deuda.montoCentavos, deuda.moneda)}`}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={avance}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Pagado ${avance} %`}
          className="h-2 overflow-hidden rounded-full bg-superficie-suave"
        >
          <div
            className={cn("h-full rounded-full", deuda.saldada ? "bg-exito" : "bg-acento")}
            style={{ width: `${avance}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {deuda.saldada ? null : (
          <Boton tamano="chico" variante="secundario" onClick={alPagar}>
            <HandCoins aria-hidden="true" className="size-4" />
            {esCobro ? "Registrar cobro" : "Registrar pago"}
          </Boton>
        )}
        <Boton
          tamano="chico"
          variante="sutil"
          aria-expanded={verPagos}
          onClick={() => setVerPagos((actual) => !actual)}
        >
          <History aria-hidden="true" className="size-4" />
          {verPagos ? "Ocultar pagos" : "Ver pagos"}
        </Boton>
        <Boton
          tamano="chico"
          variante="sutil"
          aria-label={`Editar ${deuda.concepto}`}
          onClick={alEditar}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Boton>
        <Boton
          tamano="chico"
          variante="sutil"
          aria-label={`Eliminar ${deuda.concepto}`}
          onClick={alEliminar}
        >
          <Trash2 aria-hidden="true" className="size-4 text-peligro" />
        </Boton>
      </div>

      {verPagos ? <DetalleDePagos deuda={deuda} /> : null}
    </li>
  );
}

export function DeudasDeFinanzas() {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<EstadoDeDeuda>("pendientes");
  const [sentido, setSentido] = useState<SentidoDeDeuda | "">("");
  const [pagina, setPagina] = useState(0);
  const [dialogo, setDialogo] = useState<Dialogos | null>(null);

  const filtros = { estado, sentido: sentido === "" ? undefined : sentido };
  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "deudas", "lista", { ...filtros, pagina }],
    queryFn: () => obtenerDeudas({ ...filtros, limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => eliminarDeuda(id),
    onSuccess: async () => {
      setDialogo(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["finanzas"] }),
        queryClient.invalidateQueries({ queryKey: ["contactos"] }),
      ]);
    },
  });

  function alCerrarseEl(tipo: Dialogos["tipo"]) {
    return () => setDialogo((actual) => (actual?.tipo === tipo ? null : actual));
  }
  const cerrar = () => setDialogo(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-texto">Deudas y préstamos</h2>
        <Boton tamano="chico" variante="secundario" onClick={() => setDialogo({ tipo: "nueva" })}>
          <Plus aria-hidden="true" className="size-4" />
          Nueva deuda
        </Boton>
      </div>

      <ResumenDeTotales />

      <Tarjeta className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <SelectorDeSegmentos
          id="estado-de-deudas"
          etiqueta="Estado de las deudas"
          modo="filtro"
          segmentos={ESTADOS}
          activo={estado}
          onCambiar={(valor) => {
            setEstado(valor);
            setPagina(0);
          }}
          className="sm:flex-1 [&>button]:px-2 sm:[&>button]:px-4"
        />
        <SelectorDeSegmentos
          id="sentido-de-las-deudas"
          etiqueta="Quién debe"
          modo="filtro"
          segmentos={SENTIDOS}
          activo={sentido}
          onCambiar={(valor) => {
            setSentido(valor);
            setPagina(0);
          }}
          className="sm:flex-1 [&>button]:px-2 sm:[&>button]:px-4"
        />
      </Tarjeta>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando deudas</span>
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : data.deudas.length === 0 ? (
        <Tarjeta className="flex flex-col items-center gap-3 p-8 text-center">
          <HandCoins aria-hidden="true" className="size-8 text-texto-secundario" />
          {estado === "pendientes" && sentido === "" ? (
            <>
              <h3 className="text-base font-medium text-texto">No tenés deudas pendientes</h3>
              <p className="max-w-md text-sm text-texto-secundario">
                Anotá la plata que le prestaste a alguien o la que le debés, y andá marcando los
                pagos hasta saldarla. No cambia tus cuentas ni tus totales.
              </p>
              <Boton onClick={() => setDialogo({ tipo: "nueva" })}>
                <Plus aria-hidden="true" className="size-4" />
                Registrar una deuda
              </Boton>
            </>
          ) : (
            <p className="text-sm text-texto-secundario">
              No hay deudas que coincidan con el filtro.
            </p>
          )}
        </Tarjeta>
      ) : (
        <Tarjeta>
          <ul className="flex flex-col divide-y divide-borde">
            {data.deudas.map((deuda) => (
              <FilaDeDeuda
                key={deuda.id}
                deuda={deuda}
                alPagar={() => setDialogo({ tipo: "pago", deuda })}
                alEditar={() => setDialogo({ tipo: "editar", deuda })}
                alEliminar={() => {
                  eliminar.reset();
                  setDialogo({ tipo: "eliminar", deuda });
                }}
              />
            ))}
          </ul>
        </Tarjeta>
      )}

      {data && data.total > POR_PAGINA ? (
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
              onClick={() => setPagina((actual) => actual - 1)}
            >
              Anterior
            </Boton>
            <Boton
              tamano="chico"
              variante="sutil"
              disabled={(pagina + 1) * POR_PAGINA >= data.total}
              onClick={() => setPagina((actual) => actual + 1)}
            >
              Siguiente
            </Boton>
          </div>
        </div>
      ) : null}

      <Dialogo
        abierto={dialogo?.tipo === "nueva"}
        onCerrar={alCerrarseEl("nueva")}
        titulo="Nueva deuda"
        icono={HandCoins}
      >
        {dialogo?.tipo === "nueva" ? <FormularioDeDeuda cerrar={cerrar} /> : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "pago"}
        onCerrar={alCerrarseEl("pago")}
        titulo={
          dialogo?.tipo === "pago" && dialogo.deuda.sentido === "me_deben"
            ? "Registrar cobro"
            : "Registrar pago"
        }
        icono={HandCoins}
      >
        {dialogo?.tipo === "pago" ? (
          <FormularioDePago deuda={dialogo.deuda} cerrar={cerrar} />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "editar"}
        onCerrar={alCerrarseEl("editar")}
        titulo="Editar deuda"
        icono={Pencil}
      >
        {dialogo?.tipo === "editar" ? (
          <FormularioEditarDeuda deuda={dialogo.deuda} cerrar={cerrar} />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "eliminar"}
        onCerrar={alCerrarseEl("eliminar")}
        titulo="Eliminar deuda"
        icono={Trash2}
        tono="peligro"
      >
        {dialogo?.tipo === "eliminar" ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina “{dialogo.deuda.concepto}” con {nombreDeLaDeuda(dialogo.deuda)}
              {dialogo.deuda.pendienteCentavos > 0
                ? `, que todavía tiene ${formatearMonto(dialogo.deuda.pendienteCentavos, dialogo.deuda.moneda)} pendientes`
                : ""}
              . Con sus pagos, deja de aparecer en tus listas y totales.
            </p>
            {eliminar.isError ? (
              <Aviso tono="peligro">{interpretarError(eliminar.error).mensaje}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={cerrar}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate(dialogo.deuda.id)}
              >
                Eliminar
              </Boton>
            </div>
          </>
        ) : null}
      </Dialogo>
    </div>
  );
}

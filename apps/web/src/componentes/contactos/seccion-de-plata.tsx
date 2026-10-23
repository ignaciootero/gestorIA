// "Plata" en la ficha de un contacto: lo que se gastó y cobró con él (movimientos de Finanzas
// cargados con este contacto) y las deudas pendientes, con la posibilidad de registrar una deuda
// nueva o un pago sin salir de la ficha.
//
// Las deudas son un registro aparte de los movimientos (no mueven los saldos de las cuentas); se
// administran por completo —editar, eliminar, ver los pagos— en Finanzas, pestaña Deudas. Acá
// solo se ve lo pendiente y se registra lo más frecuente.

"use client";

import {
  formatearDiaDeCalendario,
  formatearFechaHora,
  formatearMonto,
  NOMBRES_DE_SENTIDO,
  nombreCompletoDeContacto,
} from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, Plus } from "lucide-react";
import { useState } from "react";
import { FormularioDeDeuda, FormularioDePago } from "@/componentes/finanzas/formulario-de-deuda";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import { type Contacto, obtenerFinanzasDeContacto } from "@/lib/api-contactos";
import type { Deuda } from "@/lib/api-deudas";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";

type Formulario = { tipo: "deuda" } | { tipo: "pago"; deuda: Deuda } | null;

export function SeccionDePlata({ contacto }: { contacto: Contacto }) {
  const { data, isPending, error } = useQuery({
    queryKey: ["contactos", "finanzas", contacto.id],
    queryFn: () => obtenerFinanzasDeContacto(contacto.id),
  });
  const [formulario, setFormulario] = useState<Formulario>(null);

  const nombre = nombreCompletoDeContacto(contacto);

  return (
    <section aria-labelledby="plata-del-contacto" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="plata-del-contacto" className="text-sm font-medium text-texto">
          Plata
        </h3>
        {formulario === null ? (
          <Boton
            tamano="chico"
            variante="secundario"
            onClick={() => setFormulario({ tipo: "deuda" })}
          >
            <Plus aria-hidden="true" className="size-4" />
            Registrar deuda
          </Boton>
        ) : null}
      </div>

      {formulario?.tipo === "deuda" ? (
        <div className="rounded-control border border-borde bg-superficie-suave p-3">
          <FormularioDeDeuda
            contactoFijo={{ id: contacto.id, nombre }}
            cerrar={() => setFormulario(null)}
          />
        </div>
      ) : null}

      {formulario?.tipo === "pago" ? (
        <div className="rounded-control border border-borde bg-superficie-suave p-3">
          <FormularioDePago deuda={formulario.deuda} cerrar={() => setFormulario(null)} />
        </div>
      ) : null}

      {isPending ? (
        <div aria-busy="true" aria-live="polite">
          <span className="solo-lectores">Cargando la plata de este contacto</span>
          <div className="h-12 animate-pulse rounded-control bg-superficie-suave" />
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : (
        <>
          {data.deudas.pendientes.length > 0 ? (
            <ul className="flex flex-col divide-y divide-borde">
              {data.deudas.pendientes.map((deuda) => (
                <li key={deuda.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-texto">{deuda.concepto}</p>
                    <p className="numeros-tabulares text-xs text-texto-secundario">
                      {deuda.sentido === "me_deben" ? "Te debe" : "Le debés"}{" "}
                      <span className="font-medium text-texto">
                        {formatearMonto(deuda.pendienteCentavos, deuda.moneda)}
                      </span>{" "}
                      de {formatearMonto(deuda.montoCentavos, deuda.moneda)} · desde{" "}
                      {formatearDiaDeCalendario(deuda.fecha)}
                      {deuda.fechaLimite
                        ? ` · vence el ${formatearDiaDeCalendario(deuda.fechaLimite)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Insignia tono={deuda.sentido === "me_deben" ? "info" : "advertencia"}>
                      {NOMBRES_DE_SENTIDO[deuda.sentido]}
                    </Insignia>
                    <Boton
                      tamano="chico"
                      variante="secundario"
                      aria-label={`${deuda.sentido === "me_deben" ? "Registrar cobro" : "Registrar pago"} de ${deuda.concepto}`}
                      onClick={() => setFormulario({ tipo: "pago", deuda })}
                    >
                      <HandCoins aria-hidden="true" className="size-4" />
                      {deuda.sentido === "me_deben" ? "Cobro" : "Pago"}
                    </Boton>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {data.deudas.saldadas > 0 ? (
            <p className="text-xs text-texto-secundario">
              {data.deudas.saldadas === 1
                ? "1 deuda ya saldada."
                : `${data.deudas.saldadas} deudas ya saldadas.`}{" "}
              Se ven en Finanzas, pestaña Deudas.
            </p>
          ) : null}

          {data.movimientos.cantidad > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-texto">
                {data.movimientos.cantidad === 1
                  ? "1 movimiento"
                  : `${data.movimientos.cantidad} movimientos`}
                {": "}
                {data.movimientos.gastosCentavos > 0
                  ? `gastaste ${formatearMonto(data.movimientos.gastosCentavos, data.monedaBase)}`
                  : ""}
                {data.movimientos.gastosCentavos > 0 && data.movimientos.ingresosCentavos > 0
                  ? " y "
                  : ""}
                {data.movimientos.ingresosCentavos > 0
                  ? `cobraste ${formatearMonto(data.movimientos.ingresosCentavos, data.monedaBase)}`
                  : ""}
                .
              </p>
              <ul className="flex flex-col divide-y divide-borde">
                {data.movimientos.recientes.map((movimiento) => (
                  <li
                    key={movimiento.id}
                    className="flex items-center justify-between gap-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-texto">{movimiento.descripcion}</span>
                      <span className="block text-xs text-texto-secundario">
                        {formatearFechaHora(movimiento.fecha, zonaDelDispositivo())}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "numeros-tabulares shrink-0 font-medium",
                        movimiento.tipo === "ingreso" ? "text-exito" : "text-texto",
                      )}
                    >
                      {movimiento.tipo === "ingreso" ? "+" : "−"}
                      {formatearMonto(
                        movimiento.importeCentavos,
                        movimiento.cuentaFinanciera.moneda,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.deudas.pendientes.length === 0 &&
          data.deudas.saldadas === 0 &&
          data.movimientos.cantidad === 0 &&
          formulario === null ? (
            <p className="text-sm text-texto-secundario">
              Todavía no hay plata registrada con este contacto. Al cargar un movimiento en Finanzas
              podés elegirlo en “Con quién”, y acá registrás lo que te deben o debés.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

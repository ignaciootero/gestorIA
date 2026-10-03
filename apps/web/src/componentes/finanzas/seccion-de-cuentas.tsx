// Sección de cuentas de la pestaña "Cuentas": crear, renombrar, actualizar el
// saldo, ver el historial, ocultar y eliminar.
//
// - "Actualizar saldo" es la carga manual ("hoy tengo $X"): NO genera un
//   movimiento y queda en el historial de la cuenta como un ajuste.
// - Una cuenta con movimientos no se puede eliminar: se oculta, para que no se
//   ofrezca al cargar un movimiento nuevo (conserva su saldo y su historial).
//   Sin movimientos sí se puede eliminar.

"use client";

import {
  centavosDesdeImporte,
  esquemaAjusteDeSaldo,
  formatearMonto,
  MONEDA_POR_DEFECTO,
} from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  ChevronDown,
  Eye,
  EyeOff,
  History,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { CampoDeImporte } from "@/componentes/ui/campo-de-importe";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  ajustarSaldoDeCuenta,
  type CuentaFinanciera,
  eliminarCuenta,
  mostrarCuenta,
  obtenerCuentas,
  ocultarCuenta,
} from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";
import { FormularioCuenta } from "./formulario-de-cuenta";
import { FormularioMovimiento } from "./formulario-movimiento";
import { HistorialDeCuenta } from "./historial-de-cuenta";
import { Saldo } from "./saldo";

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

// --- Actualizar saldo ---

function FormularioAjusteDeSaldo({
  cuenta,
  moneda,
  cerrar,
}: {
  cuenta: CuentaFinanciera;
  moneda: string;
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();

  // Mismo esquema que valida la API, más el aviso de "no cambia nada" antes de
  // mandar el pedido.
  const esquema = esquemaAjusteDeSaldo.superRefine((datos, contexto) => {
    if (centavosDesdeImporte(datos.saldo) === cuenta.saldoCentavos) {
      contexto.addIssue({
        code: "custom",
        path: ["saldo"],
        message: "Ese ya es el saldo de la cuenta: no hay nada que ajustar.",
      });
    }
  });

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<{ saldo: number }>({
    resolver: zodResolver(esquema),
    defaultValues: { saldo: cuenta.saldoCentavos / 100 },
  });

  const mutacion = useMutation({
    mutationFn: (datos: { saldo: number }) => ajustarSaldoDeCuenta(cuenta.id, datos.saldo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      cerrar();
    },
  });

  // Cuánto cambia el saldo con lo que está escrito, para que se vea antes de guardar.
  const escrito = watch("saldo");
  const diferencia = Number.isFinite(escrito)
    ? centavosDesdeImporte(escrito) - cuenta.saldoCentavos
    : 0;

  return (
    <form
      onSubmit={handleSubmit((datos) => mutacion.mutate(datos))}
      noValidate
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-texto-secundario">
        Escribí cuánta plata tenés hoy en{" "}
        <span className="font-medium text-texto">{cuenta.nombre}</span>. No se registra como ingreso
        ni como gasto y no cuenta en ningún período: queda en el historial de la cuenta como un
        ajuste manual.
      </p>

      <Controller
        control={control}
        name="saldo"
        render={({ field }) => (
          <CampoDeImporte
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            permitirNegativo
            etiqueta="Saldo actual"
            autoFocus
            ayuda={
              diferencia === 0 ? (
                <>
                  Ahora la cuenta muestra <Saldo centavos={cuenta.saldoCentavos} moneda={moneda} />.
                </>
              ) : (
                <>
                  Ahora muestra <Saldo centavos={cuenta.saldoCentavos} moneda={moneda} />: el ajuste{" "}
                  {diferencia > 0 ? "suma" : "resta"} {formatearMonto(Math.abs(diferencia), moneda)}
                  .
                </>
              )
            }
            error={errors.saldo?.message}
          />
        )}
      />

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cerrar}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={isSubmitting || mutacion.isPending}
          textoCargando="Guardando"
        >
          Guardar saldo
        </Boton>
      </div>
    </form>
  );
}

// --- Sección ---

type AccionesDeCuenta = {
  onAjustar: (cuenta: CuentaFinanciera) => void;
  onHistorial: (cuenta: CuentaFinanciera) => void;
  onEditar: (cuenta: CuentaFinanciera) => void;
  onEliminar: (cuenta: CuentaFinanciera) => void;
  onMostrar: (cuenta: CuentaFinanciera) => void;
  /** Cuenta que se está volviendo a mostrar ahora, para mostrarle el indicador de carga. */
  cambiando: string | undefined;
};

function FilaDeCuenta({
  cuenta,
  moneda,
  acciones,
}: {
  cuenta: CuentaFinanciera;
  moneda: string;
  acciones: AccionesDeCuenta;
}) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-texto">{cuenta.nombre}</p>
        <p
          className={cn(
            "text-xs tabular-nums",
            cuenta.saldoCentavos < 0 ? "font-medium" : "text-texto-secundario",
          )}
        >
          <Saldo centavos={cuenta.saldoCentavos} moneda={moneda} />
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        <Boton
          tamano="chico"
          variante="secundario"
          aria-label={`Actualizar saldo de ${cuenta.nombre}`}
          onClick={() => acciones.onAjustar(cuenta)}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Actualizar saldo
        </Boton>
        <Boton
          tamano="chico"
          variante="sutil"
          aria-label={`Ver historial de ${cuenta.nombre}`}
          title="Historial"
          onClick={() => acciones.onHistorial(cuenta)}
        >
          <History aria-hidden="true" className="size-4" />
        </Boton>
        <Boton
          tamano="chico"
          variante="sutil"
          aria-label={`Editar ${cuenta.nombre}`}
          title="Cambiar el nombre"
          onClick={() => acciones.onEditar(cuenta)}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Boton>
        {cuenta.oculta ? (
          <Boton
            tamano="chico"
            variante="sutil"
            aria-label={`Mostrar ${cuenta.nombre}`}
            title="Volver a mostrarla"
            cargando={acciones.cambiando === cuenta.id}
            onClick={() => acciones.onMostrar(cuenta)}
          >
            <Eye aria-hidden="true" className="size-4" />
          </Boton>
        ) : null}
        {/* Para todas las cuentas: si tiene movimientos, el botón explica por qué no
            se puede eliminar y ofrece ocultarla (ver SeccionDeCuentas). */}
        <Boton
          tamano="chico"
          variante="sutil"
          aria-label={`Eliminar ${cuenta.nombre}`}
          title="Eliminarla"
          onClick={() => acciones.onEliminar(cuenta)}
        >
          <Trash2 aria-hidden="true" className="size-4 text-peligro" />
        </Boton>
      </div>
    </li>
  );
}

export function SeccionDeCuentas() {
  const queryClient = useQueryClient();
  const { data: sesion } = useSession();
  const moneda = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;

  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "cuentas"],
    queryFn: obtenerCuentas,
  });

  const [formulario, setFormulario] = useState<"nueva" | CuentaFinanciera | null>(null);
  const [aAjustar, setAAjustar] = useState<CuentaFinanciera | null>(null);
  const [historialDe, setHistorialDe] = useState<CuentaFinanciera | null>(null);
  const [aEliminar, setAEliminar] = useState<CuentaFinanciera | null>(null);
  const [transfiriendo, setTransfiriendo] = useState(false);
  // Cuenta que se quiso eliminar pero tiene movimientos: se explica y se ofrece ocultarla.
  const [noEliminable, setNoEliminable] = useState<CuentaFinanciera | null>(null);
  // La sección de cuentas ocultas arranca cerrada: se abre a mano.
  const [ocultasAbiertas, setOcultasAbiertas] = useState(false);

  const eliminar = useMutation({
    mutationFn: eliminarCuenta,
    onSuccess: () => {
      setAEliminar(null);
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
    },
  });

  // Ocultar y volver a mostrar son reversibles, así que no piden confirmación.
  const visibilidad = useMutation({
    mutationFn: (cuenta: CuentaFinanciera) =>
      cuenta.oculta ? mostrarCuenta(cuenta.id) : ocultarCuenta(cuenta.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["finanzas"] }),
  });

  const acciones: AccionesDeCuenta = {
    onAjustar: setAAjustar,
    onHistorial: setHistorialDe,
    onEditar: setFormulario,
    // Una cuenta con movimientos no se puede eliminar: en vez de borrarla, se explica.
    onEliminar: (cuenta) =>
      cuenta.tieneMovimientos ? setNoEliminable(cuenta) : setAEliminar(cuenta),
    onMostrar: (cuenta) => visibilidad.mutate(cuenta),
    cambiando:
      visibilidad.isPending && visibilidad.variables?.oculta ? visibilidad.variables.id : undefined,
  };

  const activas = data?.cuentas.filter((cuenta) => !cuenta.oculta) ?? [];
  const ocultas = data?.cuentas.filter((cuenta) => cuenta.oculta) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-texto">Cuentas</h2>
          <div className="flex gap-2">
            {/* Transferir entre cuentas necesita al menos dos cuentas activas. */}
            {activas.length >= 2 ? (
              <Boton tamano="chico" variante="secundario" onClick={() => setTransfiriendo(true)}>
                <ArrowLeftRight aria-hidden="true" className="size-4" />
                Transferir
              </Boton>
            ) : null}
            <Boton tamano="chico" variante="secundario" onClick={() => setFormulario("nueva")}>
              <Plus aria-hidden="true" className="size-4" />
              Nueva
            </Boton>
          </div>
        </div>

        {isPending ? (
          <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
            <span className="solo-lectores">Cargando cuentas</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-control bg-superficie-suave" />
            ))}
          </div>
        ) : error ? (
          <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
        ) : activas.length === 0 ? (
          <p className="py-4 text-center text-sm text-texto-secundario">
            {ocultas.length === 0 ? "Todavía no tenés cuentas." : "No tenés cuentas activas."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-borde">
            {activas.map((cuenta) => (
              <FilaDeCuenta key={cuenta.id} cuenta={cuenta} moneda={moneda} acciones={acciones} />
            ))}
          </ul>
        )}

        {visibilidad.isError && noEliminable === null ? (
          <Aviso tono="peligro">{mensajeDe(visibilidad.error)}</Aviso>
        ) : null}
      </Tarjeta>

      {/* Solo existe si hay alguna cuenta oculta (ni siquiera cerrada si no hay), y
          arranca cerrada. Conservan su saldo (que suma al disponible) y su historial,
          pero no se ofrecen al cargar movimientos nuevos. */}
      {ocultas.length > 0 ? (
        <Tarjeta className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-medium text-texto">
            <button
              type="button"
              aria-expanded={ocultasAbiertas}
              aria-controls="cuentas-ocultas"
              onClick={() => setOcultasAbiertas((abiertas) => !abiertas)}
              className="flex w-full items-center justify-between gap-2 rounded-control text-left focus-visible:shadow-(--anillo-foco) focus-visible:outline-none"
            >
              <span className="flex items-center gap-2">
                <EyeOff aria-hidden="true" className="size-4 text-texto-secundario" />
                Cuentas ocultas ({ocultas.length})
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 text-texto-secundario transition-transform duration-(--duracion-rapida)",
                  ocultasAbiertas && "rotate-180",
                )}
              />
            </button>
          </h2>
          {ocultasAbiertas ? (
            <ul id="cuentas-ocultas" className="flex flex-col divide-y divide-borde">
              {ocultas.map((cuenta) => (
                <FilaDeCuenta key={cuenta.id} cuenta={cuenta} moneda={moneda} acciones={acciones} />
              ))}
            </ul>
          ) : null}
        </Tarjeta>
      ) : null}

      <Dialogo
        abierto={formulario !== null}
        onCerrar={() => setFormulario(null)}
        titulo={formulario === "nueva" ? "Nueva cuenta" : "Editar cuenta"}
        icono={formulario === "nueva" ? Plus : Pencil}
      >
        {formulario !== null ? (
          <FormularioCuenta
            cuenta={formulario === "nueva" ? undefined : formulario}
            cerrar={() => setFormulario(null)}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={transfiriendo}
        onCerrar={() => setTransfiriendo(false)}
        titulo="Transferir entre cuentas"
        icono={ArrowLeftRight}
        tono="advertencia"
      >
        {transfiriendo ? (
          <FormularioMovimiento soloTransferencia cerrar={() => setTransfiriendo(false)} />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={aAjustar !== null}
        onCerrar={() => setAAjustar(null)}
        titulo="Actualizar saldo"
        icono={SlidersHorizontal}
      >
        {aAjustar ? (
          <FormularioAjusteDeSaldo
            cuenta={aAjustar}
            moneda={moneda}
            cerrar={() => setAAjustar(null)}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={historialDe !== null}
        onCerrar={() => setHistorialDe(null)}
        titulo={historialDe ? `Historial de ${historialDe.nombre}` : "Historial"}
        icono={History}
        className="max-w-xl"
      >
        {historialDe ? <HistorialDeCuenta cuenta={historialDe} /> : null}
        <div className="flex justify-end">
          <Boton variante="sutil" onClick={() => setHistorialDe(null)}>
            Cerrar
          </Boton>
        </div>
      </Dialogo>

      <Dialogo
        abierto={noEliminable !== null}
        onCerrar={() => setNoEliminable(null)}
        titulo="No se puede eliminar"
        icono={EyeOff}
        tono="advertencia"
      >
        {noEliminable ? (
          <>
            <p className="text-sm text-texto-secundario">
              "{noEliminable.nombre}" tiene movimientos, así que no se puede eliminar.
              {noEliminable.oculta
                ? " Ya está oculta: no te aparece como cuenta disponible al cargar movimientos, y conserva su saldo y su historial."
                : " Si no querés usarla más, podés ocultarla: no te va a aparecer como cuenta disponible al cargar movimientos nuevos, y conserva su saldo y su historial."}
            </p>
            {visibilidad.isError ? (
              <Aviso tono="peligro">{mensajeDe(visibilidad.error)}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => setNoEliminable(null)}>
                {noEliminable.oculta ? "Entendido" : "Cancelar"}
              </Boton>
              {noEliminable.oculta ? null : (
                <Boton
                  cargando={visibilidad.isPending}
                  textoCargando="Ocultando"
                  onClick={() =>
                    visibilidad.mutate(noEliminable, { onSuccess: () => setNoEliminable(null) })
                  }
                >
                  <EyeOff aria-hidden="true" className="size-4" />
                  Ocultar cuenta
                </Boton>
              )}
            </div>
          </>
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={aEliminar !== null}
        onCerrar={() => setAEliminar(null)}
        titulo="Eliminar cuenta"
        icono={Trash2}
        tono="peligro"
      >
        {aEliminar ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina "{aEliminar.nombre}". No tiene movimientos, así que no se pierde ningún
              gasto ni ingreso.
              {aEliminar.saldoCentavos !== 0 ? (
                <>
                  {" "}
                  Su saldo de <Saldo centavos={aEliminar.saldoCentavos} moneda={moneda} /> deja de
                  sumar al disponible.
                </>
              ) : null}{" "}
              Su historial de ajustes también deja de verse.
            </p>
            {eliminar.isError ? <Aviso tono="peligro">{mensajeDe(eliminar.error)}</Aviso> : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => setAEliminar(null)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate(aEliminar.id)}
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

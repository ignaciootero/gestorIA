// Formulario para crear una cuenta o renombrar una existente. Lo usan el panel de
// cuentas y el formulario de movimientos (que lo ofrece cuando no hay ninguna
// cuenta disponible para cargar el movimiento).

"use client";

import {
  esquemaMoneda,
  esquemaNombreCuentaFinanciera,
  esquemaSaldoInicial,
  MONEDA_POR_DEFECTO,
  MONEDAS_ADMITIDAS,
} from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { CampoDeImporte } from "@/componentes/ui/campo-de-importe";
import { Selector } from "@/componentes/ui/selector";
import { type CuentaFinanciera, crearCuenta, renombrarCuenta } from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

// Esquema propio del formulario, sin `.default()` (mismo motivo que el de
// categorías: `exactOptionalPropertyTypes` al tipar `useForm`).
const esquemaFormularioCuenta = z.object({
  nombre: esquemaNombreCuentaFinanciera,
  saldoInicial: esquemaSaldoInicial,
  moneda: esquemaMoneda,
});
type DatosFormularioCuenta = z.infer<typeof esquemaFormularioCuenta>;

export function FormularioCuenta({
  cuenta,
  cerrar,
}: {
  /** Si viene, solo se cambia el nombre: el saldo se actualiza con "Actualizar saldo". */
  cuenta?: CuentaFinanciera | undefined;
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: sesion } = useSession();
  const monedaBase = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DatosFormularioCuenta>({
    resolver: zodResolver(esquemaFormularioCuenta),
    defaultValues: {
      nombre: cuenta?.nombre ?? "",
      saldoInicial: 0,
      moneda: (cuenta?.moneda ?? monedaBase) as DatosFormularioCuenta["moneda"],
    },
  });

  const mutacion = useMutation({
    mutationFn: (datos: DatosFormularioCuenta) =>
      cuenta
        ? renombrarCuenta(cuenta.id, datos.nombre)
        : crearCuenta(datos.nombre, datos.saldoInicial, datos.moneda),
    // Se espera a que las listas se refresquen antes de cerrar: quien lo abre desde
    // otro formulario (movimientos) ya ve la cuenta nueva cuando vuelve.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      cerrar();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((datos) => mutacion.mutate(datos))}
      noValidate
      className="flex flex-col gap-4"
    >
      <Campo {...register("nombre")} etiqueta="Nombre" autoFocus error={errors.nombre?.message} />

      {cuenta ? null : (
        <Selector {...register("moneda")} etiqueta="Moneda" error={errors.moneda?.message}>
          {MONEDAS_ADMITIDAS.map((moneda) => (
            <option key={moneda.codigo} value={moneda.codigo}>
              {moneda.nombre} ({moneda.codigo})
            </option>
          ))}
        </Selector>
      )}

      {cuenta ? null : (
        <Controller
          control={control}
          name="saldoInicial"
          render={({ field }) => (
            <CampoDeImporte
              ref={field.ref}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              permitirNegativo
              moneda={watch("moneda")}
              etiqueta="Saldo inicial"
              ayuda="Lo que tenés hoy en esta cuenta, en su moneda. Después lo podés actualizar con “Actualizar saldo”, y queda en el historial de la cuenta. La moneda no se puede cambiar una vez creada."
              error={errors.saldoInicial?.message}
            />
          )}
        />
      )}

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
          {cuenta ? "Guardar cambios" : "Crear cuenta"}
        </Boton>
      </div>
    </form>
  );
}

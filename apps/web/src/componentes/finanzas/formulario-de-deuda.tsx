// Formularios de una deuda: registrar una nueva, editarla y registrar un pago (o cobro).
//
// Una deuda es un registro aparte de los movimientos: no mueve los saldos de las cuentas ni entra
// en los totales (se dice en el propio formulario, para que nadie espere lo contrario).
// Se define con quién (un contacto, o solo un nombre escrito a mano), el sentido ("me deben" o
// "debo"), de qué es, el monto, la moneda y el día.
//
// Los tres validan con los mismos esquemas que el servidor (@gestoria/shared). Se usan en
// la pestaña Deudas de Finanzas (en diálogos) y en la ficha del contacto (en línea, con el
// contacto ya fijado).

"use client";

import {
  avisoDeFechaLimite,
  avisosDeConQuien,
  centavosDesdeImporte,
  diaDeHoy,
  esquemaDeuda,
  esquemaEditarDeuda,
  esquemaPagoDeDeuda,
  formatearMonto,
  importeDesdeCentavos,
  instanteDelDia,
  LARGO_MAXIMO_NOMBRE_LIBRE_DE_DEUDA,
  MONEDA_POR_DEFECTO,
  MONEDAS_ADMITIDAS,
  NOMBRES_DE_SENTIDO,
  nombreCompletoDeContacto,
  SENTIDOS_DE_DEUDA_VALIDOS,
  type SentidoDeDeuda,
} from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { CampoDeImporte } from "@/componentes/ui/campo-de-importe";
import { Casilla } from "@/componentes/ui/casilla";
import { Selector } from "@/componentes/ui/selector";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { obtenerOpcionesDeContactos } from "@/lib/api-contactos";
import {
  crearDeuda,
  type Deuda,
  type DeudaConPagos,
  editarDeuda,
  nombreDeLaDeuda,
  registrarPago,
} from "@/lib/api-deudas";
import { obtenerCategorias, obtenerCuentas, obtenerPeriodos } from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { type EstadoDelCambio, SeccionDeCambio } from "./seccion-de-cambio";

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

/** Lo que cambia en la pantalla cuando se registra o se modifica algo: Finanzas y los widgets de Contactos. */
function usarInvalidar() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finanzas"] }),
      queryClient.invalidateQueries({ queryKey: ["contactos"] }),
    ]);
  };
}

const SEGMENTOS_DE_SENTIDO = SENTIDOS_DE_DEUDA_VALIDOS.map((valor) => ({
  valor,
  etiqueta: NOMBRES_DE_SENTIDO[valor],
}));

type ModoDeQuien = "contacto" | "texto";

const SEGMENTOS_DE_QUIEN = [
  { valor: "contacto", etiqueta: "Un contacto" },
  { valor: "texto", etiqueta: "Otra persona o lugar" },
] as const;

const AVISO_DE_REGISTRO_APARTE =
  "Es un registro aparte: no cambia los saldos de tus cuentas ni tus totales. Al cobrar o pagar podés generar también el ingreso o gasto.";

// --- Registrar una deuda ---

type ValoresDeDeuda = z.infer<typeof esquemaDeuda>;

export function FormularioDeDeuda({
  contactoFijo,
  cerrar,
  alGuardar,
}: {
  /** Si viene, la deuda es con este contacto y no se pide elegirlo. */
  contactoFijo?: { id: string; nombre: string } | undefined;
  cerrar: () => void;
  alGuardar?: (deuda: DeudaConPagos) => void;
}) {
  const invalidar = usarInvalidar();
  const { data: sesion } = useSession();
  const monedaBase = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;
  const contactos = useQuery({
    queryKey: ["contactos", "opciones"],
    queryFn: obtenerOpcionesDeContactos,
    enabled: contactoFijo === undefined,
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ValoresDeDeuda>({
    // Zod no revisa el "con quién" si otro campo ya falló: se suma acá para avisar todo junto.
    resolver: async (valores, contexto, opciones) => {
      const resultado = await zodResolver(esquemaDeuda)(valores, contexto, opciones);
      if (Object.keys(resultado.errors).length === 0) return resultado;
      const avisos = avisosDeConQuien(valores);
      const limite = avisoDeFechaLimite(valores);
      return {
        values: {},
        errors: {
          ...(limite && !resultado.errors.fechaLimite
            ? { fechaLimite: { type: "custom", message: limite } }
            : {}),
          ...(avisos.contactoId && !resultado.errors.contactoId
            ? { contactoId: { type: "custom", message: avisos.contactoId } }
            : {}),
          ...(avisos.nombreLibre && !resultado.errors.nombreLibre
            ? { nombreLibre: { type: "custom", message: avisos.nombreLibre } }
            : {}),
          ...resultado.errors,
        },
      };
    },
    defaultValues: {
      contactoId: contactoFijo?.id ?? "",
      nombreLibre: "",
      sentido: "me_deben",
      concepto: "",
      moneda: monedaBase as ValoresDeDeuda["moneda"],
      fecha: diaDeHoy(zonaDelDispositivo()),
      fechaLimite: "",
    },
  });

  const mutacion = useMutation({
    mutationFn: crearDeuda,
    onSuccess: async (deuda) => {
      await invalidar();
      alGuardar?.(deuda);
      cerrar();
    },
  });

  const sentido = watch("sentido");
  // Con un contacto, o solo con un nombre. Cambiar de uno al otro vacía lo del que se deja.
  const [modo, setModo] = useState<ModoDeQuien>("contacto");

  function cambiarModo(nuevo: ModoDeQuien) {
    setModo(nuevo);
    setValue("contactoId", "");
    setValue("nombreLibre", "");
    clearErrors(["contactoId", "nombreLibre"]);
  }

  return (
    <form
      onSubmit={handleSubmit((datos) =>
        // Solo viaja el dato del modo elegido.
        mutacion.mutate(
          contactoFijo || modo === "contacto"
            ? { ...datos, nombreLibre: "" }
            : { ...datos, contactoId: "" },
        ),
      )}
      noValidate
      className="flex flex-col gap-4"
    >
      <SelectorDeSegmentos
        id="sentido-de-deuda"
        etiqueta="¿Quién debe?"
        modo="filtro"
        segmentos={SEGMENTOS_DE_SENTIDO}
        activo={sentido}
        onCambiar={(valor: SentidoDeDeuda) => setValue("sentido", valor)}
      />

      {contactoFijo ? (
        <p className="text-sm text-texto-secundario">
          {sentido === "me_deben" ? "Te debe" : "Le debés a"}{" "}
          <span className="font-medium text-texto">{contactoFijo.nombre}</span>.
        </p>
      ) : (
        <>
          <SelectorDeSegmentos
            id="quien-de-la-deuda"
            etiqueta="¿Con quién es?"
            modo="filtro"
            segmentos={SEGMENTOS_DE_QUIEN}
            activo={modo}
            onCambiar={cambiarModo}
          />

          {modo === "contacto" ? (
            <Selector
              {...register("contactoId")}
              etiqueta={sentido === "me_deben" ? "¿Quién te debe?" : "¿A quién le debés?"}
              error={errors.contactoId?.message}
            >
              <option value="">Elegí un contacto</option>
              {contactos.data?.contactos.map((contacto) => (
                <option key={contacto.id} value={contacto.id}>
                  {nombreCompletoDeContacto(contacto)}
                </option>
              ))}
            </Selector>
          ) : (
            <Campo
              {...register("nombreLibre")}
              etiqueta={sentido === "me_deben" ? "¿Quién te debe?" : "¿A quién le debés?"}
              placeholder="Por ejemplo: el vecino del 3B"
              autoComplete="off"
              maxLength={LARGO_MAXIMO_NOMBRE_LIBRE_DE_DEUDA}
              ayuda="No es un contacto: la deuda queda con este nombre y sin ficha."
              error={errors.nombreLibre?.message}
            />
          )}
        </>
      )}
      {contactos.isError && modo === "contacto" ? (
        <Aviso tono="peligro">{interpretarError(contactos.error).mensaje}</Aviso>
      ) : null}
      {!contactoFijo &&
      modo === "contacto" &&
      contactos.isSuccess &&
      contactos.data.contactos.length === 0 ? (
        <Aviso>
          Todavía no tenés contactos. Podés agregarlos en la sección Contactos, o elegir “Otra
          persona o lugar” y escribir solo el nombre.
        </Aviso>
      ) : null}

      <Campo
        {...register("concepto")}
        etiqueta="¿De qué es?"
        placeholder="Por ejemplo: préstamo para el alquiler"
        autoComplete="off"
        error={errors.concepto?.message}
      />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)]">
        <Controller
          control={control}
          name="monto"
          render={({ field }) => (
            <CampoDeImporte
              ref={field.ref}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              moneda={watch("moneda")}
              etiqueta="Monto"
              error={errors.monto?.message}
            />
          )}
        />
        <Selector {...register("moneda")} etiqueta="Moneda" error={errors.moneda?.message}>
          {MONEDAS_ADMITIDAS.map((moneda) => (
            <option key={moneda.codigo} value={moneda.codigo}>
              {moneda.nombre} ({moneda.codigo})
            </option>
          ))}
        </Selector>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          {...register("fecha")}
          type="date"
          etiqueta="¿Desde cuándo?"
          max={diaDeHoy(zonaDelDispositivo())}
          error={errors.fecha?.message}
        />
        <Campo
          {...register("fechaLimite")}
          type="date"
          etiqueta="Fecha límite (opcional)"
          min={watch("fecha") || undefined}
          ayuda="Hasta qué día debería saldarse."
          error={errors.fechaLimite?.message}
        />
      </div>

      <p className="text-xs text-texto-secundario">{AVISO_DE_REGISTRO_APARTE}</p>

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
          Registrar deuda
        </Boton>
      </div>
    </form>
  );
}

// --- Editar una deuda ---

type ValoresDeEdicion = z.infer<typeof esquemaEditarDeuda>;

export function FormularioEditarDeuda({ deuda, cerrar }: { deuda: Deuda; cerrar: () => void }) {
  const invalidar = usarInvalidar();
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ValoresDeEdicion>({
    // Zod no revisa el límite si otro campo ya falló: se suma acá para avisar todo junto.
    resolver: async (valores, contexto, opciones) => {
      const resultado = await zodResolver(esquemaEditarDeuda)(valores, contexto, opciones);
      if (Object.keys(resultado.errors).length === 0) return resultado;
      const limite = avisoDeFechaLimite(valores);
      return {
        values: {},
        errors: {
          ...(limite && !resultado.errors.fechaLimite
            ? { fechaLimite: { type: "custom", message: limite } }
            : {}),
          ...resultado.errors,
        },
      };
    },
    defaultValues: {
      concepto: deuda.concepto,
      monto: importeDesdeCentavos(deuda.montoCentavos),
      fecha: deuda.fecha,
      fechaLimite: deuda.fechaLimite ?? "",
    },
  });

  const mutacion = useMutation({
    mutationFn: (datos: ValoresDeEdicion) => editarDeuda(deuda.id, datos),
    onSuccess: async () => {
      await invalidar();
      cerrar();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((datos) => mutacion.mutate(datos))}
      noValidate
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-texto-secundario">
        {deuda.sentido === "me_deben" ? "Te debe" : "Le debés a"}{" "}
        <span className="font-medium text-texto">{nombreDeLaDeuda(deuda)}</span>. Con quién es, el
        sentido y la moneda no se cambian: si están mal, eliminá la deuda y registrala de nuevo.
      </p>

      <Campo
        {...register("concepto")}
        etiqueta="¿De qué es?"
        autoComplete="off"
        autoFocus
        error={errors.concepto?.message}
      />

      <Controller
        control={control}
        name="monto"
        render={({ field }) => (
          <CampoDeImporte
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            moneda={deuda.moneda}
            etiqueta="Monto"
            ayuda={
              deuda.pagadoCentavos > 0
                ? `Ya se pagaron ${formatearMonto(deuda.pagadoCentavos, deuda.moneda)}: el monto no puede ser menor.`
                : undefined
            }
            error={errors.monto?.message}
          />
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          {...register("fecha")}
          type="date"
          etiqueta="¿Desde cuándo?"
          max={diaDeHoy(zonaDelDispositivo())}
          error={errors.fecha?.message}
        />
        <Campo
          {...register("fechaLimite")}
          type="date"
          etiqueta="Fecha límite (opcional)"
          min={watch("fecha") || undefined}
          ayuda="Hasta qué día debería saldarse. Borrala para quitar el límite."
          error={errors.fechaLimite?.message}
        />
      </div>

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
          Guardar cambios
        </Boton>
      </div>
    </form>
  );
}

// --- Registrar un pago (o cobro) ---

type ValoresDePago = z.infer<typeof esquemaPagoDeDeuda>;

/**
 * Registrar un pago (o cobro). Nunca deja pasar de lo que falta: el aviso aparece apenas se escribe
 * un importe mayor (y el servidor lo vuelve a comprobar). Con la casilla, además se genera el
 * ingreso (cobro) o gasto (pago) en una cuenta de la misma moneda que la deuda.
 */
export function FormularioDePago({ deuda, cerrar }: { deuda: Deuda; cerrar: () => void }) {
  const invalidar = usarInvalidar();
  const esCobro = deuda.sentido === "me_deben";
  // Viene tildada: lo más común es que el cobro o pago también mueva una cuenta.
  const [generar, setGenerar] = useState(true);
  const [cuentaId, setCuentaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [avisoDelMovimiento, setAvisoDelMovimiento] = useState<string | null>(null);
  // La cotización elegida cuando la cuenta es de otra moneda que la deuda (ver seccion-de-cambio.tsx).
  const [estadoCambio, setEstadoCambio] = useState<EstadoDelCambio>({
    cambio: undefined,
    importeOrigenCentavos: null,
    convertidoCentavos: null,
    error: null,
  });
  const [intentoGuardar, setIntentoGuardar] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ValoresDePago>({
    mode: "onChange",
    // Zod no sabe cuánto falta: el tope se suma acá, para avisar mientras se escribe.
    resolver: async (valores, contexto, opciones) => {
      const resultado = await zodResolver(esquemaPagoDeDeuda)(valores, contexto, opciones);
      const pasaDeLoQueFalta =
        typeof valores.monto === "number" &&
        centavosDesdeImporte(valores.monto) > deuda.pendienteCentavos;
      if (!pasaDeLoQueFalta) return resultado;
      return {
        values: {},
        errors: {
          monto: {
            type: "custom",
            message: `No puede pasar de lo que falta: ${formatearMonto(deuda.pendienteCentavos, deuda.moneda)}.`,
          },
          ...resultado.errors,
        },
      };
    },
    defaultValues: { fecha: diaDeHoy(zonaDelDispositivo()) },
  });

  // Las cuentas, categorías y períodos se piden mientras la casilla está tildada.
  const cuentas = useQuery({
    queryKey: ["finanzas", "cuentas"],
    queryFn: obtenerCuentas,
    enabled: generar,
  });
  const categorias = useQuery({
    queryKey: ["finanzas", "categorias"],
    queryFn: obtenerCategorias,
    enabled: generar,
  });
  const periodos = useQuery({
    queryKey: ["finanzas", "periodos"],
    queryFn: obtenerPeriodos,
    enabled: generar,
  });
  // Las cuentas a la vista, de cualquier moneda (si no es la de la deuda, el importe se convierte);
  // las categorías comunes (no la de transferencias).
  const cuentasPosibles = (cuentas.data?.cuentas ?? []).filter((cuenta) => !cuenta.oculta);
  const categoriasPosibles = (categorias.data?.categorias ?? []).filter(
    (categoria) => categoria.sistema === null,
  );

  // Con la casilla tildada por defecto, si no se puede generar el movimiento (no hay período abierto
  // ni cuenta a la vista, o no se pudieron traer) el pago se registra igual, solo, y el formulario lo
  // dice: así tildarla de entrada nunca impide registrar un pago.
  const sinPeriodoAbierto =
    periodos.isSuccess && !periodos.data.periodos.some((periodo) => periodo.abierto);
  const sinCuentaPosible = cuentas.isSuccess && cuentasPosibles.length === 0;
  const fallaLaCarga = cuentas.isError || categorias.isError || periodos.isError;
  const noSePuedeGenerar = sinPeriodoAbierto || sinCuentaPosible || fallaLaCarga;
  const cargandoOpciones =
    generar && (cuentas.isPending || categorias.isPending || periodos.isPending);

  const cuentaElegida = cuentasPosibles.find((cuenta) => cuenta.id === cuentaId);
  const cruzaMonedas = cuentaElegida !== undefined && cuentaElegida.moneda !== deuda.moneda;
  const diaDelPago = watch("fecha");
  // La cotización es la de ese día (al mediodía, para que caiga en el día en cualquier zona).
  const instanteDelPago = /^\d{4}-\d{2}-\d{2}$/.test(diaDelPago ?? "")
    ? instanteDelDia(diaDelPago, zonaDelDispositivo()).toISOString()
    : null;

  // Al abrirse las opciones, ya viene elegido lo más probable: una cuenta de la moneda de la deuda (si
  // hay; si no, la primera) y la categoría "Ingresos" (cobro) u "Otros" (pago), o la primera si la
  // persona las renombró.
  useEffect(() => {
    if (cuentaId === "" && cuentasPosibles[0]) {
      const igualMoneda = cuentasPosibles.find((cuenta) => cuenta.moneda === deuda.moneda);
      setCuentaId((igualMoneda ?? cuentasPosibles[0]).id);
    }
    if (categoriaId === "" && categoriasPosibles[0]) {
      const preferida = categoriasPosibles.find(
        (categoria) => categoria.nombre.toLowerCase() === (esCobro ? "ingresos" : "otros"),
      );
      setCategoriaId(String((preferida ?? categoriasPosibles[0]).id));
    }
  }, [cuentasPosibles, categoriasPosibles, cuentaId, categoriaId, esCobro, deuda.moneda]);

  const mutacion = useMutation({
    mutationFn: (datos: ValoresDePago) => registrarPago(deuda.id, datos),
    onSuccess: async () => {
      await invalidar();
      cerrar();
    },
  });

  function enviar(datos: ValoresDePago) {
    setAvisoDelMovimiento(null);
    if (!generar || noSePuedeGenerar) {
      mutacion.mutate({ monto: datos.monto, fecha: datos.fecha });
      return;
    }
    if (cuentaId === "") {
      setAvisoDelMovimiento("Elegí la cuenta.");
      return;
    }
    // Entre monedas distintas falta tener la cotización (o lo que se escribió) antes de guardar.
    if (cruzaMonedas && estadoCambio.error !== null) {
      setIntentoGuardar(true);
      return;
    }
    mutacion.mutate({
      monto: datos.monto,
      fecha: datos.fecha,
      movimiento: {
        cuentaFinancieraId: cuentaId,
        categoriaId: Number(categoriaId),
        ...(cruzaMonedas && estadoCambio.cambio ? { cambio: estadoCambio.cambio } : {}),
      },
    });
  }

  return (
    <form onSubmit={handleSubmit(enviar)} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-texto-secundario">
        {deuda.concepto} · {nombreDeLaDeuda(deuda)}. Falta {esCobro ? "cobrar" : "pagar"}{" "}
        <span className="font-medium text-texto">
          {formatearMonto(deuda.pendienteCentavos, deuda.moneda)}
        </span>{" "}
        de {formatearMonto(deuda.montoCentavos, deuda.moneda)}.
      </p>

      <div className="flex flex-col gap-1.5">
        <Controller
          control={control}
          name="monto"
          render={({ field }) => (
            <CampoDeImporte
              ref={field.ref}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              moneda={deuda.moneda}
              etiqueta={esCobro ? "¿Cuánto te pagaron?" : "¿Cuánto pagaste?"}
              ayuda={`Como máximo lo que falta: ${formatearMonto(deuda.pendienteCentavos, deuda.moneda)}.`}
              autoFocus
              error={errors.monto?.message}
            />
          )}
        />
        <Boton
          type="button"
          variante="sutil"
          tamano="chico"
          className="self-start"
          onClick={() =>
            setValue("monto", importeDesdeCentavos(deuda.pendienteCentavos), {
              shouldValidate: true,
            })
          }
        >
          {esCobro ? "Cobrar todo lo que falta" : "Pagar todo lo que falta"}
        </Boton>
      </div>

      <Campo
        {...register("fecha")}
        type="date"
        etiqueta="¿Cuándo?"
        min={deuda.fecha}
        max={diaDeHoy(zonaDelDispositivo())}
        error={errors.fecha?.message}
      />

      <div className="flex flex-col gap-3 rounded-control border border-borde bg-superficie-suave p-3">
        <Casilla
          etiqueta={
            esCobro
              ? "Registrar también el ingreso en una de mis cuentas"
              : "Registrar también el gasto desde una de mis cuentas"
          }
          marcada={generar}
          onCambio={setGenerar}
        />
        {generar ? (
          <>
            {fallaLaCarga ? (
              <Aviso tono="peligro">
                {interpretarError(cuentas.error ?? categorias.error ?? periodos.error).mensaje} Se
                registra solo el {esCobro ? "cobro" : "pago"}, sin generar el movimiento.
              </Aviso>
            ) : sinPeriodoAbierto ? (
              <Aviso>
                No tenés un período abierto, así que se registra solo el{" "}
                {esCobro ? "cobro" : "pago"} (sin ingreso ni gasto). Abrí un período en Finanzas si
                querés generarlo.
              </Aviso>
            ) : sinCuentaPosible ? (
              <Aviso>
                No tenés ninguna cuenta a la vista, así que se registra solo el{" "}
                {esCobro ? "cobro" : "pago"} (sin ingreso ni gasto). Creá una en Finanzas, pestaña
                Cuentas, si querés generarlo.
              </Aviso>
            ) : (
              <p className="text-xs text-texto-secundario">
                {esCobro
                  ? "Suma el importe al saldo de la cuenta y aparece en tus movimientos"
                  : "Resta el importe del saldo de la cuenta y aparece en tus movimientos"}
                , con la fecha de este {esCobro ? "cobro" : "pago"}. Si después quitás el{" "}
                {esCobro ? "cobro" : "pago"}, también se elimina ese movimiento.
              </p>
            )}
            {noSePuedeGenerar ? null : (
              <>
                <Selector
                  etiqueta={esCobro ? "¿En qué cuenta entró?" : "¿De qué cuenta salió?"}
                  value={cuentaId}
                  onChange={(evento) => setCuentaId(evento.target.value)}
                  error={avisoDelMovimiento ?? undefined}
                >
                  <option value="">Elegí una cuenta</option>
                  {cuentasPosibles.map((cuenta) => (
                    <option key={cuenta.id} value={cuenta.id}>
                      {cuenta.nombre} ({formatearMonto(cuenta.saldoCentavos, cuenta.moneda)})
                    </option>
                  ))}
                </Selector>
                <Selector
                  etiqueta="Categoría"
                  value={categoriaId}
                  onChange={(evento) => setCategoriaId(evento.target.value)}
                >
                  {categoriasPosibles.map((categoria) => (
                    <option key={categoria.id} value={categoria.id}>
                      {categoria.nombre}
                    </option>
                  ))}
                </Selector>
                {cruzaMonedas && cuentaElegida ? (
                  <SeccionDeCambio
                    key={`${deuda.moneda}-${cuentaElegida.moneda}`}
                    monedaDeOrigen={deuda.moneda}
                    monedaDeDestino={cuentaElegida.moneda}
                    importe={watch("monto")}
                    monedaDelImporte="origen"
                    fecha={instanteDelPago}
                    esTransferencia={false}
                    mostrarError={intentoGuardar}
                    onCambiar={setEstadoCambio}
                  />
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cerrar}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={isSubmitting || mutacion.isPending}
          textoCargando="Guardando"
          disabled={cargandoOpciones}
        >
          {esCobro ? "Registrar cobro" : "Registrar pago"}
        </Boton>
      </div>
    </form>
  );
}

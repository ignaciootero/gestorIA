// Formulario para agregar o editar un movimiento. Rápido a propósito
// (docs/guias/usabilidad.md, "Lo más usado, a mano"): la fecha y hora arrancan
// en ahora y la categoría y la cuenta proponen lo último que se usó.
//
// El movimiento no se asigna a un período a mano: el período es el que contiene
// su fecha y hora. El formulario lo muestra bajo el campo ("Se guarda en…") y
// avisa si la fecha no cae en ninguno, en vez de dejar que lo descubra el
// servidor (que de todos modos lo vuelve a validar).
//
// Transferencias entre cuentas: la casilla "Es una transferencia entre mis
// cuentas" (que solo se ofrece con dos o más cuentas activas) convierte el
// movimiento en una transferencia ("neutro": ni ingreso ni gasto): desaparecen
// "Tipo" y "Categoría" y en vez de "Cuenta" se piden la de origen y la de destino.
// Por dentro usa la categoría especial de transferencias, que la persona nunca
// elige ni ve en sus listas de categorías. El mismo formulario, con
// `soloTransferencia`, es el que se abre desde el panel de cuentas ("Transferir
// entre cuentas"), ya con la casilla marcada y sin poder desmarcarla.
//
// Sin cuentas disponibles (todas ocultas o eliminadas, o menos de dos para
// transferir) el formulario no queda en un callejón sin salida: explica qué falta
// y ofrece crear una cuenta ahí mismo, con el mismo formulario del panel de
// cuentas. Al crearla, el formulario del movimiento aparece listo para usar.
//
// Monedas: el importe se escribe en la moneda de la cuenta elegida. Si esa moneda no es la
// base de la persona (o una transferencia cruza dos monedas), aparece el bloque de
// cotización (seccion-de-cambio.tsx): propone la del día, deja cambiarla y muestra a
// cuánto equivale el importe. El saldo de cada cuenta se muestra en su propia moneda.
//
// Saldo de las cuentas: cada opción de cuenta muestra su saldo actual y, si el
// movimiento dejaría una cuenta con saldo negativo, al guardar se pide
// confirmación en vez de guardar en silencio (se puede aceptar: una cuenta en
// negativo es válida, p. ej. una tarjeta; solo se evita que sea un descuido).
//
// Mismo patrón de actualización optimista que pide docs/guias/rendimiento.md
// para "registrar un gasto": el resumen del dashboard se actualiza al tocar
// "Guardar", sin esperar la respuesta del servidor, y se revierte con un aviso
// si falla. Los totales (ingresos, gastos, saldo de cuentas) no se recalculan
// a mano: eso requeriría duplicar la lógica de la API, así que simplemente se
// refrescan al terminar la mutación.

"use client";

import type { DatosMovimiento } from "@gestoria/shared";
import {
  centavosDesdeImporte,
  esquemaCamposDeMovimiento,
  formatearMonto,
  MONEDA_POR_DEFECTO,
  nombreCompletoDeContacto,
  TIPOS_MOVIMIENTO,
  validarDestinoDeTransferencia,
} from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { CampoDeImporte } from "@/componentes/ui/campo-de-importe";
import { Casilla } from "@/componentes/ui/casilla";
import { Selector } from "@/componentes/ui/selector";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { type OpcionDeContacto, obtenerOpcionesDeContactos } from "@/lib/api-contactos";
import {
  type Categoria,
  type CuentaFinanciera,
  crearMovimiento,
  editarMovimiento,
  type Movimiento,
  obtenerCategorias,
  obtenerCuentas,
  obtenerPeriodos,
  type Periodo,
  type Resumen,
} from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";
import {
  ahoraParaInput,
  aValorDeFechaHora,
  guardarUltimaCategoria,
  guardarUltimaCuenta,
  instanteDesdeInput,
  leerUltimaCategoria,
  leerUltimaCuenta,
} from "@/lib/preferencias-finanzas";
import { FormularioCuenta } from "./formulario-de-cuenta";
import { claseDeOpcionDeSaldo, claseDeSaldoNegativo } from "./saldo";
import { type EstadoDelCambio, SeccionDeCambio } from "./seccion-de-cambio";

const TIPOS = [
  { valor: TIPOS_MOVIMIENTO.gasto, etiqueta: "Gasto" },
  { valor: TIPOS_MOVIMIENTO.ingreso, etiqueta: "Ingreso" },
] as const;

const DESCRIPCION_DE_TRANSFERENCIA = "Transferencia entre cuentas";

/**
 * Lo mismo que `esquemaMovimiento`, pero con la fecha tal como la escribe la
 * persona en el <input type="datetime-local"> (hora local, sin zona): se la
 * convierte a un instante antes de mandarla a la API.
 */
const esquemaFormulario = esquemaCamposDeMovimiento
  .extend({ fecha: z.string().min(1, "Elegí la fecha y hora del movimiento.") })
  .superRefine(validarDestinoDeTransferencia);
type ValoresFormulario = z.infer<typeof esquemaFormulario>;

/** El período que contiene un instante (ISO), o undefined si cae fuera de todos. */
function periodoQueContiene(periodos: Periodo[], instante: string): Periodo | undefined {
  const momento = new Date(instante).getTime();
  return periodos.find(
    (periodo) =>
      new Date(periodo.aperturaEn).getTime() <= momento &&
      (periodo.cierreEn === null || momento < new Date(periodo.cierreEn).getTime()),
  );
}

/**
 * Efecto de un movimiento sobre el saldo de una cuenta (con signo, en centavos de la
 * moneda de esa cuenta). A la cuenta de destino de una transferencia le llega
 * `importeDestinoCentavos`, que es el importe convertido a su moneda.
 */
function efectoEnCuenta(
  cuentaId: string,
  movimiento: {
    tipo: string;
    importeCentavos: number;
    importeDestinoCentavos: number;
    cuentaFinancieraId: string;
    cuentaDestinoId?: string | null | undefined;
  },
): number {
  if (movimiento.cuentaDestinoId === cuentaId) return movimiento.importeDestinoCentavos;
  if (movimiento.cuentaFinancieraId !== cuentaId) return 0;
  return movimiento.tipo === TIPOS_MOVIMIENTO.ingreso
    ? movimiento.importeCentavos
    : -movimiento.importeCentavos;
}

type CuentaConSaldoNegativo = { nombre: string; moneda: string; saldoFinalCentavos: number };

/**
 * Cuentas que el movimiento dejaría en negativo y que además quedarían peor que
 * ahora: ingresar plata a una cuenta que ya estaba en negativo, o editar un gasto
 * a la baja, no es un aviso. Al editar se descuenta el efecto del movimiento
 * original, que el saldo actual de la cuenta ya incluye.
 */
function cuentasQueQuedanEnNegativo(
  cuentas: CuentaFinanciera[],
  nuevo: Parameters<typeof efectoEnCuenta>[1],
  original: Movimiento | undefined,
): CuentaConSaldoNegativo[] {
  const afectadas = new Set([nuevo.cuentaFinancieraId, nuevo.cuentaDestinoId]);
  const resultado: CuentaConSaldoNegativo[] = [];
  for (const cuenta of cuentas) {
    if (!afectadas.has(cuenta.id)) continue;
    const efectoOriginal = original
      ? efectoEnCuenta(cuenta.id, {
          tipo: original.tipo,
          importeCentavos: original.importeCentavos,
          importeDestinoCentavos: original.importeConvertidoCentavos,
          cuentaFinancieraId: original.cuentaFinanciera.id,
          cuentaDestinoId: original.cuentaDestino?.id,
        })
      : 0;
    const saldoFinal = cuenta.saldoCentavos - efectoOriginal + efectoEnCuenta(cuenta.id, nuevo);
    if (saldoFinal < 0 && saldoFinal < cuenta.saldoCentavos) {
      resultado.push({
        nombre: cuenta.nombre,
        moneda: cuenta.moneda,
        saldoFinalCentavos: saldoFinal,
      });
    }
  }
  return resultado;
}

type PropsFormulario = {
  cerrar: () => void;
  /** Si viene, el formulario edita este movimiento en vez de crear uno nuevo. */
  movimiento?: Movimiento;
  /** Solo para transferir entre cuentas: la categoría queda fija y no se pide el tipo. */
  soloTransferencia?: boolean;
};

export function FormularioMovimiento({
  cerrar,
  movimiento,
  soloTransferencia = false,
}: PropsFormulario) {
  const categorias = useQuery({ queryKey: ["finanzas", "categorias"], queryFn: obtenerCategorias });
  const cuentas = useQuery({ queryKey: ["finanzas", "cuentas"], queryFn: obtenerCuentas });
  const periodos = useQuery({ queryKey: ["finanzas", "periodos"], queryFn: obtenerPeriodos });
  // Los contactos son opcionales en un movimiento: si no se pueden traer, el formulario sigue sin ellos.
  const contactos = useQuery({
    queryKey: ["contactos", "opciones"],
    queryFn: obtenerOpcionesDeContactos,
  });
  const [creandoCuenta, setCreandoCuenta] = useState(false);

  if (categorias.isPending || cuentas.isPending || periodos.isPending || contactos.isPending) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
        <span className="solo-lectores">Cargando categorías, cuentas y períodos</span>
        <div className="h-11 animate-pulse rounded-control bg-superficie-suave" />
        <div className="h-11 animate-pulse rounded-control bg-superficie-suave" />
        <div className="h-11 animate-pulse rounded-control bg-superficie-suave" />
      </div>
    );
  }

  if (categorias.error || cuentas.error || periodos.error) {
    return (
      <Aviso tono="peligro">
        {interpretarError(categorias.error ?? cuentas.error ?? periodos.error).mensaje}
      </Aviso>
    );
  }

  // Una cuenta oculta no se ofrece para movimientos nuevos. Al editar, se
  // conservan las que el movimiento ya tiene aunque se hayan ocultado después.
  const cuentasElegibles = cuentas.data.cuentas.filter(
    (cuenta) =>
      !cuenta.oculta ||
      cuenta.id === movimiento?.cuentaFinanciera.id ||
      cuenta.id === movimiento?.cuentaDestino?.id,
  );

  // La casilla de transferencia solo se ofrece con dos o más cuentas activas
  // (o si el movimiento que se edita ya es una transferencia).
  const cuentasActivas = cuentas.data.cuentas.filter((cuenta) => !cuenta.oculta);
  const categoriaDeTransferencia = categorias.data.categorias.find(
    (categoria) => categoria.sistema === "transferencia",
  );
  const puedeTransferir = cuentasActivas.length >= 2 || movimiento?.tipo === "neutro";
  // La especial no es una categoría para elegir: solo las comunes van al selector.
  const categoriasOfrecidas = categorias.data.categorias.filter(
    (categoria) => categoria.sistema === null,
  );

  // Faltan cuentas: ninguna disponible o, para transferir, menos de dos.
  const faltanCuentas =
    cuentasElegibles.length === 0 || (soloTransferencia && cuentasActivas.length < 2);
  if (faltanCuentas) {
    if (creandoCuenta) {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-texto-secundario">
            Creá la cuenta y después seguís con el movimiento.
          </p>
          <FormularioCuenta cerrar={() => setCreandoCuenta(false)} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="advertencia">
          {soloTransferencia
            ? "Para transferir entre cuentas necesitás al menos dos cuentas activas (que no estén ocultas)."
            : cuentas.data.cuentas.length > 0
              ? "No tenés ninguna cuenta disponible: todas están ocultas. Creá una cuenta para poder cargar el movimiento."
              : "No tenés ninguna cuenta. Creá una para poder cargar el movimiento."}
        </Aviso>
        <div className="flex justify-end gap-2">
          <Boton variante="sutil" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton onClick={() => setCreandoCuenta(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Crear una cuenta
          </Boton>
        </div>
      </div>
    );
  }

  // Una transferencia no usa las categorías de la persona (lleva la interna), así
  // que para transferir no hacen falta categorías propias. Las categorías llegan
  // vacías si se eliminaron todas.
  if (soloTransferencia ? !categoriaDeTransferencia : categoriasOfrecidas.length === 0) {
    return (
      <Aviso tono="advertencia">Hace falta al menos una categoría para cargar un movimiento.</Aviso>
    );
  }

  return (
    <CamposDelFormulario
      categorias={categoriasOfrecidas}
      categoriaDeTransferencia={puedeTransferir ? categoriaDeTransferencia : undefined}
      cuentas={cuentasElegibles}
      periodos={periodos.data.periodos}
      contactos={contactos.data?.contactos ?? []}
      movimiento={movimiento}
      soloTransferencia={soloTransferencia}
      cerrar={cerrar}
    />
  );
}

function valorPorDefecto<T extends string | number>(
  disponibles: { id: T }[],
  ultimoUsado: T | null,
): T | undefined {
  if (ultimoUsado !== null && disponibles.some((opcion) => opcion.id === ultimoUsado)) {
    return ultimoUsado;
  }
  return disponibles[0]?.id;
}

function CamposDelFormulario({
  categorias,
  categoriaDeTransferencia,
  cuentas,
  periodos,
  contactos,
  movimiento,
  soloTransferencia,
  cerrar,
}: {
  contactos: OpcionDeContacto[];
  categorias: Categoria[];
  categoriaDeTransferencia: Categoria | undefined;
  cuentas: CuentaFinanciera[];
  periodos: Periodo[];
  movimiento: Movimiento | undefined;
  soloTransferencia: boolean;
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: sesion } = useSession();
  const monedaBase = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;
  const esEdicion = movimiento !== undefined;
  // La cotización elegida (ver seccion-de-cambio.tsx) y si ya se intentó guardar sin completarla.
  const [estadoCambio, setEstadoCambio] = useState<EstadoDelCambio>({
    cambio: undefined,
    importeOrigenCentavos: null,
    convertidoCentavos: null,
    error: null,
  });
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  // En una transferencia entre monedas, el importe se puede escribir en la moneda de la cuenta de
  // origen (lo normal) o en la de la de destino ("quiero que lleguen 100 dólares").
  const [monedaElegidaDelImporte, setMonedaElegidaDelImporte] = useState<"origen" | "destino">(
    "origen",
  );
  // Se pone en true cuando el guardado quedó a la espera de que la persona
  // acepte el saldo negativo (ver más abajo).
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState(false);
  // Un selector cerrado muestra la opción elegida con su propio color, así que el
  // rojo de un saldo negativo se pone en las opciones y también en el selector.
  const claseDelSelector = (cuentaId: string | null | undefined) =>
    cn(claseDeSaldoNegativo(cuentas.find((cuenta) => cuenta.id === cuentaId)?.saldoCentavos ?? 0));
  const etiquetaDeCuenta = (cuenta: CuentaFinanciera) =>
    `${cuenta.nombre} (${formatearMonto(cuenta.saldoCentavos, cuenta.moneda)})`;

  // `categorias` ya son solo las comunes (ver FormularioMovimiento).
  const comunes = categorias;
  const [esTransferencia, setEsTransferencia] = useState(
    soloTransferencia || movimiento?.tipo === TIPOS_MOVIMIENTO.neutro,
  );
  const cuentaPorDefecto = valorPorDefecto(cuentas, leerUltimaCuenta()) ?? "";
  const otraCuenta = (distintaDe: string) =>
    cuentas.find((cuenta) => cuenta.id !== distintaDe)?.id ?? undefined;

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ValoresFormulario>({
    resolver: zodResolver(esquemaFormulario),
    defaultValues: movimiento
      ? {
          tipo: movimiento.tipo,
          importe: movimiento.importeCentavos / 100,
          descripcion: movimiento.descripcion,
          categoriaId: movimiento.categoria.id,
          cuentaFinancieraId: movimiento.cuentaFinanciera.id,
          cuentaDestinoId: movimiento.cuentaDestino?.id,
          contactoId: movimiento.contacto?.id ?? null,
          fecha: aValorDeFechaHora(new Date(movimiento.fecha)),
        }
      : soloTransferencia
        ? {
            tipo: TIPOS_MOVIMIENTO.neutro,
            descripcion: DESCRIPCION_DE_TRANSFERENCIA,
            categoriaId: categoriaDeTransferencia?.id ?? 0,
            cuentaFinancieraId: cuentaPorDefecto,
            cuentaDestinoId: otraCuenta(cuentaPorDefecto),
            fecha: ahoraParaInput(),
          }
        : {
            tipo: TIPOS_MOVIMIENTO.gasto,
            descripcion: "",
            categoriaId: valorPorDefecto(comunes, leerUltimaCategoria()) ?? 0,
            cuentaFinancieraId: cuentaPorDefecto,
            fecha: ahoraParaInput(),
          },
  });

  // Los contactos para elegir. El del movimiento que se edita se ofrece siempre, aunque esté en la
  // papelera, para que guardar otra cosa no se lo quite sin querer.
  const opcionesDeContacto: (OpcionDeContacto & { eliminado?: boolean })[] =
    movimiento?.contacto && !contactos.some((contacto) => contacto.id === movimiento.contacto?.id)
      ? [
          {
            id: movimiento.contacto.id,
            tipo: "persona",
            nombre: movimiento.contacto.nombre,
            apellido: movimiento.contacto.apellido,
            eliminado: movimiento.contacto.eliminado,
          },
          ...contactos,
        ]
      : contactos;

  const origenElegido = watch("cuentaFinancieraId");
  const destinoElegido = watch("cuentaDestinoId");

  // Marcar (o desmarcar) la casilla de transferencia cambia qué se pide: el tipo
  // pasa a "neutro", la categoría a la especial y aparece la cuenta de destino; o
  // vuelve a gasto con una categoría común.
  useEffect(() => {
    if (esTransferencia) {
      setValue("tipo", TIPOS_MOVIMIENTO.neutro);
      if (categoriaDeTransferencia) setValue("categoriaId", categoriaDeTransferencia.id);
      const origen = getValues("cuentaFinancieraId");
      const destino = getValues("cuentaDestinoId");
      if (!destino || destino === origen) setValue("cuentaDestinoId", otraCuenta(origen));
      if (getValues("descripcion") === "") setValue("descripcion", DESCRIPCION_DE_TRANSFERENCIA);
    } else {
      if (getValues("tipo") === TIPOS_MOVIMIENTO.neutro) setValue("tipo", TIPOS_MOVIMIENTO.gasto);
      setValue("cuentaDestinoId", undefined);
      // Al volver de una transferencia hay que elegir una categoría común.
      if (getValues("categoriaId") === categoriaDeTransferencia?.id) {
        setValue("categoriaId", valorPorDefecto(comunes, leerUltimaCategoria()) ?? 0);
      }
      if (getValues("descripcion") === DESCRIPCION_DE_TRANSFERENCIA) setValue("descripcion", "");
    }
  }, [esTransferencia]);

  // Si el origen pasa a ser la misma cuenta que el destino, el destino cambia de cuenta.
  useEffect(() => {
    if (esTransferencia && destinoElegido === origenElegido) {
      setValue("cuentaDestinoId", otraCuenta(origenElegido));
    }
  }, [origenElegido]);

  // Hacia qué período iría el movimiento con la fecha que está escrita ahora.
  const instanteEscrito = instanteDesdeInput(watch("fecha"));
  const periodoDeDestino = instanteEscrito
    ? periodoQueContiene(periodos, instanteEscrito)
    : undefined;
  const sinPeriodo = instanteEscrito !== null && periodoDeDestino === undefined;

  // Las monedas entre las que se convierte (si son distintas, hay cotización que elegir): la
  // de la cuenta y, en una transferencia, la de la cuenta de destino; si no, la moneda base.
  const monedaDeOrigen = cuentas.find((cuenta) => cuenta.id === origenElegido)?.moneda;
  const monedaDeDestino = esTransferencia
    ? cuentas.find((cuenta) => cuenta.id === destinoElegido)?.moneda
    : monedaBase;
  const cruzaMonedas =
    monedaDeOrigen !== undefined &&
    monedaDeDestino !== undefined &&
    monedaDeOrigen !== monedaDeDestino;
  // Al editar con las mismas cuentas, se puede conservar la cotización que ya tenía guardada.
  const cambioGuardado =
    movimiento !== undefined &&
    movimiento.cuentaFinanciera.id === origenElegido &&
    (movimiento.cuentaDestino?.id ?? null) === (esTransferencia ? (destinoElegido ?? null) : null)
      ? {
          tipoDeCambio: movimiento.tipoDeCambio,
          manual: movimiento.cambioManual,
          importeCentavos: movimiento.importeCentavos,
          importeConvertidoCentavos: movimiento.importeConvertidoCentavos,
        }
      : undefined;

  // Solo una transferencia entre monedas distintas puede escribirse en la moneda de destino.
  const importeEnDestino = esTransferencia && cruzaMonedas && monedaElegidaDelImporte === "destino";
  const monedaDelImporte = (importeEnDestino ? monedaDeDestino : monedaDeOrigen) ?? monedaBase;

  // Lo que dejaría en negativo el movimiento tal como está escrito ahora.
  const importeEscrito = watch("importe");
  // Cuánto sale de la cuenta de origen: lo escrito, o lo que se calculó si se escribió lo que llega.
  const importeDeOrigenCentavos = importeEnDestino
    ? estadoCambio.importeOrigenCentavos
    : Number.isFinite(importeEscrito)
      ? centavosDesdeImporte(importeEscrito)
      : null;
  const negativas =
    Number.isFinite(importeEscrito) && importeDeOrigenCentavos !== null
      ? cuentasQueQuedanEnNegativo(
          cuentas,
          {
            tipo: esTransferencia ? TIPOS_MOVIMIENTO.neutro : watch("tipo"),
            importeCentavos: importeDeOrigenCentavos,
            // Lo que llega a la cuenta de destino, ya convertido; sin cotización todavía, no se avisa.
            importeDestinoCentavos: cruzaMonedas
              ? (estadoCambio.convertidoCentavos ?? 0)
              : centavosDesdeImporte(importeEscrito),
            cuentaFinancieraId: origenElegido,
            cuentaDestinoId: esTransferencia ? destinoElegido : undefined,
          },
          movimiento,
        )
      : [];
  const tipoEscrito = watch("tipo");

  // Si la persona cambia algo después de ver el aviso, el aviso ya no vale: se
  // vuelve a evaluar al guardar.
  useEffect(() => {
    setPidiendoConfirmacion(false);
  }, [importeEscrito, origenElegido, destinoElegido, tipoEscrito, esTransferencia]);

  const mutacion = useMutation({
    mutationFn: (datos: DatosMovimiento) =>
      esEdicion ? editarMovimiento(movimiento.id, datos) : crearMovimiento(datos),

    onMutate: async (datos) => {
      await queryClient.cancelQueries({ queryKey: ["finanzas", "resumen"] });
      const previas = queryClient.getQueriesData<Resumen>({ queryKey: ["finanzas", "resumen"] });

      const categoria = [...categorias, categoriaDeTransferencia].find(
        (c) => c?.id === datos.categoriaId,
      );
      const cuenta = cuentas.find((c) => c.id === datos.cuentaFinancieraId);
      const cuentaDestino = cuentas.find((c) => c.id === datos.cuentaDestinoId);
      const contactoElegido = contactos.find((c) => c.id === datos.contactoId);
      const optimista: Movimiento = {
        id: movimiento?.id ?? `optimista-${Date.now()}`,
        tipo: datos.tipo,
        importeCentavos: Math.round(datos.importe * 100),
        tipoDeCambio: 1,
        importeConvertidoCentavos:
          estadoCambio.convertidoCentavos ?? Math.round(datos.importe * 100),
        cambioManual: false,
        descripcion: datos.descripcion,
        fecha: datos.fecha,
        periodoId: periodoDeDestino?.id ?? 0,
        creadoEn: new Date().toISOString(),
        categoria: categoria ?? { id: datos.categoriaId, nombre: "…", color: "#64748b" },
        cuentaFinanciera: cuenta
          ? { id: cuenta.id, nombre: cuenta.nombre, moneda: cuenta.moneda }
          : { id: datos.cuentaFinancieraId, nombre: "…", moneda: monedaBase },
        cuentaDestino: cuentaDestino
          ? { id: cuentaDestino.id, nombre: cuentaDestino.nombre, moneda: cuentaDestino.moneda }
          : null,
        contacto: contactoElegido
          ? {
              id: contactoElegido.id,
              nombre: contactoElegido.nombre,
              apellido: contactoElegido.apellido,
              eliminado: false,
            }
          : null,
      };

      for (const [clave, datosPrevios] of previas) {
        // El resumen de cada período solo lista los movimientos de ese período:
        // el optimista va únicamente al del período de destino.
        if (!datosPrevios || datosPrevios.periodo.id !== periodoDeDestino?.id) continue;
        queryClient.setQueryData<Resumen>(clave, {
          ...datosPrevios,
          ultimosMovimientos: esEdicion
            ? datosPrevios.ultimosMovimientos.map((m) => (m.id === optimista.id ? optimista : m))
            : [optimista, ...datosPrevios.ultimosMovimientos].slice(0, 5),
        });
      }

      return { previas };
    },

    onError: (_error, _datos, contexto) => {
      for (const [clave, datosPrevios] of contexto?.previas ?? []) {
        queryClient.setQueryData(clave, datosPrevios);
      }
    },

    onSuccess: (_resultado, datos) => {
      // La categoría de transferencias no se recuerda como "la última usada": se
      // elige a propósito, y proponerla por defecto sería un error esperando.
      if (datos.tipo !== TIPOS_MOVIMIENTO.neutro) guardarUltimaCategoria(datos.categoriaId);
      guardarUltimaCuenta(datos.cuentaFinancieraId);
      cerrar();
    },

    onSettled: () => {
      // Los totales (ingresos, gastos, saldo, presupuestos) no se recalculan a
      // mano en el cliente: se refrescan desde la API, que es la única fuente
      // de verdad para esa cuenta.
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
    },
  });

  const etiquetaDeEnvio = soloTransferencia
    ? "Transferir"
    : esEdicion
      ? "Guardar cambios"
      : "Guardar movimiento";

  return (
    <form
      onSubmit={handleSubmit((valores) => {
        // Sin período la API lo rechazaría igual; se avisa ya, junto al campo.
        if (instanteEscrito === null || sinPeriodo) return;
        // Falta la cotización (no se pudo traer y no se escribió, o lo escrito no sirve).
        if (cruzaMonedas && estadoCambio.error !== null) {
          setIntentoGuardar(true);
          return;
        }
        // Saldo negativo: la primera vez se pide confirmación; "Guardar igualmente"
        // vuelve a enviar con la confirmación puesta.
        if (negativas.length > 0 && !pidiendoConfirmacion) {
          setPidiendoConfirmacion(true);
          return;
        }
        mutacion.mutate({
          ...valores,
          // Si se escribió lo que llega al destino, a la API le va lo que sale del origen.
          ...(importeEnDestino && importeDeOrigenCentavos !== null
            ? { importe: importeDeOrigenCentavos / 100 }
            : {}),
          fecha: instanteEscrito,
          tipo: esTransferencia ? TIPOS_MOVIMIENTO.neutro : valores.tipo,
          cuentaDestinoId: esTransferencia ? valores.cuentaDestinoId : undefined,
          // Una transferencia entre cuentas propias no tiene contraparte.
          contactoId: esTransferencia ? null : (valores.contactoId ?? null),
          ...(cruzaMonedas && estadoCambio.cambio ? { cambio: estadoCambio.cambio } : {}),
        });
      })}
      noValidate
      className="flex flex-col gap-4"
    >
      {soloTransferencia ? (
        <p className="text-sm text-texto-secundario">
          Pasá plata de una cuenta a otra. No es un ingreso ni un gasto: no cuenta en los totales de
          tu período, solo mueve el saldo entre tus cuentas.
        </p>
      ) : esTransferencia ? (
        <p className="flex items-center gap-2 text-sm text-advertencia">
          <ArrowLeftRight aria-hidden="true" className="size-4 shrink-0" />
          Transferencia entre tus cuentas: no es un ingreso ni un gasto.
        </p>
      ) : (
        <Controller
          control={control}
          name="tipo"
          render={({ field }) => (
            <SelectorDeSegmentos
              id="tipo-movimiento"
              etiqueta="Tipo de movimiento"
              modo="filtro"
              segmentos={TIPOS}
              activo={
                field.value === TIPOS_MOVIMIENTO.ingreso ? field.value : TIPOS_MOVIMIENTO.gasto
              }
              onCambiar={field.onChange}
            />
          )}
        />
      )}

      {categoriaDeTransferencia && !soloTransferencia ? (
        <Casilla
          etiqueta="Es una transferencia entre mis cuentas"
          marcada={esTransferencia}
          onCambio={setEsTransferencia}
        />
      ) : null}

      {esTransferencia && cruzaMonedas ? (
        <SelectorDeSegmentos
          id="moneda-del-importe"
          etiqueta="Moneda en la que escribís el monto"
          modo="filtro"
          segmentos={[
            { valor: "origen", etiqueta: `${monedaDeOrigen} (origen)` },
            { valor: "destino", etiqueta: `${monedaDeDestino} (destino)` },
          ]}
          activo={monedaElegidaDelImporte}
          onCambiar={setMonedaElegidaDelImporte}
        />
      ) : null}

      <Controller
        control={control}
        name="importe"
        render={({ field }) => (
          <CampoDeImporte
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            moneda={monedaDelImporte}
            etiqueta="Importe"
            autoFocus
            ayuda={
              importeEnDestino
                ? `Importe en ${monedaDelImporte}, la moneda de la cuenta de destino.`
                : monedaDeOrigen !== undefined && monedaDeOrigen !== monedaBase
                  ? `Importe en ${monedaDeOrigen}, la moneda de esta cuenta.`
                  : undefined
            }
            error={errors.importe?.message}
          />
        )}
      />

      <Campo
        {...register("descripcion")}
        etiqueta="Descripción"
        autoComplete="off"
        error={errors.descripcion?.message}
      />

      {esTransferencia ? null : (
        <Selector
          {...register("contactoId", { setValueAs: (valor) => (valor === "" ? null : valor) })}
          etiqueta="Con quién (opcional)"
          error={errors.contactoId?.message}
        >
          <option value="">Nadie en particular</option>
          {opcionesDeContacto.map((contacto) => (
            <option key={contacto.id} value={contacto.id}>
              {nombreCompletoDeContacto(contacto)}
              {contacto.eliminado ? " (eliminado)" : ""}
            </option>
          ))}
        </Selector>
      )}

      {soloTransferencia || esTransferencia ? null : (
        <Selector
          {...register("categoriaId", { valueAsNumber: true })}
          etiqueta="Categoría"
          error={errors.categoriaId?.message}
        >
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </Selector>
      )}

      {esTransferencia ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector
            {...register("cuentaFinancieraId")}
            etiqueta="Cuenta de origen"
            className={claseDelSelector(origenElegido)}
            error={errors.cuentaFinancieraId?.message}
          >
            {cuentas.map((cuenta) => (
              <option
                key={cuenta.id}
                value={cuenta.id}
                className={claseDeOpcionDeSaldo(cuenta.saldoCentavos)}
              >
                {etiquetaDeCuenta(cuenta)}
              </option>
            ))}
          </Selector>

          <Selector
            {...register("cuentaDestinoId", {
              setValueAs: (valor: string) => (valor === "" ? undefined : valor),
            })}
            etiqueta="Cuenta de destino"
            className={claseDelSelector(destinoElegido)}
            error={errors.cuentaDestinoId?.message}
          >
            {cuentas
              .filter((cuenta) => cuenta.id !== origenElegido)
              .map((cuenta) => (
                <option
                  key={cuenta.id}
                  value={cuenta.id}
                  className={claseDeOpcionDeSaldo(cuenta.saldoCentavos)}
                >
                  {etiquetaDeCuenta(cuenta)}
                </option>
              ))}
          </Selector>
        </div>
      ) : (
        <Selector
          {...register("cuentaFinancieraId")}
          etiqueta="Cuenta"
          className={claseDelSelector(origenElegido)}
          error={errors.cuentaFinancieraId?.message}
        >
          {cuentas.map((cuenta) => (
            <option
              key={cuenta.id}
              value={cuenta.id}
              className={claseDeOpcionDeSaldo(cuenta.saldoCentavos)}
            >
              {etiquetaDeCuenta(cuenta)}
            </option>
          ))}
        </Selector>
      )}

      <Campo
        {...register("fecha")}
        etiqueta="Fecha y hora"
        type="datetime-local"
        ayuda={
          periodoDeDestino ? `Se guarda en el período "${periodoDeDestino.nombre}".` : undefined
        }
        error={
          errors.fecha?.message ??
          (sinPeriodo ? "Esa fecha no cae dentro de ninguno de tus períodos." : undefined)
        }
      />

      {cruzaMonedas ? (
        <SeccionDeCambio
          key={`${monedaDeOrigen}-${monedaDeDestino}`}
          monedaDeOrigen={monedaDeOrigen}
          monedaDeDestino={monedaDeDestino}
          importe={importeEscrito}
          monedaDelImporte={importeEnDestino ? "destino" : "origen"}
          fecha={instanteEscrito}
          guardado={cambioGuardado}
          esTransferencia={esTransferencia}
          mostrarError={intentoGuardar}
          onCambiar={setEstadoCambio}
        />
      ) : null}

      {mutacion.isError ? (
        <Aviso tono="peligro">
          {detalleDeValidacion(mutacion.error) ?? interpretarError(mutacion.error).mensaje}
        </Aviso>
      ) : null}

      {pidiendoConfirmacion && negativas.length > 0 ? (
        <Aviso tono="advertencia" titulo="Esta cuenta quedaría con saldo negativo">
          <ul className="list-disc pl-5">
            {negativas.map((cuenta) => (
              <li key={cuenta.nombre}>
                {cuenta.nombre} quedaría en{" "}
                {formatearMonto(cuenta.saldoFinalCentavos, cuenta.moneda)}.
              </li>
            ))}
          </ul>
          <p className="mt-1">¿Querés guardarlo igual?</p>
        </Aviso>
      ) : null}

      <div className="flex justify-end gap-2">
        {pidiendoConfirmacion && negativas.length > 0 ? (
          <Boton type="button" variante="sutil" onClick={() => setPidiendoConfirmacion(false)}>
            No, volver
          </Boton>
        ) : (
          <Boton type="button" variante="sutil" onClick={cerrar}>
            Cancelar
          </Boton>
        )}
        <Boton
          type="submit"
          cargando={isSubmitting || mutacion.isPending}
          textoCargando="Guardando"
        >
          {pidiendoConfirmacion && negativas.length > 0 ? "Sí, guardar igual" : etiquetaDeEnvio}
        </Boton>
      </div>
    </form>
  );
}

// Formularios para abrir, cerrar, reabrir, renombrar y eliminar un período.
//
// Un período es un tramo de tiempo que abre y cierra la persona (no tiene por
// qué coincidir con un mes). Las reglas de verdad (que no se solapen, que no
// queden movimientos afuera, que haya uno solo abierto) las valida la API;
// acá se repiten las más obvias solo para avisar mientras se completa el
// formulario, sin esperar al servidor.
//
// Las fechas se piden con <input type="datetime-local"> (hora local del
// dispositivo, al minuto) y viajan a la API como instantes en UTC.

"use client";

import {
  esquemaNombrePeriodo,
  esquemaRenombrarPeriodo,
  formatearFecha,
  sugerirNombreDePeriodo,
} from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import {
  abrirPeriodo,
  cerrarPeriodo,
  eliminarPeriodo,
  type Periodo,
  type PeriodoListado,
  reabrirPeriodo,
  renombrarPeriodo,
} from "@/lib/api-finanzas";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";
import {
  ahoraParaInput,
  aValorDeFechaHora,
  instanteDesdeInput,
  zonaDelDispositivo,
} from "@/lib/preferencias-finanzas";

function mismoNombre(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("es") === b.trim().toLocaleLowerCase("es");
}

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

/** El cierre más tardío de todos los períodos: el nuevo no puede abrir antes. */
function ultimoCierre(periodos: Periodo[]): Date | null {
  let ultimo: Date | null = null;
  for (const periodo of periodos) {
    if (periodo.cierreEn === null) continue;
    const cierre = new Date(periodo.cierreEn);
    if (ultimo === null || cierre > ultimo) ultimo = cierre;
  }
  return ultimo;
}

// --- Abrir ---

type ValoresAbrir = { nombre: string; aperturaEn: string };

type PropsAbrir = {
  periodos: Periodo[];
  /**
   * Instante ISO en que arranca el período, si ya viene decidido: al continuar
   * uno recién cerrado, el siguiente abre justo en su cierre. El campo sigue
   * siendo editable.
   */
  aperturaInicial?: string | undefined;
  /** true cuando se ofrece como continuación de un período recién cerrado. */
  continuacion?: boolean;
  cancelar: () => void;
  alTerminar: (periodo: Periodo) => void;
};

export function FormularioAbrirPeriodo({
  periodos,
  aperturaInicial,
  continuacion = false,
  cancelar,
  alTerminar,
}: PropsAbrir) {
  const queryClient = useQueryClient();
  const zona = zonaDelDispositivo();
  const nombresExistentes = periodos.map((periodo) => periodo.nombre);
  const minimo = ultimoCierre(periodos);

  // El input solo guarda hasta el minuto, y un cierre elegido con "ahora" tiene
  // segundos: si la persona no toca la apertura, se manda el instante exacto,
  // no el truncado (que quedaría unos segundos antes del cierre y se solaparía).
  const valorInicial = aperturaInicial
    ? aValorDeFechaHora(new Date(aperturaInicial))
    : ahoraParaInput();
  function instanteDe(valor: string): string | null {
    return aperturaInicial && valor === valorInicial ? aperturaInicial : instanteDesdeInput(valor);
  }

  const esquema = z
    .object({
      nombre: esquemaNombrePeriodo,
      aperturaEn: z.string().min(1, "Elegí la fecha y hora de apertura."),
    })
    .superRefine((datos, contexto) => {
      if (nombresExistentes.some((existente) => mismoNombre(existente, datos.nombre))) {
        contexto.addIssue({
          code: "custom",
          path: ["nombre"],
          message: "Ya tenés un período con ese nombre.",
        });
      }

      const instante = instanteDe(datos.aperturaEn);
      if (instante === null) {
        contexto.addIssue({
          code: "custom",
          path: ["aperturaEn"],
          message: "Esa fecha y hora no es válida.",
        });
        return;
      }
      const apertura = new Date(instante);
      if (apertura.getTime() > Date.now()) {
        contexto.addIssue({
          code: "custom",
          path: ["aperturaEn"],
          message: "La apertura no puede ser en el futuro.",
        });
      } else if (minimo !== null && apertura < minimo) {
        contexto.addIssue({
          code: "custom",
          path: ["aperturaEn"],
          message: `Tiene que ser a partir de ${formatearFecha(minimo, zona)}, cuando termina tu último período.`,
        });
      }
    });

  const nombreTocado = useRef(false);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ValoresAbrir>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nombre: sugerirNombreDePeriodo(
        instanteDe(valorInicial) ?? new Date(),
        zona,
        nombresExistentes,
      ),
      aperturaEn: valorInicial,
    },
  });

  // Mientras la persona no escriba un nombre propio, el sugerido sigue al mes de
  // la apertura (si la mueve a otro mes, el nombre cambia con ella).
  const aperturaEscrita = watch("aperturaEn");
  useEffect(() => {
    if (nombreTocado.current) return;
    const instante = instanteDe(aperturaEscrita);
    if (instante) setValue("nombre", sugerirNombreDePeriodo(instante, zona, nombresExistentes));
  }, [aperturaEscrita]);

  const mutacion = useMutation({
    mutationFn: (datos: ValoresAbrir) => {
      // Nunca es null acá: el resolver ya rechazó una apertura inválida.
      const aperturaEn = instanteDe(datos.aperturaEn);
      return abrirPeriodo({ nombre: datos.nombre, ...(aperturaEn ? { aperturaEn } : {}) });
    },
    onSuccess: (periodo) => {
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      alTerminar(periodo);
    },
  });

  return (
    <form
      onSubmit={handleSubmit((datos) => mutacion.mutate(datos))}
      noValidate
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-texto-secundario">
        {continuacion
          ? "Período cerrado. ¿Abrimos el siguiente? Arranca justo cuando termina el anterior, así no queda tiempo sin cubrir. Podés cambiar el nombre y la fecha."
          : "Mientras haya un período abierto, tus movimientos se guardan en él. Solo puede haber uno abierto a la vez."}
      </p>

      <Campo
        {...register("nombre", {
          onChange: () => {
            nombreTocado.current = true;
          },
        })}
        etiqueta="Nombre"
        autoComplete="off"
        autoFocus
        ayuda="Te sugerimos el mes y el año en que empieza. Podés poner el que quieras."
        error={errors.nombre?.message}
      />

      <Campo
        {...register("aperturaEn")}
        etiqueta="Empieza el"
        type="datetime-local"
        max={ahoraParaInput()}
        {...(minimo ? { min: aValorDeFechaHora(minimo) } : {})}
        error={errors.aperturaEn?.message}
      />

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cancelar}>
          {continuacion ? "Ahora no" : "Cancelar"}
        </Boton>
        <Boton type="submit" cargando={isSubmitting || mutacion.isPending} textoCargando="Abriendo">
          Abrir período
        </Boton>
      </div>
    </form>
  );
}

// --- Cerrar ---

type ModoDeCierre = "ahora" | "elegir";

const MODOS_DE_CIERRE = [
  { valor: "ahora", etiqueta: "Ahora" },
  { valor: "elegir", etiqueta: "Elegir fecha y hora" },
] as const;

type PropsCerrar = {
  periodo: Periodo;
  cancelar: () => void;
  alTerminar: (periodoCerrado: Periodo) => void;
};

export function FormularioCerrarPeriodo({ periodo, cancelar, alTerminar }: PropsCerrar) {
  const queryClient = useQueryClient();
  const zona = zonaDelDispositivo();
  const [modo, setModo] = useState<ModoDeCierre>("ahora");
  const [valor, setValor] = useState(ahoraParaInput);
  const [intentado, setIntentado] = useState(false);

  const instante = modo === "elegir" ? instanteDesdeInput(valor) : null;
  const apertura = new Date(periodo.aperturaEn);

  // Solo se valida lo que se puede saber acá. Que no queden movimientos
  // posteriores al cierre lo comprueba la API y explica cuáles son.
  let errorDeFecha: string | undefined;
  if (modo === "elegir") {
    if (instante === null) errorDeFecha = "Esa fecha y hora no es válida.";
    else if (new Date(instante).getTime() > Date.now()) {
      errorDeFecha = "El cierre no puede ser en el futuro.";
    } else if (new Date(instante) <= apertura) {
      errorDeFecha = `Tiene que ser posterior a la apertura (${formatearFecha(apertura, zona)}).`;
    }
  }

  const mutacion = useMutation({
    mutationFn: () => cerrarPeriodo(periodo.id, instante ?? undefined),
    onSuccess: (cerrado) => {
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      alTerminar(cerrado);
    },
  });

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        setIntentado(true);
        if (errorDeFecha === undefined) mutacion.mutate();
      }}
      noValidate
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-texto-secundario">
        Vas a cerrar <span className="font-medium text-texto">{periodo.nombre}</span>. Después de
        cerrarlo no podés cargar movimientos con fechas posteriores al cierre, hasta abrir otro
        período. Los movimientos que ya cargaste no cambian.
      </p>

      <SelectorDeSegmentos
        id="momento-de-cierre"
        etiqueta="Cuándo cierra"
        modo="filtro"
        segmentos={MODOS_DE_CIERRE}
        activo={modo}
        onCambiar={setModo}
      />

      {modo === "elegir" ? (
        <Campo
          etiqueta="Cierra el"
          type="datetime-local"
          value={valor}
          min={aValorDeFechaHora(apertura)}
          max={ahoraParaInput()}
          onChange={(evento) => setValor(evento.target.value)}
          autoFocus
          ayuda="No puede quedar ningún movimiento después de esta fecha y hora."
          error={intentado ? errorDeFecha : undefined}
        />
      ) : null}

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cancelar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={mutacion.isPending} textoCargando="Cerrando">
          Cerrar período
        </Boton>
      </div>
    </form>
  );
}

// --- Reabrir ---

type PropsReabrir = {
  periodo: Periodo;
  cancelar: () => void;
  alTerminar: (periodoReabierto: Periodo) => void;
};

/**
 * Pide confirmación para reabrir un período cerrado. Que no haya otro abierto ni
 * uno posterior lo comprueba la API; la barra solo ofrece el botón cuando se
 * cumple, así que un error acá es una carrera con otra pestaña o dispositivo.
 */
export function FormularioReabrirPeriodo({ periodo, cancelar, alTerminar }: PropsReabrir) {
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => reabrirPeriodo(periodo.id),
    onSuccess: (reabierto) => {
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      alTerminar(reabierto);
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-secundario">
        Vas a reabrir <span className="font-medium text-texto">{periodo.nombre}</span>: vuelve a ser
        tu período abierto, sin fecha de cierre, y podés cargar movimientos en él otra vez. Sus
        movimientos no cambian. Mientras esté abierto no podés abrir otro período; cuando quieras,
        lo volvés a cerrar.
      </p>

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cancelar}>
          Cancelar
        </Boton>
        <Boton
          type="button"
          cargando={mutacion.isPending}
          textoCargando="Reabriendo"
          onClick={() => mutacion.mutate()}
        >
          Reabrir período
        </Boton>
      </div>
    </div>
  );
}

// --- Eliminar ---

type PropsEliminar = {
  periodo: PeriodoListado;
  cancelar: () => void;
  alTerminar: () => void;
};

/**
 * Pide confirmación para eliminar un período. Se puede siempre, pero si tiene
 * movimientos el aviso dice cuántos se pierden y qué pasa con los saldos: es lo
 * único irreversible de todo el módulo.
 */
export function FormularioEliminarPeriodo({ periodo, cancelar, alTerminar }: PropsEliminar) {
  const queryClient = useQueryClient();
  const cantidad = periodo.cantidadMovimientos;

  const mutacion = useMutation({
    mutationFn: () => eliminarPeriodo(periodo.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      alTerminar();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-secundario">
        Se elimina <span className="font-medium text-texto">{periodo.nombre}</span>.
        {cantidad === 0
          ? " No tiene movimientos, así que no se pierde ningún gasto ni ingreso."
          : ""}
      </p>

      {cantidad > 0 ? (
        <Aviso
          tono="advertencia"
          titulo={
            cantidad === 1
              ? "Se va a eliminar 1 movimiento"
              : `Se van a eliminar ${cantidad} movimientos`
          }
        >
          Al eliminar el período se eliminan también todos los movimientos que tiene (incluidas las
          transferencias), y no se pueden recuperar. El saldo de tus cuentas se ajusta: queda como
          si esos movimientos nunca se hubieran cargado.
        </Aviso>
      ) : null}

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cancelar}>
          Cancelar
        </Boton>
        <Boton
          type="button"
          variante="peligro"
          cargando={mutacion.isPending}
          textoCargando="Eliminando"
          onClick={() => mutacion.mutate()}
        >
          {cantidad > 0 ? "Eliminar período y movimientos" : "Eliminar período"}
        </Boton>
      </div>
    </div>
  );
}

// --- Renombrar ---

type PropsRenombrar = {
  periodo: Periodo;
  periodos: Periodo[];
  cancelar: () => void;
  alTerminar: () => void;
};

export function FormularioRenombrarPeriodo({
  periodo,
  periodos,
  cancelar,
  alTerminar,
}: PropsRenombrar) {
  const queryClient = useQueryClient();

  const esquema = esquemaRenombrarPeriodo.superRefine((datos, contexto) => {
    const enUso = periodos.some(
      (otro) => otro.id !== periodo.id && mismoNombre(otro.nombre, datos.nombre),
    );
    if (enUso) {
      contexto.addIssue({
        code: "custom",
        path: ["nombre"],
        message: "Ya tenés un período con ese nombre.",
      });
    }
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ nombre: string }>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: periodo.nombre },
  });

  const mutacion = useMutation({
    mutationFn: (datos: { nombre: string }) => renombrarPeriodo(periodo.id, datos.nombre),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
      alTerminar();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((datos) => mutacion.mutate(datos))}
      noValidate
      className="flex flex-col gap-4"
    >
      <Campo
        {...register("nombre")}
        etiqueta="Nombre"
        autoComplete="off"
        autoFocus
        ayuda="Cambiarlo no afecta a los movimientos del período."
        error={errors.nombre?.message}
      />

      {mutacion.isError ? <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso> : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cancelar}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={isSubmitting || mutacion.isPending}
          textoCargando="Guardando"
        >
          Guardar nombre
        </Boton>
      </div>
    </form>
  );
}

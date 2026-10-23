// Formulario para agregar o editar un recordatorio de un contacto.
//
// Lo que se le pide a la persona depende de cada cuánto se repite, porque cada repetición se
// define con algo distinto:
// - Una sola vez: el día (y, si quiere, la hora).
// - Todos los días: la hora, que es obligatoria.
// - Todas las semanas: el día de la semana.
// - Todos los meses: el día del mes.
// - Todos los años: el día y el mes.
// En todas menos en la diaria la hora es opcional; en blanco significa "todo el día".
//
// Arriba ofrece los recordatorios más comunes según el tipo de contacto ("Cumpleaños",
// "Pagar el servicio"...): un toque completa el título y la repetición. Solo se ofrecen los que
// el contacto todavía no tiene. El cumpleaños, además, toma el día y el mes de la fecha de
// nacimiento si la persona la tiene cargada.
//
// La validación es la del servidor (`esquemaRecordatorio` de @gestoria/shared): el formulario
// arma los mismos datos que manda a la API según la repetición elegida y los valida con él.

"use client";

import {
  diaDeHoy,
  diaIsoDeLaSemana,
  esquemaRecordatorio,
  NOMBRES_DE_DIA_DE_LA_SEMANA,
  NOMBRES_DE_MES,
  NOMBRES_DE_REPETICION,
  REPETICIONES_VALIDAS,
  type Repeticion,
  recortarHora,
  SUGERENCIAS_DE_RECORDATORIO,
  type SugerenciaDeRecordatorio,
} from "@gestoria/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { type FieldErrors, type Resolver, useForm } from "react-hook-form";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Casilla } from "@/componentes/ui/casilla";
import { Selector } from "@/componentes/ui/selector";
import {
  type Contacto,
  crearRecordatorio,
  type DatosDeRecordatorio,
  editarRecordatorio,
  type Recordatorio,
} from "@/lib/api-contactos";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";

/** La hora que se propone al elegir "todos los días", que la pide obligatoria. */
const HORA_POR_DEFECTO = "09:00";

/** Lo que tiene el formulario: todo como texto, porque eso entregan los campos. */
type Valores = {
  titulo: string;
  /** Lleva un distintivo; no cambia el orden de las listas. */
  importante: boolean;
  repeticion: Repeticion;
  fecha: string;
  hora: string;
  diaSemana: string;
  diaDelMes: string;
  mes: string;
};

const DIAS_DEL_MES = Array.from({ length: 31 }, (_, indice) => indice + 1);

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

/** Los datos que se mandan a la API: solo los campos de la repetición elegida. */
function aDatos(valores: Valores): unknown {
  const { titulo, hora, importante } = valores;
  switch (valores.repeticion) {
    case "unica":
      return { titulo, importante, repeticion: "unica", fecha: valores.fecha, hora };
    case "diaria":
      return { titulo, importante, repeticion: "diaria", hora };
    case "semanal":
      return {
        titulo,
        importante,
        repeticion: "semanal",
        diaSemana: Number(valores.diaSemana),
        hora,
      };
    case "mensual":
      return {
        titulo,
        importante,
        repeticion: "mensual",
        diaDelMes: Number(valores.diaDelMes),
        hora,
      };
    case "anual":
      return {
        titulo,
        importante,
        repeticion: "anual",
        diaDelMes: Number(valores.diaDelMes),
        mes: Number(valores.mes),
        hora,
      };
  }
}

/** Valida con el esquema del servidor y pone cada mensaje en su campo (se muestra el primero de cada uno). */
const resolver: Resolver<Valores> = async (valores) => {
  const resultado = esquemaRecordatorio.safeParse(aDatos(valores));
  if (resultado.success) return { values: valores, errors: {} };

  const errores: Record<string, { type: string; message: string }> = {};
  for (const problema of resultado.error.issues) {
    const campo = String(problema.path[0] ?? "repeticion");
    errores[campo] ??= { type: "validate", message: problema.message };
  }
  return { values: {}, errors: errores as FieldErrors<Valores> };
};

function valoresIniciales(recordatorio: Recordatorio | undefined): Valores {
  const hoy = diaDeHoy(zonaDelDispositivo());
  return {
    titulo: recordatorio?.titulo ?? "",
    importante: recordatorio?.importante ?? false,
    repeticion: recordatorio?.repeticion ?? "unica",
    fecha: recordatorio?.fecha ?? hoy,
    hora: recortarHora(recordatorio?.hora ?? null) ?? "",
    diaSemana: String(recordatorio?.diaSemana ?? diaIsoDeLaSemana(hoy)),
    diaDelMes: String(recordatorio?.diaDelMes ?? Number(hoy.slice(8, 10))),
    mes: String(recordatorio?.mes ?? Number(hoy.slice(5, 7))),
  };
}

export function FormularioDeRecordatorio({
  contacto,
  recordatorio,
  cerrar,
}: {
  contacto: Contacto;
  /** Si viene, se edita; si no, se crea uno nuevo. */
  recordatorio?: Recordatorio | undefined;
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({ resolver, defaultValues: valoresIniciales(recordatorio) });

  const mutacion = useMutation({
    mutationFn: (datos: DatosDeRecordatorio) =>
      recordatorio
        ? editarRecordatorio(contacto.id, recordatorio.id, datos)
        : crearRecordatorio(contacto.id, datos),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contactos"] });
      cerrar();
    },
    onError: (error) => {
      // Un día que ya pasó se explica junto a la fecha.
      const mensaje = detalleDeValidacion(error);
      if (mensaje && /día|fecha/i.test(mensaje)) setError("fecha", { message: mensaje });
    },
  });

  const titulosActuales = new Set(
    contacto.recordatorios.map((existente) => existente.titulo.toLocaleLowerCase("es")),
  );
  const sugerencias = recordatorio
    ? []
    : SUGERENCIAS_DE_RECORDATORIO[contacto.tipo].filter(
        (sugerencia) => !titulosActuales.has(sugerencia.titulo.toLocaleLowerCase("es")),
      );

  function cambiarRepeticion(repeticion: Repeticion) {
    setValue("repeticion", repeticion, { shouldValidate: true });
    // "Todos los días" necesita una hora: se propone una para que no empiece vacío.
    if (repeticion === "diaria" && getValues("hora") === "") setValue("hora", HORA_POR_DEFECTO);
  }

  function aplicar(sugerencia: SugerenciaDeRecordatorio) {
    setValue("titulo", sugerencia.titulo, { shouldValidate: true });
    cambiarRepeticion(sugerencia.repeticion);
    if (sugerencia.usaElNacimiento && contacto.fechaNacimiento) {
      setValue("diaDelMes", String(Number(contacto.fechaNacimiento.slice(8, 10))));
      setValue("mes", String(Number(contacto.fechaNacimiento.slice(5, 7))));
    }
  }

  const repeticion = watch("repeticion");
  const campoDeHora = (
    <Campo
      {...register("hora")}
      type="time"
      etiqueta={repeticion === "diaria" ? "¿A qué hora?" : "Hora (opcional)"}
      ayuda={repeticion === "diaria" ? undefined : "Si la dejás en blanco, vale para todo el día."}
      error={errors.hora?.message}
    />
  );

  return (
    <form
      onSubmit={handleSubmit((valores) => mutacion.mutate(aDatos(valores) as DatosDeRecordatorio))}
      noValidate
      className="flex flex-col gap-4"
    >
      {sugerencias.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-texto">Los más comunes</p>
          <div className="flex flex-wrap gap-2">
            {sugerencias.map((sugerencia) => (
              <button
                key={sugerencia.titulo}
                type="button"
                onClick={() => aplicar(sugerencia)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-borde-fuerte bg-superficie px-3 text-sm text-texto transition-colors duration-(--duracion-rapida) ease-salida hover:border-acento/40 hover:bg-superficie-suave"
              >
                <Plus aria-hidden="true" className="size-3.5" />
                {sugerencia.titulo}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Campo
        {...register("titulo")}
        etiqueta="¿De qué te tenemos que acordar?"
        placeholder="Por ejemplo: Cumpleaños"
        autoFocus={recordatorio !== undefined}
        error={errors.titulo?.message}
      />

      <Casilla
        marcada={watch("importante")}
        onCambio={(marcada) => setValue("importante", marcada)}
        etiqueta="Marcar como importante"
      />

      <Selector
        {...register("repeticion", {
          onChange: (evento) => cambiarRepeticion(evento.target.value as Repeticion),
        })}
        etiqueta="Se repite"
        error={errors.repeticion?.message}
      >
        {REPETICIONES_VALIDAS.map((opcion) => (
          <option key={opcion} value={opcion}>
            {NOMBRES_DE_REPETICION[opcion]}
          </option>
        ))}
      </Selector>

      {/* Lo que sigue cambia con la repetición: cada una se define con algo distinto. */}
      {repeticion === "unica" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            {...register("fecha")}
            type="date"
            etiqueta="El día"
            error={errors.fecha?.message}
          />
          {campoDeHora}
        </div>
      ) : null}

      {repeticion === "diaria" ? campoDeHora : null}

      {repeticion === "semanal" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Selector
            {...register("diaSemana")}
            etiqueta="Día de la semana"
            error={errors.diaSemana?.message}
          >
            {NOMBRES_DE_DIA_DE_LA_SEMANA.map((nombre, indice) => (
              <option key={nombre} value={indice + 1}>
                {nombre.charAt(0).toLocaleUpperCase("es") + nombre.slice(1)}
              </option>
            ))}
          </Selector>
          {campoDeHora}
        </div>
      ) : null}

      {repeticion === "mensual" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Selector
              {...register("diaDelMes")}
              etiqueta="Día del mes"
              error={errors.diaDelMes?.message}
            >
              {DIAS_DEL_MES.map((dia) => (
                <option key={dia} value={dia}>
                  {dia}
                </option>
              ))}
            </Selector>
            <p className="text-xs text-texto-secundario">
              Si un mes no tiene ese día, avisa el último día del mes.
            </p>
          </div>
          {campoDeHora}
        </div>
      ) : null}

      {repeticion === "anual" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Selector {...register("diaDelMes")} etiqueta="Día" error={errors.diaDelMes?.message}>
              {DIAS_DEL_MES.map((dia) => (
                <option key={dia} value={dia}>
                  {dia}
                </option>
              ))}
            </Selector>
            <Selector {...register("mes")} etiqueta="Mes" error={errors.mes?.message}>
              {NOMBRES_DE_MES.map((nombre, indice) => (
                <option key={nombre} value={indice + 1}>
                  {nombre.charAt(0).toLocaleUpperCase("es") + nombre.slice(1)}
                </option>
              ))}
            </Selector>
          </div>
          {campoDeHora}
        </>
      ) : null}

      <p className="text-xs text-texto-secundario">
        {repeticion === "unica"
          ? "Te avisamos en la aplicación ese día. Al terminar el día pasa a Pasados y queda como histórico."
          : "Te avisamos en la aplicación cada vez que llega el día. Podés eliminarlo cuando ya no haga falta."}
      </p>

      {mutacion.isError && !errors.fecha ? (
        <Aviso tono="peligro">{mensajeDe(mutacion.error)}</Aviso>
      ) : null}

      <div className="flex justify-end gap-2">
        <Boton type="button" variante="sutil" onClick={cerrar}>
          Cancelar
        </Boton>
        <Boton
          type="submit"
          cargando={isSubmitting || mutacion.isPending}
          textoCargando="Guardando"
        >
          {recordatorio ? "Guardar cambios" : "Agregar recordatorio"}
        </Boton>
      </div>
    </form>
  );
}

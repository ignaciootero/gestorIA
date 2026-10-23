// Formulario para agregar o editar una tarea: una de uso único o una que se repite.
//
// Es un solo formulario porque para la persona es una sola cosa: "algo que hay que hacer". Lo
// único que cambia es si se repite, y de eso depende lo que se le pide:
// - No se repite: el día (hoy por defecto) y, si quiere, la hora.
// - Todos los días: nada más (la hora es opcional).
// - Todas las semanas: el día de la semana.
// - Todos los meses: el día del mes (si el mes no lo tiene, cae el último día).
// - Todos los años: el día y el mes.
//
// Qué se puede editar depende de qué se abre:
// - Una tarea suelta: todo menos si se repite (para eso se crea otra).
// - Una tarea de hoy que salió de una repetitiva: el título, las notas y la hora, solo de esa
//   (el día lo marca la regla; para cambiar la regla se edita la repetitiva).
// - Una repetitiva: su título, notas, hora y cuándo cae (pero no pasa a ser "no se repite").
//
// En todos los casos se puede elegir una categoría (opcional). Si no hay categorías, el campo no se
// muestra.
//
// La validación es la del servidor (`esquemaTarea` y `esquemaTareaRepetitiva` de
// @gestoria/shared): el formulario arma los mismos datos que manda a la API y los valida con ellos.

"use client";

import {
  diaDeHoy,
  diaIsoDeLaSemana,
  esquemaTarea,
  esquemaTareaRepetitiva,
  LARGO_MAXIMO_NOTAS_DE_TAREA,
  MAXIMO_DE_DIAS_ENTRE_REPETICIONES,
  MINIMO_DE_DIAS_ENTRE_REPETICIONES,
  NOMBRES_DE_MES,
  NOMBRES_DE_REPETICION_DE_TAREA,
  REPETICIONES_DE_TAREA,
  type RepeticionDeTarea,
} from "@gestoria/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FieldErrors, type Resolver, useForm } from "react-hook-form";
import { AreaDeTexto } from "@/componentes/ui/area-de-texto";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Casilla } from "@/componentes/ui/casilla";
import { Selector } from "@/componentes/ui/selector";
import {
  crearTarea,
  crearTareaRepetitiva,
  editarTarea,
  editarTareaRepetitiva,
  type Tarea,
  type TareaRepetitiva,
} from "@/lib/api-tareas";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { useCategoriasDeTarea } from "./categorias";
import { SelectorDeDias } from "./selector-de-dias";

export type ModoDeFormulario =
  | { tipo: "nueva" }
  | { tipo: "tarea"; tarea: Tarea }
  | { tipo: "repetitiva"; repetitiva: TareaRepetitiva };

/** Lo que tiene el formulario: todo como texto, porque eso entregan los campos. */
type Valores = {
  titulo: string;
  notas: string;
  /** El id de la categoría como texto; en blanco es "sin categoría". */
  categoriaId: string;
  repeticion: "ninguna" | RepeticionDeTarea;
  /** Solo para repetitivas: dar por fallidas sus tareas solas si pasa el día sin completarlas. */
  fallaSola: boolean;
  /** Lleva un distintivo; no cambia el orden de las listas. */
  importante: boolean;
  fecha: string;
  hora: string;
  /** Los días de la semana marcados ("1" es lunes … "7" es domingo). */
  diasSemana: string[];
  diaDelMes: string;
  mes: string;
  /** Solo "intervalo": cada cuántos días (como texto, del campo) y desde qué día. */
  cadaDias: string;
  fechaInicio: string;
};

const DIAS_DEL_MES = Array.from({ length: 31 }, (_, indice) => indice + 1);

function conMayuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("es") + texto.slice(1);
}

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

/** Los datos que se mandan a la API: solo los campos de lo que se eligió. */
function aDatos(valores: Valores): unknown {
  const { titulo, notas, hora } = valores;
  // Siempre se manda: en blanco la quita, y así editar la deja como se ve en el formulario.
  const categoriaId = valores.categoriaId === "" ? null : Number(valores.categoriaId);
  const { fallaSola, importante } = valores;
  switch (valores.repeticion) {
    case "ninguna":
      return { titulo, notas, categoriaId, importante, fecha: valores.fecha, hora };
    case "diaria":
      return { titulo, notas, categoriaId, importante, fallaSola, repeticion: "diaria", hora };
    case "intervalo":
      return {
        titulo,
        notas,
        categoriaId,
        importante,
        fallaSola,
        repeticion: "intervalo",
        cadaDias: valores.cadaDias === "" ? Number.NaN : Number(valores.cadaDias),
        fechaInicio: valores.fechaInicio,
        hora,
      };
    case "semanal":
      return {
        titulo,
        notas,
        categoriaId,
        importante,
        fallaSola,
        repeticion: "semanal",
        diasSemana: valores.diasSemana.map(Number),
        hora,
      };
    case "mensual":
      return {
        titulo,
        notas,
        categoriaId,
        importante,
        fallaSola,
        repeticion: "mensual",
        diaDelMes: Number(valores.diaDelMes),
        hora,
      };
    case "anual":
      return {
        titulo,
        notas,
        categoriaId,
        importante,
        fallaSola,
        repeticion: "anual",
        diaDelMes: Number(valores.diaDelMes),
        mes: Number(valores.mes),
        hora,
      };
  }
}

/** Valida con el esquema del servidor y pone cada mensaje en su campo (se muestra el primero de cada uno). */
const resolver: Resolver<Valores> = async (valores) => {
  const esquema = valores.repeticion === "ninguna" ? esquemaTarea : esquemaTareaRepetitiva;
  const resultado = esquema.safeParse(aDatos(valores));
  if (resultado.success) return { values: valores, errors: {} };

  const errores: Record<string, { type: string; message: string }> = {};
  for (const problema of resultado.error.issues) {
    const campo = String(problema.path[0] ?? "repeticion");
    errores[campo] ??= { type: "validate", message: problema.message };
  }
  return { values: {}, errors: errores as FieldErrors<Valores> };
};

function valoresIniciales(modo: ModoDeFormulario): Valores {
  const hoy = diaDeHoy(zonaDelDispositivo());
  const vacio: Valores = {
    titulo: "",
    notas: "",
    categoriaId: "",
    repeticion: "ninguna",
    fallaSola: false,
    importante: false,
    fecha: hoy,
    hora: "",
    diasSemana: [String(diaIsoDeLaSemana(hoy))],
    diaDelMes: String(Number(hoy.slice(8, 10))),
    mes: String(Number(hoy.slice(5, 7))),
    cadaDias: "2",
    fechaInicio: hoy,
  };

  if (modo.tipo === "tarea") {
    return {
      ...vacio,
      titulo: modo.tarea.titulo,
      notas: modo.tarea.notas ?? "",
      categoriaId: modo.tarea.categoriaId === null ? "" : String(modo.tarea.categoriaId),
      importante: modo.tarea.importante,
      fecha: modo.tarea.dia,
      hora: modo.tarea.hora ?? "",
    };
  }
  if (modo.tipo === "repetitiva") {
    const { repetitiva } = modo;
    return {
      ...vacio,
      titulo: repetitiva.titulo,
      notas: repetitiva.notas ?? "",
      categoriaId: repetitiva.categoriaId === null ? "" : String(repetitiva.categoriaId),
      repeticion: repetitiva.repeticion,
      fallaSola: repetitiva.fallaSola,
      importante: repetitiva.importante,
      hora: repetitiva.hora ?? "",
      diasSemana: repetitiva.diasSemana?.map(String) ?? vacio.diasSemana,
      diaDelMes: String(repetitiva.diaDelMes ?? vacio.diaDelMes),
      mes: String(repetitiva.mes ?? vacio.mes),
      cadaDias: String(repetitiva.cadaDias ?? vacio.cadaDias),
      fechaInicio: repetitiva.fechaInicio ?? vacio.fechaInicio,
    };
  }
  return vacio;
}

export function FormularioDeTarea({
  modo,
  cerrar,
}: {
  modo: ModoDeFormulario;
  cerrar: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({ resolver, defaultValues: valoresIniciales(modo) });

  const mutacion = useMutation({
    mutationFn: async (valores: Valores): Promise<unknown> => {
      const datos = aDatos(valores);
      if (modo.tipo === "tarea") {
        // Una que salió de una repetitiva conserva su día: se manda en blanco.
        const delDia = modo.tarea.repetitiva ? { fecha: "" } : {};
        return editarTarea(modo.tarea.id, {
          ...(datos as Parameters<typeof editarTarea>[1]),
          ...delDia,
        });
      }
      if (modo.tipo === "repetitiva") {
        return editarTareaRepetitiva(
          modo.repetitiva.id,
          datos as Parameters<typeof editarTareaRepetitiva>[1],
        );
      }
      return valores.repeticion === "ninguna"
        ? crearTarea(datos as Parameters<typeof crearTarea>[0])
        : crearTareaRepetitiva(datos as Parameters<typeof crearTareaRepetitiva>[0]);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tareas"] });
      cerrar();
    },
    onError: (error) => {
      // Un día que ya pasó se explica junto a la fecha.
      const mensaje = detalleDeValidacion(error);
      if (!mensaje) return;
      if (/categor/i.test(mensaje)) setError("categoriaId", { message: mensaje });
      else if (/día|fecha/i.test(mensaje)) {
        setError(repeticion === "intervalo" ? "fechaInicio" : "fecha", { message: mensaje });
      }
    },
  });

  const repeticion = watch("repeticion");
  const fallaSola = watch("fallaSola");
  const importante = watch("importante");
  const categorias = useCategoriasDeTarea();
  const editaOcurrencia = modo.tipo === "tarea" && modo.tarea.repetitiva;
  const puedeElegirRepeticion = modo.tipo !== "tarea";
  // Una repetitiva ya creada no pasa a ser "no se repite": para eso se crea una tarea suelta.
  const opcionesDeRepeticion =
    modo.tipo === "repetitiva"
      ? REPETICIONES_DE_TAREA
      : (["ninguna", ...REPETICIONES_DE_TAREA] as const);

  const campoDeHora = (
    <Campo
      {...register("hora")}
      type="time"
      etiqueta="Hora (opcional)"
      ayuda="Si la dejás en blanco, vale para todo el día."
      error={errors.hora?.message}
    />
  );

  const textoDelBoton = modo.tipo === "nueva" ? "Agregar tarea" : "Guardar cambios";

  return (
    <form
      onSubmit={handleSubmit((valores) => mutacion.mutate(valores))}
      noValidate
      className="flex flex-col gap-4"
    >
      <Campo
        {...register("titulo")}
        etiqueta="¿Qué hay que hacer?"
        placeholder="Por ejemplo: Pagar la luz"
        // Al abrirse para agregar, se puede escribir directo.
        autoFocus
        error={errors.titulo?.message}
      />

      {puedeElegirRepeticion ? (
        <Selector
          {...register("repeticion")}
          etiqueta="Se repite"
          error={errors.repeticion?.message}
        >
          {opcionesDeRepeticion.map((opcion) => (
            <option key={opcion} value={opcion}>
              {NOMBRES_DE_REPETICION_DE_TAREA[opcion]}
            </option>
          ))}
        </Selector>
      ) : null}

      {/* Lo que sigue cambia con la repetición: cada una se define con algo distinto. */}
      {repeticion === "ninguna" && !editaOcurrencia ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            {...register("fecha")}
            type="date"
            etiqueta="Para el día"
            error={errors.fecha?.message}
          />
          {campoDeHora}
        </div>
      ) : null}

      {editaOcurrencia ? campoDeHora : null}

      {repeticion === "diaria" ? campoDeHora : null}

      {repeticion === "intervalo" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              {...register("cadaDias")}
              type="number"
              inputMode="numeric"
              min={MINIMO_DE_DIAS_ENTRE_REPETICIONES}
              max={MAXIMO_DE_DIAS_ENTRE_REPETICIONES}
              etiqueta="Cada cuántos días"
              ayuda="2 es día por medio; 3, un día sí y dos no."
              error={errors.cadaDias?.message}
            />
            <Campo
              {...register("fechaInicio")}
              type="date"
              etiqueta="Empieza el día"
              error={errors.fechaInicio?.message}
            />
          </div>
          {campoDeHora}
        </>
      ) : null}

      {repeticion === "semanal" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectorDeDias
            registro={register("diasSemana")}
            error={(errors.diasSemana as { message?: string } | undefined)?.message}
          />
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
              Si un mes no tiene ese día, aparece el último día del mes.
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
                  {conMayuscula(nombre)}
                </option>
              ))}
            </Selector>
          </div>
          {campoDeHora}
        </>
      ) : null}

      {/* Solo para una repetitiva (la regla): sus tareas pueden darse por fallidas solas al pasar el día. */}
      {repeticion !== "ninguna" && !editaOcurrencia ? (
        <div className="flex flex-col gap-1">
          <Casilla
            marcada={fallaSola}
            onCambio={(marcada) => setValue("fallaSola", marcada)}
            etiqueta="Darla por fallida automáticamente si pasa el día"
          />
          <p className="pl-8 text-xs text-texto-secundario">
            Si no la completás ese día, queda como fallida en vez de quedar atrasada.
          </p>
        </div>
      ) : null}

      {/* Se muestra cuando ya se cargaron, para que la categoría de la tarea ya esté elegida al abrir. */}
      {categorias.data && categorias.data.categorias.length > 0 ? (
        <Selector
          {...register("categoriaId")}
          etiqueta="Categoría (opcional)"
          error={errors.categoriaId?.message}
        >
          <option value="">Sin categoría</option>
          {categorias.data.categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </Selector>
      ) : null}

      <div className="flex flex-col gap-1">
        <Casilla
          marcada={importante}
          onCambio={(marcada) => setValue("importante", marcada)}
          etiqueta="Marcar como importante"
        />
        <p className="pl-8 text-xs text-texto-secundario">
          Lleva una estrella para reconocerla de un vistazo.
        </p>
      </div>

      <AreaDeTexto
        {...register("notas")}
        etiqueta="Notas (opcional)"
        rows={2}
        maxLength={LARGO_MAXIMO_NOTAS_DE_TAREA}
        error={errors.notas?.message}
      />

      <p className="text-xs text-texto-secundario">
        {editaOcurrencia
          ? "Solo cambia la de hoy. Para cambiar todas, editala desde 'Repetitivas'."
          : repeticion === "ninguna"
            ? "Si no la hacés ese día, sigue en tu lista como atrasada hasta que la hagas."
            : "Aparece en tu lista cada vez que le toca. Si un día no la hacés, queda como atrasada hasta que la hagas o la marques como fallida."}
      </p>

      {mutacion.isError && !errors.fecha && !errors.categoriaId ? (
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
          {textoDelBoton}
        </Boton>
      </div>
    </form>
  );
}

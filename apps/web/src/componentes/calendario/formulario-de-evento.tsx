// Formulario para agregar o editar un evento del calendario.
//
// Un evento es de un solo día: se pide cómo se llama, el día (el que está elegido en el calendario,
// por defecto) y, si quiere, la hora y unas notas. Sin hora, vale para todo el día.
//
// La validación es la del servidor (`esquemaEventoDeCalendario` de @gestoria/shared): el formulario
// valida con el mismo esquema que usa la API, así las reglas no se desincronizan.

"use client";

import {
  type DatosDeEventoDeCalendario,
  esquemaEventoDeCalendario,
  LARGO_MAXIMO_NOTAS_DE_EVENTO,
  LARGO_MAXIMO_TITULO_DE_EVENTO,
} from "@gestoria/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FieldErrors, type Resolver, useForm } from "react-hook-form";
import { AreaDeTexto } from "@/componentes/ui/area-de-texto";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { crearEvento, editarEvento } from "@/lib/api-calendario";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";

export type ModoDeFormularioDeEvento =
  | { tipo: "nuevo"; dia: string }
  | { tipo: "editar"; id: string; datos: DatosDeEventoDeCalendario };

/** Valida con el esquema del servidor y pone cada mensaje en su campo (se muestra el primero de cada uno). */
const resolver: Resolver<DatosDeEventoDeCalendario> = async (valores) => {
  const resultado = esquemaEventoDeCalendario.safeParse(valores);
  if (resultado.success) return { values: valores, errors: {} };

  const errores: Record<string, { type: string; message: string }> = {};
  for (const problema of resultado.error.issues) {
    const campo = String(problema.path[0] ?? "titulo");
    errores[campo] ??= { type: "validate", message: problema.message };
  }
  return { values: {}, errors: errores as FieldErrors<DatosDeEventoDeCalendario> };
};

export function FormularioDeEvento({
  modo,
  cerrar,
  alGuardar,
}: {
  modo: ModoDeFormularioDeEvento;
  cerrar: () => void;
  /** Se llama cuando el evento quedó guardado, antes de cerrar, con el día en que quedó. */
  alGuardar?: ((dia: string) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosDeEventoDeCalendario>({
    resolver,
    defaultValues:
      modo.tipo === "editar" ? modo.datos : { titulo: "", notas: "", fecha: modo.dia, hora: "" },
  });

  const mutacion = useMutation({
    mutationFn: (datos: DatosDeEventoDeCalendario) =>
      modo.tipo === "editar" ? editarEvento(modo.id, datos) : crearEvento(datos),
    onSuccess: async (_respuesta, datos) => {
      await queryClient.invalidateQueries({ queryKey: ["calendario"] });
      alGuardar?.(datos.fecha);
      cerrar();
    },
    onError: (error) => {
      // Un día que no vale se explica junto a la fecha.
      const mensaje = detalleDeValidacion(error);
      if (mensaje && /día|fecha|año/i.test(mensaje)) setError("fecha", { message: mensaje });
    },
  });

  return (
    <form
      onSubmit={handleSubmit((datos) => mutacion.mutate(datos))}
      noValidate
      className="flex flex-col gap-4"
    >
      <Campo
        {...register("titulo")}
        etiqueta="¿Qué evento es?"
        placeholder="Por ejemplo: Turno con el dentista"
        maxLength={LARGO_MAXIMO_TITULO_DE_EVENTO}
        // Al abrirse para agregar, se puede escribir directo.
        autoFocus
        error={errors.titulo?.message}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo {...register("fecha")} type="date" etiqueta="Día" error={errors.fecha?.message} />
        <Campo
          {...register("hora")}
          type="time"
          etiqueta="Hora (opcional)"
          ayuda="Si la dejás en blanco, vale para todo el día."
          error={errors.hora?.message}
        />
      </div>

      <AreaDeTexto
        {...register("notas")}
        etiqueta="Notas (opcional)"
        rows={2}
        maxLength={LARGO_MAXIMO_NOTAS_DE_EVENTO}
        error={errors.notas?.message}
      />

      {mutacion.isError && !errors.fecha ? (
        <Aviso tono="peligro">
          {detalleDeValidacion(mutacion.error) ?? interpretarError(mutacion.error).mensaje}
        </Aviso>
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
          {modo.tipo === "editar" ? "Guardar cambios" : "Agregar evento"}
        </Boton>
      </div>
    </form>
  );
}

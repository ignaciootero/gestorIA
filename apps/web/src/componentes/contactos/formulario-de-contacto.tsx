// Formulario para crear o editar un contacto, persona o empresa/servicio.
//
// Los campos cambian según el tipo (una persona tiene apellido y fecha de nacimiento;
// una empresa, rubro, sitio web, horario, documento y persona de contacto) y el tipo no
// se puede cambiar después de crear el contacto. Teléfonos y correos son listas: arranca
// con una fila de cada una y se agregan más.
//
// Validación: el formulario arma los mismos datos que manda a la API y los valida con
// `esquemaContacto` de @gestoria/shared —los mismos que usa el servidor—, así que las
// reglas no se pueden desincronizar. Las filas en blanco de teléfonos y correos se
// descartan antes de validar (son filas que se agregaron y no se usaron); por eso hay
// que llevar la cuenta de qué fila era cuál para poner cada error en su lugar.

"use client";

import {
  type DatosDeContacto,
  esquemaContacto,
  LARGO_MAXIMO_NOMBRE_DE_ETIQUETA,
  MAXIMO_DE_CORREOS,
  MAXIMO_DE_TELEFONOS,
  TIPOS_DE_TELEFONO_VALIDOS,
  type TipoDeContacto,
  type TipoDeTelefono,
} from "@gestoria/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { type FieldErrors, type Resolver, useFieldArray, useForm } from "react-hook-form";
import { AreaDeTexto } from "@/componentes/ui/area-de-texto";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Casilla } from "@/componentes/ui/casilla";
import { Selector } from "@/componentes/ui/selector";
import {
  type Contacto,
  crearContacto,
  crearEtiqueta,
  editarContacto,
  obtenerEtiquetas,
} from "@/lib/api-contactos";
import { cn } from "@/lib/clases";
import { detalleDeValidacion, interpretarError } from "@/lib/mensajes-de-error";

const NOMBRES_DE_TELEFONO: Record<TipoDeTelefono, string> = { celular: "Celular", fijo: "Fijo" };

type ValoresDelFormulario = {
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  /** Solo al dar de alta a una persona con fecha de nacimiento. */
  recordarCumpleanos: boolean;
  rubro: string;
  sitioWeb: string;
  horario: string;
  documento: string;
  personaDeContacto: string;
  direccion: string;
  notas: string;
  favorito: boolean;
  telefonos: { numero: string; tipo: TipoDeTelefono }[];
  correos: { direccion: string }[];
  etiquetaIds: number[];
};

function valoresIniciales(contacto: Contacto | undefined): ValoresDelFormulario {
  return {
    nombre: contacto?.nombre ?? "",
    apellido: contacto?.apellido ?? "",
    fechaNacimiento: contacto?.fechaNacimiento ?? "",
    recordarCumpleanos: true,
    rubro: contacto?.rubro ?? "",
    sitioWeb: contacto?.sitioWeb ?? "",
    horario: contacto?.horario ?? "",
    documento: contacto?.documento ?? "",
    personaDeContacto: contacto?.personaDeContacto ?? "",
    direccion: contacto?.direccion ?? "",
    notas: contacto?.notas ?? "",
    favorito: contacto?.favorito ?? false,
    telefonos: contacto?.telefonos.length
      ? contacto.telefonos.map(({ numero, tipo }) => ({ numero, tipo }))
      : [{ numero: "", tipo: "celular" }],
    correos: contacto?.correos.length
      ? contacto.correos.map((direccion) => ({ direccion }))
      : [{ direccion: "" }],
    etiquetaIds: contacto?.etiquetas.map((etiqueta) => etiqueta.id) ?? [],
  };
}

/** Los datos que se mandan a la API, y de qué fila del formulario salió cada teléfono y correo. */
function aDatos(tipo: TipoDeContacto, valores: ValoresDelFormulario, alta = false) {
  const telefonos: { numero: string; tipo: TipoDeTelefono }[] = [];
  const filasDeTelefonos: number[] = [];
  valores.telefonos.forEach((telefono, fila) => {
    if (telefono.numero.trim() === "") return;
    telefonos.push({ numero: telefono.numero, tipo: telefono.tipo });
    filasDeTelefonos.push(fila);
  });

  const correos: string[] = [];
  const filasDeCorreos: number[] = [];
  valores.correos.forEach((correo, fila) => {
    if (correo.direccion.trim() === "") return;
    correos.push(correo.direccion);
    filasDeCorreos.push(fila);
  });

  const comunes = {
    nombre: valores.nombre,
    direccion: valores.direccion,
    notas: valores.notas,
    favorito: valores.favorito,
    telefonos,
    correos,
    etiquetaIds: valores.etiquetaIds,
  };
  const datos: DatosDeContacto =
    tipo === "persona"
      ? {
          tipo,
          ...comunes,
          apellido: valores.apellido,
          fechaNacimiento: valores.fechaNacimiento,
          ...(alta && valores.fechaNacimiento !== ""
            ? { recordarCumpleanos: valores.recordarCumpleanos }
            : {}),
        }
      : {
          tipo,
          ...comunes,
          rubro: valores.rubro,
          sitioWeb: valores.sitioWeb,
          horario: valores.horario,
          documento: valores.documento,
          personaDeContacto: valores.personaDeContacto,
        };
  return { datos, filasDeTelefonos, filasDeCorreos };
}

/** Pone `valor` en `destino` siguiendo `camino` (["telefonos", 1, "numero"]), creando lo que falte. */
function ponerEnElCamino(
  destino: Record<string, unknown>,
  camino: (string | number)[],
  valor: unknown,
) {
  let actual: Record<string | number, unknown> = destino;
  camino.forEach((paso, posicion) => {
    if (posicion === camino.length - 1) {
      // El primer error de cada campo es el que se muestra.
      if (actual[paso] === undefined) actual[paso] = valor;
      return;
    }
    const siguiente = camino[posicion + 1];
    if (actual[paso] === undefined) actual[paso] = typeof siguiente === "number" ? [] : {};
    actual = actual[paso] as Record<string | number, unknown>;
  });
}

function resolverDe(tipo: TipoDeContacto): Resolver<ValoresDelFormulario> {
  return async (valores) => {
    const { datos, filasDeTelefonos, filasDeCorreos } = aDatos(tipo, valores);
    const resultado = esquemaContacto.safeParse(datos);
    if (resultado.success) return { values: valores, errors: {} };

    const errores: Record<string, unknown> = {};
    for (const problema of resultado.error.issues) {
      const [campo, indice, subcampo] = problema.path;
      const entrada = { type: "validate", message: problema.message };

      if (campo === "telefonos" && typeof indice === "number") {
        ponerEnElCamino(
          errores,
          ["telefonos", filasDeTelefonos[indice] ?? indice, String(subcampo ?? "numero")],
          entrada,
        );
      } else if (campo === "correos" && typeof indice === "number") {
        ponerEnElCamino(
          errores,
          ["correos", filasDeCorreos[indice] ?? indice, "direccion"],
          entrada,
        );
      } else if (typeof campo === "string") {
        ponerEnElCamino(errores, [campo], entrada);
      }
    }
    return { values: {}, errors: errores as FieldErrors<ValoresDelFormulario> };
  };
}

function hoyEnTexto(): string {
  const ahora = new Date();
  const dos = (numero: number) => String(numero).padStart(2, "0");
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

function mensajeDe(error: unknown): string {
  return detalleDeValidacion(error) ?? interpretarError(error).mensaje;
}

/** Las etiquetas para tildar, y una forma rápida de crear una nueva sin salir del formulario. */
function SelectorDeEtiquetas({
  seleccionadas,
  onCambiar,
}: {
  seleccionadas: number[];
  onCambiar: (ids: number[]) => void;
}) {
  const queryClient = useQueryClient();
  const [nueva, setNueva] = useState("");
  const { data } = useQuery({ queryKey: ["contactos", "etiquetas"], queryFn: obtenerEtiquetas });
  const etiquetas = data?.etiquetas ?? [];

  const crear = useMutation({
    mutationFn: (nombre: string) => crearEtiqueta(nombre),
    onSuccess: async (etiqueta) => {
      await queryClient.invalidateQueries({ queryKey: ["contactos", "etiquetas"] });
      onCambiar([...seleccionadas, etiqueta.id]);
      setNueva("");
    },
  });

  function alternar(id: number) {
    onCambiar(
      seleccionadas.includes(id)
        ? seleccionadas.filter((otra) => otra !== id)
        : [...seleccionadas, id],
    );
  }

  const nombreNuevo = nueva.trim();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-texto">Etiquetas</legend>

      {etiquetas.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {etiquetas.map((etiqueta) => {
            const activa = seleccionadas.includes(etiqueta.id);
            return (
              <button
                key={etiqueta.id}
                type="button"
                aria-pressed={activa}
                onClick={() => alternar(etiqueta.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors duration-(--duracion-rapida) ease-salida",
                  activa
                    ? "border-acento bg-acento-suave text-acento-suave-texto"
                    : "border-borde-fuerte bg-superficie text-texto hover:border-acento/40 hover:bg-superficie-suave",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: etiqueta.color }}
                />
                {etiqueta.nombre}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-texto-secundario">
          Todavía no tenés etiquetas. Escribí una abajo para crear la primera.
        </p>
      )}

      <div className="flex items-end gap-2">
        <Campo
          etiqueta="Nueva etiqueta"
          value={nueva}
          maxLength={LARGO_MAXIMO_NOMBRE_DE_ETIQUETA}
          onChange={(evento) => setNueva(evento.target.value)}
          onKeyDown={(evento) => {
            // Enter crea la etiqueta, no envía todo el formulario.
            if (evento.key === "Enter") {
              evento.preventDefault();
              if (nombreNuevo !== "") crear.mutate(nombreNuevo);
            }
          }}
          className="flex-1"
        />
        <Boton
          type="button"
          variante="secundario"
          disabled={nombreNuevo === ""}
          cargando={crear.isPending}
          textoCargando="Creando"
          onClick={() => crear.mutate(nombreNuevo)}
        >
          <Plus aria-hidden="true" className="size-4" />
          Crear
        </Boton>
      </div>
      {crear.isError ? <Aviso tono="peligro">{mensajeDe(crear.error)}</Aviso> : null}
    </fieldset>
  );
}

export function FormularioDeContacto({
  tipo,
  contacto,
  cerrar,
  alGuardar,
}: {
  tipo: TipoDeContacto;
  /** Si viene, se edita; si no, se crea uno nuevo del `tipo` dado. */
  contacto?: Contacto | undefined;
  cerrar: () => void;
  /** Se llama con el contacto ya guardado, después de cerrar. */
  alGuardar: (contacto: Contacto) => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ValoresDelFormulario>({
    resolver: resolverDe(tipo),
    defaultValues: valoresIniciales(contacto),
  });

  const telefonos = useFieldArray({ control, name: "telefonos" });
  const correos = useFieldArray({ control, name: "correos" });

  const mutacion = useMutation({
    mutationFn: (datos: DatosDeContacto) =>
      contacto ? editarContacto(contacto.id, datos) : crearContacto(datos),
    onSuccess: async (guardado) => {
      await queryClient.invalidateQueries({ queryKey: ["contactos"] });
      // Primero se cierra y después se avisa: quien recibe el contacto puede abrir otro
      // diálogo (la ficha) y no tiene que quedar pisado por el cierre.
      cerrar();
      alGuardar(guardado);
    },
    onError: (error) => {
      const mensaje = detalleDeValidacion(error);
      if (mensaje?.toLowerCase().includes("nacimiento")) {
        setError("fechaNacimiento", { message: mensaje });
      }
    },
  });

  const esPersona = tipo === "persona";

  return (
    <form
      onSubmit={handleSubmit((valores) =>
        mutacion.mutate(aDatos(tipo, valores, contacto === undefined).datos),
      )}
      noValidate
      className="flex flex-col gap-4"
    >
      {esPersona ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            {...register("nombre")}
            etiqueta="Nombre"
            autoComplete="off"
            autoFocus
            error={errors.nombre?.message}
          />
          <Campo
            {...register("apellido")}
            etiqueta="Apellido"
            autoComplete="off"
            error={errors.apellido?.message}
          />
        </div>
      ) : (
        <>
          <Campo
            {...register("nombre")}
            etiqueta="Nombre de la empresa o servicio"
            autoComplete="off"
            autoFocus
            error={errors.nombre?.message}
          />
          <Campo
            {...register("rubro")}
            etiqueta="Rubro"
            placeholder="Por ejemplo: electricista, banco, veterinaria"
            autoComplete="off"
            error={errors.rubro?.message}
          />
        </>
      )}

      {esPersona ? (
        <div className="flex flex-col gap-2">
          <Campo
            {...register("fechaNacimiento")}
            type="date"
            etiqueta="Fecha de nacimiento"
            max={hoyEnTexto()}
            error={errors.fechaNacimiento?.message}
          />
          {/* Solo al dar de alta y con la fecha cargada; marcada de entrada. */}
          {contacto === undefined && watch("fechaNacimiento") !== "" ? (
            <Casilla
              etiqueta="Crear un recordatorio de su cumpleaños"
              marcada={watch("recordarCumpleanos")}
              onCambio={(marcada) => setValue("recordarCumpleanos", marcada, { shouldDirty: true })}
            />
          ) : null}
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-texto">Teléfonos</legend>
        {telefonos.fields.map((fila, posicion) => (
          <div key={fila.id} className="flex items-start gap-2">
            <div className="w-28 shrink-0">
              <Selector
                {...register(`telefonos.${posicion}.tipo`)}
                etiqueta={`Tipo ${posicion + 1}`}
                className="px-2"
              >
                {TIPOS_DE_TELEFONO_VALIDOS.map((opcion) => (
                  <option key={opcion} value={opcion}>
                    {NOMBRES_DE_TELEFONO[opcion]}
                  </option>
                ))}
              </Selector>
            </div>
            <div className="min-w-0 flex-1">
              <Campo
                {...register(`telefonos.${posicion}.numero`)}
                etiqueta={`Número ${posicion + 1}`}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="099 123 456"
                error={errors.telefonos?.[posicion]?.numero?.message}
              />
            </div>
            <Boton
              type="button"
              variante="sutil"
              aria-label={`Quitar el teléfono ${posicion + 1}`}
              className="mt-7 shrink-0"
              onClick={() => telefonos.remove(posicion)}
            >
              <Trash2 aria-hidden="true" className="size-4 text-peligro" />
            </Boton>
          </div>
        ))}
        {telefonos.fields.length < MAXIMO_DE_TELEFONOS ? (
          <Boton
            type="button"
            variante="sutil"
            tamano="chico"
            className="self-start"
            onClick={() => telefonos.append({ numero: "", tipo: "celular" })}
          >
            <Plus aria-hidden="true" className="size-4" />
            Agregar teléfono
          </Boton>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-texto">Correos</legend>
        {correos.fields.map((fila, posicion) => (
          <div key={fila.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Campo
                {...register(`correos.${posicion}.direccion`)}
                etiqueta={`Correo ${posicion + 1}`}
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="nombre@ejemplo.com"
                error={errors.correos?.[posicion]?.direccion?.message}
              />
            </div>
            <Boton
              type="button"
              variante="sutil"
              aria-label={`Quitar el correo ${posicion + 1}`}
              className="mt-7 shrink-0"
              onClick={() => correos.remove(posicion)}
            >
              <Trash2 aria-hidden="true" className="size-4 text-peligro" />
            </Boton>
          </div>
        ))}
        {correos.fields.length < MAXIMO_DE_CORREOS ? (
          <Boton
            type="button"
            variante="sutil"
            tamano="chico"
            className="self-start"
            onClick={() => correos.append({ direccion: "" })}
          >
            <Plus aria-hidden="true" className="size-4" />
            Agregar correo
          </Boton>
        ) : null}
      </fieldset>

      {esPersona ? null : (
        <Campo
          {...register("sitioWeb")}
          etiqueta="Sitio web"
          inputMode="url"
          autoComplete="off"
          placeholder="www.ejemplo.com.uy"
          error={errors.sitioWeb?.message}
        />
      )}

      <Campo
        {...register("direccion")}
        etiqueta="Dirección"
        autoComplete="off"
        error={errors.direccion?.message}
      />

      {esPersona ? null : (
        <>
          <Campo
            {...register("horario")}
            etiqueta="Horario de atención"
            placeholder="Por ejemplo: lunes a viernes de 9 a 18"
            autoComplete="off"
            error={errors.horario?.message}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              {...register("documento")}
              etiqueta="RUT o documento"
              autoComplete="off"
              error={errors.documento?.message}
            />
            <Campo
              {...register("personaDeContacto")}
              etiqueta="Persona de contacto"
              autoComplete="off"
              error={errors.personaDeContacto?.message}
            />
          </div>
        </>
      )}

      <AreaDeTexto {...register("notas")} etiqueta="Notas" error={errors.notas?.message} />

      <SelectorDeEtiquetas
        seleccionadas={watch("etiquetaIds")}
        onCambiar={(ids) => setValue("etiquetaIds", ids, { shouldDirty: true })}
      />

      <Casilla
        etiqueta="Marcar como favorito"
        marcada={watch("favorito")}
        onCambio={(marcada) => setValue("favorito", marcada, { shouldDirty: true })}
      />

      {mutacion.isError && !errors.fechaNacimiento ? (
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
          {contacto ? "Guardar cambios" : "Guardar contacto"}
        </Boton>
      </div>
    </form>
  );
}

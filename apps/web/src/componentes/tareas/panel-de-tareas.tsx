// Panel del módulo de tareas: cuatro secciones (hoy, repetitivas, historial y categorías) y el botón de "Agregar
// tarea" siempre a mano, porque es la acción más frecuente (docs/guias/usabilidad.md, "Lo más
// usado, a mano"). Para lo más rápido —una tarea para hoy— está además el campo de la pestaña Hoy.
//
// Los formularios y las confirmaciones viven en diálogos, de a uno por vez. Se montan solo mientras
// están abiertos, así cada apertura arranca con un formulario nuevo en vez de arrastrar lo que
// quedó escrito la vez anterior (mismo patrón que PanelDeContactos).

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import {
  eliminarTarea,
  eliminarTareaRepetitiva,
  type Tarea,
  type TareaRepetitiva,
} from "@/lib/api-tareas";
import { interpretarError } from "@/lib/mensajes-de-error";
import { FormularioDeTarea, type ModoDeFormulario } from "./formulario-de-tarea";
import { HistorialDeTareas } from "./historial-de-tareas";
import { ListaDeHoy } from "./lista-de-hoy";
import { ListaDeRepetitivas } from "./lista-de-repetitivas";
import { SeccionDeCategoriasDeTarea } from "./seccion-de-categorias";

type Seccion = "hoy" | "repetitivas" | "historial" | "categorias";

const SECCIONES = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "repetitivas", etiqueta: "Repetitivas" },
  { valor: "historial", etiqueta: "Historial" },
  { valor: "categorias", etiqueta: "Categorías" },
] as const;

/** Qué diálogo está abierto. Uno solo a la vez. */
type Dialogos =
  | { tipo: "formulario"; modo: ModoDeFormulario }
  | { tipo: "eliminar-tarea"; tarea: Tarea }
  | { tipo: "eliminar-repetitiva"; repetitiva: TareaRepetitiva };

const ANCHO_DE_FORMULARIO = "max-h-full max-w-xl overflow-y-auto";

export function PanelDeTareas() {
  const queryClient = useQueryClient();
  const [seccion, setSeccion] = useState<Seccion>("hoy");
  const [dialogo, setDialogo] = useState<Dialogos | null>(null);

  const eliminar = useMutation({
    mutationFn: (que: { tarea: Tarea } | { repetitiva: TareaRepetitiva }) =>
      "tarea" in que ? eliminarTarea(que.tarea.id) : eliminarTareaRepetitiva(que.repetitiva.id),
    onSuccess: async () => {
      setDialogo(null);
      await queryClient.invalidateQueries({ queryKey: ["tareas"] });
    },
  });

  function cerrarDialogo() {
    setDialogo(null);
  }

  /** Lo que hace cada <dialog> al cerrarse: limpiar el estado, pero solo si sigue siendo el suyo. */
  function alCerrarseEl(tipo: Dialogos["tipo"]) {
    return () => setDialogo((actual) => (actual?.tipo === tipo ? null : actual));
  }

  function agregar() {
    setDialogo({ tipo: "formulario", modo: { tipo: "nueva" } });
  }

  function confirmarEliminar(que: Dialogos) {
    eliminar.reset();
    setDialogo(que);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SelectorDeSegmentos
          id="seccion-tareas"
          etiqueta="Sección del módulo de tareas"
          segmentos={SECCIONES}
          activo={seccion}
          onCambiar={setSeccion}
          className="sm:max-w-md [&>button]:px-1 [&>button]:text-xs sm:[&>button]:px-4 sm:[&>button]:text-sm"
        />

        <Boton onClick={agregar} className="shrink-0">
          <Plus aria-hidden="true" className="size-4" />
          Agregar tarea
        </Boton>
      </div>

      <div
        role="tabpanel"
        id={`panel-seccion-tareas-${seccion}`}
        aria-labelledby={`seccion-tareas-${seccion}`}
      >
        {seccion === "hoy" ? (
          <ListaDeHoy
            alEditar={(tarea) => setDialogo({ tipo: "formulario", modo: { tipo: "tarea", tarea } })}
            alEliminar={(tarea) => confirmarEliminar({ tipo: "eliminar-tarea", tarea })}
          />
        ) : null}
        {seccion === "repetitivas" ? (
          <ListaDeRepetitivas
            alAgregar={agregar}
            alEditar={(repetitiva) =>
              setDialogo({ tipo: "formulario", modo: { tipo: "repetitiva", repetitiva } })
            }
            alEliminar={(repetitiva) =>
              confirmarEliminar({ tipo: "eliminar-repetitiva", repetitiva })
            }
          />
        ) : null}
        {seccion === "historial" ? <HistorialDeTareas /> : null}
        {seccion === "categorias" ? <SeccionDeCategoriasDeTarea /> : null}
      </div>

      <Dialogo
        abierto={dialogo?.tipo === "formulario"}
        onCerrar={alCerrarseEl("formulario")}
        titulo={
          dialogo?.tipo === "formulario" && dialogo.modo.tipo !== "nueva"
            ? "Editar tarea"
            : "Agregar tarea"
        }
        icono={dialogo?.tipo === "formulario" && dialogo.modo.tipo !== "nueva" ? Pencil : ListPlus}
        className={ANCHO_DE_FORMULARIO}
      >
        {dialogo?.tipo === "formulario" ? (
          <FormularioDeTarea modo={dialogo.modo} cerrar={cerrarDialogo} />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "eliminar-tarea"}
        onCerrar={alCerrarseEl("eliminar-tarea")}
        titulo="Eliminar tarea"
        icono={Trash2}
        tono="peligro"
      >
        {dialogo?.tipo === "eliminar-tarea" ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina “{dialogo.tarea.titulo}”.
              {dialogo.tarea.repetitiva
                ? " Solo la de este día: la tarea repetitiva sigue y mañana vuelve a aparecer."
                : ""}
            </p>
            {eliminar.isError ? (
              <Aviso tono="peligro">{interpretarError(eliminar.error).mensaje}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={cerrarDialogo}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate({ tarea: dialogo.tarea })}
              >
                Eliminar
              </Boton>
            </div>
          </>
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "eliminar-repetitiva"}
        onCerrar={alCerrarseEl("eliminar-repetitiva")}
        titulo="Eliminar tarea repetitiva"
        icono={Trash2}
        tono="peligro"
      >
        {dialogo?.tipo === "eliminar-repetitiva" ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina “{dialogo.repetitiva.titulo}”: deja de aparecer en tu lista desde hoy. Lo
              que ya hiciste o dejaste sin hacer en días anteriores queda en el historial.
            </p>
            {eliminar.isError ? (
              <Aviso tono="peligro">{interpretarError(eliminar.error).mensaje}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={cerrarDialogo}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate({ repetitiva: dialogo.repetitiva })}
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

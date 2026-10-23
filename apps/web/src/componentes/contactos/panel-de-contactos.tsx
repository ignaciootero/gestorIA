// Panel del módulo de contactos: tres secciones (contactos, recordatorios y etiquetas) y el
// botón de agregar siempre a mano, porque es la acción más frecuente (docs/guias/usabilidad.md,
// "Lo más usado, a mano"): "Agregar recordatorio" en la pestaña Recordatorios y "Agregar
// contacto" en las demás.
//
// Los formularios y la ficha viven en diálogos, de a uno por vez. Se montan solo mientras
// están abiertos, así cada apertura arranca con un formulario nuevo en vez de arrastrar lo
// que quedó escrito la vez anterior (mismo patrón que PanelDeFinanzas).

"use client";

import { nombreCompletoDeContacto, type TipoDeContacto } from "@gestoria/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellPlus, BookUser, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { type Contacto, eliminarContacto } from "@/lib/api-contactos";
import { interpretarError } from "@/lib/mensajes-de-error";
import { FichaDeContacto } from "./ficha-de-contacto";
import { FormularioDeContacto } from "./formulario-de-contacto";
import { ListaDeRecordatorios } from "./lista-de-recordatorios";
import { ListadoDeContactos } from "./listado-de-contactos";
import { RecordatorioNuevo } from "./recordatorio-nuevo";
import { SeccionDeEtiquetas } from "./seccion-de-etiquetas";

type Seccion = "contactos" | "recordatorios" | "etiquetas";

const SECCIONES = [
  { valor: "contactos", etiqueta: "Contactos" },
  { valor: "recordatorios", etiqueta: "Recordatorios" },
  { valor: "etiquetas", etiqueta: "Etiquetas" },
] as const;

const TIPOS = [
  { valor: "persona", etiqueta: "Persona" },
  { valor: "empresa", etiqueta: "Empresa o servicio" },
] as const;

/** Qué diálogo está abierto. Uno solo a la vez. */
type Dialogos =
  | { tipo: "agregar" }
  | { tipo: "recordatorio" }
  | { tipo: "ficha"; id: string }
  | { tipo: "editar"; contacto: Contacto }
  | { tipo: "eliminar"; contacto: Contacto };

const ANCHO_DE_FORMULARIO = "max-h-full max-w-xl overflow-y-auto";

export function PanelDeContactos({ fichaInicialId }: { fichaInicialId?: string | undefined }) {
  const queryClient = useQueryClient();
  const [seccion, setSeccion] = useState<Seccion>("contactos");
  // Con un contacto en la URL ("/contactos?contacto=<id>"), la pantalla arranca con su ficha abierta.
  const [dialogo, setDialogo] = useState<Dialogos | null>(
    fichaInicialId ? { tipo: "ficha", id: fichaInicialId } : null,
  );
  const [tipoNuevo, setTipoNuevo] = useState<TipoDeContacto>("persona");

  const eliminar = useMutation({
    mutationFn: (id: string) => eliminarContacto(id),
    onSuccess: async () => {
      setDialogo(null);
      await queryClient.invalidateQueries({ queryKey: ["contactos"] });
    },
  });

  function cerrarDialogo() {
    setDialogo(null);
  }

  /** Lo que hace cada <dialog> al cerrarse: limpiar el estado, pero solo si sigue siendo el suyo. */
  function alCerrarseEl(tipo: Dialogos["tipo"]) {
    return () => {
      setDialogo((actual) => (actual?.tipo === tipo ? null : actual));
      // Cerrada la ficha que vino de un enlace, la URL vuelve a ser la de siempre: recargar no la reabre.
      if (tipo === "ficha" && window.location.search !== "") {
        window.history.replaceState(null, "", window.location.pathname);
      }
    };
  }

  function agregar() {
    setTipoNuevo("persona");
    setDialogo({ tipo: "agregar" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SelectorDeSegmentos
          id="seccion-contactos"
          etiqueta="Sección del módulo de contactos"
          segmentos={SECCIONES}
          activo={seccion}
          onCambiar={setSeccion}
          className="sm:max-w-md [&>button]:px-2 sm:[&>button]:px-4"
        />

        {/* En Recordatorios la acción más frecuente es otra: agregar un recordatorio. */}
        {seccion === "recordatorios" ? (
          <Boton onClick={() => setDialogo({ tipo: "recordatorio" })} className="shrink-0">
            <BellPlus aria-hidden="true" className="size-4" />
            Agregar recordatorio
          </Boton>
        ) : (
          <Boton onClick={agregar} className="shrink-0">
            <Plus aria-hidden="true" className="size-4" />
            Agregar contacto
          </Boton>
        )}
      </div>

      <div
        role="tabpanel"
        id={`panel-seccion-contactos-${seccion}`}
        aria-labelledby={`seccion-contactos-${seccion}`}
      >
        {seccion === "contactos" ? (
          <ListadoDeContactos
            alAbrir={(id) => setDialogo({ tipo: "ficha", id })}
            alAgregar={agregar}
          />
        ) : null}
        {seccion === "recordatorios" ? (
          <ListaDeRecordatorios alAbrir={(id) => setDialogo({ tipo: "ficha", id })} />
        ) : null}
        {seccion === "etiquetas" ? <SeccionDeEtiquetas /> : null}
      </div>

      <Dialogo
        abierto={dialogo?.tipo === "agregar"}
        onCerrar={alCerrarseEl("agregar")}
        titulo="Agregar contacto"
        icono={UserPlus}
        className={ANCHO_DE_FORMULARIO}
      >
        {dialogo?.tipo === "agregar" ? (
          <>
            <SelectorDeSegmentos
              id="tipo-de-contacto-nuevo"
              etiqueta="Tipo de contacto"
              modo="filtro"
              segmentos={TIPOS}
              activo={tipoNuevo}
              onCambiar={setTipoNuevo}
            />
            {/* `key` por tipo: al cambiar entre persona y empresa, el formulario arranca limpio. */}
            <FormularioDeContacto
              key={tipoNuevo}
              tipo={tipoNuevo}
              cerrar={cerrarDialogo}
              // Al crear uno se abre su ficha: ahí se le agregan los recordatorios.
              alGuardar={(creado) => setDialogo({ tipo: "ficha", id: creado.id })}
            />
          </>
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "recordatorio"}
        onCerrar={alCerrarseEl("recordatorio")}
        titulo="Agregar recordatorio"
        icono={BellPlus}
        className={ANCHO_DE_FORMULARIO}
      >
        {dialogo?.tipo === "recordatorio" ? <RecordatorioNuevo cerrar={cerrarDialogo} /> : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "ficha"}
        onCerrar={alCerrarseEl("ficha")}
        titulo="Contacto"
        icono={BookUser}
        className="max-h-full max-w-lg overflow-y-auto"
      >
        {dialogo?.tipo === "ficha" ? (
          <FichaDeContacto
            id={dialogo.id}
            cerrar={cerrarDialogo}
            alEditar={(contacto) => setDialogo({ tipo: "editar", contacto })}
            alEliminar={(contacto) => {
              eliminar.reset();
              setDialogo({ tipo: "eliminar", contacto });
            }}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "editar"}
        onCerrar={alCerrarseEl("editar")}
        titulo="Editar contacto"
        icono={Pencil}
        className={ANCHO_DE_FORMULARIO}
      >
        {dialogo?.tipo === "editar" ? (
          <FormularioDeContacto
            tipo={dialogo.contacto.tipo}
            contacto={dialogo.contacto}
            cerrar={cerrarDialogo}
            alGuardar={(guardado) => setDialogo({ tipo: "ficha", id: guardado.id })}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "eliminar"}
        onCerrar={alCerrarseEl("eliminar")}
        titulo="Eliminar contacto"
        icono={Trash2}
        tono="peligro"
      >
        {dialogo?.tipo === "eliminar" ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina a {nombreCompletoDeContacto(dialogo.contacto)} con sus teléfonos, correos y
              recordatorios. Deja de aparecer en tus listas y en tus avisos.
            </p>
            {eliminar.isError ? (
              <Aviso tono="peligro">{interpretarError(eliminar.error).mensaje}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton
                variante="sutil"
                onClick={() => setDialogo({ tipo: "ficha", id: dialogo.contacto.id })}
              >
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate(dialogo.contacto.id)}
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

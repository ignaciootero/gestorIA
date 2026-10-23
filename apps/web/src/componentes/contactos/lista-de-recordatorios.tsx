// Pestaña "Recordatorios" de Contactos: los de todos los contactos, en dos listas.
//
// - Próximos: los recordatorios vigentes, el que cae antes primero, agrupados por cuándo caen.
// - Pasados: el histórico. Cada vez que un recordatorio cae y su día pasa, queda una entrada acá —
//   también en los que se repiten: el recordatorio principal sigue vivo y avisando—, la más reciente
//   primero. Se puede eliminar una entrada suelta o vaciar todo el histórico; ninguna de las dos cosas
//   toca los recordatorios (el aviso de "Vaciar historial" lo explica).
//
// Se puede buscar por texto (en el título o en el nombre del contacto) y filtrar por contacto y por
// cómo se repite. Los filtros los resuelve la API. La búsqueda espera a que se deje de escribir
// (300 ms) y, mientras llega la respuesta, se sigue viendo la lista anterior. Tocar uno abre la ficha
// de su contacto; en los próximos además se editan (el mismo formulario de la ficha, en un diálogo) y se
// eliminan (con confirmación) directo desde la fila.

"use client";

import {
  describirProgramacion,
  formatearDiaDeCalendario,
  NOMBRES_DE_REPETICION,
  nombreCompletoDeContacto,
  REPETICIONES_VALIDAS,
  type Repeticion,
} from "@gestoria/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  FilterX,
  History,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { DistintivoImportante } from "@/componentes/ui/distintivo-importante";
import { Selector } from "@/componentes/ui/selector";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  type EntradaDelHistorial,
  eliminarDelHistorial,
  eliminarRecordatorio,
  obtenerHistorialDeRecordatorios,
  obtenerOpcionesDeContactos,
  obtenerRecordatorios,
  type RecordatorioConContacto,
  vaciarElHistorial,
} from "@/lib/api-contactos";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { AvatarDeContacto } from "./avatar-de-contacto";
import { EditarRecordatorio } from "./editar-recordatorio";

type Estado = "proximos" | "pasados";

const ESTADOS = [
  { valor: "proximos", etiqueta: "Próximos" },
  { valor: "pasados", etiqueta: "Pasados" },
] as const;

/** Los próximos, de lo más cercano a lo más lejano. */
const GRUPOS_DE_PROXIMOS = [
  { titulo: "Hoy", contiene: (dias: number) => dias === 0 },
  { titulo: "Esta semana", contiene: (dias: number) => dias >= 1 && dias < 7 },
  { titulo: "Este mes", contiene: (dias: number) => dias >= 7 && dias < 30 },
  { titulo: "Más adelante", contiene: (dias: number) => dias >= 30 },
];

/** Los pasados, de lo más reciente a lo más viejo (`dias` es cuántos días pasaron). */
const GRUPOS_DE_PASADOS = [
  { titulo: "Ayer", contiene: (dias: number) => dias === 1 },
  { titulo: "La última semana", contiene: (dias: number) => dias >= 2 && dias <= 7 },
  { titulo: "El último mes", contiene: (dias: number) => dias >= 8 && dias <= 30 },
  { titulo: "Antes", contiene: (dias: number) => dias > 30 },
];

/** "ayer", "hace 3 días": cuánto hace que pasó una entrada del histórico. */
function haceCuanto(diasAtras: number): string {
  return diasAtras === 1 ? "ayer" : `hace ${diasAtras} días`;
}

export function ListaDeRecordatorios({ alAbrir }: { alAbrir: (contactoId: string) => void }) {
  const [estado, setEstado] = useState<Estado>("proximos");
  const [busquedaEscrita, setBusquedaEscrita] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [contactoId, setContactoId] = useState("");
  const [repeticion, setRepeticion] = useState<Repeticion | "">("");
  const [vaciando, setVaciando] = useState(false);
  const [editando, setEditando] = useState<RecordatorioConContacto | null>(null);

  useEffect(() => {
    const espera = setTimeout(() => setBusqueda(busquedaEscrita.trim()), 300);
    return () => clearTimeout(espera);
  }, [busquedaEscrita]);

  const pasados = estado === "pasados";
  const filtros = {
    busqueda,
    contactoId: contactoId === "" ? undefined : contactoId,
    repeticion: repeticion === "" ? undefined : repeticion,
  };

  const contactos = useQuery({
    queryKey: ["contactos", "opciones"],
    queryFn: obtenerOpcionesDeContactos,
  });
  // Una sola de las dos consultas está activa, según la lista que se mira.
  const proximos = useQuery({
    queryKey: ["contactos", "recordatorios", filtros],
    queryFn: () => obtenerRecordatorios({ ...filtros, limit: 200 }),
    placeholderData: keepPreviousData,
    enabled: !pasados,
  });
  const historial = useQuery({
    queryKey: ["contactos", "historial", filtros],
    queryFn: () => obtenerHistorialDeRecordatorios({ ...filtros, limit: 200 }),
    placeholderData: keepPreviousData,
    enabled: pasados,
  });

  const cantidadDeFiltros =
    (busquedaEscrita.trim() !== "" ? 1 : 0) +
    (contactoId !== "" ? 1 : 0) +
    (repeticion !== "" ? 1 : 0);
  const hayFiltros = busqueda !== "" || contactoId !== "" || repeticion !== "";

  function limpiarFiltros() {
    setBusquedaEscrita("");
    setBusqueda("");
    setContactoId("");
    setRepeticion("");
  }

  const consulta = pasados ? historial : proximos;
  const sinHistorial = pasados && !hayFiltros && (historial.data?.total ?? 0) === 0;

  const tarjetaDeFiltros = (
    <Tarjeta className="flex flex-col gap-3 p-4">
      <SelectorDeSegmentos
        id="estado-de-recordatorios"
        etiqueta="Qué recordatorios ver"
        modo="filtro"
        segmentos={ESTADOS}
        activo={estado}
        onCambiar={setEstado}
        className="sm:max-w-xs"
      />

      <form
        aria-label="Filtros de los recordatorios"
        onSubmit={(evento) => evento.preventDefault()}
        className="flex flex-col gap-3"
      >
        {/* Alto fijo (el del botón): al poner un filtro aparece "Limpiar filtros" y el encabezado no cambia de tamaño. */}
        <div className="flex h-9 items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-texto">
            <SlidersHorizontal aria-hidden="true" className="size-4 text-texto-secundario" />
            Filtros
            {cantidadDeFiltros > 0 ? (
              <span className="numeros-tabulares rounded-full bg-acento px-1.5 text-[10px] leading-4 font-semibold text-acento-texto">
                {cantidadDeFiltros}
                <span className="solo-lectores">
                  {cantidadDeFiltros === 1 ? " filtro puesto" : " filtros puestos"}
                </span>
              </span>
            ) : null}
          </h2>
          {cantidadDeFiltros > 0 ? (
            <Boton variante="sutil" tamano="chico" onClick={limpiarFiltros}>
              <FilterX aria-hidden="true" className="size-4" />
              Limpiar filtros
            </Boton>
          ) : null}
          {pasados ? (
            <Boton
              variante="sutil"
              tamano="chico"
              className="ml-auto"
              disabled={sinHistorial}
              onClick={() => setVaciando(true)}
            >
              <Trash2 aria-hidden="true" className="size-4 text-peligro" />
              Vaciar historial
            </Boton>
          ) : null}
        </div>

        <Campo
          etiqueta="Buscar"
          icono={Search}
          placeholder="Título del recordatorio o nombre del contacto"
          value={busquedaEscrita}
          onChange={(evento) => setBusquedaEscrita(evento.target.value)}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Selector
            etiqueta="Contacto"
            value={contactoId}
            onChange={(evento) => setContactoId(evento.target.value)}
          >
            <option value="">Todos</option>
            {contactos.data?.contactos.map((contacto) => (
              <option key={contacto.id} value={contacto.id}>
                {nombreCompletoDeContacto(contacto)}
              </option>
            ))}
          </Selector>
          <Selector
            etiqueta="Se repite"
            value={repeticion}
            onChange={(evento) => setRepeticion(evento.target.value as Repeticion | "")}
          >
            <option value="">Todos</option>
            {REPETICIONES_VALIDAS.map((opcion) => (
              <option key={opcion} value={opcion}>
                {NOMBRES_DE_REPETICION[opcion]}
              </option>
            ))}
          </Selector>
        </div>
      </form>
    </Tarjeta>
  );

  return (
    <div className="flex flex-col gap-4">
      {tarjetaDeFiltros}

      {consulta.isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando recordatorios</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      ) : consulta.error ? (
        <Aviso tono="peligro">{interpretarError(consulta.error).mensaje}</Aviso>
      ) : pasados ? (
        <ListaDelHistorial
          entradas={historial.data?.entradas ?? []}
          total={historial.data?.total ?? 0}
          hayFiltros={hayFiltros}
          alAbrir={alAbrir}
        />
      ) : (
        <ListaDeProximos
          recordatorios={proximos.data?.recordatorios ?? []}
          total={proximos.data?.total ?? 0}
          hayFiltros={hayFiltros}
          alAbrir={alAbrir}
          alEditar={setEditando}
        />
      )}

      <Dialogo
        abierto={editando !== null}
        onCerrar={() => setEditando(null)}
        titulo="Editar recordatorio"
        icono={Pencil}
        className="max-h-full max-w-xl overflow-y-auto"
      >
        {editando ? (
          <EditarRecordatorio recordatorio={editando} cerrar={() => setEditando(null)} />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={vaciando}
        onCerrar={() => setVaciando(false)}
        titulo="Vaciar el historial"
        icono={Trash2}
        tono="peligro"
      >
        {vaciando ? (
          <VaciarHistorial cerrar={() => setVaciando(false)} hayFiltros={hayFiltros} />
        ) : null}
      </Dialogo>
    </div>
  );
}

/** El aviso antes de vaciar: aclara que los recordatorios no se tocan. */
function VaciarHistorial({ cerrar, hayFiltros }: { cerrar: () => void; hayFiltros: boolean }) {
  const queryClient = useQueryClient();
  const vaciar = useMutation({
    mutationFn: vaciarElHistorial,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contactos"] });
      cerrar();
    },
  });

  return (
    <>
      <div className="flex flex-col gap-2 text-sm text-texto-secundario">
        <p>
          Se borra <strong className="font-medium text-texto">todo el historial</strong>
          {hayFiltros ? ", no solo lo que estás viendo con los filtros" : ""}: la lista de las veces
          que tus recordatorios ya cayeron. No se puede deshacer.
        </p>
        <p>
          <strong className="font-medium text-texto">Tus recordatorios no se borran.</strong> Los
          que tenés en Próximos siguen igual y van a seguir avisándote; lo que pase de ahora en
          adelante volverá a quedar en el historial.
        </p>
      </div>
      {vaciar.isError ? (
        <Aviso tono="peligro">{interpretarError(vaciar.error).mensaje}</Aviso>
      ) : null}
      <div className="flex justify-end gap-2">
        <Boton variante="sutil" onClick={cerrar}>
          Cancelar
        </Boton>
        <Boton
          variante="peligro"
          cargando={vaciar.isPending}
          textoCargando="Vaciando"
          onClick={() => vaciar.mutate()}
        >
          Vaciar historial
        </Boton>
      </div>
    </>
  );
}

function SinResultados({
  icono: Icono,
  children,
}: {
  icono: typeof BellRing;
  children: React.ReactNode;
}) {
  return (
    <Tarjeta className="flex flex-col items-center gap-3 p-8 text-center">
      <Icono aria-hidden="true" className="size-8 text-texto-secundario" />
      {children}
    </Tarjeta>
  );
}

function ListaDeProximos({
  recordatorios,
  total,
  hayFiltros,
  alAbrir,
  alEditar,
}: {
  recordatorios: RecordatorioConContacto[];
  total: number;
  hayFiltros: boolean;
  alAbrir: (contactoId: string) => void;
  alEditar: (recordatorio: RecordatorioConContacto) => void;
}) {
  if (recordatorios.length === 0) {
    return (
      <SinResultados icono={BellRing}>
        {hayFiltros ? (
          <p className="text-sm text-texto-secundario">
            Ningún recordatorio coincide con los filtros.
          </p>
        ) : (
          <>
            <h2 className="text-base font-medium text-texto">No tenés recordatorios</h2>
            <p className="max-w-md text-sm text-texto-secundario">
              Agregá uno con el botón de arriba —el cumpleaños de alguien, el vencimiento de un
              contrato, un pago mensual— y lo vas a ver acá y en tu pantalla de inicio cuando se
              acerque.
            </p>
          </>
        )}
      </SinResultados>
    );
  }

  return (
    <Grupos
      grupos={GRUPOS_DE_PROXIMOS}
      items={recordatorios.map((recordatorio) => ({
        clave: recordatorio.id,
        dias: recordatorio.diasRestantes,
        fila: (
          <FilaDeRecordatorio
            recordatorio={recordatorio}
            alAbrir={() => alAbrir(recordatorio.contactoId)}
            alEditar={() => alEditar(recordatorio)}
          />
        ),
      }))}
      pie={total > recordatorios.length ? `Se muestran ${recordatorios.length} de ${total}.` : null}
    />
  );
}

function ListaDelHistorial({
  entradas,
  total,
  hayFiltros,
  alAbrir,
}: {
  entradas: EntradaDelHistorial[];
  total: number;
  hayFiltros: boolean;
  alAbrir: (contactoId: string) => void;
}) {
  if (entradas.length === 0) {
    return (
      <SinResultados icono={History}>
        {hayFiltros ? (
          <p className="text-sm text-texto-secundario">
            Ninguna entrada del historial coincide con los filtros.
          </p>
        ) : (
          <>
            <h2 className="text-base font-medium text-texto">El historial está vacío</h2>
            <p className="max-w-md text-sm text-texto-secundario">
              Cada vez que un recordatorio cae y pasa su día, queda registrado acá —también los que
              se repiten, que siguen vivos en Próximos— hasta que lo elimines.
            </p>
          </>
        )}
      </SinResultados>
    );
  }

  return (
    <Grupos
      grupos={GRUPOS_DE_PASADOS}
      items={entradas.map((entrada) => ({
        clave: entrada.id,
        dias: entrada.diasAtras,
        fila: <FilaDelHistorial entrada={entrada} alAbrir={() => alAbrir(entrada.contactoId)} />,
      }))}
      pie={total > entradas.length ? `Se muestran ${entradas.length} de ${total}.` : null}
    />
  );
}

function Grupos({
  grupos,
  items,
  pie,
}: {
  grupos: { titulo: string; contiene: (dias: number) => boolean }[];
  items: { clave: string; dias: number; fila: React.ReactNode }[];
  pie: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {grupos.map((grupo) => {
        const delGrupo = items.filter((item) => grupo.contiene(item.dias));
        if (delGrupo.length === 0) return null;

        return (
          <section key={grupo.titulo} aria-label={grupo.titulo} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-texto">{grupo.titulo}</h2>
            <Tarjeta>
              <ul className="flex flex-col divide-y divide-borde">
                {delGrupo.map((item) => (
                  <li key={item.clave}>{item.fila}</li>
                ))}
              </ul>
            </Tarjeta>
          </section>
        );
      })}
      {pie ? (
        <p className="text-sm text-texto-secundario">{pie} Usá los filtros para ver el resto.</p>
      ) : null}
    </div>
  );
}

/**
 * Las acciones de una fila (editar, eliminar). Con mouse están colapsadas (ancho 0) y al pasar el mouse por la fila —o al
 * navegar con el teclado— se despliegan hacia la izquierda empujando el contenido, con la misma animación que las
 * acciones de la lista de movimientos de Finanzas; sin mouse (táctil) se ven siempre. La fila tiene que ser un
 * `group`. Mientras se confirma una eliminación se queda abierta, aunque el mouse se vaya.
 */
function AccionesDeFila({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-acciones-de-fila=""
      className={cn(
        "flex shrink-0 items-center",
        "con-mouse:max-w-0 con-mouse:overflow-hidden con-mouse:opacity-0",
        "con-mouse:group-hover:max-w-40 con-mouse:group-hover:overflow-visible con-mouse:group-hover:opacity-100",
        "con-mouse:group-focus-within:max-w-40 con-mouse:group-focus-within:overflow-visible con-mouse:group-focus-within:opacity-100",
        "con-mouse:has-data-[confirmando]:max-w-72 con-mouse:has-data-[confirmando]:overflow-visible con-mouse:has-data-[confirmando]:opacity-100",
        // El doble de la duración base: más lenta que el resto, y con "reducir movimiento" sigue siendo instantánea.
        "transition-[max-width,opacity] duration-[calc(var(--anim-duracion)*2)] ease-(--anim-curva)",
      )}
    >
      <div className="flex items-center gap-1 pl-3">{children}</div>
    </div>
  );
}

/**
 * Eliminar con confirmación en la misma fila ("¿Eliminar? No / Sí"): un toque en el tacho pide confirmar, así no se
 * borra por error. Lo usan las filas de los próximos y las del histórico.
 */
function EliminarConConfirmacion({
  etiqueta,
  eliminando,
  alConfirmar,
}: {
  etiqueta: string;
  eliminando: boolean;
  alConfirmar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) {
    return (
      <span data-confirmando="" className="flex shrink-0 items-center gap-1">
        <span className="text-xs text-texto-secundario">¿Eliminar?</span>
        <Boton tamano="chico" variante="sutil" onClick={() => setConfirmando(false)}>
          No
        </Boton>
        <Boton
          tamano="chico"
          variante="peligro"
          cargando={eliminando}
          textoCargando="Eliminando"
          onClick={alConfirmar}
        >
          Sí
        </Boton>
      </span>
    );
  }
  return (
    <Boton
      tamano="chico"
      variante="sutil"
      aria-label={etiqueta}
      onClick={() => setConfirmando(true)}
    >
      <Trash2 aria-hidden="true" className="size-4 text-peligro" />
    </Boton>
  );
}

function FilaDeRecordatorio({
  recordatorio,
  alAbrir,
  alEditar,
}: {
  recordatorio: RecordatorioConContacto;
  alAbrir: () => void;
  alEditar: () => void;
}) {
  const queryClient = useQueryClient();
  const eliminar = useMutation({
    mutationFn: () => eliminarRecordatorio(recordatorio.contactoId, recordatorio.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contactos"] }),
  });

  return (
    <div className="group flex items-center pr-2 transition-colors duration-(--duracion-rapida) ease-salida hover:bg-superficie-suave">
      <button
        type="button"
        onClick={alAbrir}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
      >
        <AvatarDeContacto contacto={recordatorio.contacto} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium text-texto">
            <span className="truncate">{recordatorio.titulo}</span>
            {recordatorio.importante ? <DistintivoImportante /> : null}
          </span>
          <span className="block truncate text-sm text-texto-secundario">
            {nombreCompletoDeContacto(recordatorio.contacto)} ·{" "}
            {describirProgramacion(recordatorio, recordatorio.hora)}
          </span>
        </span>
        <span className="numeros-tabulares shrink-0 text-right text-sm">
          <span className="block font-medium text-texto">
            {recordatorio.diasRestantes === 0
              ? "hoy"
              : recordatorio.diasRestantes === 1
                ? "mañana"
                : `en ${recordatorio.diasRestantes} días`}
          </span>
          <span className="block text-xs text-texto-secundario">
            {formatearDiaDeCalendario(recordatorio.proximaFecha)}
            {recordatorio.hora ? ` ${recordatorio.hora}` : ""}
          </span>
        </span>
      </button>
      <AccionesDeFila>
        <Boton
          tamano="chico"
          variante="sutil"
          aria-label={`Editar el recordatorio ${recordatorio.titulo}`}
          onClick={alEditar}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Boton>
        <EliminarConConfirmacion
          etiqueta={`Eliminar el recordatorio ${recordatorio.titulo}`}
          eliminando={eliminar.isPending}
          alConfirmar={() => eliminar.mutate()}
        />
      </AccionesDeFila>
    </div>
  );
}

/** Una entrada del histórico. Eliminarla pide confirmación en la misma fila. */
function FilaDelHistorial({
  entrada,
  alAbrir,
}: {
  entrada: EntradaDelHistorial;
  alAbrir: () => void;
}) {
  const queryClient = useQueryClient();
  const eliminar = useMutation({
    mutationFn: () => eliminarDelHistorial(entrada.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contactos"] }),
  });

  return (
    <div
      data-historial=""
      className="group flex items-center pr-2 transition-colors duration-(--duracion-rapida) ease-salida hover:bg-superficie-suave"
    >
      <button
        type="button"
        onClick={alAbrir}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
      >
        <AvatarDeContacto contacto={entrada.contacto} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-medium text-texto">
            <span className="truncate">{entrada.titulo}</span>
            {entrada.importante ? <DistintivoImportante /> : null}
          </span>
          <span className="block truncate text-sm text-texto-secundario">
            {nombreCompletoDeContacto(entrada.contacto)} ·{" "}
            {NOMBRES_DE_REPETICION[entrada.repeticion]}
          </span>
        </span>
        <span className="numeros-tabulares shrink-0 text-right text-sm">
          <span className="block font-medium text-texto">{haceCuanto(entrada.diasAtras)}</span>
          <span className="block text-xs text-texto-secundario">
            {formatearDiaDeCalendario(entrada.dia)}
            {entrada.hora ? ` ${entrada.hora}` : ""}
          </span>
        </span>
      </button>
      <AccionesDeFila>
        <EliminarConConfirmacion
          etiqueta={`Eliminar del historial: ${entrada.titulo}, ${formatearDiaDeCalendario(entrada.dia)}`}
          eliminando={eliminar.isPending}
          alConfirmar={() => eliminar.mutate()}
        />
      </AccionesDeFila>
    </div>
  );
}

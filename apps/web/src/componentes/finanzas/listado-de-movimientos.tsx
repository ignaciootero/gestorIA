// Listado de movimientos del período elegido: buscar, filtrar por
// categoría/cuenta/tipo, editar, duplicar y eliminar. Mismo patrón de filtros, paginado y acciones
// que ListadoDeCuentas (admin).

"use client";

import { formatearFechaHora, formatearMonto, MONEDA_POR_DEFECTO } from "@gestoria/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Selector } from "@/componentes/ui/selector";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  duplicarMovimiento,
  eliminarMovimiento,
  type Movimiento,
  obtenerCategorias,
  obtenerCuentas,
  obtenerMovimientos,
  type Periodo,
  type TipoMovimiento,
} from "@/lib/api-finanzas";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import {
  claseDeMonto,
  cuentasDeMovimiento,
  IconoDeMovimiento,
  signoDeMonto,
} from "./estilo-de-movimiento";
import { FormularioMovimiento } from "./formulario-movimiento";

const POR_PAGINA = 20;

const FILTROS_TIPO = [
  { valor: "", etiqueta: "Todos" },
  { valor: "gasto", etiqueta: "Gastos" },
  { valor: "ingreso", etiqueta: "Ingresos" },
  { valor: "neutro", etiqueta: "Transferencias" },
] as const;

export function ListadoDeMovimientos({ periodo }: { periodo: Periodo }) {
  const queryClient = useQueryClient();
  const { data: sesion } = useSession();
  const moneda = sesion?.user.monedaPorDefecto ?? MONEDA_POR_DEFECTO;

  const [busquedaEscrita, setBusquedaEscrita] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState("");
  const [tipo, setTipo] = useState<TipoMovimiento | "">("");
  const [pagina, setPagina] = useState(0);

  const [aEditar, setAEditar] = useState<Movimiento | null>(null);
  const [aEliminar, setAEliminar] = useState<Movimiento | null>(null);

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(busquedaEscrita);
      setPagina(0);
    }, 300);
    return () => clearTimeout(espera);
  }, [busquedaEscrita]);

  const filtros = {
    periodoId: periodo.id,
    categoriaId: categoriaId === "" ? undefined : Number(categoriaId),
    cuentaFinancieraId,
    tipo: tipo || undefined,
    busqueda,
  };

  const categorias = useQuery({ queryKey: ["finanzas", "categorias"], queryFn: obtenerCategorias });
  const cuentas = useQuery({ queryKey: ["finanzas", "cuentas"], queryFn: obtenerCuentas });

  const { data, isPending, error } = useQuery({
    queryKey: ["finanzas", "movimientos", { ...filtros, pagina }],
    queryFn: () =>
      obtenerMovimientos({ ...filtros, limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
  });

  const hayFiltros =
    busqueda !== "" || categoriaId !== "" || cuentaFinancieraId !== "" || tipo !== "";

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
  }

  const duplicar = useMutation({
    mutationFn: duplicarMovimiento,
    onSuccess: invalidar,
  });

  const eliminar = useMutation({
    mutationFn: eliminarMovimiento,
    onSuccess: () => {
      setAEliminar(null);
      invalidar();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-texto">Movimientos de {periodo.nombre}</h2>

      <Tarjeta className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Campo
            etiqueta="Buscar"
            icono={Search}
            placeholder="Descripción"
            value={busquedaEscrita}
            onChange={(evento) => setBusquedaEscrita(evento.target.value)}
            className="sm:flex-1"
          />
          <SelectorDeSegmentos
            id="filtro-tipo-movimiento"
            etiqueta="Filtrar por tipo"
            modo="filtro"
            segmentos={FILTROS_TIPO}
            activo={tipo}
            onCambiar={(valor) => {
              setTipo(valor);
              setPagina(0);
            }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Selector
            etiqueta="Categoría"
            value={categoriaId}
            onChange={(evento) => {
              setCategoriaId(evento.target.value);
              setPagina(0);
            }}
          >
            <option value="">Todas</option>
            {/* Las transferencias se filtran con "Transferencias" (tipo), no por categoría. */}
            {categorias.data?.categorias
              .filter((categoria) => categoria.sistema === null)
              .map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
          </Selector>
          <Selector
            etiqueta="Cuenta"
            value={cuentaFinancieraId}
            onChange={(evento) => {
              setCuentaFinancieraId(evento.target.value);
              setPagina(0);
            }}
          >
            <option value="">Todas</option>
            {cuentas.data?.cuentas.map((cuenta) => (
              <option key={cuenta.id} value={cuenta.id}>
                {cuenta.nombre}
              </option>
            ))}
          </Selector>
        </div>
      </Tarjeta>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando movimientos</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : data.movimientos.length === 0 ? (
        <Tarjeta className="p-6 text-center text-sm text-texto-secundario">
          {hayFiltros
            ? "Ningún movimiento coincide con el filtro."
            : `Todavía no hay movimientos en ${periodo.nombre}. Tocá "Agregar movimiento" para cargar el primero.`}
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-2">
          {data.movimientos.map((movimiento) => {
            return (
              <Tarjeta
                key={movimiento.id}
                className="group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <IconoDeMovimiento tipo={movimiento.tipo} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-texto">{movimiento.descripcion}</p>
                    <p className="flex items-center gap-1.5 truncate text-sm text-texto-secundario">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: movimiento.categoria.color }}
                      />
                      {movimiento.categoria.nombre} · {cuentasDeMovimiento(movimiento)} ·{" "}
                      {formatearFechaHora(movimiento.fecha, zonaDelDispositivo())}
                    </p>
                  </div>
                </div>

                {/* El importe va pegado al borde derecho. Con mouse, los botones están
                    colapsados (ancho 0) y al pasar el mouse por la fila se despliegan a la
                    derecha empujando el importe hacia la izquierda. Sin mouse (táctil) se ven
                    siempre. */}
                <div className="flex shrink-0 items-center">
                  <p
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      claseDeMonto(movimiento.tipo),
                    )}
                  >
                    {signoDeMonto(movimiento.tipo)}
                    {formatearMonto(movimiento.importeCentavos, moneda)}
                  </p>

                  <div
                    className={cn(
                      "con-mouse:max-w-0 con-mouse:overflow-hidden con-mouse:opacity-0",
                      "con-mouse:group-hover:max-w-40 con-mouse:group-hover:overflow-visible con-mouse:group-hover:opacity-100",
                      "con-mouse:group-focus-within:max-w-40 con-mouse:group-focus-within:overflow-visible con-mouse:group-focus-within:opacity-100",
                      // El doble de la duración base: más lenta que el resto, y con "reducir movimiento" sigue siendo instantánea.
                      "transition-[max-width,opacity] duration-[calc(var(--anim-duracion)*2)] ease-(--anim-curva)",
                    )}
                  >
                    <div className="flex gap-1 pl-3">
                      <Boton
                        tamano="chico"
                        variante="sutil"
                        aria-label="Editar"
                        onClick={() => setAEditar(movimiento)}
                      >
                        <Pencil aria-hidden="true" className="size-4" />
                      </Boton>
                      <Boton
                        tamano="chico"
                        variante="sutil"
                        aria-label="Duplicar"
                        cargando={duplicar.isPending && duplicar.variables === movimiento.id}
                        onClick={() => duplicar.mutate(movimiento.id)}
                      >
                        <Copy aria-hidden="true" className="size-4" />
                      </Boton>
                      <Boton
                        tamano="chico"
                        variante="sutil"
                        aria-label="Eliminar"
                        onClick={() => setAEliminar(movimiento)}
                      >
                        <Trash2 aria-hidden="true" className="size-4 text-peligro" />
                      </Boton>
                    </div>
                  </div>
                </div>
              </Tarjeta>
            );
          })}

          <div className="flex items-center justify-between pt-2 text-sm text-texto-secundario">
            <span>
              {data.total === 0 ? 0 : pagina * POR_PAGINA + 1}–
              {Math.min((pagina + 1) * POR_PAGINA, data.total)} de {data.total}
            </span>
            <div className="flex gap-2">
              <Boton
                tamano="chico"
                variante="sutil"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Boton>
              <Boton
                tamano="chico"
                variante="sutil"
                disabled={(pagina + 1) * POR_PAGINA >= data.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
            </div>
          </div>
        </div>
      )}

      <Dialogo
        abierto={aEditar !== null}
        onCerrar={() => setAEditar(null)}
        titulo="Editar movimiento"
        icono={Pencil}
      >
        {aEditar ? (
          <FormularioMovimiento movimiento={aEditar} cerrar={() => setAEditar(null)} />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={aEliminar !== null}
        onCerrar={() => setAEliminar(null)}
        titulo="Eliminar movimiento"
        icono={Trash2}
        tono="peligro"
      >
        {aEliminar ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se elimina "{aEliminar.descripcion}" (
              {formatearMonto(aEliminar.importeCentavos, moneda)}) y deja de contar en tus totales.
            </p>

            {eliminar.isError ? (
              <Aviso tono="peligro">{interpretarError(eliminar.error).mensaje}</Aviso>
            ) : null}

            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => setAEliminar(null)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                cargando={eliminar.isPending}
                textoCargando="Eliminando"
                onClick={() => eliminar.mutate(aEliminar.id)}
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

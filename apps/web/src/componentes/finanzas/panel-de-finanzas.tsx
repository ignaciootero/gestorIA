// Panel del módulo de ingresos y gastos: pestañas (mismo patrón que
// panel-de-admin.tsx), la barra del período y el botón de "Agregar movimiento"
// siempre a mano, porque es la acción más frecuente de todo el módulo
// (docs/guias/usabilidad.md, "Lo más usado, a mano").
//
// Resumen, movimientos, presupuestos y estadísticas muestran siempre un
// período (el elegido en la barra; por defecto, el abierto). Cuentas y
// categorías no dependen de ninguno. Sin un período abierto no se pueden cargar
// movimientos: en ese caso "Agregar movimiento" explica la situación y ofrece
// abrir uno.

"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Lock, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { obtenerPeriodos, type Periodo, type PeriodoListado } from "@/lib/api-finanzas";
import { interpretarError } from "@/lib/mensajes-de-error";
import { BarraDePeriodo } from "./barra-de-periodo";
import { CuentasYCategorias } from "./cuentas-y-categorias";
import { EstadisticasDeFinanzas } from "./estadisticas-de-finanzas";
import { FormularioMovimiento } from "./formulario-movimiento";
import {
  FormularioAbrirPeriodo,
  FormularioCerrarPeriodo,
  FormularioEliminarPeriodo,
  FormularioReabrirPeriodo,
  FormularioRenombrarPeriodo,
} from "./formularios-de-periodo";
import { ListadoDeMovimientos } from "./listado-de-movimientos";
import { PresupuestosDeFinanzas } from "./presupuestos-de-finanzas";
import { ResumenDeFinanzas } from "./resumen-de-finanzas";

type Seccion = "resumen" | "movimientos" | "presupuestos" | "estadisticas" | "cuentas";

const SECCIONES = [
  { valor: "resumen", etiqueta: "Resumen" },
  { valor: "movimientos", etiqueta: "Movimientos" },
  { valor: "presupuestos", etiqueta: "Presupuestos" },
  { valor: "estadisticas", etiqueta: "Estadísticas" },
  { valor: "cuentas", etiqueta: "Cuentas" },
] as const;

/** Qué diálogo está abierto. Uno solo a la vez. */
type Dialogos =
  | { tipo: "agregar" }
  | { tipo: "sin-periodo" }
  | {
      tipo: "abrir";
      /** Instante en que arranca, si ya viene decidido (continuación de uno recién cerrado). */
      aperturaInicial?: string;
      continuacion?: boolean;
    }
  | { tipo: "cerrar"; periodo: Periodo }
  | { tipo: "reabrir"; periodo: Periodo }
  | { tipo: "eliminar"; periodo: PeriodoListado }
  | { tipo: "renombrar"; periodo: Periodo };

export function PanelDeFinanzas() {
  const [seccion, setSeccion] = useState<Seccion>("resumen");
  const [dialogo, setDialogo] = useState<Dialogos | null>(null);
  const [periodoElegidoId, setPeriodoElegidoId] = useState<number | null>(null);

  const periodos = useQuery({ queryKey: ["finanzas", "periodos"], queryFn: obtenerPeriodos });
  const lista = periodos.data?.periodos ?? [];
  // La lista viene del más nuevo al más viejo: sin elección, el abierto y, si
  // no hay, el más reciente.
  const periodo =
    lista.find((otro) => otro.id === periodoElegidoId) ??
    lista.find((otro) => otro.abierto) ??
    lista[0] ??
    null;
  const hayAbierto = lista.some((otro) => otro.abierto);

  function agregarMovimiento() {
    setDialogo(hayAbierto ? { tipo: "agregar" } : { tipo: "sin-periodo" });
  }

  function cerrarDialogo() {
    setDialogo(null);
  }

  /**
   * Lo que hace cada <dialog> cuando se cierra: limpiar el estado, pero solo si
   * sigue siendo el suyo. Al pasar de un diálogo a otro (cerrar un período y
   * ofrecer abrir el siguiente), el <dialog> que se cierra avisa recién
   * después, y sin esta comprobación su aviso borraba al diálogo nuevo.
   */
  function alCerrarseEl(tipo: Dialogos["tipo"]) {
    return () => setDialogo((actual) => (actual?.tipo === tipo ? null : actual));
  }

  const necesitaPeriodo = seccion !== "cuentas";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SelectorDeSegmentos
          id="seccion-finanzas"
          etiqueta="Sección del módulo de finanzas"
          segmentos={SECCIONES}
          activo={seccion}
          onCambiar={setSeccion}
          className="sm:max-w-xl"
        />

        <Boton onClick={agregarMovimiento} disabled={periodos.isPending} className="shrink-0">
          <Plus aria-hidden="true" className="size-4" />
          Agregar movimiento
        </Boton>
      </div>

      {periodos.error ? (
        <Aviso tono="peligro">{interpretarError(periodos.error).mensaje}</Aviso>
      ) : null}

      {periodo !== null && necesitaPeriodo ? (
        <BarraDePeriodo
          periodos={lista}
          periodo={periodo}
          onElegir={setPeriodoElegidoId}
          onRenombrar={() => setDialogo({ tipo: "renombrar", periodo })}
          onCerrar={() => setDialogo({ tipo: "cerrar", periodo })}
          onReabrir={() => setDialogo({ tipo: "reabrir", periodo })}
          onEliminar={() => setDialogo({ tipo: "eliminar", periodo })}
          onAbrir={() => setDialogo({ tipo: "abrir" })}
        />
      ) : null}

      <div
        role="tabpanel"
        id={`panel-seccion-finanzas-${seccion}`}
        aria-labelledby={`seccion-finanzas-${seccion}`}
      >
        {seccion === "cuentas" ? <CuentasYCategorias /> : null}

        {necesitaPeriodo && periodos.isPending ? (
          <div aria-busy="true" aria-live="polite">
            <span className="solo-lectores">Cargando tus períodos</span>
            <div className="h-48 animate-pulse rounded-tarjeta bg-superficie-suave" />
          </div>
        ) : null}

        {necesitaPeriodo && periodos.isSuccess && periodo === null ? (
          <SinPeriodos onAbrir={() => setDialogo({ tipo: "abrir" })} />
        ) : null}

        {/* `key` por período: al cambiar de período cada pestaña arranca limpia
            (primera página, filtros vacíos) en vez de arrastrar lo del anterior. */}
        {periodo !== null && seccion === "resumen" ? (
          <ResumenDeFinanzas key={periodo.id} periodo={periodo} />
        ) : null}
        {periodo !== null && seccion === "movimientos" ? (
          <ListadoDeMovimientos key={periodo.id} periodo={periodo} />
        ) : null}
        {periodo !== null && seccion === "presupuestos" ? (
          <PresupuestosDeFinanzas key={periodo.id} periodo={periodo} />
        ) : null}
        {periodo !== null && seccion === "estadisticas" ? (
          <EstadisticasDeFinanzas key={periodo.id} periodo={periodo} />
        ) : null}
      </div>

      {/* Los formularios van condicionales (no siempre montados): así cada
          apertura arranca con un formulario nuevo (fecha de ahora, nombre
          sugerido) en vez de arrastrar lo que quedó cargado la vez anterior.
          Mismo patrón que los diálogos de ListadoDeCuentas. */}
      <Dialogo
        abierto={dialogo?.tipo === "agregar"}
        onCerrar={alCerrarseEl("agregar")}
        titulo="Agregar movimiento"
        icono={Plus}
      >
        {dialogo?.tipo === "agregar" ? <FormularioMovimiento cerrar={cerrarDialogo} /> : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "sin-periodo"}
        onCerrar={alCerrarseEl("sin-periodo")}
        titulo="No tenés un período abierto"
        icono={CalendarPlus}
        tono="advertencia"
      >
        <p className="text-sm text-texto-secundario">
          Los movimientos se guardan dentro de un período, y ahora no hay ninguno abierto. Abrí uno
          para poder cargar el movimiento.
        </p>
        <div className="flex justify-end gap-2">
          <Boton variante="sutil" onClick={cerrarDialogo}>
            Cancelar
          </Boton>
          <Boton onClick={() => setDialogo({ tipo: "abrir" })}>Abrir período</Boton>
        </div>
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "abrir"}
        onCerrar={alCerrarseEl("abrir")}
        titulo={
          dialogo?.tipo === "abrir" && dialogo.continuacion
            ? "Abrir el siguiente período"
            : "Abrir período"
        }
        icono={CalendarPlus}
      >
        {dialogo?.tipo === "abrir" ? (
          <FormularioAbrirPeriodo
            periodos={lista}
            aperturaInicial={dialogo.aperturaInicial}
            continuacion={dialogo.continuacion ?? false}
            cancelar={cerrarDialogo}
            alTerminar={(nuevo) => {
              setPeriodoElegidoId(nuevo.id);
              cerrarDialogo();
            }}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "cerrar"}
        onCerrar={alCerrarseEl("cerrar")}
        titulo="Cerrar período"
        icono={Lock}
      >
        {dialogo?.tipo === "cerrar" ? (
          <FormularioCerrarPeriodo
            periodo={dialogo.periodo}
            cancelar={cerrarDialogo}
            alTerminar={(cerrado) =>
              // Al cerrar se ofrece abrir el siguiente, que continúa justo donde
              // terminó este. Si la persona dice "Ahora no", queda sin período
              // abierto hasta que abra uno.
              setDialogo({
                tipo: "abrir",
                continuacion: true,
                ...(cerrado.cierreEn ? { aperturaInicial: cerrado.cierreEn } : {}),
              })
            }
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "reabrir"}
        onCerrar={alCerrarseEl("reabrir")}
        titulo="Reabrir período"
        icono={RotateCcw}
      >
        {dialogo?.tipo === "reabrir" ? (
          <FormularioReabrirPeriodo
            periodo={dialogo.periodo}
            cancelar={cerrarDialogo}
            alTerminar={(reabierto) => {
              setPeriodoElegidoId(reabierto.id);
              cerrarDialogo();
            }}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "eliminar"}
        onCerrar={alCerrarseEl("eliminar")}
        titulo="Eliminar período"
        icono={Trash2}
        tono="peligro"
      >
        {dialogo?.tipo === "eliminar" ? (
          <FormularioEliminarPeriodo
            periodo={dialogo.periodo}
            cancelar={cerrarDialogo}
            alTerminar={() => {
              // Sin elección explícita se vuelve al abierto o al más reciente.
              setPeriodoElegidoId(null);
              cerrarDialogo();
            }}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        abierto={dialogo?.tipo === "renombrar"}
        onCerrar={alCerrarseEl("renombrar")}
        titulo="Renombrar período"
        icono={Pencil}
      >
        {dialogo?.tipo === "renombrar" ? (
          <FormularioRenombrarPeriodo
            periodo={dialogo.periodo}
            periodos={lista}
            cancelar={cerrarDialogo}
            alTerminar={cerrarDialogo}
          />
        ) : null}
      </Dialogo>
    </div>
  );
}

/** Estado vacío del módulo: todavía no se abrió ningún período. */
function SinPeriodos({ onAbrir }: { onAbrir: () => void }) {
  return (
    <Tarjeta className="flex flex-col items-center gap-3 p-8 text-center">
      <CalendarPlus aria-hidden="true" className="size-8 text-texto-secundario" />
      <h2 className="text-base font-medium text-texto">Empezá abriendo un período</h2>
      <p className="max-w-md text-sm text-texto-secundario">
        Un período es el tramo de tiempo que vos elegís para llevar tus cuentas: puede ser un mes,
        una quincena o lo que te sirva. Tus movimientos se guardan dentro del período abierto.
      </p>
      <Boton onClick={onAbrir}>
        <CalendarPlus aria-hidden="true" className="size-4" />
        Abrir mi primer período
      </Boton>
    </Tarjeta>
  );
}

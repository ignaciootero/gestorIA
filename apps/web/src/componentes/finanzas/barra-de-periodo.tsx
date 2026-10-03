// Barra del período: qué período se está mirando, cuándo empieza y termina, y
// las acciones sobre él (renombrar, cerrar, reabrir, eliminar). "Abrir período" va
// arriba a la derecha de la tarjeta.
//
// Todas las pestañas del módulo (resumen, movimientos, presupuestos y
// estadísticas) muestran los datos del período elegido acá. Por defecto es el
// abierto; si no hay ninguno, el más reciente.

"use client";

import { formatearFecha } from "@gestoria/shared";
import { CalendarPlus, Lock, Pencil, RotateCcw, Trash2, Unlock } from "lucide-react";
import { Boton } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import { Selector } from "@/componentes/ui/selector";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import type { Periodo } from "@/lib/api-finanzas";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";

type PropsBarra = {
  periodos: Periodo[];
  periodo: Periodo;
  onElegir: (id: number) => void;
  onRenombrar: () => void;
  onCerrar: () => void;
  onReabrir: () => void;
  onEliminar: () => void;
  onAbrir: () => void;
};

/** "Desde 01/10/2026" si está abierto; "Del 01/09/2026 al 01/10/2026" si ya cerró (la hora no se muestra). */
export function describirRango(periodo: Periodo): string {
  const zona = zonaDelDispositivo();
  const desde = formatearFecha(periodo.aperturaEn, zona);
  if (periodo.cierreEn === null) return `Desde ${desde}`;
  return `Del ${desde} al ${formatearFecha(periodo.cierreEn, zona)}`;
}

export function BarraDePeriodo({
  periodos,
  periodo,
  onElegir,
  onRenombrar,
  onCerrar,
  onReabrir,
  onEliminar,
  onAbrir,
}: PropsBarra) {
  const hayAbierto = periodos.some((otro) => otro.abierto);
  // Reabrir un período lo extiende hacia adelante: solo si no hay otro abierto y
  // ninguno empieza después (la lista viene del más nuevo al más viejo). La API
  // lo vuelve a comprobar.
  const sePuedeReabrir = !periodo.abierto && !hayAbierto && periodos[0]?.id === periodo.id;

  return (
    <Tarjeta className="flex flex-col gap-3 p-4">
      {/* Arriba: el selector a la izquierda y "Abrir período" en la esquina superior derecha. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 max-w-xs flex-1">
          <Selector
            etiqueta="Período"
            value={periodo.id}
            onChange={(evento) => onElegir(Number(evento.target.value))}
          >
            {periodos.map((opcion) => (
              <option key={opcion.id} value={opcion.id}>
                {opcion.nombre}
                {opcion.abierto ? " (abierto)" : ""}
              </option>
            ))}
          </Selector>
        </div>

        {!hayAbierto ? (
          <Boton variante="secundario" tamano="chico" onClick={onAbrir} className="shrink-0">
            <CalendarPlus aria-hidden="true" className="size-4" />
            Abrir período
          </Boton>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap items-center gap-2 text-sm text-texto-secundario">
          {periodo.abierto ? (
            <Insignia tono="exito" icono={Unlock} className="px-3 py-1 text-sm">
              Abierto
            </Insignia>
          ) : (
            <Insignia tono="advertencia" icono={Lock} className="px-3 py-1 text-sm">
              Cerrado
            </Insignia>
          )}
          {describirRango(periodo)}
        </p>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Boton variante="sutil" tamano="chico" onClick={onRenombrar}>
            <Pencil aria-hidden="true" className="size-4" />
            Renombrar
          </Boton>

          {periodo.abierto ? (
            <Boton variante="secundario" tamano="chico" onClick={onCerrar}>
              <Lock aria-hidden="true" className="size-4" />
              Cerrar período
            </Boton>
          ) : null}

          {sePuedeReabrir ? (
            <Boton variante="secundario" tamano="chico" onClick={onReabrir}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Reabrir
            </Boton>
          ) : null}

          <Boton variante="sutil" tamano="chico" onClick={onEliminar}>
            <Trash2 aria-hidden="true" className="size-4 text-peligro" />
            Eliminar
          </Boton>
        </div>
      </div>
    </Tarjeta>
  );
}

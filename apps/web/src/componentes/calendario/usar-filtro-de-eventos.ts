// El estado del filtro de eventos del calendario: qué orígenes, qué repeticiones y qué estados
// se ocultan (los de las tareas y los de los recordatorios, por separado).
//
// Se aplica sobre lo que ya llegó del servidor, así que cambiarlo es instantáneo y no vuelve a pedir
// nada. Se recuerda en este navegador (ver lib/preferencias-calendario.ts).

"use client";

import type {
  EstadoParaFiltrar,
  FiltroDeEventos,
  OrigenConRepeticion,
  OrigenDeEvento,
  RepeticionDeEvento,
} from "@gestoria/shared";
import { filtroSinRestricciones } from "@gestoria/shared";
import { useState } from "react";
import { guardarFiltroDeEventos, leerFiltroDeEventos } from "@/lib/preferencias-calendario";

/** Agrega el valor al conjunto si no estaba y lo saca si estaba. */
function alternar<T>(conjunto: ReadonlySet<T>, valor: T): Set<T> {
  const nuevo = new Set(conjunto);
  if (!nuevo.delete(valor)) nuevo.add(valor);
  return nuevo;
}

export function useFiltroDeEventos() {
  const [filtro, setFiltro] = useState<FiltroDeEventos>(leerFiltroDeEventos);

  function cambiar(nuevo: FiltroDeEventos) {
    setFiltro(nuevo);
    guardarFiltroDeEventos(nuevo);
  }

  return {
    filtro,
    alternarOrigen: (origen: OrigenDeEvento) =>
      cambiar({ ...filtro, origenesOcultos: alternar(filtro.origenesOcultos, origen) }),
    alternarRepeticion: (origen: OrigenConRepeticion, repeticion: RepeticionDeEvento) =>
      cambiar({
        ...filtro,
        repeticionesOcultas: {
          ...filtro.repeticionesOcultas,
          [origen]: alternar(filtro.repeticionesOcultas[origen], repeticion),
        },
      }),
    /** Vuelve a mostrar un origen (si estaba oculto): por ejemplo, el de los eventos propios al agregar uno. */
    mostrarOrigen: (origen: OrigenDeEvento) => {
      if (!filtro.origenesOcultos.has(origen)) return;
      const origenesOcultos = new Set(filtro.origenesOcultos);
      origenesOcultos.delete(origen);
      cambiar({ ...filtro, origenesOcultos });
    },
    alternarEstado: (origen: OrigenConRepeticion, estado: EstadoParaFiltrar) =>
      cambiar({
        ...filtro,
        estadosOcultos: {
          ...filtro.estadosOcultos,
          [origen]: alternar(filtro.estadosOcultos[origen], estado),
        },
      }),
    /** Quita las restricciones de origen y de repetición: se ve todo. Los estados quedan como están. */
    mostrarTodo: () =>
      cambiar({ ...filtroSinRestricciones(), estadosOcultos: filtro.estadosOcultos }),
  };
}

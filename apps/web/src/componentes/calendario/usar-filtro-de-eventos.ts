// El estado del filtro de eventos del calendario: qué orígenes, qué repeticiones y qué estados
// se ocultan (los de cada origen por separado).
//
// Se aplica sobre lo que ya llegó del servidor, así que cambiarlo es instantáneo y no vuelve a pedir
// eventos. Se guarda **en la cuenta** (GET y PUT /api/calendario/filtro, tabla `filtros_del_calendario`):
// queda así en cualquier dispositivo hasta que la persona lo vuelva a cambiar.
//
// Cómo se guarda:
// - Cada cambio se ve al instante (se escribe primero en la caché de TanStack Query) y después se manda
//   el filtro entero a la API. Los envíos van en fila (`scope`), así uno viejo nunca pisa a uno nuevo.
// - Si un envío falla, el filtro sigue aplicado en esta pantalla y se avisa que no se guardó; el próximo
//   cambio lo vuelve a intentar con el filtro completo.
// - La primera vez, si la cuenta todavía no tiene filtro pero este navegador tenía uno de antes (cuando se
//   guardaba en `localStorage`), se lo pasa a la cuenta y se lo borra del navegador.

"use client";

import type {
  EstadoParaFiltrar,
  FiltroDeEventos,
  OrigenConRepeticion,
  OrigenDeEvento,
  RepeticionDeEvento,
} from "@gestoria/shared";
import { filtroDesdeGuardado, filtroParaGuardar, filtroSinRestricciones } from "@gestoria/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { guardarFiltroDelCalendario, obtenerFiltroDelCalendario } from "@/lib/api-calendario";
import { borrarFiltroDelNavegador, leerFiltroDelNavegador } from "@/lib/preferencias-calendario";

/** Fuera de la clave "calendario": guardar un evento invalida esa y no tiene por qué volver a pedir esto. */
const CLAVE = ["filtro-del-calendario"] as const;

/** Agrega el valor al conjunto si no estaba y lo saca si estaba. */
function alternar<T>(conjunto: ReadonlySet<T>, valor: T): Set<T> {
  const nuevo = new Set(conjunto);
  if (!nuevo.delete(valor)) nuevo.add(valor);
  return nuevo;
}

/** El filtro de la cuenta; si no tiene, el que quedó en este navegador (pasado a la cuenta) o el de siempre. */
async function cargarFiltro(): Promise<FiltroDeEventos> {
  const guardado = await obtenerFiltroDelCalendario();
  if (guardado) return filtroDesdeGuardado(guardado);
  const delNavegador = leerFiltroDelNavegador();
  if (!delNavegador) return filtroSinRestricciones();
  try {
    await guardarFiltroDelCalendario(filtroParaGuardar(delNavegador));
    borrarFiltroDelNavegador();
  } catch {
    // Se vuelve a intentar la próxima vez; mientras tanto se usa igual.
  }
  return delNavegador;
}

export function useFiltroDeEventos() {
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE,
    queryFn: cargarFiltro,
    // Solo cambia cuando la persona lo cambia (y eso ya actualiza la caché).
    staleTime: Number.POSITIVE_INFINITY,
  });
  const guardado = useMutation({
    mutationFn: (filtro: FiltroDeEventos) => guardarFiltroDelCalendario(filtroParaGuardar(filtro)),
    scope: { id: "filtro-del-calendario" },
  });

  // Mientras llega, el de por defecto (`listo` dice si ya es el de la cuenta).
  const filtro = consulta.data ?? filtroSinRestricciones();

  function cambiar(nuevo: FiltroDeEventos) {
    queryClient.setQueryData(CLAVE, nuevo);
    guardado.mutate(nuevo);
  }

  return {
    filtro,
    /** true cuando el filtro ya es el de la cuenta (o falló al pedirlo y se usa el de por defecto). */
    listo: !consulta.isPending,
    /** true si el último cambio no se pudo guardar en la cuenta. */
    noSeGuardo: guardado.isError,
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
    /**
     * Al guardar un evento propio, se asegura de que se vea: vuelve a prender "Calendario" si estaba
     * apagado, y el estado que le toca (pasado o futuro, según su día) si estaba oculto. Si no, parecería
     * que no se guardó.
     */
    mostrarEventoPropio: (dia: string, hoy: string) => {
      const estado = dia < hoy ? "pasado" : "futuro";
      if (!filtro.origenesOcultos.has("manual") && !filtro.estadosOcultos.manual.has(estado)) return;
      const origenesOcultos = new Set(filtro.origenesOcultos);
      origenesOcultos.delete("manual");
      const deEventosPropios = new Set(filtro.estadosOcultos.manual);
      deEventosPropios.delete(estado);
      cambiar({
        ...filtro,
        origenesOcultos,
        estadosOcultos: { ...filtro.estadosOcultos, manual: deEventosPropios },
      });
    },
    alternarEstado: (origen: OrigenDeEvento, estado: EstadoParaFiltrar) =>
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

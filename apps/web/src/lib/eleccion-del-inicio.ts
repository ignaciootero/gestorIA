// Qué se ve primero en la pantalla de inicio: la pestaña del carrusel y la variante del resumen de
// cada módulo, elegidas al azar en cada visita para no ver siempre lo mismo.
//
// "Al azar" con una regla: no repetir lo de la visita anterior. Sin ella, con cuatro pestañas
// tocaría la misma dos veces seguidas una de cada cuatro veces, y se sentiría como que no cambia.
// Para eso se guarda en el navegador lo último que se eligió.
//
// Se puede forzar con la dirección (`/inicio?resumen=finanzas&variante=presupuestos`): sirve para
// probar cada variante y para volver a una que interesó.

/** Lo que se eligió en una visita. */
export type EleccionDelInicio = {
  /** El módulo cuya pestaña se abre primero. */
  pestana: string;
  /** La variante del resumen de cada módulo. */
  variantes: Record<string, string>;
};

const CLAVE = "gestion.inicio.ultimaEleccion";

/**
 * Una opción al azar que no sea `anterior` (si hay otra). `azar` da un número en [0, 1), como
 * Math.random; se puede pasar otro para que el resultado sea predecible.
 */
export function elegirSinRepetir<T>(
  opciones: readonly T[],
  anterior: T | undefined,
  azar: () => number = Math.random,
): T {
  const candidatas =
    opciones.length > 1 ? opciones.filter((opcion) => opcion !== anterior) : opciones;
  const elegida = candidatas[Math.floor(azar() * candidatas.length)] ?? opciones[0];
  if (elegida === undefined) throw new Error("No hay opciones para elegir.");
  return elegida;
}

/** Lo que se eligió en la visita anterior, si el navegador lo tiene. */
function leerAnterior(): Partial<EleccionDelInicio> {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE) ?? "null") as unknown;
    if (guardado && typeof guardado === "object") return guardado as Partial<EleccionDelInicio>;
  } catch {
    // Sin almacenamiento o con algo roto: como si fuera la primera visita.
  }
  return {};
}

/** Recuerda lo elegido para no repetirlo en la próxima visita. */
export function guardarEleccion(eleccion: EleccionDelInicio): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(eleccion));
  } catch {
    // Sin almacenamiento solo se pierde la regla de no repetir.
  }
}

/** Lo que pide la dirección, si pide algo válido: `?resumen=<módulo>&variante=<variante>`. */
function leerForzado(variantesPorModulo: Record<string, readonly string[]>): {
  pestana?: string | undefined;
  variante?: string | undefined;
} {
  const parametros = new URLSearchParams(window.location.search);
  const pestana = parametros.get("resumen") ?? undefined;
  if (!pestana || !variantesPorModulo[pestana]) return {};
  const variante = parametros.get("variante") ?? undefined;
  return {
    pestana,
    variante: variante && variantesPorModulo[pestana]?.includes(variante) ? variante : undefined,
  };
}

/**
 * Elige la pestaña y la variante de cada módulo para esta visita. Lee el navegador: solo se puede
 * llamar del lado del cliente (en la pantalla de inicio, el carrusel nunca se dibuja en el servidor).
 */
export function elegirInicio(
  variantesPorModulo: Record<string, readonly string[]>,
  azar: () => number = Math.random,
): EleccionDelInicio {
  const anterior = leerAnterior();
  const forzado = leerForzado(variantesPorModulo);
  const modulos = Object.keys(variantesPorModulo);

  const variantes: Record<string, string> = {};
  for (const modulo of modulos) {
    const opciones = variantesPorModulo[modulo] ?? [];
    variantes[modulo] =
      forzado.pestana === modulo && forzado.variante
        ? forzado.variante
        : elegirSinRepetir(opciones, anterior.variantes?.[modulo], azar);
  }

  return {
    pestana: forzado.pestana ?? elegirSinRepetir(modulos, anterior.pestana, azar),
    variantes,
  };
}

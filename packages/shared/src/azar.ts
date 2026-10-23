// Utilidades de azar para la interfaz (orden de bloques, elegir uno al pasar).
//
// Reciben la fuente de números al azar para poder probarlas con valores fijos; por
// defecto usan `Math.random`. No sirven para nada sensible (contraseñas, tokens): es
// azar de presentación.

/** Una fuente de números al azar: devuelve un número en [0, 1). */
export type FuenteDeAzar = () => number;

/** Una copia de la lista en orden aleatorio (Fisher-Yates), sin modificar la original. */
export function mezclar<T>(lista: readonly T[], azar: FuenteDeAzar = Math.random): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [copia[i], copia[j]] = [copia[j] as T, copia[i] as T];
  }
  return copia;
}

/** Un elemento cualquiera de la lista, o `undefined` si está vacía. */
export function elegirAlAzar<T>(
  lista: readonly T[],
  azar: FuenteDeAzar = Math.random,
): T | undefined {
  return lista[Math.floor(azar() * lista.length)];
}

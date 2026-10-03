// Preferencias del módulo de ingresos y gastos que solo le importan a este
// navegador: la categoría y la cuenta usadas la última vez, para proponerlas
// de entrada en el formulario rápido (docs/guias/usabilidad.md, "Lo más usado,
// a mano"). No es un dato del usuario que valga la pena guardar en el
// servidor, así que vive en `localStorage`.
//
// También las utilidades para pasar fechas entre el formulario (hora local del
// dispositivo) y la API (instantes en UTC).

const CLAVE_CATEGORIA = "gestoria:finanzas:ultima-categoria";
const CLAVE_CUENTA = "gestoria:finanzas:ultima-cuenta";

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    // Modo privado, almacenamiento bloqueado, etc.: sin preferencia guardada,
    // el formulario simplemente no preselecciona nada.
    return null;
  }
}

function guardar(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // No hay nada que recuperar: la preferencia es una comodidad, no un dato.
  }
}

/** El id (numérico) de la última categoría usada, o null si no hay o el valor guardado no sirve. */
export function leerUltimaCategoria(): number | null {
  const guardada = Number(leer(CLAVE_CATEGORIA));
  return Number.isInteger(guardada) && guardada > 0 ? guardada : null;
}

export function guardarUltimaCategoria(categoriaId: number): void {
  guardar(CLAVE_CATEGORIA, String(categoriaId));
}

export function leerUltimaCuenta(): string | null {
  return leer(CLAVE_CUENTA);
}

export function guardarUltimaCuenta(cuentaId: string): void {
  guardar(CLAVE_CUENTA, cuentaId);
}

/**
 * Zona horaria del dispositivo ("America/Montevideo"). La web muestra y pide
 * las fechas en ella, igual que lo hace un <input type="datetime-local">.
 */
export function zonaDelDispositivo(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function dosDigitos(numero: number): string {
  return String(numero).padStart(2, "0");
}

/**
 * Convierte una fecha al valor que entiende un <input type="datetime-local">:
 * "AAAA-MM-DDTHH:mm", en la hora local del dispositivo (no UTC), sin segundos.
 */
export function aValorDeFechaHora(fecha: Date): string {
  return (
    `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    `T${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  );
}

/** Ahora, como valor de un <input type="datetime-local"> (al minuto: nunca queda en el futuro). */
export function ahoraParaInput(): string {
  return aValorDeFechaHora(new Date());
}

/**
 * Lo que escribió la persona en un <input type="datetime-local"> (hora local)
 * como instante ISO 8601 para mandar a la API. Null si el valor está vacío o
 * no es una fecha válida.
 */
export function instanteDesdeInput(valor: string): string | null {
  if (valor === "") return null;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

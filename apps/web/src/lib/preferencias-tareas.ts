// Preferencias de Tareas que solo le importan a este navegador. Hoy una: si ya se vio el aviso que explica
// qué significa dar una tarea por fallida y la persona pidió no volver a verlo. No vale la pena guardarlo en el
// servidor, así que vive en `localStorage` (mismo criterio que preferencias-calendario.ts).

const CLAVE_DE_AVISO_DE_FALLIDA = "gestoria:tareas:aviso-de-fallida-oculto";

/** Si la persona pidió no volver a ver el aviso de "dar por fallida". */
export function avisoDeFallidaOculto(): boolean {
  try {
    // Solo un "true" explícito lo oculta: cualquier otra cosa es el valor por defecto (mostrarlo).
    return localStorage.getItem(CLAVE_DE_AVISO_DE_FALLIDA) === "true";
  } catch {
    // Modo privado o almacenamiento bloqueado: se muestra, como la primera vez.
    return false;
  }
}

export function ocultarAvisoDeFallida(): void {
  try {
    localStorage.setItem(CLAVE_DE_AVISO_DE_FALLIDA, "true");
  } catch {
    // Sin almacenamiento no se puede recordar; el aviso seguirá apareciendo.
  }
}

export { CLAVE_DE_AVISO_DE_FALLIDA };

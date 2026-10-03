// Teardown global de Playwright: corre una sola vez, al terminar toda la
// corrida (no confundir con limpiarBaseDePruebas() en cada test.beforeEach).
//
// Deja gestion_test vacía después de la suite, igual que como la espera el
// primer test que se ejecute la próxima vez.

import { limpiarBaseDePruebas } from "./utilidades";

export default async function limpiezaGlobal(): Promise<void> {
  await limpiarBaseDePruebas();
}

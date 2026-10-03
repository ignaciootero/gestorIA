// Setup global de Vitest (no confundir con el `beforeEach` de cada archivo,
// que vacía la base antes de cada test individual): esto corre una sola vez
// para toda la corrida, y lo único que importa es lo que devuelve.
//
// La función devuelta es el teardown: se ejecuta al terminar todos los
// archivos de test, así gestion_test queda vacía después de correr la suite,
// igual que como la espera el primer test que se ejecute la próxima vez.
//
// Corre fuera del proceso de los tests, así que arma su propio cliente en vez
// de reusar el de cada archivo.

import { limpiarBase } from "./auth-de-prueba.ts";
import { clienteDePrueba } from "./entorno-de-prueba.ts";

export default function setup(): () => Promise<void> {
  return async () => {
    const cliente = clienteDePrueba();
    try {
      await limpiarBase(cliente);
    } finally {
      await cliente.cerrar();
    }
  };
}

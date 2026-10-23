// La moneda base de la persona: aquella en la que se expresan los totales, el
// balance, los presupuestos y las estadísticas. Es `usuarios.monedaPorDefecto`
// (pesos uruguayos por defecto) y no se cambia desde la aplicación.

import type { ClienteDb } from "@gestoria/db";

export async function obtenerMonedaBase(cliente: ClienteDb, userId: string): Promise<string> {
  const fila = await cliente.db.query.usuarios.findFirst({
    where: (tabla, { eq: eqCol }) => eqCol(tabla.id, userId),
    columns: { monedaPorDefecto: true },
  });
  if (!fila) throw new Error(`Usuario ${userId} no encontrado al leer su moneda base.`);
  return fila.monedaPorDefecto;
}

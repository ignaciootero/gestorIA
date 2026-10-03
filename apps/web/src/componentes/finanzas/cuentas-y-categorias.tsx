// Pestaña "Cuentas": las cuentas (seccion-de-cuentas.tsx, con su saldo, ajustes
// manuales, transferencias e historial) y las categorías (seccion-de-categorias.tsx).

"use client";

import { SeccionDeCategorias } from "./seccion-de-categorias";
import { SeccionDeCuentas } from "./seccion-de-cuentas";

export function CuentasYCategorias() {
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <SeccionDeCuentas />
      <SeccionDeCategorias />
    </div>
  );
}

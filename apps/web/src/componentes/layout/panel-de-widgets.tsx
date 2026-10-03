// Columna derecha del marco de la aplicación: por ahora solo reserva el
// lugar. Los widgets (resumen de gastos, próximos recordatorios, etc.) se
// suman más adelante, junto con los módulos que les dan datos.

import { LayoutGrid } from "lucide-react";

export function PanelDeWidgets() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-tarjeta border border-dashed border-borde p-6 text-center text-sm text-texto-secundario">
      <LayoutGrid aria-hidden="true" className="size-5" />
      Los widgets se van a sumar acá más adelante.
    </div>
  );
}

// Marco de tres columnas para las pantallas de la aplicación (una vez hay
// sesión iniciada): navegación a la izquierda, el contenido de la pantalla en
// el medio —la columna más grande, porque es lo que se está mirando— y
// widgets a la derecha, que por ahora solo reservan el lugar.
//
// Sin ancho máximo ni `mx-auto` en la grilla: las columnas laterales tienen
// que quedar pegadas a los bordes de la ventana (con el mismo margen que
// usan el Navbar y el pie), no encerradas en una franja centrada que en una
// pantalla ancha deja el menú flotando lejos del borde real. El contenido del
// medio se centra en SU columna (cada página le pone su propio ancho
// máximo), no la grilla entera.
//
// Las columnas laterales van con `sticky`: acompañan el scroll hasta que se
// terminan, en vez de quedar clavadas en la pantalla sin importar cuánto
// contenido tengan. El tope coincide con la altura del Navbar, para que
// queden pegadas justo debajo. `max-h` + `overflow-y-auto` es por si algún
// día el menú o los widgets crecen más que la pantalla: se desplazan solos en
// vez de cortarse sin forma de llegar al final.
//
// En pantallas angostas no entran las tres columnas: los widgets se ocultan
// primero (son lo menos esencial) y, si todavía no entra, también el menú,
// dejando solo el contenido central (docs/guias/usabilidad.md, pantallas
// chicas y grandes).

import type { ReactNode } from "react";
import { MenuDeNavegacion } from "@/componentes/layout/menu-de-navegacion";
import { PanelDeWidgets } from "@/componentes/layout/panel-de-widgets";
import { cn } from "@/lib/clases";

const CLASE_COLUMNA_LATERAL =
  "sticky top-(--alto-navbar) max-h-[calc(100dvh-var(--alto-navbar))] overflow-y-auto py-6";

export function EstructuraDeApp({ children }: { children: ReactNode }) {
  return (
    <div className="grid w-full flex-1 grid-cols-1 gap-6 px-4 sm:px-8 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_260px]">
      <aside aria-label="Navegación" className={cn("hidden md:block", CLASE_COLUMNA_LATERAL)}>
        <MenuDeNavegacion />
      </aside>

      <main className="flex min-w-0 flex-col gap-6 py-6">{children}</main>

      <aside aria-label="Widgets" className={cn("hidden lg:block", CLASE_COLUMNA_LATERAL)}>
        <PanelDeWidgets />
      </aside>
    </div>
  );
}

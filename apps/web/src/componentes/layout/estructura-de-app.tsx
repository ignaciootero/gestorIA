// Marco de las pantallas de la aplicación (una vez hay sesión iniciada):
// navegación a la izquierda, el contenido de la pantalla en el medio —la columna
// más grande, porque es lo que se está mirando— y, si la pantalla los tiene,
// widgets a la derecha.
//
// Los widgets los pone cada página (`widgets`), porque dependen de dónde está
// parada la persona: Finanzas muestra los suyos y las pantallas sin widgets
// (administración) se quedan con dos columnas, sin una tercera vacía. La pantalla
// de inicio tampoco pasa `widgets`: sus resúmenes son el contenido principal, que
// ocupa el lugar de las dos columnas (ver PanelDeInicio).
//
// Las dos columnas laterales se pueden esconder con una pestaña pegada al borde de
// la ventana (PestanaDeColumna), para quien prefiere no verlas.
// Esconder una columna NO mueve nada del resto de la pantalla: la grilla conserva
// sus tres anchos, y la columna se desliza hacia su borde mientras se desvanece
// (`transform` y `opacity`) hasta quedar invisible, así que tampoco recibe el foco
// del teclado ni la lee un lector de pantalla. Un atributo de <html> (ver
// lib/columnas-plegables.ts) dice qué está escondido. La visibilidad cambia al final
// al esconder y al principio al mostrar, para no cortar la animación; con la
// preferencia de reducir movimiento, sin animación.
//
// El contenido del medio queda centrado en la pantalla, no solo entre las dos columnas (que miden
// distinto: el menú 220 px y los widgets 336 px, así que centrarlo entre ellas lo corre a un lado).
// Desde `xl` la grilla tiene tres pistas: las dos de los costados son `1fr` con el mismo mínimo
// (así miden lo mismo y el medio queda justo en el centro) y la del medio llega a 56 rem, el ancho
// máximo de las páginas. El menú se pega al borde izquierdo y los widgets al derecho dentro de su
// pista. Con las pantallas más angostas no sobra lugar para igualar los costados y se usa el reparto
// de siempre. Sin widgets (administración) la pista derecha queda vacía para mantener el equilibrio.
// La excepción son las páginas "fusionadas" (inicio y calendario): su contenido ocupa también el
// lugar de los widgets, así que usan solo menú y contenido (`fusionada`).
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
// Una pantalla puede pedir entrar entera en la ventana, sin desplazamiento vertical (`pantallaFija`,
// hoy la de inicio): la grilla se marca con `data-pantalla-fija`, el marco de la aplicación pasa a medir
// el alto de la ventana (ver `.marco-de-la-app` en globals.css) y la fila de la grilla y el contenido
// pueden achicarse hasta lo que queda entre la barra y el pie.
//
// En pantallas angostas no entran las tres columnas: los widgets se ocultan
// primero (son lo menos esencial) y, si todavía no entra, también el menú,
// dejando solo el contenido central (docs/guias/usabilidad.md, pantallas
// chicas y grandes).

import type { ReactNode } from "react";
import { MenuDeNavegacion } from "@/componentes/layout/menu-de-navegacion";
import { PestanaDeColumna } from "@/componentes/layout/pestana-de-columna";
import { cn } from "@/lib/clases";

const CLASE_COLUMNA_LATERAL =
  "sticky top-(--alto-navbar) max-h-[calc(100dvh-var(--alto-navbar))] overflow-y-auto overflow-x-hidden py-6";

/**
 * Lo que le pasa a una columna escondida: se corre hacia su borde, se desvanece y queda
 * invisible. La visibilidad cambia al final al esconder y al principio al mostrar (así
 * no corta la animación). `atributo` es el de <html> que dice que está escondida.
 */
const ENTRADA_Y_SALIDA =
  "transition-[transform,opacity,visibility] duration-(--duracion-normal) ease-salida motion-reduce:transition-none";
const ESCONDIDA_MENU =
  "[html[data-menu=cerrado]_&]:invisible [html[data-menu=cerrado]_&]:-translate-x-6 [html[data-menu=cerrado]_&]:opacity-0";
const ESCONDIDA_WIDGETS =
  "[html[data-widgets=cerrado]_&]:invisible [html[data-widgets=cerrado]_&]:translate-x-6 [html[data-widgets=cerrado]_&]:opacity-0";

/** Menú y contenido; el contenido ocupa todo el resto (inicio y calendario). */
const COLUMNAS_FUSIONADAS = "md:grid-cols-[220px_minmax(0,1fr)]";
/** Contenido centrado en la pantalla desde `xl`, con la pista derecha vacía. */
const COLUMNAS_SIN_WIDGETS =
  "md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[minmax(220px,1fr)_minmax(0,56rem)_minmax(220px,1fr)]";
/** Contenido centrado en la pantalla desde `xl`, con los costados iguales (el ancho de los widgets). */
const COLUMNAS_CON_WIDGETS =
  "md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)_288px] xl:grid-cols-[minmax(336px,1fr)_minmax(0,56rem)_minmax(336px,1fr)]";

export function EstructuraDeApp({
  children,
  widgets,
  fusionada = false,
  pantallaFija = false,
}: {
  children: ReactNode;
  /** Contenido de la columna derecha. Sin él, la pantalla tiene solo menú y contenido. */
  widgets?: ReactNode;
  /**
   * El contenido ocupa también el lugar de los widgets (inicio y calendario), en vez de quedar
   * centrado en la pantalla. Sin `widgets`, claro.
   */
  fusionada?: boolean;
  /** La pantalla entra entera en la ventana, sin desplazamiento vertical (inicio). */
  pantallaFija?: boolean;
}) {
  return (
    <div
      data-pantalla-fija={pantallaFija || undefined}
      className={cn(
        "grid w-full flex-1 grid-cols-1 gap-6 px-4 sm:px-8",
        pantallaFija && "min-h-0 grid-rows-[minmax(0,1fr)]",
        widgets ? COLUMNAS_CON_WIDGETS : fusionada ? COLUMNAS_FUSIONADAS : COLUMNAS_SIN_WIDGETS,
      )}
    >
      <PestanaDeColumna
        nombre="menu"
        lado="izquierda"
        etiqueta="el menú"
        controla="columna-menu"
        desde="md"
      />
      <aside
        id="columna-menu"
        aria-label="Navegación"
        className={cn(
          "hidden md:block xl:w-55 xl:justify-self-start",
          ENTRADA_Y_SALIDA,
          ESCONDIDA_MENU,
          CLASE_COLUMNA_LATERAL,
        )}
      >
        <div className="min-w-[220px]">
          <MenuDeNavegacion />
        </div>
      </aside>

      <main className={cn("flex min-w-0 flex-col gap-6 py-6", pantallaFija && "min-h-0")}>
        {children}
      </main>

      {widgets ? (
        <>
          {/* `flex` en columna para que los widgets puedan centrarse en el alto entero. */}
          <aside
            id="columna-widgets"
            aria-label="Widgets"
            className={cn(
              "hidden lg:flex lg:flex-col xl:justify-self-end",
              ENTRADA_Y_SALIDA,
              ESCONDIDA_WIDGETS,
              CLASE_COLUMNA_LATERAL,
            )}
          >
            <div className="flex w-72 flex-1 flex-col xl:w-84">{widgets}</div>
          </aside>
          <PestanaDeColumna
            nombre="widgets"
            lado="derecha"
            etiqueta="los widgets"
            controla="columna-widgets"
            desde="lg"
          />
        </>
      ) : null}
    </div>
  );
}

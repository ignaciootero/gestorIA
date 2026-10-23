// Columna de widgets: un carrusel por categoría, apilados, juntos y centrados en el alto de la
// columna lateral (que acompaña el scroll, ver EstructuraDeApp).
//
// Arriba va el carrusel de los widgets de texto (cifras, curiosidades y avisos) y abajo el de
// los gráficos (ver CATEGORIAS_DE_WIDGET). Dentro de cada categoría se respeta el orden de la
// lista, que viene con los avisos primero: lo más importante queda a la vista. Una categoría
// sin widgets no muestra su carrusel (sin gráficos que mostrar, queda solo el de texto).
//
// Los dos comparten el mismo tiempo: un solo reloj (`useRelojCompartido`) les avisa cuándo toca
// pasar al siguiente, así que cambian juntos. Al tocar la flecha de cualquiera de los dos, el
// reloj vuelve a empezar para ambos. Cada uno se frena por su cuenta con el mouse o el foco encima
// (ver CarruselDeWidgets).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CarruselDeWidgets,
  INTERVALO_DEL_CARRUSEL_MS,
} from "@/componentes/widgets/carrusel-de-widgets";
import {
  CATEGORIAS_DE_WIDGET,
  type CategoriaDeWidget,
  type DatoDeWidget,
} from "@/componentes/widgets/tipos";

const NOMBRE_DE_CATEGORIA: Record<CategoriaDeWidget, string> = {
  texto: "texto",
  grafico: "gráficos",
};

/** Separa la lista por categoría, en el orden de la columna. Las categorías vacías no se devuelven. */
export function repartirPorCategoria(
  widgets: readonly DatoDeWidget[],
): { categoria: CategoriaDeWidget; widgets: DatoDeWidget[] }[] {
  return CATEGORIAS_DE_WIDGET.map((categoria) => ({
    categoria,
    widgets: widgets.filter((widget) => widget.categoria === categoria),
  })).filter((grupo) => grupo.widgets.length > 0);
}

/**
 * Un reloj para toda la columna: `tic` sube cada `intervaloMs`, y `reiniciar` lo hace empezar de
 * nuevo (el próximo tic llega recién después de un intervalo completo). Es un intervalo y no un
 * `setTimeout` para que, si un tic cae con la pestaña oculta, el siguiente vuelva a intentar en vez
 * de quedarse quieto para siempre.
 */
function useRelojCompartido(intervaloMs: number): { tic: number; reiniciar: () => void } {
  const [tic, setTic] = useState(0);
  const [reinicios, setReinicios] = useState(0);

  // Al cambiar `reinicios` el efecto se rehace, y con él el intervalo.
  useEffect(() => {
    const temporizador = window.setInterval(() => {
      if (!document.hidden) setTic((actual) => actual + 1);
    }, intervaloMs);
    return () => window.clearInterval(temporizador);
  }, [intervaloMs, reinicios]);

  const reiniciar = useCallback(() => setReinicios((actual) => actual + 1), []);
  return { tic, reiniciar };
}

export function ColumnaDeCarruseles({
  widgets,
  etiqueta,
}: {
  widgets: readonly DatoDeWidget[];
  /** Nombre del conjunto ("Widgets de finanzas"); cada carrusel agrega su categoría. */
  etiqueta: string;
}) {
  // Memoizado: cada carrusel reinicia su temporizador si su lista cambia de identidad.
  const grupos = useMemo(() => repartirPorCategoria(widgets), [widgets]);
  const { tic, reiniciar } = useRelojCompartido(INTERVALO_DEL_CARRUSEL_MS);

  return (
    // Juntos y en el medio: con espacio de sobra arriba y abajo, no estirados de punta a
    // punta. Si la ventana es baja y no entran, la columna se desplaza (ver EstructuraDeApp).
    <div className="flex flex-1 flex-col justify-center gap-8 [@media(min-height:800px)]:gap-10 [@media(min-height:900px)]:gap-12">
      {grupos.map((grupo) => (
        <CarruselDeWidgets
          // La categoría es la identidad del carrusel: lo que cambia entre
          // actualizaciones son sus widgets, no cuál es cuál.
          key={grupo.categoria}
          widgets={grupo.widgets}
          tic={tic}
          alCambiarAMano={reiniciar}
          etiqueta={`${etiqueta}: ${NOMBRE_DE_CATEGORIA[grupo.categoria]}`}
        />
      ))}
    </div>
  );
}

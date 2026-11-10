// La marca de lo atrasado en la grilla del mes (una tarea de un día anterior sin hacer, o una deuda vencida
// sin saldar): un triángulo de aviso lleno del color del origen, con un signo de exclamación blanco.
//
// Las demás marcas del día son círculos de 12 px (14 px desde `sm`) con adentro una marca blanca y un
// anillo de 1 px que las separa del fondo. Esta usa **la misma caja, el mismo grosor de trazo y el mismo
// anillo**, para que en la fila de marcas se vea del mismo tamaño y no salte:
// - El triángulo ocupa el ancho entero de la caja y queda centrado en el alto, como el círculo.
// - El signo va con el mismo grosor que el tilde o la cruz de los círculos.
// - El anillo es un trazo del color del fondo detrás del relleno (`paint-order`), que asoma 1 px por
//   fuera, igual que el `ring-1` de los círculos. El SVG deja que se dibuje fuera de su caja.
//
// Se dibuja a mano (y no con TriangleAlert de Lucide) porque el de Lucide es solo contorno: acá hace falta
// relleno, el anillo y la exclamación encima.

import { cn } from "@/lib/clases";

/**
 * El contorno del triángulo de Lucide (TriangleAlert), con las puntas redondeadas: va de x=2 a x=22 y de
 * y≈3 a y=21. La caja de `viewBox` (20 × 20) lo encierra justo, así ocupa el mismo ancho que el círculo.
 */
const TRIANGULO = "M10.27 4a2 2 0 0 1 3.46 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.73-3Z";

export function MarcaDeAtrasada({
  colorDelOrigen,
  colorDelAnillo,
}: {
  /** La clase de texto del origen (`text-origen-tareas`): el triángulo se pinta con `currentColor`. */
  colorDelOrigen: string;
  /** La clase de trazo del fondo sobre el que va (`stroke-superficie` o la del día elegido). */
  colorDelAnillo: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="2 2 20 20"
      overflow="visible"
      className={cn("size-full", colorDelOrigen)}
    >
      <path
        d={TRIANGULO}
        fill="currentColor"
        // 3 unidades de trazo centrado sobre el borde: 1,5 quedan afuera ≈ 1 px a este tamaño.
        strokeWidth={3}
        strokeLinejoin="round"
        paintOrder="stroke"
        className={colorDelAnillo}
      />
      {/* El signo, más abajo que el centro de la caja: el centro visual de un triángulo está bajo. */}
      <path
        d="M12 10v4.2M12 17.6h.01"
        fill="none"
        strokeWidth={2.4}
        strokeLinecap="round"
        className="stroke-superficie"
      />
    </svg>
  );
}

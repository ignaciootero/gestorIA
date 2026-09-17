// Un número que pulsa cuando cambia: totales, saldos, contadores.
//
// Sin esto, un total que se actualiza solo (porque se agregó un gasto en otra
// pantalla, o porque llegó la respuesta del servidor) cambia en silencio y
// nadie lo nota. El pulso es la respuesta visible que pide la guía de
// usabilidad, aplicada a algo que el usuario no tocó.
//
// Va con números tabulares: sin eso, cada dígito tiene un ancho distinto y el
// valor "baila" al actualizarse, que es exactamente lo contrario de lo que se
// busca.

"use client";

import { CURVA_SALIDA, DURACION_MS } from "@gestoria/ui-tokens";
import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/clases";

export function ValorConPulso({ valor, className }: { valor: string; className?: string }) {
  const [alcance, animar] = useAnimate<HTMLSpanElement>();
  const reducirMovimiento = useReducedMotion();
  const anterior = useRef(valor);

  useEffect(() => {
    if (anterior.current === valor) return;
    anterior.current = valor;

    // Con la preferencia de reducir movimiento no hay pulso. El valor nuevo
    // sigue apareciendo: lo que se quita es el movimiento, no la información.
    if (reducirMovimiento || !alcance.current) return;

    void animar(
      alcance.current,
      { scale: [1, 1.12, 1] },
      { duration: DURACION_MS.normal / 1000, ease: CURVA_SALIDA },
    );
  }, [valor, reducirMovimiento, animar, alcance]);

  return (
    <span ref={alcance} className={cn("numeros-tabulares inline-block", className)}>
      {valor}
    </span>
  );
}

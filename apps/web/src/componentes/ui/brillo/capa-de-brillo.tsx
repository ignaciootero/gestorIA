// La capa SVG que dibuja el brillo del borde de un contenedor.
//
// Va como primer hijo de cualquier elemento con la clase `con-brillo`. El motor
// que la mueve es el proveedor (proveedor-de-brillo.tsx): acá solo se declara la
// estructura una vez, y a partir de ahí el bucle le cambia los atributos por
// referencia. Nada de esto pasa por el estado de React: son hasta sesenta
// actualizaciones por segundo y volver a renderizar en cada una sería absurdo.
//
// Son dos rectángulos y no uno: el fino marca la línea nítida del borde y el
// ancho, difuminado, es el halo que la rodea. Los dos comparten el mismo
// gradiente radial, centrado donde está el mouse.

"use client";

import { useEffect, useId, useRef } from "react";
import { useRegistroDeBrillo } from "./proveedor-de-brillo";

export function CapaDeBrillo() {
  // `useId` trae caracteres que no sirven dentro de `url(#…)`, así que se
  // limpian. El id tiene que ser único: si dos tarjetas comparten gradiente,
  // las dos brillan en el punto de la última.
  const identificador = `brillo-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const referencia = useRef<SVGSVGElement>(null);
  const registrar = useRegistroDeBrillo();

  useEffect(() => {
    const svg = referencia.current;
    const contenedor = svg?.parentElement;
    if (!svg || !contenedor || !registrar) return;

    const linea = svg.querySelector<SVGRectElement>(".linea");
    const halo = svg.querySelector<SVGRectElement>(".halo");
    const gradiente = svg.querySelector<SVGRadialGradientElement>("radialGradient");
    if (!linea || !halo || !gradiente) return;

    return registrar({
      contenedor,
      svg,
      linea,
      halo,
      gradiente,
      paradas: [...svg.querySelectorAll<SVGStopElement>("stop")],
    });
  }, [registrar]);

  return (
    <svg ref={referencia} aria-hidden="true" className="brillo-svg">
      <defs>
        {/*
          `userSpaceOnUse` para que cx, cy y r vayan en píxeles del contenedor y
          no en fracciones de su caja: el mouse llega en píxeles.
        */}
        <radialGradient id={identificador} gradientUnits="userSpaceOnUse">
          {/* El color y la opacidad los pone el proveedor, que sabe el tema. */}
          <stop offset="0" />
          <stop offset="0.3" />
          <stop offset="1" />
        </radialGradient>
      </defs>
      <rect className="halo" stroke={`url(#${identificador})`} />
      <rect className="linea" stroke={`url(#${identificador})`} />
    </svg>
  );
}

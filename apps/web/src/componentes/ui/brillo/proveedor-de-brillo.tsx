// Brillo de bordes: el contorno de una tarjeta o panel se ilumina según la
// cercanía del mouse (docs/guias/estetica.md).
//
// Acá está el motor: un único `requestAnimationFrame` y un único juego de
// escuchas para toda la página, que recorre los contenedores registrados y les
// actualiza el gradiente. Cada contenedor pone su capa SVG con
// `<CapaDeBrillo />` y se registra acá.
//
// Por qué un solo bucle y no uno por tarjeta: con una escucha de `mousemove`
// por contenedor, diez tarjetas serían diez llamadas por movimiento del mouse,
// cada una con su `getBoundingClientRect` (que además obliga al navegador a
// recalcular el layout). Así hay una sola pasada por cuadro, que es el techo de
// lo que la pantalla puede mostrar (docs/guias/rendimiento.md).
//
// El algoritmo completo está copiado en docs/referencias/fondo-animado.md.

"use client";

import { BRILLO_DE_BORDE } from "@gestoria/ui-tokens";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from "react";
import { useColorDeAcento } from "@/componentes/color-de-acento";
import { useTema } from "@/componentes/tema";

/** Cuánto sobresale la capa SVG del contenedor, para que el halo no se corte. */
export const MARGEN = 6;

const ALCANCE = Number.parseFloat(BRILLO_DE_BORDE.alcance);
const GROSOR = Number.parseFloat(BRILLO_DE_BORDE.grosor);
const INTENSIDAD = Number.parseFloat(BRILLO_DE_BORDE.intensidad) / 100;

/** Qué proporción de la intensidad tiene cada parada del gradiente. */
const FACTORES_DE_PARADA = [1, 1, 0];

export type RegistroDeBrillo = {
  contenedor: HTMLElement;
  svg: SVGSVGElement;
  linea: SVGRectElement;
  halo: SVGRectElement;
  gradiente: SVGRadialGradientElement;
  paradas: SVGStopElement[];
};

type Contexto = {
  /** Registra un contenedor y devuelve la función que lo da de baja. */
  registrar: (registro: RegistroDeBrillo) => () => void;
};

const ContextoDeBrillo = createContext<Contexto | null>(null);

/** Le pone al gradiente el color de acento del tema activo. */
function pintar(registro: RegistroDeBrillo, acento: string): void {
  registro.paradas.forEach((parada, indice) => {
    parada.setAttribute("stop-color", acento);
    parada.setAttribute("stop-opacity", String(INTENSIDAD * (FACTORES_DE_PARADA[indice] ?? 0)));
  });
}

export function ProveedorDeBrillo({ children }: { children: ReactNode }) {
  const { tema } = useTema();
  const { colores } = useColorDeAcento();
  const registros = useRef(new Set<RegistroDeBrillo>());
  const acento = useRef("");
  const posicion = useRef<{ x: number; y: number } | null>(null);
  const pedido = useRef(0);

  const registrar = useCallback((registro: RegistroDeBrillo) => {
    registros.current.add(registro);
    // Puede registrarse en cualquier momento, no solo al cargar la página: se
    // le pinta el color que ya está vigente.
    if (acento.current) pintar(registro, acento.current);

    return () => {
      registros.current.delete(registro);
    };
  }, []);

  // El color de acento se relee al cambiar de tema o de color elegido. Un gradiente SVG no
  // hereda las variables CSS del documento, así que hay que escribirle el color. Los colores
  // elegidos no se usan acá: solo avisan cuándo releer (el proveedor de color ya los aplicó).
  useEffect(() => {
    acento.current = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-acento")
      .trim();

    for (const registro of registros.current) pintar(registro, acento.current);
  }, [tema, colores.claro, colores.oscuro]);

  useEffect(() => {
    // Solo con mouse. En una pantalla táctil no hay puntero que seguir, así que
    // el efecto directamente no existe y no se engancha ninguna escucha.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const conjunto = registros.current;

    function actualizar(): void {
      const mouse = posicion.current;

      for (const registro of conjunto) {
        const caja = registro.contenedor.getBoundingClientRect();
        // Se enciende también con el mouse cerca pero afuera: el brillo tiene
        // que anticiparse al contacto, no esperar a que el puntero entre.
        const cerca =
          mouse !== null &&
          mouse.x > caja.left - ALCANCE &&
          mouse.x < caja.right + ALCANCE &&
          mouse.y > caja.top - ALCANCE &&
          mouse.y < caja.bottom + ALCANCE;

        registro.svg.classList.toggle("activo", cerca);
        if (!cerca || mouse === null) continue;

        const radio = Number.parseFloat(getComputedStyle(registro.contenedor).borderTopLeftRadius);

        for (const rectangulo of [registro.linea, registro.halo]) {
          // El medio píxel es lo que hace que un trazo de 1 px caiga sobre la
          // grilla de la pantalla y se vea nítido en vez de gris.
          rectangulo.setAttribute("x", String(MARGEN + 0.5));
          rectangulo.setAttribute("y", String(MARGEN + 0.5));
          rectangulo.setAttribute("width", String(Math.max(0, caja.width - 1)));
          rectangulo.setAttribute("height", String(Math.max(0, caja.height - 1)));
          rectangulo.setAttribute("rx", String(Math.max(0, (radio || 0) - 0.5)));
        }

        registro.linea.setAttribute("stroke-width", String(GROSOR));
        registro.halo.setAttribute("stroke-width", String(GROSOR * 4));
        registro.gradiente.setAttribute("cx", String(mouse.x - caja.left + MARGEN));
        registro.gradiente.setAttribute("cy", String(mouse.y - caja.top + MARGEN));
        registro.gradiente.setAttribute("r", String(ALCANCE));
      }
    }

    function cuadro(): void {
      pedido.current = window.requestAnimationFrame(cuadro);
      actualizar();
    }

    function arrancar(): void {
      if (pedido.current !== 0) return;
      pedido.current = window.requestAnimationFrame(cuadro);
    }

    function frenar(): void {
      if (pedido.current === 0) return;
      window.cancelAnimationFrame(pedido.current);
      pedido.current = 0;
    }

    function alMover(evento: MouseEvent): void {
      posicion.current = { x: evento.clientX, y: evento.clientY };
      // El bucle solo corre mientras hay un mouse en la ventana. Girar para
      // siempre sin nadie mirando es gastar batería en nada.
      arrancar();
    }

    function alSalir(): void {
      posicion.current = null;
      // Una última pasada para apagar todo, y recién ahí se corta el bucle.
      actualizar();
      frenar();
    }

    // El scroll y el resize mueven los contenedores sin mover el mouse: las
    // cajas cambian y hay que recalcular. En captura porque el scroll de un
    // contenedor interno no burbujea hasta window.
    window.addEventListener("mousemove", alMover, { passive: true });
    window.addEventListener("scroll", actualizar, { passive: true, capture: true });
    window.addEventListener("resize", actualizar, { passive: true });
    document.addEventListener("mouseleave", alSalir);

    return () => {
      frenar();
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("scroll", actualizar, { capture: true });
      window.removeEventListener("resize", actualizar);
      document.removeEventListener("mouseleave", alSalir);
    };
  }, []);

  return <ContextoDeBrillo.Provider value={{ registrar }}>{children}</ContextoDeBrillo.Provider>;
}

/**
 * Da de alta un contenedor en el motor del brillo.
 *
 * Devuelve `null` si no hay proveedor: el brillo es decorativo, así que su
 * ausencia no tiene que romper nada ni obligar a envolver los tests.
 */
export function useRegistroDeBrillo(): Contexto["registrar"] | null {
  return useContext(ContextoDeBrillo)?.registrar ?? null;
}

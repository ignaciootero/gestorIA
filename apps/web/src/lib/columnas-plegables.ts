// Las columnas laterales del marco (el menú y los widgets) se pueden esconder.
//
// La preferencia es del dispositivo, no de la cuenta (como el tema): vive en
// `localStorage` y se refleja en un atributo de <html> (`data-menu` y
// `data-widgets`, con el valor "cerrado" cuando está escondida). El CSS del marco
// lee esos atributos para achicar la columna a cero, así que no depende de que
// React ya haya cargado.
//
// Por eso hay un script que corre antes del primer pintado (igual que el del tema):
// si el atributo lo pusiera React después de hidratar, quien dejó una columna
// cerrada vería la pantalla abierta un instante y luego "cerrarse" sola.

"use client";

import { useCallback, useSyncExternalStore } from "react";

export type NombreDeColumna = "menu" | "widgets";

const CLAVE = (nombre: NombreDeColumna) => `gestoria:columna-${nombre}`;
const EVENTO = "gestoria:columnas";

export const SCRIPT_COLUMNAS_INICIAL = `
(function () {
  try {
    ["menu", "widgets"].forEach(function (n) {
      if (localStorage.getItem("gestoria:columna-" + n) === "cerrado") {
        document.documentElement.setAttribute("data-" + n, "cerrado");
      }
    });
  } catch (e) {}
})();
`;

function estaAbierta(nombre: NombreDeColumna): boolean {
  return document.documentElement.getAttribute(`data-${nombre}`) !== "cerrado";
}

function suscribir(avisar: () => void): () => void {
  window.addEventListener(EVENTO, avisar);
  return () => window.removeEventListener(EVENTO, avisar);
}

/**
 * Si una columna está abierta y cómo abrirla o cerrarla. En el servidor siempre
 * "abierta": el atributo real lo pone el script de arriba antes de pintar, y React
 * lo lee al hidratar.
 */
export function usarColumnaPlegable(nombre: NombreDeColumna): {
  abierta: boolean;
  alternar: () => void;
} {
  const abierta = useSyncExternalStore(
    suscribir,
    () => estaAbierta(nombre),
    () => true,
  );

  const alternar = useCallback(() => {
    const cerrar = estaAbierta(nombre);
    if (cerrar) document.documentElement.setAttribute(`data-${nombre}`, "cerrado");
    else document.documentElement.removeAttribute(`data-${nombre}`);
    try {
      localStorage.setItem(CLAVE(nombre), cerrar ? "cerrado" : "abierto");
    } catch {
      // Sin almacenamiento (ventana privada, datos bloqueados): funciona en esta visita y no se recuerda.
    }
    window.dispatchEvent(new Event(EVENTO));
  }, [nombre]);

  return { abierta, alternar };
}

// Aplicar el color de acento que eligió la persona.
//
// Los colores se guardan en la cuenta (PUT /api/yo/colores), pero la sesión llega después del
// primer pintado: si se esperara a ella, la página se vería un instante con el verde agua y
// después cambiaría. Por eso se guarda además una copia en el navegador, con los tonos ya
// derivados, que un script del layout aplica antes de pintar (igual que el tema).
//
// Los tonos se escriben como variables CSS en el estilo de <html>, que pisan a las de
// tokens.css. Sin color elegido se borran y vuelven a mandar las de tokens.css.

import type { ColoresDeAcento } from "@gestoria/shared";
import {
  derivarAcento,
  esColorHex,
  type ModoDeColor,
  type TonosDeAcento,
} from "@gestoria/ui-tokens";

const CLAVE = "gestion.acento";

/** Cada tono → su variable CSS. Son las mismas cuatro que define tokens.css. */
export const VARIABLES_DEL_ACENTO: Record<keyof TonosDeAcento, string> = {
  acento: "--color-acento",
  acentoTexto: "--color-acento-texto",
  acentoSuave: "--color-acento-suave",
  acentoSuaveTexto: "--color-acento-suave-texto",
};

/** Lo que queda guardado en el navegador: los tonos ya derivados de cada modo. */
type Copia = Record<ModoDeColor, TonosDeAcento | null>;

/** Los tonos de un modo, o null si en ese modo va el color de la app. */
export function tonosDe(colores: ColoresDeAcento, modo: ModoDeColor): TonosDeAcento | null {
  const color = colores[modo];
  return esColorHex(color) ? derivarAcento(color, modo) : null;
}

/** Escribe (o borra, con null) los cuatro tonos en <html>. */
export function aplicarTonos(tonos: TonosDeAcento | null): void {
  const estilo = document.documentElement.style;
  for (const [tono, variable] of Object.entries(VARIABLES_DEL_ACENTO)) {
    const valor = tonos?.[tono as keyof TonosDeAcento];
    if (valor) estilo.setProperty(variable, valor);
    else estilo.removeProperty(variable);
  }
}

/** Guarda la copia del navegador. Sin colores elegidos (o al salir) la borra. */
export function guardarCopia(colores: ColoresDeAcento | null): void {
  try {
    if (!colores || (colores.claro === null && colores.oscuro === null)) {
      window.localStorage.removeItem(CLAVE);
      return;
    }
    const copia: Copia = { claro: tonosDe(colores, "claro"), oscuro: tonosDe(colores, "oscuro") };
    window.localStorage.setItem(CLAVE, JSON.stringify(copia));
  } catch {
    // Sin almacenamiento (modo privado estricto): solo se pierde evitar el destello.
  }
}

/**
 * Corre antes del primer pintado, después del script del tema (que ya dejó data-theme en
 * <html>). Es JavaScript suelto, sin imports: repite a mano lo de `aplicarTonos`.
 */
export const SCRIPT_ACENTO_INICIAL = `
(function () {
  try {
    var copia = JSON.parse(localStorage.getItem("${CLAVE}") || "null");
    if (!copia) return;
    var raiz = document.documentElement;
    var tonos = copia[raiz.getAttribute("data-theme") === "dark" ? "oscuro" : "claro"];
    if (!tonos) return;
    var variables = ${JSON.stringify(VARIABLES_DEL_ACENTO)};
    for (var tono in variables) {
      if (tonos[tono]) raiz.style.setProperty(variables[tono], tonos[tono]);
    }
  } catch (e) {}
})();
`;

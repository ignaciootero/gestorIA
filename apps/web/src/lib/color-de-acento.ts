// Aplicar la apariencia que eligió la persona: el color de acento y la intensidad del fondo.
//
// Se guardan en la cuenta (PUT /api/yo/colores y /api/yo/fondo), pero la sesión llega después
// del primer pintado: si se esperara a ella, la página se vería un instante con el verde agua y
// el fondo de siempre, y después cambiaría. Por eso se guarda además una copia en el navegador,
// con los valores ya calculados, que un script del layout aplica antes de pintar (como el tema).
// El resto de los ajustes del fondo (velocidad, tamaño, segundo tono) los usa el lienzo, que
// arranca recién con la sesión: no se ven antes del primer pintado, así que no hace falta.
//
// Todo se escribe como variables CSS en el estilo de <html>, que pisan a las de tokens.css. Sin
// nada elegido se borran y vuelven a mandar las de tokens.css.

import type { ColoresDeAcento, Fondos } from "@gestoria/shared";
import {
  derivarAcento,
  esColorHex,
  type ModoDeColor,
  opacidadDelFondo,
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

/** La variable de tokens.css con la opacidad del fondo animado. */
export const VARIABLE_DE_INTENSIDAD = "--fondo-intensidad";

/** Lo que queda guardado en el navegador, por modo: los tonos y la opacidad del fondo. */
type Copia = Record<ModoDeColor, { tonos: TonosDeAcento | null; opacidad: number | null }>;

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

/** La opacidad del fondo de un modo, o null si en ese modo va el fondo de la app. */
export function opacidadDe(fondos: Fondos, modo: ModoDeColor): number | null {
  const ajustes = fondos[modo];
  return ajustes ? opacidadDelFondo(ajustes.intensidad, modo) : null;
}

/** Escribe (o borra, con null) la opacidad del fondo en <html>. */
export function aplicarIntensidad(opacidad: number | null): void {
  const estilo = document.documentElement.style;
  if (opacidad === null) estilo.removeProperty(VARIABLE_DE_INTENSIDAD);
  else estilo.setProperty(VARIABLE_DE_INTENSIDAD, String(opacidad));
}

/** Lo que eligió la persona en su cuenta. */
export type Apariencia = { colores: ColoresDeAcento; fondos: Fondos };

/** Guarda la copia del navegador. Sin nada elegido (o al salir) la borra. */
export function guardarCopia(apariencia: Apariencia | null): void {
  try {
    const { colores, fondos } = apariencia ?? {};
    const deUnModo = (modo: ModoDeColor) => ({
      tonos: colores ? tonosDe(colores, modo) : null,
      opacidad: fondos ? opacidadDe(fondos, modo) : null,
    });
    const copia: Copia = { claro: deUnModo("claro"), oscuro: deUnModo("oscuro") };
    const vacia = Object.values(copia).every((modo) => !modo.tonos && modo.opacidad === null);
    if (vacia) {
      window.localStorage.removeItem(CLAVE);
      return;
    }
    window.localStorage.setItem(CLAVE, JSON.stringify(copia));
  } catch {
    // Sin almacenamiento (modo privado estricto): solo se pierde evitar el destello.
  }
}

/**
 * Corre antes del primer pintado, después del script del tema (que ya dejó data-theme en
 * <html>). Es JavaScript suelto, sin imports: repite a mano lo de `aplicarTonos` y
 * `aplicarIntensidad`. Una copia del formato anterior (solo tonos, sin `opacidad`) no rompe
 * nada: no encuentra lo que busca y sigue de largo hasta que la sesión la reemplaza.
 */
export const SCRIPT_ACENTO_INICIAL = `
(function () {
  try {
    var copia = JSON.parse(localStorage.getItem("${CLAVE}") || "null");
    if (!copia) return;
    var raiz = document.documentElement;
    var modo = copia[raiz.getAttribute("data-theme") === "dark" ? "oscuro" : "claro"];
    if (!modo) return;
    var tonos = modo.tonos || {};
    var variables = ${JSON.stringify(VARIABLES_DEL_ACENTO)};
    for (var tono in variables) {
      if (tonos[tono]) raiz.style.setProperty(variables[tono], tonos[tono]);
    }
    if (typeof modo.opacidad === "number") {
      raiz.style.setProperty("${VARIABLE_DE_INTENSIDAD}", String(modo.opacidad));
    }
  } catch (e) {}
})();
`;

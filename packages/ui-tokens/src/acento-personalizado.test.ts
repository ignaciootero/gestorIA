// Tests de la derivación del color de acento elegido por la persona.

import { describe, expect, it } from "vitest";
import {
  type ColorHex,
  CONTRASTE_MINIMO,
  contraste,
  derivarAcento,
  esColorHex,
  type ModoDeColor,
  SUPERFICIE_DEL_ACENTO,
  TEXTO_SOBRE_ACENTO,
  tonoDelFondo,
} from "./acento-personalizado.ts";
import { ACENTO, TEMA_CLARO, TEMA_OSCURO } from "./index.ts";

const MODOS: ModoDeColor[] = ["claro", "oscuro"];

/** Una grilla del cubo RGB (cada canal en 0, 51, 102, …, 255): 216 colores de todo tipo. */
function grillaDeColores(): ColorHex[] {
  const pasos = [0, 51, 102, 153, 204, 255];
  const hex = (valor: number) => valor.toString(16).padStart(2, "0");
  return pasos.flatMap((r) =>
    pasos.flatMap((g) => pasos.map((b) => `#${hex(r)}${hex(g)}${hex(b)}` as ColorHex)),
  );
}

/** Casos que suelen romper estas cuentas: extremos, grises y colores muy intensos o muy claros. */
const BORDES: ColorHex[] = [
  "#000000",
  "#ffffff",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#0000ff",
  "#ffff00",
  "#fde047",
  "#00ffff",
  "#ff00ff",
  "#1e1b4b",
  "#fffbeb",
];

describe("derivarAcento", () => {
  it.each(MODOS)("en modo %s siempre llega al contraste mínimo, elija el color que elija", (modo) => {
    for (const color of [...grillaDeColores(), ...BORDES]) {
      const tonos = derivarAcento(color, modo);
      // El texto sobre los botones, los enlaces y el foco sobre la superficie, y el texto
      // sobre el fondo suave de lo seleccionado.
      expect(contraste(tonos.acento, tonos.acentoTexto), color).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO,
      );
      expect(contraste(tonos.acento, SUPERFICIE_DEL_ACENTO[modo]), color).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO,
      );
      expect(contraste(tonos.acentoSuave, tonos.acentoSuaveTexto), color).toBeGreaterThanOrEqual(
        CONTRASTE_MINIMO,
      );
    }
  });

  it("devuelve siempre colores #rrggbb en minúsculas", () => {
    for (const color of BORDES) {
      for (const modo of MODOS) {
        for (const tono of Object.values(derivarAcento(color, modo))) {
          expect(tono).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("deja el color tal cual cuando ya se lee bien", () => {
    // El verde agua original pasa en los dos modos: no se toca.
    expect(derivarAcento(ACENTO[700], "claro").acento).toBe(ACENTO[700]);
    expect(derivarAcento(ACENTO[600], "oscuro").acento).toBe(ACENTO[600]);
    expect(derivarAcento("#1e3a8a", "claro").acento).toBe("#1e3a8a");
    expect(derivarAcento("#fde047", "oscuro").acento).toBe("#fde047");
  });

  it("si no se lee, cambia la luminosidad y no el tono", () => {
    // Un amarillo clarito en modo claro y un azul marino en oscuro.
    for (const [color, modo] of [
      ["#fde047", "claro"],
      ["#1e3a8a", "oscuro"],
      ["#00ff00", "claro"],
    ] as const) {
      const { acento } = derivarAcento(color, modo);
      expect(acento).not.toBe(color);
      // Los tonos de HSL se comparan con un margen: al oscurecer o aclarar, el redondeo a
      // #rrggbb mueve el tono unos pocos grados.
      const diferencia = Math.abs(tonoDelFondo(acento, "claro") - tonoDelFondo(color, "claro"));
      expect(Math.min(diferencia, 360 - diferencia), color).toBeLessThan(6);
    }
  });

  it("en modo claro oscurece lo que no se lee con texto blanco, y en oscuro aclara", () => {
    const luz = (hex: string) => contraste(hex, "#000000");
    expect(luz(derivarAcento("#fde047", "claro").acento)).toBeLessThan(luz("#fde047"));
    expect(luz(derivarAcento("#1e3a8a", "oscuro").acento)).toBeGreaterThan(luz("#1e3a8a"));
    // El negro en modo oscuro arranca en el extremo y tiene que poder aclararse.
    expect(derivarAcento("#000000", "oscuro").acento).not.toBe("#000000");
  });

  it("usa el mismo texto sobre el acento que el tema original", () => {
    expect(derivarAcento("#7c3aed", "claro").acentoTexto).toBe(TEMA_CLARO.acentoTexto);
    expect(derivarAcento("#7c3aed", "oscuro").acentoTexto).toBe(TEMA_OSCURO.acentoTexto);
  });

  it("apoya el acento sobre las mismas superficies que el tema", () => {
    expect(SUPERFICIE_DEL_ACENTO.claro).toBe(TEMA_CLARO.superficie);
    expect(SUPERFICIE_DEL_ACENTO.oscuro).toBe(TEMA_OSCURO.superficie);
    expect(TEXTO_SOBRE_ACENTO.claro).toBe(TEMA_CLARO.acentoTexto);
    expect(TEXTO_SOBRE_ACENTO.oscuro).toBe(TEMA_OSCURO.acentoTexto);
  });
});

describe("tonoDelFondo", () => {
  it("con el verde agua original da los tonos del fondo original", () => {
    expect(Math.round(tonoDelFondo(ACENTO[700], "claro"))).toBe(175);
    expect(Math.round(tonoDelFondo(ACENTO[700], "oscuro"))).toBe(200);
  });

  it("queda siempre entre 0 y 360", () => {
    for (const color of [...BORDES, "#ff0080" as ColorHex, "#ff00f0" as ColorHex]) {
      for (const modo of MODOS) {
        const tono = tonoDelFondo(color, modo);
        expect(tono).toBeGreaterThanOrEqual(0);
        expect(tono).toBeLessThan(360);
      }
    }
  });
});

describe("esColorHex", () => {
  it("acepta #rrggbb en mayúsculas o minúsculas y nada más", () => {
    expect(esColorHex("#0f766e")).toBe(true);
    expect(esColorHex("#0F766E")).toBe(true);
    for (const valor of ["0f766e", "#fff", "#0f766e00", "#ggg000", "", null, 123, "teal"]) {
      expect(esColorHex(valor)).toBe(false);
    }
  });
});

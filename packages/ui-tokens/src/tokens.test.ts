// Verifica que los tokens en TypeScript y los de tokens.css no se desincronicen.
//
// Existen en dos formatos porque los consumen dos mundos distintos (la web usa
// variables CSS, el móvil va a usar los objetos). Este test es lo que garantiza
// que cambiar uno y olvidarse del otro no pase desapercibido.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANIMACION,
  BRILLO_DE_BORDE,
  DESPLAZAMIENTO_DE_LUZ,
  FONDO_ANIMADO,
  MICROINTERACCION,
  type PaletaDeFondo,
  RADIO,
  RESORTE,
  SOMBRA,
  TEMA_CLARO,
  TEMA_OSCURO,
  type TokensDeTema,
} from "./index.ts";

const css = readFileSync(path.join(import.meta.dirname, "tokens.css"), "utf8");

/** Nombre del token en TypeScript → nombre de la variable CSS. */
function aVariableCss(nombre: string): string {
  return `--color-${nombre.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`)}`;
}

/** Lee el valor de una variable dentro de un bloque concreto del archivo. */
function valorEnBloque(selector: string, variable: string): string | null {
  const inicio = css.indexOf(selector);
  if (inicio === -1) return null;

  const abre = css.indexOf("{", inicio);
  const cierra = css.indexOf("}", abre);
  const bloque = css.slice(abre, cierra);

  const encontrado = new RegExp(`${variable}\\s*:\\s*([^;]+);`).exec(bloque);
  return encontrado?.[1]?.trim() ?? null;
}

describe("tokens del tema claro", () => {
  for (const nombre of Object.keys(TEMA_CLARO) as (keyof TokensDeTema)[]) {
    it(`${nombre} coincide entre TypeScript y CSS`, () => {
      const enCss = valorEnBloque(":root {", aVariableCss(nombre));

      expect(enCss, `falta ${aVariableCss(nombre)} en :root de tokens.css`).not.toBeNull();
      expect(enCss?.toLowerCase()).toBe(TEMA_CLARO[nombre].toLowerCase());
    });
  }
});

describe("tokens del tema oscuro", () => {
  for (const nombre of Object.keys(TEMA_OSCURO) as (keyof TokensDeTema)[]) {
    it(`${nombre} coincide entre TypeScript y CSS`, () => {
      const enCss = valorEnBloque(':root[data-theme="dark"]', aVariableCss(nombre));

      expect(enCss, `falta ${aVariableCss(nombre)} en el bloque oscuro`).not.toBeNull();
      expect(enCss?.toLowerCase()).toBe(TEMA_OSCURO[nombre].toLowerCase());
    });
  }
});

describe("coherencia del sistema visual", () => {
  it("los dos temas definen exactamente los mismos tokens", () => {
    expect(Object.keys(TEMA_OSCURO).sort()).toEqual(Object.keys(TEMA_CLARO).sort());
  });

  it("el bloque de preferencia del sistema repite todos los tokens oscuros", () => {
    // Si faltara uno, quien tiene el sistema en oscuro y no eligió tema vería una
    // mezcla de colores claros y oscuros.
    const inicio = css.indexOf("@media (prefers-color-scheme: dark)");
    const bloque = css.slice(inicio, css.indexOf("@media (prefers-reduced-motion"));

    for (const nombre of Object.keys(TEMA_OSCURO)) {
      expect(bloque, `falta ${aVariableCss(nombre)}`).toContain(aVariableCss(nombre));
    }
  });

  it("respeta la preferencia de reducir movimiento", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("las duraciones suben de rápida a lenta y quedan en el rango de la guía", () => {
    const { rapida, normal, lenta } = ANIMACION.duracion;
    const ms = (valor: string) => Number.parseInt(valor, 10);

    expect(ms(rapida)).toBeLessThan(ms(normal));
    expect(ms(normal)).toBeLessThan(ms(lenta));
    // Nada instantáneo ni tan largo que se sienta lento.
    expect(ms(rapida)).toBeGreaterThanOrEqual(120);
    expect(ms(lenta)).toBeLessThanOrEqual(400);
  });

  it("usa la curva de desaceleración sin rebotes", () => {
    expect(ANIMACION.curva.salida).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(valorEnBloque(":root {", "--curva-salida")).toBe(ANIMACION.curva.salida);
  });

  it("mantiene los radios de la guía: 8 px en controles y 12 px en tarjetas", () => {
    expect(RADIO.control).toBe("0.5rem");
    expect(RADIO.tarjeta).toBe("0.75rem");
    expect(valorEnBloque(":root {", "--radio-control")).toBe(RADIO.control);
    expect(valorEnBloque(":root {", "--radio-tarjeta")).toBe(RADIO.tarjeta);
  });
});

describe("elevación", () => {
  const NIVELES = ["sutil", "elevada", "flotante"] as const;

  for (const nivel of NIVELES) {
    it(`${nivel} coincide entre TypeScript y CSS en el tema claro`, () => {
      expect(valorEnBloque(":root {", `--sombra-${nivel}`)).toBe(SOMBRA.claro[nivel]);
    });

    it(`${nivel} coincide entre TypeScript y CSS en el tema oscuro`, () => {
      expect(valorEnBloque(':root[data-theme="dark"]', `--sombra-${nivel}`)).toBe(
        SOMBRA.oscuro[nivel],
      );
    });
  }

  it("las sombras del modo oscuro son más marcadas que las del claro", () => {
    // Sobre fondo oscuro una sombra suave no se ve. Se compara la opacidad más
    // alta de cada una, que es lo que gobierna cuánto se percibe.
    const opacidadMaxima = (sombra: string) =>
      Math.max(...[...sombra.matchAll(/\/\s*([\d.]+)\)/g)].map((m) => Number(m[1])));

    for (const nivel of NIVELES) {
      expect(opacidadMaxima(SOMBRA.oscuro[nivel])).toBeGreaterThan(
        opacidadMaxima(SOMBRA.claro[nivel]),
      );
    }
  });

  it("cada nivel es más marcado que el anterior", () => {
    for (const tema of ["claro", "oscuro"] as const) {
      const tamano = (sombra: string) =>
        Math.max(...[...sombra.matchAll(/(\d+)px/g)].map((m) => Number(m[1])));
      expect(tamano(SOMBRA[tema].elevada)).toBeGreaterThan(tamano(SOMBRA[tema].sutil));
      expect(tamano(SOMBRA[tema].flotante)).toBeGreaterThan(tamano(SOMBRA[tema].elevada));
    }
  });

  it("el bloque de preferencia del sistema también trae las sombras oscuras", () => {
    const inicio = css.indexOf("@media (prefers-color-scheme: dark)");
    const bloque = css.slice(inicio, css.indexOf("@media (prefers-reduced-motion"));

    for (const nivel of NIVELES) {
      expect(bloque).toContain(`--sombra-${nivel}`);
    }
  });
});

describe("resortes", () => {
  it("tienen poco rebote: nada elástico", () => {
    // Un amortiguamiento bajo respecto de la rigidez da rebote. Con estos
    // valores el resorte se asienta casi sin oscilar (docs/guias/estetica.md).
    for (const resorte of Object.values(RESORTE)) {
      const critico = 2 * Math.sqrt(resorte.stiffness * resorte.mass);
      expect(resorte.damping / critico).toBeGreaterThan(0.6);
    }
  });
});

describe("microinteracciones y brillo de borde", () => {
  it("los valores coinciden entre TypeScript y CSS", () => {
    const pares: [string, string][] = [
      ["--anim-duracion", MICROINTERACCION.duracion],
      ["--anim-curva", MICROINTERACCION.curva],
      ["--anim-escala-presion", MICROINTERACCION.escalaPresion],
      ["--anim-elevacion-hover", MICROINTERACCION.elevacionHover],
      ["--borde-brillo-alcance", BRILLO_DE_BORDE.alcance],
      ["--borde-brillo-intensidad", BRILLO_DE_BORDE.intensidad],
      ["--borde-brillo-grosor", BRILLO_DE_BORDE.grosor],
    ];

    for (const [variable, esperado] of pares) {
      expect(valorEnBloque(":root {", variable), `falta ${variable}`).toBe(esperado);
    }
  });

  it("con reducir movimiento no queda ni levantado ni hundido", () => {
    // Que el botón siga respondiendo es obligatorio; que lo haga moviéndose, no.
    // Sin esto, la preferencia del sistema quedaría a medias.
    const bloque = "@media (prefers-reduced-motion: reduce)";
    expect(valorEnBloque(bloque, "--anim-duracion")).toBe("1ms");
    expect(valorEnBloque(bloque, "--anim-escala-presion")).toBe("1");
    expect(valorEnBloque(bloque, "--anim-elevacion-hover")).toBe("0px");
  });
});

describe("fondo animado", () => {
  it("la intensidad de cada tema coincide entre TypeScript y CSS", () => {
    expect(valorEnBloque(":root {", "--fondo-intensidad")).toBe(
      String(FONDO_ANIMADO.claro.intensidad),
    );
    expect(valorEnBloque(':root[data-theme="dark"]', "--fondo-intensidad")).toBe(
      String(FONDO_ANIMADO.oscuro.intensidad),
    );
  });

  it("el bloque de preferencia del sistema también trae la intensidad oscura", () => {
    const bloque = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    expect(bloque).toContain(`--fondo-intensidad: ${FONDO_ANIMADO.oscuro.intensidad};`);
  });

  it("el modo oscuro es más intenso que el claro", () => {
    // Sobre un fondo casi negro un lavado del 10% no se percibe; sobre uno casi
    // blanco, el mismo 10% ya se ve. Si algún día se igualan, es un error.
    expect(FONDO_ANIMADO.oscuro.intensidad).toBeGreaterThan(FONDO_ANIMADO.claro.intensidad);
  });

  it("dibuja bastante más chico de lo que muestra", () => {
    // De acá sale el difuminado: si el factor baja de ~8 se empiezan a ver los
    // bordes de las formas y el efecto deja de funcionar.
    expect(FONDO_ANIMADO.difuminado).toBeGreaterThanOrEqual(8);
  });

  it("no pasa de 30 cuadros por segundo", () => {
    // Es un fondo que tarda decenas de segundos en dar una vuelta: pintarlo a
    // 60 fps sería gastar batería en algo que nadie puede distinguir.
    expect(FONDO_ANIMADO.cuadrosPorSegundo).toBeLessThanOrEqual(30);
  });
});

describe("contraste sobre el fondo animado", () => {
  /**
   * Este test existe porque las herramientas automáticas de accesibilidad NO
   * detectan este caso: calculan el contraste mirando el fondo de los elementos
   * ancestros, y el fondo animado es un canvas hermano, fijo y por detrás. Para
   * axe el texto está sobre `fondo` a secas, así que una intensidad de más
   * pasaría todos los tests y aun así dejaría texto ilegible.
   *
   * El peor caso NO es una forma sola con su alfa: las formas se apilan, y
   * varios gradientes encima del mismo punto convergen al color pleno. Así que
   * el alfa efectivo que llega a la pantalla es la **intensidad del canvas**, y
   * el color es el de la forma más desfavorable de toda la paleta. Se recorren
   * los 360 grados de tono posibles y los dos extremos del desplazamiento de
   * luminosidad.
   */

  type Rgb = { r: number; g: number; b: number };

  function desdeHex(hex: string): Rgb {
    const limpio = hex.replace("#", "");
    return {
      r: Number.parseInt(limpio.slice(0, 2), 16),
      g: Number.parseInt(limpio.slice(2, 4), 16),
      b: Number.parseInt(limpio.slice(4, 6), 16),
    };
  }

  /** hsl con saturación y luminosidad en porcentaje, a rgb 0-255. */
  function desdeHsl(tono: number, saturacion: number, luminosidad: number): Rgb {
    const s = saturacion / 100;
    const l = Math.min(100, Math.max(0, luminosidad)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const h = (((tono % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = l - c / 2;

    const tramos: [number, number, number][] = [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ];
    const tramo = tramos[Math.floor(h)] ?? tramos[0];
    if (!tramo) throw new Error("tono fuera de rango");

    return {
      r: Math.round((tramo[0] + m) * 255),
      g: Math.round((tramo[1] + m) * 255),
      b: Math.round((tramo[2] + m) * 255),
    };
  }

  /** Pinta una capa translúcida encima de otra opaca. */
  function componer(debajo: Rgb, encima: Rgb, alfa: number): Rgb {
    return {
      r: (1 - alfa) * debajo.r + alfa * encima.r,
      g: (1 - alfa) * debajo.g + alfa * encima.g,
      b: (1 - alfa) * debajo.b + alfa * encima.b,
    };
  }

  function luminancia({ r, g, b }: Rgb): number {
    const canal = (valor: number) => {
      const normalizado = valor / 255;
      return normalizado <= 0.03928 ? normalizado / 12.92 : ((normalizado + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  }

  function contraste(uno: Rgb, otro: Rgb): number {
    const [claro, oscuro] = [luminancia(uno), luminancia(otro)].sort((a, b) => b - a);
    return ((claro as number) + 0.05) / ((oscuro as number) + 0.05);
  }

  /** El contraste más bajo que puede dar el fondo contra un color de texto. */
  function peorContraste(texto: Rgb, fondo: Rgb, paleta: PaletaDeFondo): number {
    let peor = Number.POSITIVE_INFINITY;
    const mitad = DESPLAZAMIENTO_DE_LUZ / 2;

    for (let tono = paleta.tono - paleta.rango; tono <= paleta.tono + paleta.rango; tono += 1) {
      for (const desvio of [-mitad, 0, mitad]) {
        const encima = desdeHsl(tono, paleta.sat, paleta.luz + desvio);
        peor = Math.min(peor, contraste(texto, componer(fondo, encima, paleta.intensidad)));
      }
    }

    return peor;
  }

  for (const [nombreTema, tema, paleta] of [
    ["claro", TEMA_CLARO, FONDO_ANIMADO.claro],
    ["oscuro", TEMA_OSCURO, FONDO_ANIMADO.oscuro],
  ] as const) {
    it(`el texto sigue legible en el tema ${nombreTema} con el fondo en su punto más intenso`, () => {
      const fondo = desdeHex(tema.fondo);

      // 4,5:1 es el mínimo de WCAG AA para texto normal.
      expect(peorContraste(desdeHex(tema.texto), fondo, paleta)).toBeGreaterThanOrEqual(4.5);
      expect(peorContraste(desdeHex(tema.textoSecundario), fondo, paleta)).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  }
});

describe("colores de origen", () => {
  type Rgb = [number, number, number];

  function desdeHex(hex: string): Rgb {
    const limpio = hex.replace("#", "");
    return [0, 2, 4].map((desde) => Number.parseInt(limpio.slice(desde, desde + 2), 16)) as Rgb;
  }

  function luminancia([r, g, b]: Rgb): number {
    const canal = (valor: number) => {
      const normalizado = valor / 255;
      return normalizado <= 0.03928 ? normalizado / 12.92 : ((normalizado + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  }

  function contraste(uno: string, otro: string): number {
    const [claro, oscuro] = [luminancia(desdeHex(uno)), luminancia(desdeHex(otro))].sort(
      (a, b) => b - a,
    );
    return ((claro as number) + 0.05) / ((oscuro as number) + 0.05);
  }

  const ORIGENES = ["Manual", "Finanzas", "Contactos", "Tareas"] as const;

  for (const [nombreTema, tema] of [
    ["claro", TEMA_CLARO],
    ["oscuro", TEMA_OSCURO],
  ] as const) {
    for (const origen of ORIGENES) {
      it(`${origen}: el texto se lee sobre su fondo suave en el tema ${nombreTema} (4,5:1)`, () => {
        expect(
          contraste(tema[`origen${origen}Texto`], tema[`origen${origen}Fondo`]),
        ).toBeGreaterThanOrEqual(4.5);
      });

      it(`${origen}: el color pleno se distingue de la superficie en el tema ${nombreTema} (3:1)`, () => {
        // 3:1 es el mínimo de WCAG para elementos gráficos (los puntos y bordes).
        expect(contraste(tema[`origen${origen}`], tema.superficie)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("los cuatro colores plenos son distintos entre sí y de los estados y el acento", () => {
    const plenos = ORIGENES.map((origen) => TEMA_CLARO[`origen${origen}`]);
    const reservados = [
      TEMA_CLARO.acento,
      TEMA_CLARO.exito,
      TEMA_CLARO.advertencia,
      TEMA_CLARO.peligro,
    ];
    expect(new Set(plenos).size).toBe(4);
    for (const pleno of plenos) expect(reservados).not.toContain(pleno);
  });
});

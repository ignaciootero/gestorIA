// Colores de categorías: elegir uno "lo más distinto posible" de los que ya hay.
//
// La distancia entre dos colores se mide en el espacio CIE L*a*b* (ΔE de 1976:
// distancia euclídea), que es bastante más parecido a cómo los ve una persona
// que comparar valores RGB. Es una aproximación simple y alcanza para este uso;
// no hace falta el ΔE2000 completo.
//
// `colorMasDistinto` recorre un conjunto fijo de candidatos (parejas de matiz,
// saturación y luminosidad repartidas parejo, más un par de grises) y se queda
// con el que más se aleja de su vecino más cercano entre los colores en uso
// ("farthest point"). Es determinista: los mismos colores en uso dan siempre el
// mismo resultado, que es lo que permite probarlo.

type Rgb = readonly [number, number, number];
type Lab = readonly [number, number, number];

function rgbDesdeHex(hex: string): Rgb {
  const limpio = hex.replace("#", "");
  return [
    Number.parseInt(limpio.slice(0, 2), 16),
    Number.parseInt(limpio.slice(2, 4), 16),
    Number.parseInt(limpio.slice(4, 6), 16),
  ];
}

function linealizar(canal: number): number {
  const c = canal / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function labDesdeRgb([r, g, b]: Rgb): Lab {
  const [rl, gl, bl] = [linealizar(r), linealizar(g), linealizar(b)] as const;
  // sRGB lineal → XYZ (D65), normalizado al blanco de referencia.
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883;

  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)] as const;
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Qué tan distintos se ven dos colores "#rrggbb": 0 es idéntico; arriba de ~20 se distinguen sin esfuerzo. */
export function distanciaDeColor(a: string, b: string): number {
  const [l1, a1, b1] = labDesdeRgb(rgbDesdeHex(a));
  const [l2, a2, b2] = labDesdeRgb(rgbDesdeHex(b));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

function hexDesdeHsl(matiz: number, saturacion: number, luminosidad: number): string {
  const k = (n: number) => (n + matiz / 30) % 12;
  const a = saturacion * Math.min(luminosidad, 1 - luminosidad);
  const canal = (n: number) =>
    luminosidad - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const aHex = (valor: number) =>
    Math.round(valor * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${aHex(canal(0))}${aHex(canal(8))}${aHex(canal(4))}`;
}

/**
 * Candidatos: matices cada 10°, en cuatro combinaciones de saturación y
 * luminosidad (vivos y apagados, claros y oscuros), más dos grises. Ni tan claros
 * que se pierdan sobre fondo blanco ni tan oscuros que se pierdan en modo oscuro.
 */
const CANDIDATOS: readonly string[] = (() => {
  const colores: string[] = [];
  for (let matiz = 0; matiz < 360; matiz += 10) {
    for (const [s, l] of [
      [0.8, 0.45],
      [0.8, 0.62],
      [0.5, 0.4],
      [0.5, 0.68],
    ] as const) {
      colores.push(hexDesdeHsl(matiz, s, l));
    }
  }
  colores.push("#6b7280", "#9ca3af");
  return colores;
})();

/**
 * El color, entre los candidatos, que más se aleja de todos los `usados`
 * (maximiza la distancia al más cercano). Sin colores en uso devuelve el
 * primero. Un color con formato inválido en `usados` se ignora.
 */
export function colorMasDistinto(usados: readonly string[]): string {
  const labsUsados = usados
    .filter((color) => /^#[0-9a-fA-F]{6}$/.test(color))
    .map((color) => labDesdeRgb(rgbDesdeHex(color)));

  let mejor = CANDIDATOS[0] ?? "#64748b";
  let mejorDistancia = -1;

  for (const candidato of CANDIDATOS) {
    const lab = labDesdeRgb(rgbDesdeHex(candidato));
    const masCercano = labsUsados.reduce(
      (minimo, otro) =>
        Math.min(minimo, Math.hypot(lab[0] - otro[0], lab[1] - otro[1], lab[2] - otro[2])),
      Number.POSITIVE_INFINITY,
    );
    if (masCercano > mejorDistancia) {
      mejorDistancia = masCercano;
      mejor = candidato;
    }
  }
  return mejor;
}

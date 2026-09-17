// Fondo animado de la aplicación.
//
// Formas de color difuminadas que se mueven, giran, cambian de tamaño y de
// color muy despacio, detrás de todo el contenido (docs/guias/estetica.md).
//
// El algoritmo con todas sus constantes está copiado en
// docs/referencias/fondo-animado.md, para no depender de este archivo si algún
// día hay que rehacerlo.
//
// Las decisiones que importan:
//
// - **El difuminado no sale de `filter: blur()`.** El canvas se pinta a 1/24 del
//   tamaño de la ventana (unos 53×33 píxeles) y CSS lo estira a pantalla
//   completa; esa interpolación es la que suaviza los bordes. Pintar quince
//   gradientes radiales sobre un lienzo de ese tamaño no se mide, mientras que
//   un blur de radio grande sobre la ventana entera es de lo más caro que puede
//   hacer el navegador y se paga en cada cuadro (docs/guias/rendimiento.md).
// - **Es `fixed`,** así que cubre la ventana también al hacer scroll y no hay
//   que preocuparse por el alto del documento.
// - **Es decorativo:** `aria-hidden` y sin eventos de puntero, para que no
//   aparezca en un lector de pantalla ni se coma un clic.
// - **Tope de 30 cuadros por segundo,** en pausa con la pestaña oculta y un solo
//   cuadro fijo con la preferencia de reducir movimiento. Nada de esto es
//   opcional: son las dos cosas que la guía de estética no negocia.

"use client";

import { DESPLAZAMIENTO_DE_LUZ, FONDO_ANIMADO, type PaletaDeFondo } from "@gestoria/ui-tokens";
import { useEffect, useRef } from "react";
import { useTema } from "@/componentes/tema";

/**
 * Una forma del fondo.
 *
 * `x` e `y` van normalizados (0 a 1) y se multiplican por el tamaño del lienzo
 * al dibujar: así la misma forma sirve para cualquier ventana.
 */
type Forma = {
  x: number;
  y: number;
  escala: number;
  alargamiento: number;
  giro: number;
  velGiro: number;
  /** Frecuencias del vaivén en cada eje. */
  fx: number;
  fy: number;
  fase: number;
  amplitud: number;
  /** Cuánto crece y se achica al respirar. */
  respiracion: number;
  /** Desfases del ciclo de color, para que no cambien todas juntas. */
  tonoOffset: number;
  faseTono: number;
  velTono: number;
  /** Cuánto se aparta su luminosidad de la del tema. */
  luzOffset: number;
};

/** Los valores del fondo que no dependen del tema, más el color que sí. */
type Config = {
  velocidad: number;
  tamano: number;
  variedadFormas: number;
  cicloColor: number;
  tono: number;
  rango: number;
};

/**
 * Genera las formas repartidas en una cuadrícula con desplazamiento aleatorio.
 *
 * La cuadrícula es lo que garantiza que no queden huecos: con posiciones del
 * todo al azar siempre aparece una zona vacía y otra amontonada. El corrimiento
 * dentro de cada celda es lo que hace que no se note la grilla.
 *
 * El pseudoaleatorio tiene semilla fija a propósito: la misma ventana da siempre
 * la misma distribución, así que el fondo no cambia de forma entre recargas ni
 * entre la pantalla de una persona y la de otra del mismo tamaño. Por eso
 * también importa el **orden** de las llamadas a `aleatorio()`: cambiarlo
 * cambia el fondo entero.
 */
function generar(cantidad: number, anchoVentana: number, altoVentana: number): Forma[] {
  let semilla = 7;
  const aleatorio = (): number => {
    semilla = (semilla * 16807) % 2147483647;
    return (semilla - 1) / 2147483646;
  };

  const columnas = Math.max(
    1,
    Math.ceil(Math.sqrt(cantidad * (anchoVentana / Math.max(altoVentana, 1)))),
  );
  const filas = Math.ceil(cantidad / columnas);

  return Array.from({ length: cantidad }, (_, indice) => {
    const columna = indice % columnas;
    const fila = Math.floor(indice / columnas);

    return {
      x: (columna + 0.5 + (aleatorio() - 0.5) * 0.9) / columnas,
      y: (fila + 0.5 + (aleatorio() - 0.5) * 0.9) / filas,
      escala: 0.6 + aleatorio() * 0.9,
      alargamiento: aleatorio(),
      giro: aleatorio() * Math.PI,
      velGiro: (aleatorio() - 0.5) * 0.25,
      fx: 0.3 + aleatorio() * 0.7,
      fy: 0.3 + aleatorio() * 0.7,
      fase: aleatorio() * Math.PI * 2,
      amplitud: 0.04 + aleatorio() * 0.08,
      respiracion: 0.1 + aleatorio() * 0.2,
      tonoOffset: aleatorio() * 2 - 1,
      faseTono: aleatorio() * Math.PI * 2,
      velTono: 0.6 + aleatorio() * 0.8,
      luzOffset: (aleatorio() - 0.5) * DESPLAZAMIENTO_DE_LUZ,
    };
  });
}

/**
 * Pinta un cuadro completo. `t` son los segundos acumulados de animación.
 *
 * Cada forma es un gradiente radial de tres paradas que se desvanece hasta
 * transparente. El degradado es lo que hace que el conjunto se lea como una
 * sola mancha continua en vez de quince círculos apilados.
 */
function dibujar(
  ctx: CanvasRenderingContext2D,
  ancho: number,
  alto: number,
  formas: readonly Forma[],
  t: number,
  cfg: Config,
  tema: PaletaDeFondo,
): void {
  const lado = Math.max(ancho, alto);
  ctx.clearRect(0, 0, ancho, alto);

  for (const forma of formas) {
    const tm = t * cfg.velocidad * 0.35;
    const x = (forma.x + Math.sin(tm * forma.fx + forma.fase) * forma.amplitud * 1.6) * ancho;
    const y = (forma.y + Math.cos(tm * forma.fy + forma.fase * 1.3) * forma.amplitud * 1.6) * alto;
    const radio =
      lado * cfg.tamano * forma.escala * (1 + Math.sin(tm * 0.8 + forma.fase) * forma.respiracion);
    const estirado = 1 + forma.alargamiento * cfg.variedadFormas * 1.8;
    const tono =
      cfg.tono +
      forma.tonoOffset *
        cfg.rango *
        Math.cos(t * cfg.cicloColor * 0.12 * forma.velTono + forma.faseTono) +
      Math.sin(t * cfg.cicloColor * 0.07 + forma.fase) * cfg.rango * 0.35;
    const color = `hsla(${tono.toFixed(1)},${tema.sat}%,${(tema.luz + forma.luzOffset).toFixed(1)}%,`;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(forma.giro + tm * forma.velGiro);
    // El estirado alarga un eje y achica el otro, así el área no cambia.
    ctx.scale(estirado, 1 / Math.sqrt(estirado));

    const degradado = ctx.createRadialGradient(0, 0, 0, 0, 0, radio);
    degradado.addColorStop(0, `${color}${tema.alfa})`);
    degradado.addColorStop(0.55, `${color}${(tema.alfa * 0.45).toFixed(2)})`);
    degradado.addColorStop(1, `${color}0)`);

    ctx.fillStyle = degradado;
    ctx.fillRect(-radio, -radio, radio * 2, radio * 2);
    ctx.restore();
  }
}

export function FondoAnimado() {
  const referencia = useRef<HTMLCanvasElement>(null);
  const { tema } = useTema();

  useEffect(() => {
    const elemento = referencia.current;
    const contexto2d = elemento?.getContext("2d");
    if (!elemento || !contexto2d) return;

    // Copias ya comprobadas: TypeScript pierde el estrechamiento dentro de las
    // funciones declaradas más abajo, porque se izan y podrían llamarse antes.
    const lienzo = elemento;
    const ctx = contexto2d;

    const paleta: PaletaDeFondo = tema === "oscuro" ? FONDO_ANIMADO.oscuro : FONDO_ANIMADO.claro;
    const cfg: Config = {
      velocidad: FONDO_ANIMADO.velocidad,
      tamano: FONDO_ANIMADO.tamano,
      variedadFormas: FONDO_ANIMADO.variedadFormas,
      cicloColor: FONDO_ANIMADO.cicloColor,
      tono: paleta.tono,
      rango: paleta.rango,
    };

    const intervalo = 1000 / FONDO_ANIMADO.cuadrosPorSegundo;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)");

    let formas: readonly Forma[] = [];
    let tiempo = 0;
    let ultimoCuadro = 0;
    let pedido = 0;
    let esperaDeMedida = 0;

    /** Ajusta el lienzo a la ventana y regenera las formas. */
    function medir(): void {
      const ancho = Math.max(8, Math.round(window.innerWidth / FONDO_ANIMADO.difuminado));
      const alto = Math.max(8, Math.round(window.innerHeight / FONDO_ANIMADO.difuminado));

      lienzo.width = ancho;
      lienzo.height = alto;
      formas = generar(FONDO_ANIMADO.formas, window.innerWidth, window.innerHeight);
      dibujar(ctx, ancho, alto, formas, tiempo, cfg, paleta);
    }

    function cuadro(ahora: number): void {
      pedido = window.requestAnimationFrame(cuadro);

      const transcurrido = ahora - ultimoCuadro;
      // Tope de cuadros por segundo: de un fondo tan lento nadie nota más, y
      // cada cuadro que no se pinta es batería que no se gasta.
      if (transcurrido < intervalo) return;
      ultimoCuadro = ahora;

      // Con tope al salto: si la pestaña estuvo oculta o el equipo se durmió, el
      // fondo sigue desde donde estaba en vez de saltar a otra parte.
      tiempo +=
        (Math.min(transcurrido, FONDO_ANIMADO.saltoMaximoMs) / 1000) * FONDO_ANIMADO.velocidad;
      dibujar(ctx, lienzo.width, lienzo.height, formas, tiempo, cfg, paleta);
    }

    function arrancar(): void {
      if (pedido !== 0 || sinMovimiento.matches || document.hidden) return;
      ultimoCuadro = performance.now();
      pedido = window.requestAnimationFrame(cuadro);
    }

    function frenar(): void {
      if (pedido === 0) return;
      window.cancelAnimationFrame(pedido);
      pedido = 0;
    }

    function alCambiarVisibilidad(): void {
      if (document.hidden) frenar();
      else arrancar();
    }

    function alRedimensionar(): void {
      // Al arrastrar el borde de la ventana esto se dispara decenas de veces;
      // regenerar las formas en cada una no tiene sentido.
      window.clearTimeout(esperaDeMedida);
      esperaDeMedida = window.setTimeout(medir, 150);
    }

    function alCambiarLaPreferencia(): void {
      if (sinMovimiento.matches) frenar();
      else arrancar();
    }

    medir();
    arrancar();

    window.addEventListener("resize", alRedimensionar);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    sinMovimiento.addEventListener("change", alCambiarLaPreferencia);

    return () => {
      frenar();
      window.clearTimeout(esperaDeMedida);
      window.removeEventListener("resize", alRedimensionar);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      sinMovimiento.removeEventListener("change", alCambiarLaPreferencia);
    };
  }, [tema]);

  // `tabIndex={-1}` además de `aria-hidden`: el navegador considera enfocable a
  // un <canvas> (puede llevar contenido alternativo adentro), y un elemento
  // enfocable pero invisible para un lector de pantalla es una trampa.
  return <canvas ref={referencia} aria-hidden="true" tabIndex={-1} className="fondo-animado" />;
}

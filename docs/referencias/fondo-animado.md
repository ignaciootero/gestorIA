# Referencia: fondo animado y brillo de bordes

Los algoritmos completos, con sus constantes, tal como se implementaron. Esto no es una guía: es la copia de referencia, para poder rehacer el efecto sin depender del código ni de la conversación que lo originó.

La implementación vive en:

- `packages/ui-tokens/src/index.ts` — todas las constantes, como tokens.
- `apps/web/src/componentes/layout/fondo-animado.tsx` — el fondo.
- `apps/web/src/componentes/ui/brillo/` — el brillo de bordes.

En móvil **no está implementado** ninguno de los dos.

---

## Fondo animado

Formas de color difuminadas que se mueven, giran, cambian de tamaño y de color lentamente, detrás de todo el contenido, cubriendo siempre la ventana completa (también al hacer scroll).

### Técnica

- Un `<canvas>` fijo: `position: fixed`, `inset: 0`, `width: 100vw`, `height: 100dvh`, z-index por debajo del contenido, `pointer-events: none`, `aria-hidden`.
- Se dibuja a baja resolución (la ventana dividida por el factor de difuminado) y el navegador lo escala a pantalla completa: **ese escalado produce el difuminado**. No se usa `filter: blur()`.
- Tamaño del lienzo: `max(8, round(ventana / factorDifuminado))` en cada eje.
- La intensidad es la opacidad CSS del canvas y depende del tema.
- Máximo 30 fps. En pausa cuando la pestaña no está visible. Con `prefers-reduced-motion`, un único cuadro estático.
- Se redibuja al cambiar de tema y se regeneran las formas al redimensionar.
- Componente cliente único en el layout raíz, con limpieza de escuchas y de `requestAnimationFrame` al desmontar.

### Configuración

Común a ambos modos:

| Parámetro | Valor |
|---|---|
| formas | 15 |
| variedad de formas | 0 (círculos, sin alargamiento) |
| tamaño | 0.40 (fracción del lado mayor del canvas) |
| velocidad de movimiento | 1.0 |
| velocidad del ciclo de color | 1.0 |
| factor de difuminado | 24 |

Por tema:

| | intensidad | tono central | variedad de color | saturación | luminosidad | alfa |
|---|---|---|---|---|---|---|
| Claro | 0.18 | 175 | ±75 | 78 | 72 | 0.85 |
| Oscuro | 0.25 | 200 | ±55 | 62 | 30 | 0.90 |

La intensidad del modo claro arrancó en 0.10 y se subió a 0.18: sobre el fondo casi blanco, el lavado original apenas se percibía. El techo no es estético sino de contraste; a 0.30 el texto secundario cae a 4,97:1.

### Algoritmo

```js
// Pseudoaleatorio con semilla fija: siempre la misma distribución.
let semilla = 7;
const aleatorio = () => { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646; };

// Cuadrícula con desplazamiento aleatorio: cubre toda la pantalla sin huecos.
function generar(n, anchoVentana, altoVentana) {
  const columnas = Math.max(1, Math.ceil(Math.sqrt(n * (anchoVentana / Math.max(altoVentana, 1)))));
  const filas = Math.ceil(n / columnas);
  return Array.from({ length: n }, (_, i) => {
    const c = i % columnas, f = Math.floor(i / columnas);
    return {
      x: (c + 0.5 + (aleatorio() - 0.5) * 0.9) / columnas,
      y: (f + 0.5 + (aleatorio() - 0.5) * 0.9) / filas,
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
      luzOffset: (aleatorio() - 0.5) * 14,
    };
  });
}

// t = segundos acumulados de animación (sumando deltas de como máximo 100 ms).
// cfg trae los valores comunes; tema trae sat, luz y alfa del modo activo.
function dibujar(ctx, w, h, formas, t, cfg, tema) {
  const lado = Math.max(w, h);
  ctx.clearRect(0, 0, w, h);
  for (const s of formas) {
    const tm = t * cfg.velocidad * 0.35;
    const x = (s.x + Math.sin(tm * s.fx + s.fase) * s.amplitud * 1.6) * w;
    const y = (s.y + Math.cos(tm * s.fy + s.fase * 1.3) * s.amplitud * 1.6) * h;
    const radio = lado * cfg.tamano * s.escala * (1 + Math.sin(tm * 0.8 + s.fase) * s.respiracion);
    const estirado = 1 + s.alargamiento * cfg.variedadFormas * 1.8;
    const tono = cfg.tono
      + s.tonoOffset * cfg.rango * Math.cos(t * cfg.cicloColor * 0.12 * s.velTono + s.faseTono)
      + Math.sin(t * cfg.cicloColor * 0.07 + s.fase) * cfg.rango * 0.35;
    const color = `hsla(${tono.toFixed(1)},${tema.sat}%,${(tema.luz + s.luzOffset).toFixed(1)}%,`;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(s.giro + tm * s.velGiro);
    ctx.scale(estirado, 1 / Math.sqrt(estirado));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radio);
    g.addColorStop(0, color + tema.alfa + ')');
    g.addColorStop(0.55, color + (tema.alfa * 0.45).toFixed(2) + ')');
    g.addColorStop(1, color + '0)');
    ctx.fillStyle = g;
    ctx.fillRect(-radio, -radio, radio * 2, radio * 2);
    ctx.restore();
  }
}
```

**El orden de las llamadas a `aleatorio()` es parte del algoritmo.** Cambiarlo cambia la distribución entera, aunque los valores sigan en el mismo rango.

---

## Brillo de bordes

En las tarjetas y paneles que agrupan contenido, el borde se ilumina según la cercanía del mouse: el tramo más próximo brilla y el brillo se apaga a lo largo del contorno. Se activa también con el mouse cerca pero **fuera** del contenedor, y **solo con mouse** (nunca en pantallas táctiles).

### Parámetros

| Token | Valor | Qué es |
|---|---|---|
| `--borde-brillo-alcance` | 250px | Radio del halo alrededor del puntero |
| `--borde-brillo-intensidad` | 40% | Proporción del acento en el punto más brillante |
| `--borde-brillo-grosor` | 1px | Ancho de la línea encendida |

### Técnica

Con **SVG**, no con máscaras CSS ni `color-mix` (ver `docs/decisiones.md`). A cada contenedor se le superpone una capa SVG con dos rectángulos redondeados que siguen la línea del borde: uno fino y nítido, y otro más ancho y difuminado como halo. El trazo de ambos usa un gradiente radial centrado en la posición del mouse.

```css
.con-brillo { position: relative; }
.brillo-svg {
  position: absolute; left: -6px; top: -6px;
  width: calc(100% + 12px); height: calc(100% + 12px);
  overflow: visible; pointer-events: none; z-index: 2;
  opacity: 0; transition: opacity 300ms ease;
}
.brillo-svg.activo { opacity: 1; }
.brillo-svg rect { fill: none; }
.brillo-svg .halo { filter: blur(4px); opacity: .6; }
```

```js
// Estructura por contenedor (MARGEN = 6):
// <svg class="brillo-svg"><defs><radialGradient id=".." gradientUnits="userSpaceOnUse">
//   <stop offset="0"/><stop offset="0.3"/><stop offset="1"/>
// </radialGradient></defs><rect class="halo"/><rect class="linea"/></svg>
// Los stops usan stop-color = color de acento y stop-opacity =
// intensidad * factor, con factores 1, 1 y 0 respectivamente.

// Una vez por cuadro (requestAnimationFrame), para cada contenedor:
const r = el.getBoundingClientRect();
const cerca = mouse && mouse.x > r.left - alcance && mouse.x < r.right + alcance
                    && mouse.y > r.top - alcance && mouse.y < r.bottom + alcance;
svg.classList.toggle('activo', cerca);
if (cerca) {
  const radio = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  for (const rect of [linea, halo]) {
    rect.setAttribute('x', MARGEN + 0.5);
    rect.setAttribute('y', MARGEN + 0.5);
    rect.setAttribute('width', Math.max(0, r.width - 1));
    rect.setAttribute('height', Math.max(0, r.height - 1));
    rect.setAttribute('rx', Math.max(0, radio - 0.5));
  }
  linea.setAttribute('stroke-width', grosor);
  halo.setAttribute('stroke-width', grosor * 4);
  grad.setAttribute('cx', mouse.x - r.left + MARGEN);
  grad.setAttribute('cy', mouse.y - r.top + MARGEN);
  grad.setAttribute('r', alcance);
}
```

### Escuchas

- `mousemove` en `window` (passive), `scroll` con `capture`, y `resize`.
- Todo se apaga con `mouseleave` en `document`.
- Se recalcula al cambiar de tema, para tomar el nuevo color de acento: un gradiente SVG no hereda las variables CSS del documento.
- Un solo bucle para toda la página, no uno por contenedor: con una escucha por tarjeta, diez tarjetas serían diez `getBoundingClientRect` por movimiento del mouse.

### Desviación deliberada de esta referencia

El bucle **solo corre mientras hay una posición de mouse conocida**: arranca con el primer `mousemove` y se corta en el `mouseleave` de `document`, después de una última pasada que apaga todo. Girar un `requestAnimationFrame` para siempre sin nadie mirando gasta batería sin mostrar nada.

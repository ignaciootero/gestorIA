// Las piezas con las que se arma el resumen de cada módulo en la pantalla de inicio.
//
// Todos los resúmenes tienen la misma forma, para que pasar de uno a otro no obligue a volver a
// aprender dónde está cada cosa:
// - Arriba, el módulo (ícono y nombre en su color de origen) y un enlace para ir a él.
// - A la izquierda, **una cifra destacada** (lo más importante del módulo, en grande), a lo sumo
//   un aviso y una lista breve de lo que viene (solo en pantallas anchas).
// - A la derecha, **un solo gráfico** con sus etiquetas escritas, para leerlo de un vistazo.
//
// Pocos datos por resumen, a propósito: la pantalla de inicio es para orientarse; el detalle está
// en cada módulo. Los colores de origen (`ESTILOS_DE_ORIGEN`) identifican el módulo, nunca solos:
// siempre van con su ícono y su nombre (docs/guias/estetica.md, Colores).

"use client";

import { CURVA_SALIDA, DURACION_MS } from "@gestoria/ui-tokens";
import { Check, CircleAlert, Info, type LucideIcon, TriangleAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { type ReactNode, useId } from "react";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";

/** Lo que identifica a un módulo en su resumen. */
export type IdentidadDeModulo = {
  nombre: string;
  Icono: LucideIcon;
  href: string;
  /** Fondo suave y texto del color de origen, para el ícono del encabezado. */
  suave: string;
  /** El color pleno, para las barras del gráfico. */
  punto: string;
  /** El mismo color como valor CSS (`var(--color-origen-…)`), para lo que se pinta con `style`. */
  color: string;
};

/**
 * Lo que arma cada variante de un resumen: la columna de texto (cifra, aviso y lista) y el gráfico.
 * Una variante que no tiene qué mostrar devuelve null y el resumen usa la general.
 */
export type ResumenArmado = { texto: ReactNode; grafico: ReactNode | null };

/** El resumen entero: encabezado, la columna de texto y la del gráfico. */
export function Resumen({
  modulo,
  variante,
  texto,
  grafico,
}: {
  modulo: IdentidadDeModulo;
  /** Qué variante del resumen es (ver `armarResumen`): queda en `data-variante`, para las pruebas. */
  variante?: string;
  /** La cifra destacada, el aviso y la lista. */
  texto: ReactNode;
  /** El bloque del gráfico; sin datos para dibujar, se omite y el texto ocupa todo. */
  grafico: ReactNode | null;
}) {
  return (
    <div
      data-variante={variante}
      className="flex h-full min-h-0 flex-col gap-4 p-4 sm:gap-5 sm:p-6"
      // Un tinte muy suave del color del módulo desde la esquina de arriba: cada resumen tiene su
      // identidad y el cambio de uno a otro se nota, sin restarle contraste al texto.
      style={{
        backgroundImage: `radial-gradient(ellipse at top right, color-mix(in oklab, ${modulo.color} 14%, transparent), transparent 65%)`,
      }}
    >
      <EncabezadoDeResumen modulo={modulo} />
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-6",
          grafico
            ? "grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-rows-1"
            : "grid-rows-1",
        )}
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-hidden">{texto}</div>
        {grafico}
      </div>
    </div>
  );
}

function EncabezadoDeResumen({ modulo }: { modulo: IdentidadDeModulo }) {
  const { Icono } = modulo;
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            modulo.suave,
          )}
        >
          <Icono aria-hidden="true" className="size-4" />
        </span>
        {modulo.nombre}
      </h2>
      <Link
        href={modulo.href}
        className={cn(
          "inline-flex h-8 shrink-0 items-center rounded-control px-3 text-sm font-medium text-acento",
          "transition-colors duration-(--duracion-rapida) ease-salida",
          "hover:bg-superficie-suave",
          "focus-visible:outline-none focus-visible:shadow-(--anillo-foco)",
        )}
      >
        Ir a {modulo.nombre}
      </Link>
    </div>
  );
}

/** La cifra más importante del módulo, en grande, con lo que la explica. */
export function Destacado({
  etiqueta,
  valor,
  detalle,
  adorno,
}: {
  etiqueta: string;
  valor: string;
  detalle?: ReactNode;
  /** Algo que acompaña a la cifra a la izquierda (por ejemplo, un anillo de avance). */
  adorno?: ReactNode;
}) {
  return (
    <div data-destacado className="flex items-center gap-4">
      {adorno}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm text-texto-secundario">{etiqueta}</p>
        <p
          className={cn(
            "numeros-tabulares font-semibold tracking-tight break-words text-texto",
            valor.length > 18 ? "text-2xl" : "text-3xl sm:text-4xl",
          )}
        >
          {valor}
        </p>
        {detalle ? <p className="text-sm text-texto-secundario">{detalle}</p> : null}
      </div>
    </div>
  );
}

const ESTILO_DE_AVISO = {
  peligro: { Icono: CircleAlert, clase: "bg-peligro-fondo text-peligro", etiqueta: "Atención" },
  advertencia: {
    Icono: TriangleAlert,
    clase: "bg-advertencia-fondo text-advertencia",
    etiqueta: "Aviso",
  },
  info: {
    Icono: Info,
    clase: "bg-acento-suave text-acento-suave-texto",
    etiqueta: "Para tener en cuenta",
  },
} as const;

/** Un aviso en una línea (el más importante del módulo, si hay alguno). */
export function LineaDeAviso({
  tono,
  children,
}: {
  tono: keyof typeof ESTILO_DE_AVISO;
  children: ReactNode;
}) {
  const { Icono, clase, etiqueta } = ESTILO_DE_AVISO[tono];
  return (
    <p
      data-aviso={tono}
      className={cn("flex items-start gap-2 rounded-control px-3 py-2 text-sm", clase)}
    >
      <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="text-texto">
        <span className="solo-lectores">{etiqueta}: </span>
        {children}
      </span>
    </p>
  );
}

export type FilaBreve = {
  id: string;
  principal: string;
  secundario: string;
  /** Algo chico a la izquierda: un punto de color, un ícono. */
  marca?: ReactNode;
};

/**
 * Pocas filas (lo que viene), con un "y N más" si hay más de las que se muestran. Es lo de menor
 * prioridad del resumen: en pantallas angostas no se muestra.
 */
export function ListaBreve({
  titulo,
  filas,
  resto = 0,
  vacio,
}: {
  titulo: string;
  filas: readonly FilaBreve[];
  /** Cuántas más hay además de las que se muestran. */
  resto?: number;
  /** Qué decir si no hay ninguna. */
  vacio: string;
}) {
  return (
    // En pantallas angostas no entra junto con el gráfico: se omite (el detalle está en el módulo).
    <section className="hidden min-h-0 flex-col gap-2 md:flex">
      <h3 className="text-xs font-medium tracking-wide text-texto-secundario uppercase">
        {titulo}
      </h3>
      {filas.length === 0 ? (
        <p className="text-sm text-texto-secundario">{vacio}</p>
      ) : (
        <ul className="flex min-h-0 flex-col divide-y divide-borde overflow-hidden">
          {filas.map((fila) => (
            <li key={fila.id} className="flex items-center gap-3 py-2 first:pt-0">
              {fila.marca}
              <span className="min-w-0 flex-1 truncate text-sm text-texto">{fila.principal}</span>
              <span className="numeros-tabulares shrink-0 text-sm text-texto-secundario">
                {fila.secundario}
              </span>
            </li>
          ))}
        </ul>
      )}
      {resto > 0 ? <p className="text-xs text-texto-secundario">y {resto} más</p> : null}
    </section>
  );
}

/**
 * El gráfico del resumen, en su recuadro: un título que dice qué muestra, el dibujo y una línea que lo
 * lee en palabras. El dibujo es decorativo para un lector de pantalla; `descripcion` dice lo mismo.
 */
export function BloqueDeGrafico({
  titulo,
  descripcion,
  pie,
  children,
}: {
  titulo: string;
  /** El gráfico en palabras, para los lectores de pantalla. */
  descripcion: string;
  /** Una frase visible debajo del gráfico que ayuda a leerlo. */
  pie?: string | undefined;
  children: ReactNode;
}) {
  return (
    <figure
      data-grafico
      className="flex min-h-24 flex-col gap-3 overflow-hidden rounded-tarjeta bg-superficie-suave/60 p-4 [@media(min-height:741px)]:min-h-36"
    >
      <figcaption className="text-sm font-medium text-texto">
        {titulo}
        <span className="solo-lectores">. {descripcion}</span>
      </figcaption>
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
      {/* En una ventana baja no entra: el título y el dibujo alcanzan. */}
      {pie ? (
        <p className="text-xs text-texto-secundario [@media(max-height:740px)]:hidden">{pie}</p>
      ) : null}
    </figure>
  );
}

export type ColumnaDeBarras = {
  /** Lo que va debajo de la barra ("lun", "Esta semana"). */
  etiqueta: string;
  valor: number;
  /** Si se da, la barra muestra `valor` sobre un fondo que llega hasta `total` (por ejemplo, hechas de un total). */
  total?: number;
  /** Lo que va arriba de la barra, ya escrito ("3", "2/4"). */
  texto: string;
  /** La que se destaca (hoy, esta semana). */
  resaltada?: boolean;
};

/**
 * Barras verticales con su número arriba y su etiqueta abajo: se leen sin ejes ni leyendas. Crecen
 * desde abajo al aparecer (solo `transform`), en cascada; con reducir movimiento aparecen quietas.
 */
export function BarrasConEtiquetas({
  columnas,
  color,
}: {
  columnas: readonly ColumnaDeBarras[];
  /** El color pleno del módulo (una clase `bg-…`). */
  color: string;
}) {
  const reducirMovimiento = useReducedMotion();
  const maximo = Math.max(1, ...columnas.map((columna) => columna.total ?? columna.valor));

  return (
    <div className="flex min-h-16 flex-1 items-stretch gap-2">
      {columnas.map((columna, posicion) => (
        <div
          // La posición es la identidad: son días o semanas en orden fijo.
          key={posicion}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
        >
          <span
            className={cn(
              "numeros-tabulares text-xs",
              columna.resaltada ? "font-semibold text-texto" : "text-texto-secundario",
            )}
          >
            {columna.texto}
          </span>
          <div className="relative w-full max-w-10 flex-1">
            {columna.total !== undefined ? (
              <div
                className="absolute inset-x-0 bottom-0 rounded-md bg-texto-secundario/15"
                style={{ height: `${(columna.total / maximo) * 100}%` }}
              />
            ) : null}
            <motion.div
              className={cn(
                "absolute inset-x-0 bottom-0 origin-bottom rounded-md",
                color,
                !columna.resaltada && "opacity-60",
              )}
              style={{
                height: `${Math.max(columna.valor > 0 ? 4 : 0, (columna.valor / maximo) * 100)}%`,
              }}
              initial={reducirMovimiento ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{
                duration: DURACION_MS.lenta / 1000,
                delay: posicion * 0.04,
                ease: CURVA_SALIDA,
              }}
            />
          </div>
          <span
            className={cn(
              "w-full truncate text-center text-xs",
              columna.resaltada ? "font-medium text-texto" : "text-texto-secundario",
            )}
          >
            {columna.etiqueta}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Dona ---

export type PorcionDeDona = {
  etiqueta: string;
  valor: number;
  /** Lo que se lee en la leyenda ("$ 1.200", "3"). */
  texto: string;
  /** Un color CSS (`var(--color-…)` o el de una categoría). */
  color: string;
};

/** Grosor del aro y su radio, en unidades del `viewBox` (100 × 100). */
const ARO = 14;
const RADIO = 50 - ARO / 2;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
/** Lo que queda entre una porción y la siguiente, para que se distingan aunque tengan colores parecidos. */
const SEPARACION = 1.6;

/**
 * Un reparto: una dona con la cifra total en el centro y la leyenda al costado, cada porción con su
 * color, su nombre y su valor escritos. Sirve cuando importa **cuánto de cada cosa** (en qué se va la
 * plata, de qué módulo viene la semana) más que el orden. Las porciones se dibujan en orden, de la
 * más grande a la más chica, empezando arriba; al aparecer se van completando, una detrás de otra.
 */
export function Dona({
  porciones,
  centro,
  detalleDelCentro,
}: {
  porciones: readonly PorcionDeDona[];
  /** La cifra del medio (el total). */
  centro: string;
  /** Una palabra debajo de la cifra ("gastos", "cosas"). */
  detalleDelCentro?: string;
}) {
  const reducirMovimiento = useReducedMotion();
  const total = porciones.reduce((suma, porcion) => suma + Math.max(0, porcion.valor), 0);
  const conGrosor = porciones.filter((porcion) => porcion.valor > 0);
  // Con una sola porción no hay separación que dejar.
  const separacion = conGrosor.length > 1 ? SEPARACION : 0;
  let recorrido = 0;

  return (
    // El aro ocupa todo el alto disponible (hasta 15 rem): el contenedor mide su alto con
    // `container-type: size` y el aro usa esa medida (`cqh`) como lado.
    <div className="flex min-h-24 flex-1 items-center gap-4 [container-type:size] sm:gap-6">
      <div className="relative size-[min(100cqh,15rem)] shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle
            cx={50}
            cy={50}
            r={RADIO}
            fill="none"
            strokeWidth={ARO}
            className="stroke-texto-secundario/10"
          />
          {total > 0
            ? conGrosor.map((porcion, posicion) => {
                const largo = (porcion.valor / total) * CIRCUNFERENCIA;
                const inicio = recorrido;
                recorrido += largo;
                const visible = Math.max(0.01, largo - separacion);
                return (
                  <motion.circle
                    // La posición es la identidad: las porciones van en un orden fijo.
                    key={posicion}
                    cx={50}
                    cy={50}
                    r={RADIO}
                    fill="none"
                    strokeWidth={ARO}
                    stroke={porcion.color}
                    strokeDashoffset={-inicio}
                    initial={reducirMovimiento ? false : { strokeDasharray: `0 ${CIRCUNFERENCIA}` }}
                    animate={{ strokeDasharray: `${visible} ${CIRCUNFERENCIA - visible}` }}
                    transition={{
                      duration: DURACION_MS.lenta / 1000,
                      delay: posicion * 0.12,
                      ease: CURVA_SALIDA,
                    }}
                  />
                );
              })
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="numeros-tabulares text-xl leading-tight font-semibold text-texto sm:text-2xl">
            {centro}
          </span>
          {detalleDelCentro ? (
            <span className="text-xs text-texto-secundario">{detalleDelCentro}</span>
          ) : null}
        </div>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-3">
        {porciones.map((porcion, posicion) => (
          <li
            // La posición es la identidad: la leyenda sigue el orden de las porciones.
            key={posicion}
            className="flex items-center gap-2.5 text-sm sm:text-base"
          >
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: porcion.color }}
            />
            <span className="min-w-0 flex-1 truncate text-texto">{porcion.etiqueta}</span>
            <span className="numeros-tabulares shrink-0 text-texto-secundario">{porcion.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Casillas ---

export type Casilla = {
  /** Lo que va debajo ("lun", "hoy"). */
  etiqueta: string;
  /** De 0 a 1: qué tan llena está. Null es "no había nada ese día" (queda punteada). */
  proporcion: number | null;
  /** Lo que se lee adentro o debajo ("3/4", "2"). */
  texto: string;
  /** La que se destaca (hoy). */
  resaltada?: boolean;
};

/**
 * Una casilla por día, más intensa cuanto más se cumplió: se lee como un calendario de hábitos. Un día
 * completo lleva una tilde. Para **constancia** (lo que se hizo de lo que había), donde unas barras de
 * distinto alto harían pensar en cantidades.
 */
export function Casillas({
  casillas,
  color,
  marcarCompletas = true,
}: {
  casillas: readonly Casilla[];
  color: string;
  /** Si una casilla llena lleva tilde (sí para lo cumplido; no para una cantidad). */
  marcarCompletas?: boolean;
}) {
  const reducirMovimiento = useReducedMotion();
  return (
    <div
      className="grid min-h-16 flex-1 gap-2"
      style={{ gridTemplateColumns: `repeat(${casillas.length}, minmax(0, 1fr))` }}
    >
        {casillas.map((casilla, posicion) => {
          const llena = marcarCompletas && casilla.proporcion !== null && casilla.proporcion >= 1;
          return (
            <div
              // La posición es la identidad: son días en orden fijo.
              key={posicion}
              className="flex min-h-0 min-w-0 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "numeros-tabulares text-xs",
                  casilla.resaltada ? "font-semibold text-texto" : "text-texto-secundario",
                )}
              >
                {casilla.texto}
              </span>
              <motion.div
                className={cn(
                  "relative flex min-h-6 w-full max-w-12 flex-1 origin-bottom items-center justify-center rounded-lg",
                  casilla.proporcion === null && "border border-dashed border-borde-fuerte",
                  casilla.resaltada && "ring-2 ring-texto/70 ring-offset-2 ring-offset-superficie",
                )}
                style={
                  casilla.proporcion === null
                    ? {}
                    : {
                        // Nunca del todo transparente: un día con algo y nada hecho igual se ve.
                        backgroundColor: `color-mix(in oklab, ${color} ${Math.round(12 + casilla.proporcion * 88)}%, transparent)`,
                      }
                }
                initial={reducirMovimiento ? false : { opacity: 0, scaleY: 0.4 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{
                  duration: DURACION_MS.lenta / 1000,
                  delay: posicion * 0.04,
                  ease: CURVA_SALIDA,
                }}
              >
                {llena ? <Check className="size-5 text-white" strokeWidth={3} /> : null}
              </motion.div>
              <span
                className={cn(
                  "w-full truncate text-center text-xs",
                  casilla.resaltada ? "font-medium text-texto" : "text-texto-secundario",
                )}
              >
                {casilla.etiqueta}
              </span>
            </div>
          );
        })}
    </div>
  );
}

// --- Agenda ---

export type DiaDeAgenda = {
  etiqueta: string;
  /** Un color CSS por cosa que hay ese día, en orden. */
  puntos: readonly string[];
  resaltada?: boolean;
};

/** Cuántos puntos entran por día antes de pasar a "+N". */
const PUNTOS_POR_DIA = 6;

/**
 * La semana como una agenda: una columna por día con un punto por cosa, del color de su módulo. Se
 * ve de un vistazo qué días están cargados y de dónde viene cada cosa, sin leer números.
 */
export function Agenda({ dias }: { dias: readonly DiaDeAgenda[] }) {
  const reducirMovimiento = useReducedMotion();
  return (
    <div
      className="grid min-h-16 flex-1 gap-1.5"
      style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}
    >
      {dias.map((dia, posicion) => {
        const visibles = dia.puntos.slice(0, PUNTOS_POR_DIA);
        const resto = dia.puntos.length - visibles.length;
        return (
          <div
            // La posición es la identidad: son días en orden fijo.
            key={posicion}
            className={cn(
              "flex min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-2",
              dia.resaltada ? "bg-superficie" : "bg-superficie/40",
            )}
          >
            <span
              className={cn(
                "w-full truncate text-center text-xs",
                dia.resaltada ? "font-semibold text-texto" : "text-texto-secundario",
              )}
            >
              {dia.etiqueta}
            </span>
            <div className="flex min-h-0 flex-1 flex-wrap content-center justify-center gap-1.5">
              {visibles.map((color, orden) => (
                <motion.span
                  // El orden es la identidad: son las cosas del día en el orden del calendario.
                  key={orden}
                  className="size-3 rounded-full"
                  style={{ backgroundColor: color }}
                  initial={reducirMovimiento ? false : { opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: DURACION_MS.normal / 1000,
                    delay: posicion * 0.05 + orden * 0.04,
                    ease: CURVA_SALIDA,
                  }}
                />
              ))}
            </div>
            {resto > 0 ? <span className="text-xs text-texto-secundario">+{resto}</span> : null}
            <span
              className={cn(
                "numeros-tabulares text-lg leading-none font-semibold",
                dia.puntos.length > 0 ? "text-texto" : "text-texto-secundario/60",
              )}
            >
              {dia.puntos.length}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- Línea con área ---

/**
 * Una serie en el tiempo, con el área de abajo pintada y una línea punteada de referencia (el
 * promedio). Para ver **el ritmo**: si los últimos días van por encima o por debajo de lo normal.
 */
export function LineaConArea({
  valores,
  referencia,
  etiquetas,
  color,
}: {
  valores: readonly number[];
  /** La línea punteada (por ejemplo, el promedio). */
  referencia?: number;
  /** Debajo del gráfico, una por valor ("lun", "hoy"). */
  etiquetas: readonly string[];
  /** Un color CSS. */
  color: string;
}) {
  const reducirMovimiento = useReducedMotion();
  const id = useId();
  if (valores.length < 2) return null;
  const maximo = Math.max(1, referencia ?? 0, ...valores) * 1.1;
  const ancho = 100;
  const alto = 50;
  const x = (posicion: number) => (posicion / (valores.length - 1)) * ancho;
  const y = (valor: number) => alto - (valor / maximo) * alto;
  const linea = valores
    .map((valor, posicion) => `${posicion === 0 ? "M" : "L"}${x(posicion)},${y(valor)}`)
    .join(" ");
  const area = `${linea} L${ancho},${alto} L0,${alto} Z`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        className="min-h-16 w-full flex-1 overflow-visible"
      >
        <defs>
          <linearGradient id={`${id}-relleno`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <motion.path
          d={area}
          fill={`url(#${id}-relleno)`}
          initial={reducirMovimiento ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURACION_MS.lenta / 1000, ease: CURVA_SALIDA }}
        />
        {referencia !== undefined ? (
          <line
            x1={0}
            x2={ancho}
            y1={y(referencia)}
            y2={y(referencia)}
            strokeWidth={1.5}
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
            className="stroke-texto-secundario"
          />
        ) : null}
        <motion.path
          d={linea}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={reducirMovimiento ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: DURACION_MS.lenta / 1000, ease: CURVA_SALIDA }}
        />
      </svg>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${etiquetas.length}, minmax(0, 1fr))` }}
      >
        {etiquetas.map((etiqueta, posicion) => (
          <span
            // La posición es la identidad: son días en orden fijo.
            key={posicion}
            className={cn(
              "truncate text-center text-xs",
              posicion === etiquetas.length - 1
                ? "font-medium text-texto"
                : "text-texto-secundario",
            )}
          >
            {etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Mientras llegan los datos: la misma forma del resumen, sin contenido. */
export function EsqueletoDeResumen({ modulo }: { modulo: IdentidadDeModulo }) {
  return (
    <div aria-busy="true" className="flex h-full flex-col gap-5 p-4 sm:p-6">
      <EncabezadoDeResumen modulo={modulo} />
      <span className="solo-lectores">Cargando el resumen de {modulo.nombre}</span>
      <div className="grid flex-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="h-20 animate-pulse rounded-control bg-superficie-suave" />
          <div className="h-32 animate-pulse rounded-control bg-superficie-suave" />
        </div>
        <div className="min-h-36 animate-pulse rounded-tarjeta bg-superficie-suave" />
      </div>
    </div>
  );
}

/** Si no se pudo cargar: qué pasó, sin tapar el resto del carrusel. */
export function ErrorDeResumen({ modulo, error }: { modulo: IdentidadDeModulo; error: unknown }) {
  return (
    <div className="flex h-full flex-col gap-5 p-4 sm:p-6">
      <EncabezadoDeResumen modulo={modulo} />
      <LineaDeAviso tono="peligro">
        No pudimos cargar el resumen de {modulo.nombre}. {interpretarError(error).mensaje}
      </LineaDeAviso>
    </div>
  );
}

/** El día de la semana corto ("lun", "mié"), sin punto. */
export function diaCortoDeLaSemana(dia: string): string {
  return new Intl.DateTimeFormat("es-UY", { weekday: "short", timeZone: "UTC" })
    .format(new Date(`${dia}T00:00:00Z`))
    .replace(".", "");
}

/** "hoy", "mañana" o el día de la semana ("jueves"). Para fechas de los próximos días. */
export function cuandoEs(dias: number, dia: string): string {
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  const nombre = new Intl.DateTimeFormat("es-UY", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${dia}T00:00:00Z`),
  );
  return dias < 7 ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : `En ${dias} días`;
}

export function plural(cantidad: number, singular: string, enPlural: string): string {
  return cantidad === 1 ? singular : enPlural;
}

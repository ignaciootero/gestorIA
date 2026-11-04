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
import { CircleAlert, Info, type LucideIcon, TriangleAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
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
};

/** El resumen entero: encabezado, la columna de texto y la del gráfico. */
export function Resumen({
  modulo,
  texto,
  grafico,
}: {
  modulo: IdentidadDeModulo;
  /** La cifra destacada, el aviso y la lista. */
  texto: ReactNode;
  /** El bloque del gráfico; sin datos para dibujar, se omite y el texto ocupa todo. */
  grafico: ReactNode | null;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:gap-5 sm:p-6">
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
  pie?: string;
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

// Tarjeta de un widget: ícono, título y, según el widget, una cifra grande, un mini
// gráfico y una o dos frases.
//
// Lo usan el carrusel de la columna lateral (en su versión `grande`, con datos de apoyo) y la
// grilla de la pantalla de inicio (versión chica),
// así que no fija su alto: lo decide quien la contiene. Hay cuatro formas de
// armarla, según lo que lleve el widget:
// - solo texto: la cifra y su detalle (un dato o un aviso);
// - cifra con gráfico debajo (línea, barras, comparación, avance);
// - cifra con un anillo al costado;
// - ranking: filas con barras, en lugar de la cifra grande.
//
// Un aviso lleva además la insignia "Aviso" para distinguirlo de una cifra a simple
// vista; el significado nunca depende solo del color (docs/guias/estetica.md,
// Colores), por eso el tono siempre viaja con un ícono y, en los avisos, con texto.

import { Insignia, type TonoInsignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { ValorConPulso } from "@/componentes/ui/valor-con-pulso";
import { AreaDesplazable } from "@/componentes/widgets/area-desplazable";
import type { DatoDeWidget, TonoDeWidget } from "@/componentes/widgets/tipos";
import { Anillo, VisualDelWidget } from "@/componentes/widgets/visuales";
import { cn } from "@/lib/clases";

const FONDO_DEL_ICONO: Record<TonoDeWidget, string> = {
  neutro: "bg-superficie-suave text-texto-secundario",
  info: "bg-acento-suave text-acento-suave-texto",
  exito: "bg-exito-fondo text-exito",
  advertencia: "bg-advertencia-fondo text-advertencia",
  peligro: "bg-peligro-fondo text-peligro",
};

const COLOR_DEL_VALOR: Record<TonoDeWidget, string> = {
  neutro: "text-texto",
  info: "text-texto",
  exito: "text-exito",
  advertencia: "text-advertencia",
  peligro: "text-peligro",
};

const TONO_DE_INSIGNIA: Record<TonoDeWidget, TonoInsignia> = {
  neutro: "neutral",
  info: "info",
  exito: "exito",
  advertencia: "advertencia",
  peligro: "peligro",
};

/**
 * Tamaño de la cifra. En la versión grande, una cifra corta (un número, "4 días") se agranda y una
 * larga ("US$ 120,00 · $ 5.000,00") se achica y puede pasar a un segundo renglón: nunca se corta con
 * puntos suspensivos.
 */
function claseDeLaCifra(valor: string, grande: boolean, holgada: boolean): string {
  if (!grande) return "text-2xl";
  if (valor.length > 14) return "text-xl";
  if (valor.length > 10) return "text-2xl";
  return holgada ? "text-4xl" : "text-3xl";
}

export function TarjetaDeWidget({
  dato,
  className,
  grande = false,
  desplazarSolo = false,
}: {
  dato: DatoDeWidget;
  className?: string;
  /** La versión de la columna lateral: cifra y gráficos más grandes, y los datos de apoyo (`extras`). */
  grande?: boolean;
  /** En la versión grande, si el contenido se pasa del alto, que se deslice solo (false: queda quieto, desplazable a mano). */
  desplazarSolo?: boolean;
}) {
  const { Icono, tono, tipo, titulo, valor, detalle, visual, extras } = dato;
  const hayExtras = grande && extras !== undefined && extras.length > 0;
  // Con poco para mostrar (sin gráfico y con a lo sumo un dato de apoyo), la cifra y el detalle crecen
  // y se centran en el alto que sobra, en vez de dejar un hueco abajo.
  const holgada = grande && !visual && (extras?.length ?? 0) <= 1;

  const cifra = valor ? (
    <ValorConPulso
      valor={valor}
      className={cn(
        "max-w-full shrink-0 text-balance break-words font-semibold leading-tight tracking-tight",
        claseDeLaCifra(valor, grande, holgada),
        COLOR_DEL_VALOR[tono],
      )}
    />
  ) : null;

  // En la versión grande el detalle no se recorta por renglones: si no entra, la zona se desliza.
  const detalleDelWidget = (clases: string) => (
    <p
      className={cn(
        "shrink-0 text-texto-secundario",
        grande ? "text-sm" : "text-xs",
        grande ? clases.replace(/line-clamp-\d/, "") : clases,
      )}
    >
      {detalle}
    </p>
  );

  const cuerpo = (
    <>
      {visual?.tipo === "anillo" ? (
        // La cifra (un nombre, a veces largo) arriba y a todo el ancho; el anillo y el detalle, debajo.
        <>
          {cifra}
          <div className={cn("flex items-center gap-3", grande ? "flex-1" : "")}>
            {detalleDelWidget("min-w-0 flex-1 line-clamp-5")}
            <Anillo porcentaje={visual.porcentaje} color={visual.color} grande={grande} />
          </div>
        </>
      ) : visual?.tipo === "ranking" ? (
        <>
          <VisualDelWidget visual={visual} grande={grande} />
          {detalleDelWidget("line-clamp-2")}
        </>
      ) : holgada ? (
        // Centrado en el alto que sobra, con la letra más grande: sin hueco abajo.
        <div className="flex flex-1 flex-col justify-center gap-2">
          {cifra}
          {detalleDelWidget("text-base line-clamp-6")}
        </div>
      ) : (
        <>
          {cifra}
          {visual ? <VisualDelWidget visual={visual} grande={grande} /> : null}
          {detalleDelWidget(visual ? "line-clamp-3" : "line-clamp-4")}
        </>
      )}

      {hayExtras ? (
        <dl className="mt-auto flex flex-col divide-y divide-borde border-t border-borde text-sm">
          {extras.map((extra) => (
            <div
              key={extra.etiqueta}
              className="flex flex-wrap items-baseline justify-between gap-x-3 py-0.5"
            >
              <dt className="min-w-0 text-texto-secundario">{extra.etiqueta}</dt>
              <dd className="numeros-tabulares ml-auto break-words text-right font-medium text-texto">
                {extra.valor}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );

  return (
    // El tipo de visual queda en un atributo para poder ubicar cada forma de widget.
    <div
      data-visual={visual?.tipo ?? "cifra"}
      data-categoria={dato.categoria}
      className={cn("h-full", className)}
    >
      <Tarjeta className={cn("flex h-full flex-col p-4", grande ? "gap-3" : "gap-2")}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-control",
              FONDO_DEL_ICONO[tono],
            )}
          >
            <Icono className="size-4" />
          </span>
          {/* Hasta dos renglones: con la insignia "Aviso" al lado, un título como
              "Presupuesto superado" no entra entero en la columna angosta. */}
          <p className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-tight text-texto-secundario">
            {titulo}
          </p>
          {tipo === "aviso" ? <Insignia tono={TONO_DE_INSIGNIA[tono]}>Aviso</Insignia> : null}
        </div>

        {grande ? (
          // Si el contenido no entra en el alto de la tarjeta, se desliza solo para poder leerlo entero.
          <AreaDesplazable activo={desplazarSolo} className="flex min-h-0 flex-1 flex-col gap-3">
            {cuerpo}
          </AreaDesplazable>
        ) : (
          cuerpo
        )}
      </Tarjeta>
    </div>
  );
}

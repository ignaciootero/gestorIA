// Resumen de Tareas en la pantalla de inicio. Tiene varias variantes, y la pantalla elige una al
// azar en cada visita (lib/eleccion-del-inicio.ts):
// - "general": cuánto de lo de hoy ya se hizo (con un anillo de avance), lo que falta hoy y cómo
//   vinieron los últimos siete días.
// - "racha": los días seguidos al día, cuánto se cumplió en la semana y cómo van las rutinas.
// - "viene": lo que hay más adelante, y lo que falta por categoría.
// - "atender": lo atrasado, lo que está por darse por fallido y lo que falló hace poco.
// Una variante sin datos para mostrar cede su lugar a la general. Si hay tareas atrasadas, un aviso.
//
// Sale del mismo pedido que los widgets de Tareas (GET /api/tareas/widgets), con la misma clave de
// caché.

"use client";

import { describirDiasRestantes, diasEntre } from "@gestoria/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { Anillo, VisualDelWidget } from "@/componentes/widgets/visuales";
import type { CategoriaDeWidget, WidgetsDeTareas } from "@/lib/api-tareas";
import {
  BarrasConEtiquetas,
  BloqueDeGrafico,
  cuandoEs,
  Destacado,
  diaCortoDeLaSemana,
  ErrorDeResumen,
  EsqueletoDeResumen,
  type IdentidadDeModulo,
  LineaDeAviso,
  ListaBreve,
  plural,
  Resumen,
  type ResumenArmado,
} from "./piezas-de-resumen";

/** Qué decir debajo de "3 de 5". */
function detalleDeHoy(datos: WidgetsDeTareas, total: number): string {
  const partes: string[] = [];
  if (total === 0) partes.push("No hay tareas para hoy.");
  else if (datos.hoyPendientes === 0) partes.push("Ya no te queda nada para hoy.");
  else partes.push(`Te ${plural(datos.hoyPendientes, "falta", "faltan")} ${datos.hoyPendientes}.`);
  if (datos.racha > 1) partes.push(`Llevás ${datos.racha} días seguidos al día.`);
  return partes.join(" ");
}

/** Las variantes del resumen; la primera es la general (ver el comentario de arriba). */
export const VARIANTES_DE_TAREAS = ["general", "racha", "viene", "atender"] as const;
export type VarianteDeTareas = (typeof VARIANTES_DE_TAREAS)[number];

type Contexto = { datos: WidgetsDeTareas; modulo: IdentidadDeModulo };

/** El aviso de las atrasadas, igual en todas las variantes. */
function AvisoDeAtrasadas({ datos }: { datos: WidgetsDeTareas }) {
  if (datos.atrasadas.total === 0) return null;
  return (
    <LineaDeAviso tono="advertencia">
      {datos.atrasadas.total === 1
        ? "Tenés una tarea atrasada"
        : `Tenés ${datos.atrasadas.total} tareas atrasadas`}
      {datos.porFallar.primera
        ? `: "${datos.porFallar.primera.titulo}" se da por fallida ${describirDiasRestantes(datos.porFallar.primera.dias)}.`
        : "."}
    </LineaDeAviso>
  );
}

/** Un ranking de categorías (la que más tiene arriba), o null si no hay ninguna. */
function rankingDeCategorias(
  categorias: readonly CategoriaDeWidget<{ total: number }>[],
  titulo: string,
  pie: string,
): ResumenArmado["grafico"] {
  if (categorias.length === 0) return null;
  const mayor = Math.max(1, ...categorias.map((categoria) => categoria.total));
  const filas = categorias.slice(0, 5).map((categoria) => ({
    etiqueta: categoria.nombre ?? "Sin categoría",
    texto: String(categoria.total),
    proporcion: categoria.total / mayor,
    color: categoria.color ?? "var(--color-texto-secundario)",
  }));
  return (
    <BloqueDeGrafico
      titulo={titulo}
      descripcion={filas.map((fila) => `${fila.etiqueta}: ${fila.texto}`).join(", ")}
      pie={pie}
    >
      <VisualDelWidget grande visual={{ tipo: "ranking", filas }} />
    </BloqueDeGrafico>
  );
}

function general({ datos, modulo }: Contexto): ResumenArmado {
  const total = datos.hoyHechas + datos.hoyPendientes + datos.hoyFallidas;
  const porcentaje = total > 0 ? (datos.hoyHechas / total) * 100 : 0;
  const { primera } = datos.masAdelante;
  const conTareas = datos.ultimosDias.some((dia) => dia.total > 0);

  return {
    texto: (
      <>
        <Destacado
          etiqueta="Hechas hoy"
          valor={total > 0 ? `${datos.hoyHechas} de ${total}` : "Nada para hoy"}
          detalle={detalleDeHoy(datos, total)}
          adorno={
            total > 0 ? (
              <Anillo porcentaje={porcentaje} color="var(--color-origen-tareas)" grande />
            ) : undefined
          }
        />
        <AvisoDeAtrasadas datos={datos} />
        <ListaBreve
          titulo="Lo que falta hoy"
          vacio={
            primera
              ? `La próxima es "${primera.titulo}", ${describirDiasRestantes(primera.dias)}.`
              : "No tenés tareas pendientes."
          }
          filas={datos.proximas.map((tarea, posicion) => ({
            id: `${posicion}-${tarea.titulo}`,
            principal: tarea.titulo,
            secundario: tarea.hora ?? "Todo el día",
          }))}
          resto={Math.max(0, datos.hoyPendientes - datos.proximas.length)}
        />
      </>
    ),
    grafico: conTareas ? (
      <BloqueDeGrafico
        titulo="Últimos 7 días"
        descripcion={datos.ultimosDias
          .map((dia) => `${diaCortoDeLaSemana(dia.dia)}: ${dia.hechas} de ${dia.total} hechas`)
          .join(", ")}
        pie="Cada barra son las tareas hechas de las que había ese día."
      >
        <BarrasConEtiquetas
          color={modulo.punto}
          columnas={datos.ultimosDias.map((dia, posicion) => ({
            etiqueta:
              posicion === datos.ultimosDias.length - 1 ? "hoy" : diaCortoDeLaSemana(dia.dia),
            valor: dia.hechas,
            total: dia.total,
            texto: `${dia.hechas}/${dia.total}`,
            resaltada: posicion === datos.ultimosDias.length - 1,
          }))}
        />
      </BloqueDeGrafico>
    ) : null,
  };
}

/** Racha y constancia. Necesita tareas en la semana o alguna rutina. */
function racha({ datos, modulo }: Contexto): ResumenArmado | null {
  const totalSemana = datos.ultimosDias.reduce((suma, dia) => suma + dia.total, 0);
  const hechasSemana = datos.ultimosDias.reduce((suma, dia) => suma + dia.hechas, 0);
  if (totalSemana === 0 && datos.rutinas.length === 0) return null;

  const cumplido = totalSemana > 0 ? Math.round((hechasSemana / totalSemana) * 100) : 0;
  const porcentajeDe = (dia: { hechas: number; total: number }) =>
    dia.total > 0 ? Math.round((dia.hechas / dia.total) * 100) : 0;

  return {
    texto: (
      <>
        <Destacado
          etiqueta="Días seguidos al día"
          valor={
            datos.racha === 0
              ? "Sin racha"
              : `${datos.racha} ${plural(datos.racha, "día", "días")}`
          }
          detalle={
            totalSemana > 0
              ? `En la última semana hiciste ${hechasSemana} de ${totalSemana} tareas (${cumplido} %).`
              : "En la última semana no hubo tareas."
          }
          adorno={
            totalSemana > 0 ? (
              <Anillo porcentaje={cumplido} color="var(--color-origen-tareas)" grande />
            ) : undefined
          }
        />
        <AvisoDeAtrasadas datos={datos} />
        <ListaBreve
          titulo="Tus rutinas, últimas dos semanas"
          vacio="Cuando tengas tareas que se repiten, acá vas a ver cómo las cumplís."
          filas={datos.rutinas.slice(0, 4).map((rutina) => ({
            id: rutina.titulo,
            principal: rutina.titulo,
            secundario: `${rutina.hechas} de ${rutina.total}`,
          }))}
          resto={Math.max(0, datos.rutinas.length - 4)}
        />
      </>
    ),
    grafico:
      totalSemana > 0 ? (
        <BloqueDeGrafico
          titulo="Cuánto cumpliste cada día"
          descripcion={datos.ultimosDias
            .map((dia) => `${diaCortoDeLaSemana(dia.dia)}: ${porcentajeDe(dia)} %`)
            .join(", ")}
          pie="Cada barra es el porcentaje de las tareas de ese día que hiciste."
        >
          <BarrasConEtiquetas
            color={modulo.punto}
            columnas={datos.ultimosDias.map((dia, posicion) => ({
              etiqueta:
                posicion === datos.ultimosDias.length - 1 ? "hoy" : diaCortoDeLaSemana(dia.dia),
              valor: porcentajeDe(dia),
              total: 100,
              texto: dia.total > 0 ? `${porcentajeDe(dia)}%` : "–",
              resaltada: posicion === datos.ultimosDias.length - 1,
            }))}
          />
        </BloqueDeGrafico>
      ) : null,
  };
}

/** Lo que viene más adelante. Necesita alguna tarea con día futuro. */
function loQueViene({ datos }: Contexto): ResumenArmado | null {
  const { total, primera, primeras } = datos.masAdelante;
  if (total === 0 || !primera) return null;

  return {
    texto: (
      <>
        <Destacado
          etiqueta="Más adelante"
          valor={`${total} ${plural(total, "tarea", "tareas")}`}
          detalle={`La próxima es "${primera.titulo}", ${describirDiasRestantes(primera.dias)}.`}
        />
        <AvisoDeAtrasadas datos={datos} />
        <ListaBreve
          titulo="Lo que viene"
          vacio="No hay tareas con día más adelante."
          filas={primeras.map((tarea, posicion) => ({
            id: `${posicion}-${tarea.titulo}`,
            principal: tarea.titulo,
            secundario: `${cuandoEs(tarea.dias, tarea.dia)}${tarea.hora ? ` · ${tarea.hora}` : ""}`,
          }))}
          resto={Math.max(0, total - primeras.length)}
        />
      </>
    ),
    grafico: rankingDeCategorias(
      datos.categorias.pendientes,
      "Lo que falta, por categoría",
      "Cuenta lo atrasado, lo de hoy y lo de más adelante.",
    ),
  };
}

/** Lo que hay que atender. Necesita algo atrasado o algo que falló hace poco. */
function paraAtender({ datos, hoy }: Contexto & { hoy: string }): ResumenArmado | null {
  const { atrasadas, porFallar, fallidas } = datos;
  if (atrasadas.total === 0 && fallidas.total === 0) return null;

  return {
    texto: (
      <>
        <Destacado
          etiqueta="Atrasadas"
          valor={atrasadas.total === 0 ? "Ninguna" : String(atrasadas.total)}
          detalle={
            porFallar.total > 0
              ? `${porFallar.total === 1 ? "Una se da" : `${porFallar.total} se dan`} por fallida en pocos días si no las hacés.`
              : atrasadas.total > 0
                ? "Ninguna está por darse por fallida todavía."
                : "Estás al día con lo de días anteriores."
          }
        />
        {porFallar.primera ? (
          <LineaDeAviso tono="advertencia">
            &quot;{porFallar.primera.titulo}&quot; se da por fallida{" "}
            {describirDiasRestantes(porFallar.primera.dias)}.
          </LineaDeAviso>
        ) : null}
        <ListaBreve
          titulo="Fallaron hace poco"
          vacio="Nada falló en las últimas dos semanas."
          filas={fallidas.ultimas.slice(0, 4).map((tarea, posicion) => {
            const atras = diasEntre(tarea.dia, hoy);
            return {
              id: `${posicion}-${tarea.titulo}`,
              principal: tarea.titulo,
              secundario: atras === 0 ? "hoy" : atras === 1 ? "ayer" : `hace ${atras} días`,
            };
          })}
          resto={Math.max(0, fallidas.total - Math.min(4, fallidas.ultimas.length))}
        />
      </>
    ),
    grafico: rankingDeCategorias(
      datos.categorias.atrasadas,
      "Atrasadas por categoría",
      "Cada barra es cuántas tareas atrasadas tiene esa categoría.",
    ),
  };
}

export function ResumenDeTareas({
  modulo,
  consulta,
  variante = "general",
}: {
  modulo: IdentidadDeModulo;
  consulta: UseQueryResult<WidgetsDeTareas>;
  variante?: VarianteDeTareas;
}) {
  if (consulta.isPending) return <EsqueletoDeResumen modulo={modulo} />;
  if (consulta.isError) return <ErrorDeResumen modulo={modulo} error={consulta.error} />;

  const contexto = { datos: consulta.data, modulo, hoy: consulta.data.hoy };
  const armadores: Record<VarianteDeTareas, () => ResumenArmado | null> = {
    general: () => general(contexto),
    racha: () => racha(contexto),
    viene: () => loQueViene(contexto),
    atender: () => paraAtender(contexto),
  };
  // Si la elegida no tiene qué mostrar, va la general (que siempre tiene algo).
  const elegida = armadores[variante]();
  const { texto, grafico } = elegida ?? general(contexto);
  return (
    <Resumen
      modulo={modulo}
      variante={elegida ? variante : "general"}
      texto={texto}
      grafico={grafico}
    />
  );
}

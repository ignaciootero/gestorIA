// Resumen de Contactos en la pantalla de inicio. Tiene varias variantes, y la pantalla elige una al
// azar en cada visita (lib/eleccion-del-inicio.ts):
// - "general": el próximo cumpleaños, los recordatorios que vienen y cuántos caen en cada una de
//   las próximas cuatro semanas.
// - "cumpleanos": el próximo cumpleaños, los que siguen y cuántos hay en cada mes del año.
// - "deudas": lo que te deben tus contactos y lo que les debés, y quiénes deben más.
// - "semana": los recordatorios que cayeron en los últimos siete días, con una casilla por día.
// Una variante sin datos para mostrar cede su lugar a la general. Si hay recordatorios hoy, un aviso.
//
// Sale del mismo pedido que los widgets de Contactos (GET /api/contactos/widgets), con la misma
// clave de caché.

"use client";

import {
  describirDiasRestantes,
  edadQueCumple,
  formatearDiaYMes,
  formatearMonto,
  nombreCompletoDeContacto,
  sumarDias,
} from "@gestoria/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { VisualDelWidget } from "@/componentes/widgets/visuales";
import type { DeudasConContactos, WidgetsDeContactos } from "@/lib/api-contactos";
import { totalesEnPalabras } from "@/lib/api-deudas";
import {
  BarrasConEtiquetas,
  BloqueDeGrafico,
  Casillas,
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

/** Cuántos recordatorios se listan: el resto se cuenta con "y N más". */
const RECORDATORIOS_EN_LA_LISTA = 4;

const ETIQUETAS_DE_SEMANA = ["Esta semana", "En 1 sem.", "En 2 sem.", "En 3 sem."];

/** Las variantes del resumen; la primera es la general (ver el comentario de arriba). */
export const VARIANTES_DE_CONTACTOS = ["general", "cumpleanos", "deudas", "semana"] as const;
export type VarianteDeContactos = (typeof VARIANTES_DE_CONTACTOS)[number];

/** Una letra por mes, debajo de cada barra de "cumpleaños por mes". */
const INICIALES_DE_MES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const NOMBRES_DE_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

type Contexto = { datos: WidgetsDeContactos; modulo: IdentidadDeModulo };

/** El aviso de los recordatorios de hoy, igual en todas las variantes. */
function AvisoDeHoy({ datos }: { datos: WidgetsDeContactos }) {
  const { recordatorios } = datos;
  const deHoy = recordatorios.proximos.filter((recordatorio) => recordatorio.dias === 0);
  if (deHoy.length === 0) return null;
  return (
    <LineaDeAviso tono="advertencia">
      {plural(recordatorios.hoy, "Recordatorio de hoy", "Recordatorios de hoy")}:{" "}
      {deHoy
        .map(
          (recordatorio) =>
            `${recordatorio.titulo}${recordatorio.hora ? ` a las ${recordatorio.hora}` : ""} (${nombreCompletoDeContacto(recordatorio.contacto)})`,
        )
        .join(", ")}
      {recordatorios.hoy > deHoy.length ? ` y ${recordatorios.hoy - deHoy.length} más` : ""}.
    </LineaDeAviso>
  );
}

/** El próximo cumpleaños como cifra destacada, o la cantidad de contactos si no hay ninguno. */
function DestacadoDeCumpleanos({ datos }: { datos: WidgetsDeContactos }) {
  const { totales, proximoCumpleanos: cumple } = datos;
  const cantidad = totales.personas + totales.empresas;
  if (cumple) {
    return (
      <Destacado
        etiqueta="Próximo cumpleaños"
        valor={nombreCompletoDeContacto(cumple)}
        detalle={`Cumple ${edadQueCumple(cumple.nacimiento, cumple.fecha)} el ${formatearDiaYMes(cumple.fecha)} (${describirDiasRestantes(cumple.dias)}).`}
      />
    );
  }
  return (
    <Destacado
      etiqueta="Contactos"
      valor={String(cantidad)}
      detalle={
        cantidad === 0
          ? "Agregá tu primer contacto: una persona, una empresa o un servicio que uses."
          : `${totales.personas} ${plural(totales.personas, "persona", "personas")} y ${totales.empresas} ${plural(totales.empresas, "empresa", "empresas")}.`
      }
    />
  );
}

function general({ datos, modulo }: Contexto): ResumenArmado {
  const { recordatorios } = datos;
  const enLaLista = recordatorios.proximos.slice(0, RECORDATORIOS_EN_LA_LISTA);

  return {
    texto: (
      <>
        <DestacadoDeCumpleanos datos={datos} />
        <AvisoDeHoy datos={datos} />
        <ListaBreve
          titulo="Próximos recordatorios"
          vacio="No hay recordatorios en los próximos días."
          filas={enLaLista.map((recordatorio, posicion) => ({
            id: `${posicion}-${recordatorio.titulo}`,
            principal: `${recordatorio.titulo} · ${nombreCompletoDeContacto(recordatorio.contacto)}`,
            secundario: `${cuandoEs(recordatorio.dias, recordatorio.fecha)}${recordatorio.hora ? ` · ${recordatorio.hora}` : ""}`,
          }))}
          resto={Math.max(
            0,
            recordatorios.proximos30 -
              enLaLista.filter((recordatorio) => recordatorio.dias < 30).length,
          )}
        />
      </>
    ),
    grafico:
      recordatorios.proximos30 > 0 ? (
        <BloqueDeGrafico
          titulo={`${recordatorios.proximos30} ${plural(recordatorios.proximos30, "recordatorio", "recordatorios")} en 30 días`}
          descripcion={recordatorios.porSemana
            .map((total, semana) => `${ETIQUETAS_DE_SEMANA[semana] ?? ""}: ${total}`)
            .join(", ")}
          pie="Cada barra es una semana, empezando hoy."
        >
          <BarrasConEtiquetas
            color={modulo.punto}
            columnas={recordatorios.porSemana.map((total, semana) => ({
              etiqueta: ETIQUETAS_DE_SEMANA[semana] ?? "",
              valor: total,
              texto: String(total),
              resaltada: semana === 0,
            }))}
          />
        </BloqueDeGrafico>
      ) : null,
  };
}

/** Los próximos cumpleaños y cuántos hay por mes. Necesita alguno. */
function cumpleanos({ datos, modulo }: Contexto): ResumenArmado | null {
  const [, ...siguientes] = datos.proximosCumpleanos;
  if (datos.proximosCumpleanos.length === 0) return null;
  const mesActual = Number(datos.hoy.slice(5, 7)) - 1;
  const total = datos.cumpleanosPorMes.reduce((suma, cantidad) => suma + cantidad, 0);

  return {
    texto: (
      <>
        <DestacadoDeCumpleanos datos={datos} />
        <AvisoDeHoy datos={datos} />
        <ListaBreve
          titulo="Los que siguen"
          vacio="No hay más cumpleaños cargados."
          filas={siguientes.map((uno) => ({
            id: `${uno.fecha}-${uno.nombre}-${uno.apellido ?? ""}`,
            principal: nombreCompletoDeContacto(uno),
            secundario: `${formatearDiaYMes(uno.fecha)} · cumple ${edadQueCumple(uno.nacimiento, uno.fecha)}`,
          }))}
        />
      </>
    ),
    grafico: (
      <BloqueDeGrafico
        titulo={`${total} ${plural(total, "cumpleaños", "cumpleaños")} en el año`}
        descripcion={datos.cumpleanosPorMes
          .map((cantidad, mes) => `${NOMBRES_DE_MES[mes] ?? ""}: ${cantidad}`)
          .join(", ")}
        pie="Cada barra es un mes; la resaltada es este."
      >
        <BarrasConEtiquetas
          color={modulo.punto}
          columnas={datos.cumpleanosPorMes.map((cantidad, mes) => ({
            etiqueta: INICIALES_DE_MES[mes] ?? "",
            valor: cantidad,
            texto: String(cantidad),
            resaltada: mes === mesActual,
          }))}
        />
      </BloqueDeGrafico>
    ),
  };
}

/** Quiénes deben más, como filas de un ranking (las barras se comparan dentro de cada moneda). */
function filasDeDeudas(
  deudas: DeudasConContactos,
  sufijo: string,
  color: string,
): { etiqueta: string; texto: string; proporcion: number; color: string; moneda: string }[] {
  return deudas.mayores.map((contacto) => ({
    etiqueta: `${nombreCompletoDeContacto(contacto)} (${sufijo})`,
    texto: formatearMonto(contacto.centavos, contacto.moneda),
    proporcion: contacto.centavos,
    color,
    moneda: contacto.moneda,
  }));
}

/** Lo que te deben tus contactos y lo que les debés. Necesita alguna deuda pendiente. */
function deudas({ datos }: Contexto): ResumenArmado | null {
  const { teDeben, debes, proximoVencimiento } = datos.deudas;
  if (teDeben.totales.length === 0 && debes.totales.length === 0) return null;

  const filas = [
    ...filasDeDeudas(teDeben, "te debe", "var(--color-exito)"),
    ...filasDeDeudas(debes, "le debés", "var(--color-peligro)"),
  ];
  // Cada barra, contra la más grande de su misma moneda: un peso y un dólar no se comparan.
  const mayorDe = (moneda: string) =>
    Math.max(1, ...filas.filter((fila) => fila.moneda === moneda).map((fila) => fila.proporcion));
  const ranking = filas.map(({ moneda, ...fila }) => ({
    ...fila,
    proporcion: fila.proporcion / mayorDe(moneda),
  }));

  const principal = teDeben.totales.length > 0 ? teDeben : debes;
  const cantidad = (lado: DeudasConContactos) =>
    lado.totales.reduce((suma, total) => suma + total.deudas, 0);

  return {
    texto: (
      <>
        <Destacado
          etiqueta={principal === teDeben ? "Te deben tus contactos" : "Les debés a tus contactos"}
          valor={totalesEnPalabras(principal.totales)}
          detalle={
            principal === teDeben && debes.totales.length > 0
              ? `Y vos les debés ${totalesEnPalabras(debes.totales)}.`
              : `${cantidad(principal)} ${plural(cantidad(principal), "deuda pendiente", "deudas pendientes")} con ${principal.contactos} ${plural(principal.contactos, "contacto", "contactos")}.`
          }
        />
        {proximoVencimiento && proximoVencimiento.dias <= 7 ? (
          <LineaDeAviso tono={proximoVencimiento.dias < 0 ? "peligro" : "advertencia"}>
            {proximoVencimiento.sentido === "me_deben"
              ? `${nombreCompletoDeContacto(proximoVencimiento.contacto)} te tiene que pagar ${formatearMonto(proximoVencimiento.centavos, proximoVencimiento.moneda)}`
              : `Le tenés que pagar ${formatearMonto(proximoVencimiento.centavos, proximoVencimiento.moneda)} a ${nombreCompletoDeContacto(proximoVencimiento.contacto)}`}
            {proximoVencimiento.dias < 0
              ? `: venció el ${formatearDiaYMes(proximoVencimiento.fechaLimite)}.`
              : ` ${describirDiasRestantes(proximoVencimiento.dias)}.`}
          </LineaDeAviso>
        ) : (
          <AvisoDeHoy datos={datos} />
        )}
        <ListaBreve
          titulo="Próximo vencimiento"
          vacio="Ninguna deuda con contactos tiene fecha límite."
          filas={
            proximoVencimiento
              ? [
                  {
                    id: "vencimiento",
                    principal: `${proximoVencimiento.concepto} · ${nombreCompletoDeContacto(proximoVencimiento.contacto)}`,
                    secundario: formatearDiaYMes(proximoVencimiento.fechaLimite),
                  },
                ]
              : []
          }
        />
      </>
    ),
    grafico: (
      <BloqueDeGrafico
        titulo="Con quién tenés más pendiente"
        descripcion={ranking.map((fila) => `${fila.etiqueta}: ${fila.texto}`).join(", ")}
        pie="Verde es lo que te deben y rojo, lo que debés."
      >
        <VisualDelWidget grande visual={{ tipo: "ranking", filas: ranking }} />
      </BloqueDeGrafico>
    ),
  };
}

/** Lo que cayó en la última semana. Necesita algo. */
function semana({ datos, modulo }: Contexto): ResumenArmado | null {
  const { semanaPasada } = datos;
  if (semanaPasada.length === 0) return null;
  // La API manda hasta ocho: si llegaron ocho puede haber más, y el gráfico contaría de menos.
  const completa = semanaPasada.length < 8;
  // Del más viejo (hace 7 días) a ayer.
  const porDia = Array.from({ length: 7 }, (_, posicion) => {
    const atras = 7 - posicion;
    return semanaPasada.filter((entrada) => entrada.diasAtras === atras).length;
  });
  const mayor = Math.max(1, ...porDia);

  return {
    texto: (
      <>
        <Destacado
          etiqueta="La semana pasada"
          valor={
            completa
              ? `${semanaPasada.length} ${plural(semanaPasada.length, "recordatorio", "recordatorios")}`
              : `${semanaPasada.length} o más`
          }
          detalle="Los que cayeron en los últimos 7 días, de ayer para atrás."
        />
        <AvisoDeHoy datos={datos} />
        <ListaBreve
          titulo="Lo que pasó"
          vacio="Nada en la última semana."
          filas={semanaPasada.slice(0, 4).map((entrada, posicion) => ({
            id: `${posicion}-${entrada.titulo}`,
            principal: `${entrada.titulo} · ${nombreCompletoDeContacto(entrada.contacto)}`,
            secundario: entrada.diasAtras === 1 ? "Ayer" : `Hace ${entrada.diasAtras} días`,
          }))}
          resto={Math.max(0, semanaPasada.length - 4)}
        />
      </>
    ),
    grafico: completa ? (
      <BloqueDeGrafico
        titulo="Día por día"
        descripcion={porDia
          .map(
            (cantidad, posicion) =>
              `${diaCortoDeLaSemana(sumarDias(datos.hoy, posicion - 7))}: ${cantidad}`,
          )
          .join(", ")}
        pie="Cuanto más intensa la casilla, más recordatorios ese día."
      >
        <Casillas
          color={modulo.color}
          marcarCompletas={false}
          casillas={porDia.map((cantidad, posicion) => ({
            etiqueta:
              posicion === 6 ? "ayer" : diaCortoDeLaSemana(sumarDias(datos.hoy, posicion - 7)),
            proporcion: cantidad > 0 ? cantidad / mayor : null,
            texto: String(cantidad),
            resaltada: posicion === 6,
          }))}
        />
      </BloqueDeGrafico>
    ) : null,
  };
}

const ARMADORES: Record<VarianteDeContactos, (contexto: Contexto) => ResumenArmado | null> = {
  general,
  cumpleanos,
  deudas,
  semana,
};

export function ResumenDeContactos({
  modulo,
  consulta,
  variante = "general",
}: {
  modulo: IdentidadDeModulo;
  consulta: UseQueryResult<WidgetsDeContactos>;
  variante?: VarianteDeContactos;
}) {
  if (consulta.isPending) return <EsqueletoDeResumen modulo={modulo} />;
  if (consulta.isError) return <ErrorDeResumen modulo={modulo} error={consulta.error} />;

  const contexto = { datos: consulta.data, modulo };
  // Si la elegida no tiene qué mostrar, va la general (que siempre tiene algo).
  const elegida = ARMADORES[variante](contexto);
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

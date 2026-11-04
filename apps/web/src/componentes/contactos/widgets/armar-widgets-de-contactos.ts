// Convierte los datos que devuelve la API (GET /api/contactos/widgets) en la lista de
// widgets de Contactos: primero los avisos y después las cifras.
//
// Solo lo que le sirve a la persona en el día a día: cumpleaños, recordatorios, deudas con sus
// contactos y contactos sin forma de comunicarse (ver docs/decisiones.md).
//
// La API cuenta y ordena; acá se escribe en español de todos los días. Es una función
// pura para que sea fácil de leer y de probar: no toca el DOM ni pide nada.

import {
  describirDiasRestantes,
  edadQueCumple,
  formatearDiaYMes,
  formatearMonto,
  NOMBRES_DE_MES,
  nombreCompletoDeContacto,
} from "@gestoria/shared";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Cake,
  CalendarClock,
  ChartColumn,
  HandCoins,
  History,
  UserPlus,
  UserRoundX,
} from "lucide-react";
import type { DatoDeWidget } from "@/componentes/widgets/tipos";
import type { DeudasConContactos, WidgetsDeContactos } from "@/lib/api-contactos";
import { totalesEnPalabras } from "@/lib/api-deudas";

/** Debajo de cada barra de "Cumpleaños por mes": 1 es enero y 12, diciembre. */
const NUMEROS_DE_MES = Array.from({ length: 12 }, (_, mes) => String(mes + 1));

/** Cuántos días antes de la fecha límite una deuda pasa a ser un aviso. */
const DIAS_DE_AVISO_DE_VENCIMIENTO = 7;

function plural(cantidad: number, singular: string, pluralDe: string): string {
  return cantidad === 1 ? singular : pluralDe;
}

/** "Ana" o "Ana y Beto" o "Ana, Beto y Carla". */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

function conMayuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("es") + texto.slice(1);
}

/**
 * La deuda que vence antes. Si vence en una semana o menos, o ya venció, es un aviso; si falta
 * más, un dato.
 */
function armarVencimiento(datos: WidgetsDeContactos): DatoDeWidget | null {
  const deuda = datos.deudas.proximoVencimiento;
  if (!deuda) return null;

  const nombre = nombreCompletoDeContacto(deuda.contacto);
  const monto = formatearMonto(deuda.centavos, deuda.moneda);
  const vencida = deuda.dias < 0;
  const esAviso = deuda.dias <= DIAS_DE_AVISO_DE_VENCIMIENTO;

  let cuando: string;
  if (deuda.dias < -1) cuando = `Venció hace ${-deuda.dias} días`;
  else if (deuda.dias === -1) cuando = "Venció ayer";
  else if (deuda.dias === 0) cuando = "Vence hoy";
  else cuando = `Vence ${describirDiasRestantes(deuda.dias)}`;

  return {
    id: "vencimiento-de-deuda",
    tipo: esAviso ? "aviso" : "dato",
    categoria: "texto",
    tono: vencida ? "peligro" : esAviso ? "advertencia" : "neutro",
    Icono: HandCoins,
    titulo: vencida ? "Deuda vencida" : "Próximo vencimiento",
    valor: cuando,
    detalle:
      deuda.sentido === "me_deben"
        ? `${nombre} te tiene que pagar ${monto} (${deuda.concepto}).`
        : `Le tenés que pagar ${monto} a ${nombre} (${deuda.concepto}).`,
    extras: [
      { etiqueta: "Fecha límite", valor: formatearDiaYMes(deuda.fechaLimite) },
      { etiqueta: "Falta", valor: monto },
    ],
  };
}

function armarAvisos(datos: WidgetsDeContactos, vencimiento: DatoDeWidget | null): DatoDeWidget[] {
  const avisos: DatoDeWidget[] = [];
  const { totales, recordatorios } = datos;
  const cantidad = totales.personas + totales.empresas;

  if (cantidad === 0) {
    avisos.push({
      id: "sin-contactos",
      tipo: "aviso",
      categoria: "texto",
      tono: "info",
      Icono: UserPlus,
      titulo: "Todavía sin contactos",
      detalle: "Agregá tu primer contacto: una persona, una empresa o un servicio que uses.",
    });
    return avisos;
  }

  const deHoy = recordatorios.proximos.filter((recordatorio) => recordatorio.dias === 0);
  if (recordatorios.hoy > 0) {
    const primeros = deHoy.map(
      (recordatorio) =>
        `${recordatorio.titulo}${recordatorio.hora ? ` a las ${recordatorio.hora}` : ""} (${nombreCompletoDeContacto(recordatorio.contacto)})`,
    );
    const resto = recordatorios.hoy - primeros.length;
    avisos.push({
      id: "recordatorios-de-hoy",
      tipo: "aviso",
      categoria: "texto",
      tono: "advertencia",
      Icono: Bell,
      titulo: recordatorios.hoy === 1 ? "Recordatorio de hoy" : "Recordatorios de hoy",
      valor: String(recordatorios.hoy),
      detalle: resto > 0 ? `${enumerar(primeros)} y ${resto} más.` : `${enumerar(primeros)}.`,
      extras: deHoy.slice(0, 3).map((recordatorio) => ({
        etiqueta: recordatorio.titulo,
        valor: recordatorio.hora ?? "Todo el día",
      })),
    });
  }

  if (vencimiento?.tipo === "aviso") avisos.push(vencimiento);

  if (totales.sinDatosDeContacto > 0) {
    avisos.push({
      id: "contactos-sin-datos",
      tipo: "aviso",
      categoria: "texto",
      tono: "info",
      Icono: UserRoundX,
      titulo: "Sin forma de comunicarse",
      valor: String(totales.sinDatosDeContacto),
      detalle: `${totales.sinDatosDeContacto === 1 ? "Un contacto no tiene" : `${totales.sinDatosDeContacto} contactos no tienen`} teléfono ni correo cargado.`,
      extras: [
        { etiqueta: "Sin teléfono ni correo", valor: String(totales.sinDatosDeContacto) },
        { etiqueta: "Con teléfono o correo", valor: String(cantidad - totales.sinDatosDeContacto) },
      ],
    });
  }

  return avisos;
}

/** Lo pendiente por moneda en una línea, y cuántas deudas y con cuántos contactos. */
function resumenDeDeuda(deudas: DeudasConContactos): { valor: string; detalle: string } {
  const cantidad = deudas.totales.reduce((suma, total) => suma + total.deudas, 0);
  return {
    valor: totalesEnPalabras(deudas.totales),
    detalle: `${cantidad} ${plural(cantidad, "deuda pendiente", "deudas pendientes")} con ${deudas.contactos} ${plural(deudas.contactos, "contacto", "contactos")}.`,
  };
}

/** "Les debés": texto, con los contactos de montos más altos como datos de apoyo. */
function armarLoQueDebes(deudas: DeudasConContactos): DatoDeWidget | null {
  if (deudas.totales.length === 0) return null;
  return {
    id: "debes",
    categoria: "texto",
    tipo: "dato",
    tono: "neutro",
    Icono: ArrowUpRight,
    titulo: "Les debés",
    ...resumenDeDeuda(deudas),
    extras: deudas.mayores.map((contacto) => ({
      etiqueta: nombreCompletoDeContacto(contacto),
      valor: formatearMonto(contacto.centavos, contacto.moneda),
    })),
  };
}

/**
 * "Tus contactos te deben": un ranking con quién debe más. Las barras se comparan solo dentro
 * de la misma moneda (un peso y un dólar no se miden con la misma regla).
 */
function armarLoQueTeDeben(deudas: DeudasConContactos): DatoDeWidget | null {
  if (deudas.totales.length === 0) return null;
  const variasMonedas = new Set(deudas.mayores.map((contacto) => contacto.moneda)).size > 1;
  const mayorDe = (moneda: string) =>
    Math.max(
      1,
      ...deudas.mayores
        .filter((contacto) => contacto.moneda === moneda)
        .map((contacto) => contacto.centavos),
    );
  const { valor, detalle } = resumenDeDeuda(deudas);
  return {
    id: "te-deben",
    categoria: "grafico",
    tipo: "dato",
    tono: "neutro",
    Icono: ArrowDownLeft,
    titulo: "Tus contactos te deben",
    // El ranking reemplaza a la cifra grande: el total va en el detalle.
    detalle: `En total, ${valor}: ${detalle.charAt(0).toLocaleLowerCase("es")}${detalle.slice(1)}`,
    visual: {
      tipo: "ranking",
      filas: deudas.mayores.map((contacto) => ({
        // Con varias monedas, un mismo contacto puede aparecer dos veces: la moneda los distingue.
        etiqueta: `${nombreCompletoDeContacto(contacto)}${variasMonedas ? ` (${contacto.moneda})` : ""}`,
        texto: formatearMonto(contacto.centavos, contacto.moneda),
        proporcion: contacto.centavos / mayorDe(contacto.moneda),
        color: "var(--color-exito)",
      })),
    },
  };
}

function armarCifras(datos: WidgetsDeContactos, vencimiento: DatoDeWidget | null): DatoDeWidget[] {
  const { totales, recordatorios, proximoCumpleanos } = datos;
  if (totales.personas + totales.empresas === 0) return [];

  const cumpleanos: DatoDeWidget | null = proximoCumpleanos
    ? {
        id: "proximo-cumpleanos",
        categoria: "texto",
        tipo: "dato",
        tono: proximoCumpleanos.dias === 0 ? "exito" : "neutro",
        Icono: Cake,
        titulo: "Próximo cumpleaños",
        valor: describirDiasRestantes(proximoCumpleanos.dias),
        detalle: `${nombreCompletoDeContacto(proximoCumpleanos)} cumple ${edadQueCumple(proximoCumpleanos.nacimiento, proximoCumpleanos.fecha)} el ${formatearDiaYMes(proximoCumpleanos.fecha)}.`,
        extras: [
          { etiqueta: "Fecha", valor: formatearDiaYMes(proximoCumpleanos.fecha) },
          {
            etiqueta: "Cumple",
            valor: `${edadQueCumple(proximoCumpleanos.nacimiento, proximoCumpleanos.fecha)} años`,
          },
        ],
      }
    : null;

  // Los de hoy ya están en su aviso: el próximo es el primero de mañana en adelante.
  const siguiente = recordatorios.proximos.find((recordatorio) => recordatorio.dias > 0);
  const proximoRecordatorio: DatoDeWidget | null = siguiente
    ? {
        id: "proximo-recordatorio",
        categoria: "texto",
        tipo: "dato",
        tono: "neutro",
        Icono: CalendarClock,
        titulo: "Próximo recordatorio",
        valor: describirDiasRestantes(siguiente.dias),
        detalle: `${siguiente.titulo} (${nombreCompletoDeContacto(siguiente.contacto)}), el ${formatearDiaYMes(siguiente.fecha)}${siguiente.hora ? ` a las ${siguiente.hora}` : ""}.`,
        extras: [
          { etiqueta: "Fecha", valor: formatearDiaYMes(siguiente.fecha) },
          { etiqueta: "Hora", valor: siguiente.hora ?? "Todo el día" },
        ],
      }
    : null;

  // Lo que cayó en la última semana, como lista: qué fue, de quién y cuándo. Sin cifra: la
  // lista es el dato.
  const hace = (dias: number) => (dias === 1 ? "Ayer" : `Hace ${dias} días`);
  const semana: DatoDeWidget | null =
    datos.semanaPasada.length > 0
      ? {
          id: "recordatorios-de-la-semana",
          categoria: "texto",
          tipo: "dato",
          tono: "neutro",
          Icono: History,
          titulo: "Recordatorios de la semana",
          detalle: "Los que cayeron en los últimos 7 días, el más reciente primero.",
          extras: datos.semanaPasada.map((entrada) => ({
            etiqueta: `${entrada.titulo} · ${nombreCompletoDeContacto(entrada.contacto)}`,
            valor: hace(entrada.diasAtras),
          })),
        }
      : null;

  // Cumpleaños por mes, de enero a diciembre, con el mes actual resaltado.
  const totalDeCumpleanos = datos.cumpleanosPorMes.reduce((suma, cantidad) => suma + cantidad, 0);
  const mesActual = Number(datos.hoy.slice(5, 7)) - 1;
  const mayor = Math.max(...datos.cumpleanosPorMes);
  const mesConMas = datos.cumpleanosPorMes.indexOf(mayor);
  const esteMes = datos.cumpleanosPorMes[mesActual] ?? 0;
  const porMes: DatoDeWidget | null =
    totalDeCumpleanos > 0
      ? {
          id: "cumpleanos-por-mes",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: ChartColumn,
          titulo: "Cumpleaños por mes",
          valor: String(totalDeCumpleanos),
          detalle: `${conMayuscula(NOMBRES_DE_MES[mesConMas] ?? "")} es el mes con más (${mayor}). Este mes ${esteMes === 1 ? "hay uno" : `hay ${esteMes}`}. La barra de otro color es este mes.`,
          visual: {
            tipo: "barras",
            valores: datos.cumpleanosPorMes,
            resaltada: mesActual,
            // El color del módulo de Contactos, para que el mes actual se distinga a simple vista.
            colorDeLaResaltada: "var(--color-origen-contactos)",
            etiquetas: NUMEROS_DE_MES,
          },
        }
      : null;

  const teDeben = armarLoQueTeDeben(datos.deudas.teDeben);
  const debes = armarLoQueDebes(datos.deudas.debes);

  // La columna lateral separa por categoría (texto arriba, gráficos abajo); la pantalla de inicio
  // los muestra todos juntos, por eso van intercalados.
  return [
    cumpleanos,
    proximoRecordatorio,
    semana,
    porMes,
    teDeben,
    debes,
    vencimiento?.tipo === "dato" ? vencimiento : null,
  ].filter((widget) => widget !== null);
}

/** Los widgets de Contactos, con los avisos primero. */
export function armarWidgetsDeContactos(datos: WidgetsDeContactos): DatoDeWidget[] {
  const vencimiento = armarVencimiento(datos);
  return [...armarAvisos(datos, vencimiento), ...armarCifras(datos, vencimiento)];
}

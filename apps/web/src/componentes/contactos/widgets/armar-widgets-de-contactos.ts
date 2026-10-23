// Convierte los datos que devuelve la API (GET /api/contactos/widgets) en la lista de
// widgets de Contactos: primero los avisos y después las cifras y curiosidades.
//
// La API cuenta y ordena; acá se escribe en español de todos los días. Es una función
// pura para que sea fácil de leer y de probar: no toca el DOM ni pide nada.

import {
  describirDiasRestantes,
  edadQueCumple,
  formatearDiaYMes,
  formatearMonto,
  NOMBRES_DE_REPETICION,
  nombreCompletoDeContacto,
} from "@gestoria/shared";
import {
  Bell,
  BookUser,
  Cake,
  CalendarClock,
  History,
  Receipt,
  Repeat,
  Star,
  Tag,
  UserPlus,
  UserRoundX,
  Wrench,
} from "lucide-react";
import type { DatoDeWidget } from "@/componentes/widgets/tipos";
import type { WidgetsDeContactos } from "@/lib/api-contactos";

function plural(cantidad: number, singular: string, pluralDe: string): string {
  return cantidad === 1 ? singular : pluralDe;
}

/** "Ana" o "Ana y Beto" o "Ana, Beto y Carla". */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

function armarAvisos(datos: WidgetsDeContactos): DatoDeWidget[] {
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

function armarCifras(datos: WidgetsDeContactos): DatoDeWidget[] {
  const { totales, recordatorios, proximoCumpleanos } = datos;
  const cantidad = totales.personas + totales.empresas;
  if (cantidad === 0) return [];

  const total: DatoDeWidget = {
    id: "total-de-contactos",
    categoria: "grafico",
    tipo: "dato",
    tono: "neutro",
    Icono: BookUser,
    titulo: "Tus contactos",
    valor: String(cantidad),
    detalle: `${totales.personas} ${plural(totales.personas, "persona", "personas")} y ${totales.empresas} ${plural(totales.empresas, "empresa o servicio", "empresas o servicios")}.`,
    visual: {
      tipo: "anillo",
      porcentaje: Math.round((totales.personas / cantidad) * 100),
      color: "var(--color-acento)",
    },
  };

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

  const proximos: DatoDeWidget | null =
    recordatorios.proximos30 > 0
      ? {
          id: "recordatorios-proximos",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: CalendarClock,
          titulo: "Próximos recordatorios",
          valor: String(recordatorios.proximos30),
          detalle: `${recordatorios.proximos30 === 1 ? "Cae" : "Caen"} en los próximos 30 días. Las barras son las próximas cuatro semanas.`,
          visual: { tipo: "barras", valores: recordatorios.porSemana },
        }
      : null;

  const favoritos: DatoDeWidget | null =
    totales.favoritos > 0
      ? {
          id: "favoritos",
          categoria: "texto",
          tipo: "dato",
          tono: "neutro",
          Icono: Star,
          titulo: "Favoritos",
          valor: String(totales.favoritos),
          detalle: `${enumerar(datos.favoritos.map((favorito) => nombreCompletoDeContacto(favorito)))}${totales.favoritos > datos.favoritos.length ? " y más" : ""}.`,
        }
      : null;

  const mayorEtiqueta = datos.etiquetas[0]?.contactos || 1;
  const etiquetas: DatoDeWidget | null =
    datos.etiquetas.length >= 1
      ? {
          id: "etiquetas-principales",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: Tag,
          titulo: "Tus etiquetas",
          detalle: "Las que más contactos tienen.",
          visual: {
            tipo: "ranking",
            filas: datos.etiquetas.map((etiqueta) => ({
              etiqueta: etiqueta.nombre,
              texto: `${etiqueta.contactos}`,
              proporcion: etiqueta.contactos / mayorEtiqueta,
              color: etiqueta.color,
            })),
          },
        }
      : null;

  const mayorRubro = datos.rubros[0]?.empresas || 1;
  const rubros: DatoDeWidget | null =
    datos.rubros.length >= 1
      ? {
          id: "rubros-principales",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: Wrench,
          titulo: "Empresas por rubro",
          detalle: "Los rubros que más se repiten.",
          visual: {
            tipo: "ranking",
            filas: datos.rubros.map((rubro) => ({
              etiqueta: rubro.rubro,
              texto: `${rubro.empresas}`,
              proporcion: rubro.empresas / mayorRubro,
              color: "var(--color-acento)",
            })),
          },
        }
      : null;

  // Con quién más se gastó (movimientos de Finanzas cargados con un contacto), en la moneda base.
  const mayorGasto = datos.masGastado[0]?.gastoCentavos || 1;
  const masGastado: DatoDeWidget | null =
    datos.masGastado.length >= 1
      ? {
          id: "mas-gastado",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: Receipt,
          titulo: "Con quién más gastaste",
          detalle: "En los últimos 90 días, según los movimientos que cargaste con un contacto.",
          visual: {
            tipo: "ranking",
            filas: datos.masGastado.map((contacto) => ({
              etiqueta: nombreCompletoDeContacto(contacto),
              texto: formatearMonto(contacto.gastoCentavos, datos.monedaBase),
              proporcion: contacto.gastoCentavos / mayorGasto,
              color: "var(--color-acento)",
            })),
          },
        }
      : null;

  // El histórico: lo que ya pasó de los recordatorios (también de los que se repiten, que siguen vivos).
  const { historial } = datos;
  const hace = (dias: number) => (dias === 1 ? "ayer" : `hace ${dias} días`);
  const delHistorial: DatoDeWidget | null =
    historial.ultimos7 > 0
      ? {
          id: "historial-reciente",
          categoria: "texto",
          tipo: "dato",
          tono: "neutro",
          Icono: History,
          titulo: "Lo que pasó esta semana",
          valor: String(historial.ultimos7),
          detalle: `${plural(historial.ultimos7, "Recordatorio que ya cayó", "Recordatorios que ya cayeron")} en los últimos 7 días. Quedan en el historial de la pestaña Recordatorios.`,
          extras: historial.ultimas.map((entrada) => ({
            etiqueta: `${entrada.titulo} · ${nombreCompletoDeContacto(entrada.contacto)}`,
            valor: hace(entrada.diasAtras),
          })),
        }
      : null;
  const graficoDelHistorial: DatoDeWidget | null =
    historial.ultimos7 > 0
      ? {
          id: "historial-de-la-semana",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: History,
          titulo: "Historial de la semana",
          valor: String(historial.ultimos7),
          detalle: `Cuántos recordatorios cayeron cada día de los últimos 7. La última barra es ayer. En total, el historial tiene ${historial.total}.`,
          visual: { tipo: "barras", valores: historial.porDia },
        }
      : null;

  // Cómo se reparten los recordatorios vigentes según cada cuánto se repiten.
  const mayorRepeticion = Math.max(1, ...datos.porRepeticion.map((una) => una.total));
  const porRepeticion: DatoDeWidget | null =
    datos.porRepeticion.length > 1
      ? {
          id: "recordatorios-por-repeticion",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: Repeat,
          titulo: "Recordatorios por repetición",
          detalle: "Cuántos recordatorios vigentes tenés según cada cuánto se repiten.",
          visual: {
            tipo: "ranking",
            filas: datos.porRepeticion.map((una) => ({
              etiqueta: NOMBRES_DE_REPETICION[una.repeticion],
              texto: String(una.total),
              proporcion: una.total / mayorRepeticion,
              color: "var(--color-acento)",
            })),
          },
        }
      : null;

  // La columna lateral separa por categoría (texto arriba, gráficos abajo); la pantalla de inicio
  // los muestra todos juntos, por eso van intercalados.
  return [
    total,
    cumpleanos,
    proximos,
    delHistorial,
    graficoDelHistorial,
    porRepeticion,
    masGastado,
    etiquetas,
    favoritos,
    rubros,
  ].filter((widget) => widget !== null);
}

/** Los widgets de Contactos, con los avisos primero. */
export function armarWidgetsDeContactos(datos: WidgetsDeContactos): DatoDeWidget[] {
  return [...armarAvisos(datos), ...armarCifras(datos)];
}

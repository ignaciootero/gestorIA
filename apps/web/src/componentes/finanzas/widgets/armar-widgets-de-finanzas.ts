// Convierte los datos que devuelve la API (GET /api/finanzas/widgets) en la lista
// de widgets de Finanzas: primero los avisos, del más grave al más leve, y después
// las cifras y curiosidades.
//
// La API decide cuándo hay algo que avisar de los presupuestos y las cuentas; acá
// solo se escribe en español de todos los días y se ordena. Es una función pura
// para que sea fácil de leer y de probar: no toca el DOM ni pide nada.

import { formatearFecha, formatearMonto, formatearPorcentaje } from "@gestoria/shared";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  Clock,
  Coins,
  Hash,
  ListOrdered,
  Receipt,
  Scale,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { DatoDeWidget, TonoDeWidget } from "@/componentes/widgets/tipos";
import { totalesEnPalabras } from "@/lib/api-deudas";
import type { WidgetsDeFinanzas } from "@/lib/api-finanzas";

/** Cuántos días sin cargar nada hacen falta para que aparezca el recordatorio. */
const DIAS_SIN_CARGAR_PARA_AVISAR = 3;

/** Cuántas filas de datos de apoyo muestra como máximo un widget (entran tres en la tarjeta grande). */
const MAXIMO_DE_FILAS = 3;

const GRAVEDAD: Record<TonoDeWidget, number> = {
  peligro: 0,
  advertencia: 1,
  info: 2,
  exito: 3,
  neutro: 3,
};

function plural(cantidad: number, singular: string, pluralDe: string): string {
  return cantidad === 1 ? singular : pluralDe;
}

function armarAvisos(datos: WidgetsDeFinanzas): DatoDeWidget[] {
  const { monedaBase: moneda, periodo } = datos;
  const avisos: DatoDeWidget[] = [];

  const [cuentaEnRojo, ...otrasEnRojo] = datos.cuentasEnNegativo;
  if (cuentaEnRojo) {
    avisos.push({
      id: "cuentas-en-rojo",
      tipo: "aviso",
      categoria: "texto",
      tono: "peligro",
      Icono: Wallet,
      titulo: otrasEnRojo.length === 0 ? "Cuenta en rojo" : "Cuentas en rojo",
      valor: formatearMonto(cuentaEnRojo.saldoCentavos, cuentaEnRojo.moneda),
      detalle:
        otrasEnRojo.length === 0
          ? `${cuentaEnRojo.nombre} tiene el saldo en negativo.`
          : `${cuentaEnRojo.nombre} y ${otrasEnRojo.length} ${plural(otrasEnRojo.length, "cuenta más", "cuentas más")} tienen el saldo en negativo.`,
      extras: datos.cuentasEnNegativo.slice(0, MAXIMO_DE_FILAS).map((cuenta) => ({
        etiqueta: cuenta.nombre,
        valor: formatearMonto(cuenta.saldoCentavos, cuenta.moneda),
      })),
    });
  }

  const [superado, ...otrosSuperados] = periodo?.presupuestos.superados ?? [];
  if (superado) {
    avisos.push({
      id: "presupuestos-superados",
      tipo: "aviso",
      categoria: "texto",
      tono: "peligro",
      Icono: Target,
      titulo: otrosSuperados.length === 0 ? "Presupuesto superado" : "Presupuestos superados",
      valor: formatearMonto(superado.diferenciaCentavos, moneda),
      detalle:
        otrosSuperados.length === 0
          ? `Te pasaste en ${superado.nombre}, que ya va por el ${formatearPorcentaje(superado.usadoPorcentaje)} del límite.`
          : `Te pasaste en ${superado.nombre} y en ${otrosSuperados.length} ${plural(otrosSuperados.length, "presupuesto más", "presupuestos más")}.`,
      extras: (periodo?.presupuestos.superados ?? [])
        .slice(0, MAXIMO_DE_FILAS)
        .map((presupuesto) => ({
          etiqueta: presupuesto.nombre,
          valor: `+${formatearMonto(presupuesto.diferenciaCentavos, moneda)}`,
        })),
    });
  }

  const [porAgotarse, ...otrosPorAgotarse] = periodo?.presupuestos.porAgotarse ?? [];
  if (porAgotarse) {
    avisos.push({
      id: "presupuestos-por-agotarse",
      tipo: "aviso",
      categoria: "texto",
      tono: "advertencia",
      Icono: Target,
      titulo:
        otrosPorAgotarse.length === 0 ? "Presupuesto por agotarse" : "Presupuestos por agotarse",
      valor: formatearMonto(porAgotarse.diferenciaCentavos, moneda),
      detalle:
        otrosPorAgotarse.length === 0
          ? `Es lo que te queda en ${porAgotarse.nombre}: ya usaste el ${formatearPorcentaje(porAgotarse.usadoPorcentaje)} del límite.`
          : `Es lo que te queda en ${porAgotarse.nombre}. ${otrosPorAgotarse.length === 1 ? "Otro presupuesto está" : `Otros ${otrosPorAgotarse.length} presupuestos están`} cerca del límite.`,
      extras: (periodo?.presupuestos.porAgotarse ?? [])
        .slice(0, MAXIMO_DE_FILAS)
        .map((presupuesto) => ({
          etiqueta: presupuesto.nombre,
          valor: `${formatearPorcentaje(presupuesto.usadoPorcentaje)} usado`,
        })),
    });
  }

  if (datos.disponible.monedasSinCotizacion.length > 0) {
    avisos.push({
      id: "monedas-sin-cotizacion",
      tipo: "aviso",
      categoria: "texto",
      tono: "advertencia",
      Icono: Coins,
      titulo: "Disponible incompleto",
      detalle: `No hay cotización de ${datos.disponible.monedasSinCotizacion.join(", ")}: esas cuentas no suman al total.`,
      extras: datos.disponible.monedasSinCotizacion.slice(0, MAXIMO_DE_FILAS).map((codigo) => ({
        etiqueta: codigo,
        valor: "Sin cotización",
      })),
    });
  }

  if (periodo === null) {
    avisos.push({
      id: "sin-periodos",
      tipo: "aviso",
      categoria: "texto",
      tono: "info",
      Icono: CalendarPlus,
      titulo: "Todavía sin períodos",
      detalle: "Abrí tu primer período para empezar a registrar movimientos.",
    });
  } else if (!periodo.abierto) {
    avisos.push({
      id: "sin-periodo-abierto",
      tipo: "aviso",
      categoria: "texto",
      tono: "advertencia",
      Icono: CalendarPlus,
      titulo: "Sin período abierto",
      detalle: `${periodo.nombre} ya cerró. Abrí uno nuevo para poder cargar movimientos.`,
    });
  } else if (periodo.diasDesdeElUltimoMovimiento === null) {
    avisos.push({
      id: "sin-movimientos",
      tipo: "aviso",
      categoria: "texto",
      tono: "info",
      Icono: Clock,
      titulo: "Sin movimientos todavía",
      detalle: `No cargaste nada en ${periodo.nombre}. Anotá el primero para empezar a ver tus números.`,
    });
  } else if (periodo.diasDesdeElUltimoMovimiento >= DIAS_SIN_CARGAR_PARA_AVISAR) {
    const dias = periodo.diasDesdeElUltimoMovimiento;
    avisos.push({
      id: "sin-movimientos-recientes",
      tipo: "aviso",
      categoria: "texto",
      tono: "info",
      Icono: Clock,
      titulo: "Hace días que no cargás nada",
      valor: `${dias} ${plural(dias, "día", "días")}`,
      detalle: `Pasó ese tiempo desde el último movimiento que anotaste en ${periodo.nombre}.`,
      extras: [
        { etiqueta: "Período", valor: periodo.nombre },
        { etiqueta: "Movimientos cargados", valor: String(periodo.cantidadDeMovimientos) },
      ],
    });
  }

  // `sort` es estable: a igual gravedad queda el orden en que se armaron.
  return avisos.sort((a, b) => GRAVEDAD[a.tono] - GRAVEDAD[b.tono]);
}

function armarCifras(datos: WidgetsDeFinanzas, zonaHoraria: string | undefined): DatoDeWidget[] {
  const { monedaBase: moneda, periodo } = datos;
  const dinero = (centavos: number) => formatearMonto(centavos, moneda);
  const disponible: DatoDeWidget = {
    id: "disponible",
    categoria: "texto",
    tipo: "dato",
    tono: "neutro",
    Icono: Wallet,
    titulo: "Disponible",
    valor: dinero(datos.disponible.centavos),
    detalle: datos.disponible.esEstimado
      ? "Lo que tenés en todas tus cuentas, con las otras monedas a la cotización de hoy."
      : "Lo que tenés sumando todas tus cuentas.",
    // Del período que se está mirando: lo que se ve en el resto de la pantalla, a mano acá.
    ...(periodo
      ? {
          extras: [
            { etiqueta: `Entró en ${periodo.nombre}`, valor: dinero(periodo.ingresosCentavos) },
            { etiqueta: `Salió en ${periodo.nombre}`, valor: dinero(periodo.gastosCentavos) },
          ],
        }
      : {}),
  };

  // Lo que le deben y lo que debe (módulo de contactos): por moneda, nunca mezcladas.
  const deudaDe = (
    id: string,
    titulo: string,
    Icono: DatoDeWidget["Icono"],
    totales: WidgetsDeFinanzas["deudas"]["meDeben"],
    detalle: string,
  ): DatoDeWidget | null => {
    if (totales.length === 0) return null;
    const cantidad = totales.reduce((suma, total) => suma + total.deudas, 0);
    return {
      id,
      categoria: "texto",
      tipo: "dato",
      tono: "neutro",
      Icono,
      titulo,
      valor: totalesEnPalabras(totales),
      detalle: `${detalle} ${cantidad} ${plural(cantidad, "deuda pendiente", "deudas pendientes")} con ${datos.deudas.contactos} ${plural(datos.deudas.contactos, "contacto", "contactos")}.`,
      // Con más de una moneda, cada una en su renglón: la cifra de arriba las junta en una línea.
      ...(totales.length > 1
        ? {
            extras: totales.map((total) => ({
              etiqueta: total.moneda,
              valor: formatearMonto(total.centavos, total.moneda),
            })),
          }
        : {}),
    };
  };
  const teDeben = deudaDe("te-deben", "Te deben", ArrowDownLeft, datos.deudas.meDeben, "Suman");
  const debes = deudaDe("debes", "Debés", ArrowUpRight, datos.deudas.debo, "Pagos que faltan:");

  // Las deudas no dependen de ningún período: se ven aunque todavía no se haya abierto uno.
  if (periodo === null) return [disponible, teDeben, debes].filter((widget) => widget !== null);

  const anterior = periodo.anterior;
  const dias = periodo.diasTranscurridos;

  const balance: DatoDeWidget = {
    id: "balance",
    categoria: "grafico",
    tipo: "dato",
    tono: periodo.balanceCentavos >= 0 ? "exito" : "peligro",
    Icono: Scale,
    titulo: `Balance de ${periodo.nombre}`,
    valor: dinero(periodo.balanceCentavos),
    detalle: anterior
      ? `Ingresos menos gastos. En ${anterior.nombre} fue ${dinero(anterior.balanceCentavos)}.`
      : "Ingresos menos gastos del período.",
    visual: {
      tipo: "comparacion",
      filas: [
        {
          etiqueta: "Entró",
          texto: dinero(periodo.ingresosCentavos),
          valor: periodo.ingresosCentavos,
          color: "ingreso",
        },
        {
          etiqueta: "Salió",
          texto: dinero(periodo.gastosCentavos),
          valor: periodo.gastosCentavos,
          color: "gasto",
        },
      ],
    },
  };

  // El ritmo compara con el período anterior a esta misma altura: sin anterior, o sin gastos
  // en alguno de los dos, no hay nada que comparar.
  let ritmo: DatoDeWidget | null = null;
  if (
    anterior &&
    periodo.ritmo &&
    anterior.gastosAlMismoDiaCentavos > 0 &&
    periodo.gastosCentavos > 0
  ) {
    const variacion = Math.round(
      ((periodo.gastosCentavos - anterior.gastosAlMismoDiaCentavos) /
        anterior.gastosAlMismoDiaCentavos) *
        100,
    );
    ritmo = {
      id: "ritmo-de-gasto",
      categoria: "grafico",
      tipo: "dato",
      tono: variacion > 0 ? "advertencia" : variacion < 0 ? "exito" : "neutro",
      Icono: variacion < 0 ? TrendingDown : TrendingUp,
      titulo: "Ritmo de gasto",
      valor: `${variacion > 0 ? "+" : variacion < 0 ? "−" : ""}${formatearPorcentaje(Math.abs(variacion))}`,
      detalle: `Llevás ${dinero(periodo.gastosCentavos)}; en ${anterior.nombre} llevabas ${dinero(anterior.gastosAlMismoDiaCentavos)} a esta altura.`,
      visual: {
        tipo: "linea",
        series: [
          { valores: periodo.ritmo.actualCentavos },
          { valores: periodo.ritmo.anteriorCentavos, referencia: true },
        ],
      },
    };
  }

  const categoria = periodo.categoriaPrincipal;
  const categoriaPrincipal: DatoDeWidget | null = categoria
    ? {
        id: "categoria-principal",
        categoria: "grafico",
        tipo: "dato",
        tono: "neutro",
        Icono: Tag,
        titulo: "Donde más gastás",
        valor: categoria.nombre,
        detalle: `${dinero(categoria.totalCentavos)} de tus gastos de ${periodo.nombre}.`,
        visual: {
          tipo: "anillo",
          porcentaje: categoria.porcentajeDelGasto,
          color: categoria.color,
        },
      }
    : null;

  // Hace falta más de un período para que una evolución diga algo.
  const gastoPorPeriodo: DatoDeWidget | null =
    periodo.evolucion.length >= 2
      ? {
          id: "gasto-por-periodo",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: ChartColumn,
          titulo: "Gasto por período",
          valor: dinero(periodo.gastosCentavos),
          detalle: `Tus últimos ${periodo.evolucion.length} períodos; la barra oscura es ${periodo.nombre}.`,
          visual: { tipo: "barras", valores: periodo.evolucion.map((p) => p.gastosCentavos) },
        }
      : null;

  const total = periodo.presupuestos.total;
  const porcentajeDelPresupuesto = total
    ? Math.round((total.gastadoCentavos / total.presupuestadoCentavos) * 100)
    : 0;
  const presupuestos: DatoDeWidget | null = total
    ? {
        id: "presupuestos-del-periodo",
        categoria: "grafico",
        tipo: "dato",
        tono:
          porcentajeDelPresupuesto > 100
            ? "peligro"
            : porcentajeDelPresupuesto >= 80
              ? "advertencia"
              : "neutro",
        Icono: Target,
        titulo: "Presupuestos del período",
        valor: formatearPorcentaje(porcentajeDelPresupuesto),
        detalle: `Gastaste ${dinero(total.gastadoCentavos)} de los ${dinero(total.presupuestadoCentavos)} que presupuestaste.`,
        visual: { tipo: "progreso", porcentaje: porcentajeDelPresupuesto },
        extras: [
          total.gastadoCentavos > total.presupuestadoCentavos
            ? {
                etiqueta: "Te pasaste por",
                valor: dinero(total.gastadoCentavos - total.presupuestadoCentavos),
              }
            : {
                etiqueta: "Te queda",
                valor: dinero(total.presupuestadoCentavos - total.gastadoCentavos),
              },
        ],
      }
    : null;

  const mayor = periodo.gastoMasGrande;
  const gastoMasGrande: DatoDeWidget | null = mayor
    ? {
        id: "gasto-mas-grande",
        categoria: "texto",
        tipo: "dato",
        tono: "neutro",
        Icono: Receipt,
        titulo: "Tu gasto más grande",
        valor: dinero(mayor.importeCentavos),
        detalle: `${mayor.descripcion} (${mayor.categoria}), el ${formatearFecha(mayor.fecha, zonaHoraria)}.`,
        ...(periodo.gastosCentavos > 0
          ? {
              extras: [
                {
                  etiqueta: "Pesa en tus gastos",
                  valor: formatearPorcentaje(
                    Math.round((mayor.importeCentavos / periodo.gastosCentavos) * 100),
                  ),
                },
              ],
            }
          : {}),
      }
    : null;

  // Con una sola categoría el ranking es una barra llena: no dice nada que no diga el anillo.
  const mayorDelRanking = periodo.categoriasPrincipales[0]?.totalCentavos || 1;
  const ranking: DatoDeWidget | null =
    periodo.categoriasPrincipales.length >= 2
      ? {
          id: "mayores-gastos",
          categoria: "grafico",
          tipo: "dato",
          tono: "neutro",
          Icono: ListOrdered,
          titulo: "Tus mayores gastos",
          detalle: `Las categorías en las que más gastaste en ${periodo.nombre}.`,
          visual: {
            tipo: "ranking",
            filas: periodo.categoriasPrincipales.map((otra) => ({
              etiqueta: otra.nombre,
              texto: dinero(otra.totalCentavos),
              proporcion: otra.totalCentavos / mayorDelRanking,
              color: otra.color,
            })),
          },
        }
      : null;

  const hayBarrasPorDia = periodo.gastoDiarioCentavos.length >= 2;
  const gastoPorDia: DatoDeWidget | null =
    periodo.gastosCentavos > 0
      ? {
          id: "gasto-por-dia",
          categoria: hayBarrasPorDia ? "grafico" : "texto",
          tipo: "dato",
          tono: "neutro",
          Icono: CalendarDays,
          titulo: "Gasto por día",
          valor: dinero(periodo.promedioPorDiaCentavos),
          detalle: `Promedio de los ${dias} ${plural(dias, "día", "días")} de ${periodo.nombre}. Las barras son tus últimos días.`,
          ...(hayBarrasPorDia
            ? { visual: { tipo: "barras" as const, valores: periodo.gastoDiarioCentavos } }
            : {}),
        }
      : null;

  const movimientos: DatoDeWidget | null =
    periodo.cantidadDeMovimientos > 0
      ? {
          id: "cantidad-de-movimientos",
          categoria: "texto",
          tipo: "dato",
          tono: "neutro",
          Icono: Hash,
          titulo: "Movimientos cargados",
          valor: String(periodo.cantidadDeMovimientos),
          detalle: `Entre ingresos y gastos de ${periodo.nombre}.`,
          extras: [
            { etiqueta: "Promedio por día", valor: dinero(periodo.promedioPorDiaCentavos) },
            ...(periodo.diasDesdeElUltimoMovimiento !== null
              ? [
                  {
                    etiqueta: "Último cargado",
                    valor:
                      periodo.diasDesdeElUltimoMovimiento === 0
                        ? "hoy"
                        : `hace ${periodo.diasDesdeElUltimoMovimiento} ${plural(periodo.diasDesdeElUltimoMovimiento, "día", "días")}`,
                  },
                ]
              : []),
          ],
        }
      : null;

  // La columna lateral separa por categoría (texto arriba, gráficos abajo) y respeta este orden
  // dentro de cada una; la pantalla de inicio los muestra todos juntos, así que acá van
  // intercalados los de texto y los gráficos.
  return [
    disponible,
    balance,
    ritmo,
    categoriaPrincipal,
    gastoPorPeriodo,
    presupuestos,
    gastoMasGrande,
    ranking,
    gastoPorDia,
    teDeben,
    debes,
    movimientos,
  ].filter((widget) => widget !== null);
}

/** Los widgets de Finanzas, con los avisos primero. `zonaHoraria` es la de la persona o del dispositivo. */
export function armarWidgetsDeFinanzas(
  datos: WidgetsDeFinanzas,
  zonaHoraria?: string,
): DatoDeWidget[] {
  return [...armarAvisos(datos), ...armarCifras(datos, zonaHoraria)];
}

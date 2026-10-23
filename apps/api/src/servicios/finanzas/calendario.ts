// Lo que Finanzas aporta al calendario: el día en que vence cada deuda pendiente.
//
// No se guarda nada: se lee de las deudas que tienen fecha límite y todavía no están saldadas.
// Una deuda saldada ya no vence, y una sin fecha límite no tiene día en el calendario.

import type { ClienteDb } from "@gestoria/db";
import {
  type EventoDeCalendario,
  formatearMonto,
  nombreCompletoDeContacto,
  type RangoDeEventos,
} from "@gestoria/shared";
import { type Deuda, deudasPendientesConLimiteEnRango } from "./deudas.ts";

function aEvento(deuda: Deuda, dia: string): EventoDeCalendario {
  const nombre = deuda.contacto ? nombreCompletoDeContacto(deuda.contacto) : deuda.nombreLibre;
  const monto = formatearMonto(deuda.pendienteCentavos, deuda.moneda);
  return {
    id: `deuda:${deuda.id}`,
    origen: "finanzas",
    titulo: `Vence: ${deuda.concepto}`,
    detalle:
      deuda.sentido === "debo" ? `Le debés ${monto} a ${nombre}` : `${nombre} te debe ${monto}`,
    dia,
    // Una fecha límite es un día, no una hora.
    hora: null,
    repeticion: null,
    completado: false,
    fallido: false,
  };
}

/** Los vencimientos de deudas pendientes dentro del rango, de la persona. */
export async function eventosDeFinanzas(
  cliente: ClienteDb,
  userId: string,
  rango: RangoDeEventos,
): Promise<EventoDeCalendario[]> {
  const deudas = await deudasPendientesConLimiteEnRango(cliente, userId, rango.desde, rango.hasta);
  return deudas.flatMap((deuda) => (deuda.fechaLimite ? [aEvento(deuda, deuda.fechaLimite)] : []));
}

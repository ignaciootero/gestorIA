// Lo que Finanzas aporta al calendario: el día en que vence cada deuda.
//
// No se guarda nada: se lee de las deudas que tienen fecha límite (una sin fecha límite no tiene día en
// el calendario). Vienen las pendientes y también las saldadas, marcadas como completadas: el filtro del
// calendario las separa en pendientes, atrasadas (venció y no se saldó) y pagadas, y por defecto oculta
// las pagadas.

import type { ClienteDb } from "@gestoria/db";
import {
  type EventoDeCalendario,
  formatearMonto,
  nombreCompletoDeContacto,
  type RangoDeEventos,
} from "@gestoria/shared";
import { type Deuda, deudasConLimiteEnRango } from "./deudas.ts";

/** Con quién y cuánto: lo que falta si está pendiente, o el total si ya se saldó. */
function detalleDe(deuda: Deuda): string {
  const nombre = deuda.contacto ? nombreCompletoDeContacto(deuda.contacto) : deuda.nombreLibre;
  if (deuda.saldada) {
    const total = formatearMonto(deuda.montoCentavos, deuda.moneda);
    return deuda.sentido === "debo"
      ? `Le pagaste ${total} a ${nombre}`
      : `${nombre} te pagó ${total}`;
  }
  const monto = formatearMonto(deuda.pendienteCentavos, deuda.moneda);
  return deuda.sentido === "debo" ? `Le debés ${monto} a ${nombre}` : `${nombre} te debe ${monto}`;
}

function aEvento(deuda: Deuda, dia: string): EventoDeCalendario {
  return {
    id: `deuda:${deuda.id}`,
    origen: "finanzas",
    titulo: `Vence: ${deuda.concepto}`,
    detalle: detalleDe(deuda),
    dia,
    // Una fecha límite es un día, no una hora.
    hora: null,
    repeticion: null,
    // Saldada es "pagada" en el filtro del calendario.
    completado: deuda.saldada,
    fallido: false,
  };
}

/** Los vencimientos de deudas (pendientes y saldadas) dentro del rango, de la persona. */
export async function eventosDeFinanzas(
  cliente: ClienteDb,
  userId: string,
  rango: RangoDeEventos,
): Promise<EventoDeCalendario[]> {
  const deudas = await deudasConLimiteEnRango(cliente, userId, rango.desde, rango.hasta);
  return deudas.flatMap((deuda) => (deuda.fechaLimite ? [aEvento(deuda, deuda.fechaLimite)] : []));
}

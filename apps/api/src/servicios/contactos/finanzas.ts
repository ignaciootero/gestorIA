// Lo que une a un contacto con Finanzas: los movimientos que se cargaron con él y las deudas.
//
// La ficha de un contacto muestra "plata" con esa persona o empresa: cuánto se gastó y cuánto se
// cobró en total (en la moneda base, con el importe ya convertido que guarda cada movimiento), los
// últimos movimientos y las deudas. Todo filtra por la persona de la sesión.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import {
  type Deuda,
  listarDeudas,
  type ResumenDeDeudas,
  resumenDeDeudas,
} from "../finanzas/deudas.ts";
import { obtenerMonedaBase } from "../finanzas/moneda-base.ts";
import { listarMovimientos, type Movimiento } from "../finanzas/movimientos.ts";

const MOVIMIENTOS_RECIENTES = 5;

export type FinanzasDeUnContacto = {
  monedaBase: string;
  movimientos: {
    /** Los más recientes. */
    recientes: Movimiento[];
    /** Cuántos hay en total con este contacto. */
    cantidad: number;
    /** Sumas en la moneda base: es el importe convertido que guarda cada movimiento. */
    gastosCentavos: number;
    ingresosCentavos: number;
  };
  deudas: {
    /** Las pendientes, la más reciente primero. */
    pendientes: Deuda[];
    /** Cuánto falta, por moneda. */
    resumen: ResumenDeDeudas;
    /** Cuántas ya están saldadas. */
    saldadas: number;
  };
};

/** Devuelve null si el contacto no existe, es de otra persona o está eliminado. */
export async function obtenerFinanzasDeContacto(
  cliente: ClienteDb,
  userId: string,
  contactoId: string,
): Promise<FinanzasDeUnContacto | null> {
  const contacto = await cliente.db.query.contactos.findFirst({
    where: (tabla, { eq: eqCol, and: andCol, isNull: isNullCol }) =>
      andCol(
        eqCol(tabla.id, contactoId),
        eqCol(tabla.userId, userId),
        isNullCol(tabla.eliminadoEn),
      ),
    columns: { id: true },
  });
  if (!contacto) return null;

  const { movimientos } = esquema;
  const [monedaBase, recientes, sumas, pendientes, resumen, saldadas] = await Promise.all([
    obtenerMonedaBase(cliente, userId),
    listarMovimientos(cliente, userId, { contactoId, limit: MOVIMIENTOS_RECIENTES }),
    cliente.db
      .select({
        tipo: movimientos.tipo,
        total: sql<number>`coalesce(sum(${movimientos.importeConvertidoCentavos}), 0)`.mapWith(
          Number,
        ),
        cantidad: count(),
      })
      .from(movimientos)
      .where(
        and(
          eq(movimientos.userId, userId),
          eq(movimientos.contactoId, contactoId),
          isNull(movimientos.eliminadoEn),
        ),
      )
      .groupBy(movimientos.tipo),
    listarDeudas(cliente, userId, { contactoId, estado: "pendientes", limit: 100 }),
    resumenDeDeudas(cliente, userId, { contactoId }),
    listarDeudas(cliente, userId, { contactoId, estado: "saldadas", limit: 1 }),
  ]);

  const suma = (tipo: string) => sumas.find((fila) => fila.tipo === tipo)?.total ?? 0;

  return {
    monedaBase,
    movimientos: {
      recientes: recientes.movimientos,
      cantidad: recientes.total,
      gastosCentavos: suma("gasto"),
      ingresosCentavos: suma("ingreso"),
    },
    deudas: { pendientes: pendientes.deudas, resumen, saldadas: saldadas.total },
  };
}

/** Un contacto para elegir en un selector (por ejemplo, al cargar un movimiento). */
export type OpcionDeContacto = {
  id: string;
  tipo: "persona" | "empresa";
  nombre: string;
  apellido: string | null;
};

/** Tope de la lista de opciones: un selector con más que esto no se puede usar bien. */
export const MAXIMO_DE_OPCIONES = 500;

/** Los contactos activos de la persona por nombre, solo lo necesario para elegir uno. */
export async function opcionesDeContactos(
  cliente: ClienteDb,
  userId: string,
): Promise<OpcionDeContacto[]> {
  const filas = await cliente.db
    .select({
      id: esquema.contactos.id,
      tipo: esquema.contactos.tipo,
      nombre: esquema.contactos.nombre,
      apellido: esquema.contactos.apellido,
    })
    .from(esquema.contactos)
    .where(and(eq(esquema.contactos.userId, userId), isNull(esquema.contactos.eliminadoEn)))
    .orderBy(
      sql`lower(${esquema.contactos.nombre})`,
      sql`lower(coalesce(${esquema.contactos.apellido}, ''))`,
    )
    .limit(MAXIMO_DE_OPCIONES);
  return filas.map((fila) => ({ ...fila, tipo: fila.tipo as OpcionDeContacto["tipo"] }));
}

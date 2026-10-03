// Auditoria de acciones de admin: quien, que, a quien y cuando.
//
// Vive separada de cuentas.ts porque la llaman lugares distintos: las rutas del
// panel (aprobar, rechazar) y el hook de Better Auth en crear-auth.ts (bloquear,
// desbloquear, resetear contraseña), que no conoce el resto de servicios de
// cuentas.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import type { AccionAuditoria } from "@gestoria/shared";
import { and, count, eq, gte, lte } from "drizzle-orm";

export type NuevaEntradaAuditoria = {
  /** null para acciones hechas desde la consola, sin sesión de admin que atribuir. */
  adminId: string | null;
  accion: AccionAuditoria;
  /** Cuenta afectada. Ausente en acciones que no apuntan a una cuenta puntual. */
  objetivoId?: string | null;
  /** Contexto legible (por ejemplo, el motivo de un bloqueo). Nunca un secreto. */
  detalle?: string | null;
};

export async function registrarAuditoria(
  cliente: ClienteDb,
  entrada: NuevaEntradaAuditoria,
): Promise<void> {
  await cliente.db.insert(esquema.auditoria).values({
    adminId: entrada.adminId,
    accion: entrada.accion,
    objetivoId: entrada.objetivoId ?? null,
    detalle: entrada.detalle ?? null,
  });
}

/** Datos minimos de quien aparece en una entrada, tal como los pinta el panel. */
export type PersonaEnAuditoria = { id: string; usuario: string | null; email: string };

export type EntradaAuditoria = {
  id: string;
  accion: AccionAuditoria;
  detalle: string | null;
  creadoEn: Date;
  /** null si la cuenta que hizo la accion ya no existe. */
  admin: PersonaEnAuditoria | null;
  /** null si la accion no apuntaba a una cuenta, o si esa cuenta ya no existe. */
  objetivo: PersonaEnAuditoria | null;
};

const LIMITE_MAXIMO = 200;

/**
 * Lista la auditoria, de la mas reciente a la mas vieja.
 *
 * Resuelve admin y objetivo con una segunda consulta en vez de un join: son
 * como mucho dos IDs por fila y evita tener que armar un self-join con alias
 * solo para esto.
 */
export async function listarAuditoria(
  cliente: ClienteDb,
  opciones: {
    limit?: number | undefined;
    offset?: number | undefined;
    accion?: AccionAuditoria | undefined;
    /** Incluye el día entero: se compara contra las 00:00:00 de esa fecha. */
    desde?: Date | undefined;
    /** Incluye el día entero: se compara contra las 23:59:59,999 de esa fecha. */
    hasta?: Date | undefined;
    /** El historial de una cuenta puntual: el perfil de admin lo usa así. */
    objetivoId?: string | undefined;
  } = {},
): Promise<{ entradas: EntradaAuditoria[]; total: number }> {
  const limit = Math.min(opciones.limit ?? 50, LIMITE_MAXIMO);
  const offset = opciones.offset ?? 0;

  const condiciones = [
    opciones.accion ? eq(esquema.auditoria.accion, opciones.accion) : undefined,
    opciones.desde ? gte(esquema.auditoria.creadoEn, opciones.desde) : undefined,
    opciones.hasta ? lte(esquema.auditoria.creadoEn, opciones.hasta) : undefined,
    opciones.objetivoId ? eq(esquema.auditoria.objetivoId, opciones.objetivoId) : undefined,
  ].filter((condicion) => condicion !== undefined);
  const donde = condiciones.length > 0 ? and(...condiciones) : undefined;

  const [filas, [totalFila]] = await Promise.all([
    cliente.db.query.auditoria.findMany({
      where: () => donde,
      limit,
      offset,
      orderBy: (tabla, { desc }) => desc(tabla.creadoEn),
    }),
    cliente.db.select({ total: count() }).from(esquema.auditoria).where(donde),
  ]);

  const idsInvolucrados = [
    ...new Set(
      filas.flatMap((fila) => [fila.adminId, fila.objetivoId]).filter((id) => id !== null),
    ),
  ];

  const personas =
    idsInvolucrados.length === 0
      ? []
      : await cliente.db.query.usuarios.findMany({
          where: (tabla, { inArray }) => inArray(tabla.id, idsInvolucrados),
          columns: { id: true, username: true, email: true },
        });

  const porId = new Map(personas.map((persona) => [persona.id, persona]));

  function referencia(id: string | null): PersonaEnAuditoria | null {
    if (id === null) return null;
    const persona = porId.get(id);
    // La cuenta ya no existe (se borró): el id queda en la fila pero sin FK.
    return persona
      ? { id: persona.id, usuario: persona.username, email: persona.email }
      : { id, usuario: null, email: "(cuenta eliminada)" };
  }

  return {
    entradas: filas.map((fila) => ({
      id: fila.id,
      accion: fila.accion as AccionAuditoria,
      detalle: fila.detalle,
      creadoEn: fila.creadoEn,
      admin: referencia(fila.adminId),
      objetivo: referencia(fila.objetivoId),
    })),
    total: totalFila?.total ?? 0,
  };
}

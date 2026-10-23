// Lógica de negocio de las etiquetas de contactos ("Familia", "Proveedores"...).
//
// Cada persona tiene las suyas; toda consulta filtra por `userId`, que sale siempre
// de la sesión. Son configuración vigente: eliminar una etiqueta la borra en duro y
// se la quita a todos los contactos que la tenían (el vínculo cae en cascada), sin
// tocar a los contactos.
//
// Cada persona arranca con unas etiquetas por defecto (ETIQUETAS_POR_DEFECTO: Familia, Amigos,
// Trabajo, Servicios), que son suyas como cualquier otra y puede eliminar. Se crean la primera vez
// que se miran sus etiquetas, no al registrarse: así también las tienen las cuentas que ya
// existían, y no dependen de por dónde se creó la cuenta. Una marca en el usuario
// (`etiquetasInicialesCreadas`) evita que vuelvan a aparecer después de eliminarlas.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { colorMasDistinto, ETIQUETAS_POR_DEFECTO, MAXIMO_DE_ETIQUETAS } from "@gestoria/shared";
import { and, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { EtiquetaDeUnContacto } from "./contactos.ts";

export type Etiqueta = {
  id: number;
  nombre: string;
  color: string;
  /** Cuántos contactos (no eliminados) la tienen. */
  contactos: number;
};

export class NombreDeEtiquetaEnUso extends Error {}
export class LimiteDeEtiquetas extends Error {}

function violaNombreUnico(error: unknown): boolean {
  const origen = (error as { cause?: unknown } | null)?.cause ?? error;
  return (
    typeof origen === "object" &&
    origen !== null &&
    (origen as { code?: unknown }).code === "23505" &&
    (origen as { constraint?: unknown }).constraint ===
      "etiquetas_de_contactos_usuario_nombre_unico"
  );
}

/**
 * Le crea a la persona las etiquetas por defecto, una sola vez en la vida de la cuenta. Quien ya
 * tenía etiquetas propias no recibe ninguna (solo se le anota que ya pasó). Todo va en una
 * transacción: si dos pedidos llegan a la vez, el segundo espera al primero y ya las encuentra.
 */
async function asegurarEtiquetasPorDefecto(cliente: ClienteDb, userId: string): Promise<void> {
  await cliente.db.transaction(async (tx) => {
    const reclamada = await tx
      .update(esquema.usuarios)
      .set({ etiquetasInicialesCreadas: true })
      .where(
        and(eq(esquema.usuarios.id, userId), eq(esquema.usuarios.etiquetasInicialesCreadas, false)),
      )
      .returning({ id: esquema.usuarios.id });
    if (reclamada.length === 0) return;

    const [fila] = await tx
      .select({ total: count() })
      .from(esquema.etiquetasDeContactos)
      .where(eq(esquema.etiquetasDeContactos.userId, userId));
    if ((fila?.total ?? 0) > 0) return;

    await tx
      .insert(esquema.etiquetasDeContactos)
      .values(ETIQUETAS_POR_DEFECTO.map(({ nombre, color }) => ({ userId, nombre, color })))
      .onConflictDoNothing();
  });
}

/** Las etiquetas de la persona por nombre, con cuántos contactos usa cada una. */
export async function listarEtiquetas(cliente: ClienteDb, userId: string): Promise<Etiqueta[]> {
  await asegurarEtiquetasPorDefecto(cliente, userId);
  const [filas, usos] = await Promise.all([
    cliente.db
      .select({
        id: esquema.etiquetasDeContactos.id,
        nombre: esquema.etiquetasDeContactos.nombre,
        color: esquema.etiquetasDeContactos.color,
      })
      .from(esquema.etiquetasDeContactos)
      .where(eq(esquema.etiquetasDeContactos.userId, userId))
      .orderBy(sql`lower(${esquema.etiquetasDeContactos.nombre})`),
    cliente.db
      .select({ etiquetaId: esquema.etiquetasPorContacto.etiquetaId, total: count() })
      .from(esquema.etiquetasPorContacto)
      .innerJoin(
        esquema.contactos,
        eq(esquema.contactos.id, esquema.etiquetasPorContacto.contactoId),
      )
      .where(and(eq(esquema.contactos.userId, userId), isNull(esquema.contactos.eliminadoEn)))
      .groupBy(esquema.etiquetasPorContacto.etiquetaId),
  ]);

  const porEtiqueta = new Map(usos.map((fila) => [fila.etiquetaId, fila.total]));
  return filas.map((fila) => ({ ...fila, contactos: porEtiqueta.get(fila.id) ?? 0 }));
}

/**
 * Las etiquetas de varios contactos con una sola consulta, por nombre. Los contactos sin etiquetas
 * no figuran en el mapa. No filtra por persona: los ids tienen que venir de contactos ya verificados.
 */
export async function etiquetasDeLosContactos(
  cliente: ClienteDb,
  contactoIds: string[],
): Promise<Map<string, EtiquetaDeUnContacto[]>> {
  const porContacto = new Map<string, EtiquetaDeUnContacto[]>();
  if (contactoIds.length === 0) return porContacto;

  const filas = await cliente.db
    .select({
      contactoId: esquema.etiquetasPorContacto.contactoId,
      id: esquema.etiquetasDeContactos.id,
      nombre: esquema.etiquetasDeContactos.nombre,
      color: esquema.etiquetasDeContactos.color,
    })
    .from(esquema.etiquetasPorContacto)
    .innerJoin(
      esquema.etiquetasDeContactos,
      eq(esquema.etiquetasDeContactos.id, esquema.etiquetasPorContacto.etiquetaId),
    )
    .where(inArray(esquema.etiquetasPorContacto.contactoId, contactoIds))
    .orderBy(sql`lower(${esquema.etiquetasDeContactos.nombre})`);

  for (const { contactoId, ...etiqueta } of filas) {
    porContacto.set(contactoId, [...(porContacto.get(contactoId) ?? []), etiqueta]);
  }
  return porContacto;
}

async function existeConNombre(
  cliente: ClienteDb,
  userId: string,
  nombre: string,
  excluirId?: number,
): Promise<boolean> {
  const fila = await cliente.db.query.etiquetasDeContactos.findFirst({
    where: () =>
      and(
        eq(esquema.etiquetasDeContactos.userId, userId),
        sql`lower(${esquema.etiquetasDeContactos.nombre}) = lower(${nombre})`,
        excluirId === undefined ? undefined : ne(esquema.etiquetasDeContactos.id, excluirId),
      ),
    columns: { id: true },
  });
  return fila !== undefined;
}

/** Sin `color`, toma el más distinto de los que ya tiene la persona. */
export async function crearEtiqueta(
  cliente: ClienteDb,
  userId: string,
  nombre: string,
  color?: string,
): Promise<Etiqueta> {
  await asegurarEtiquetasPorDefecto(cliente, userId);
  const existentes = await cliente.db
    .select({ color: esquema.etiquetasDeContactos.color })
    .from(esquema.etiquetasDeContactos)
    .where(eq(esquema.etiquetasDeContactos.userId, userId));

  if (existentes.length >= MAXIMO_DE_ETIQUETAS) throw new LimiteDeEtiquetas();
  if (await existeConNombre(cliente, userId, nombre)) throw new NombreDeEtiquetaEnUso();

  try {
    const [fila] = await cliente.db
      .insert(esquema.etiquetasDeContactos)
      .values({
        userId,
        nombre,
        color: color ?? colorMasDistinto(existentes.map((existente) => existente.color)),
      })
      .returning({
        id: esquema.etiquetasDeContactos.id,
        nombre: esquema.etiquetasDeContactos.nombre,
        color: esquema.etiquetasDeContactos.color,
      });
    if (!fila) throw new Error("No se pudo crear la etiqueta.");
    return { ...fila, contactos: 0 };
  } catch (error) {
    if (violaNombreUnico(error)) throw new NombreDeEtiquetaEnUso();
    throw error;
  }
}

/** Cambia el nombre y, si viene, el color. Devuelve null si no existe o es de otra persona. */
export async function editarEtiqueta(
  cliente: ClienteDb,
  userId: string,
  id: number,
  nombre: string,
  color?: string,
): Promise<Etiqueta | null> {
  if (await existeConNombre(cliente, userId, nombre, id)) throw new NombreDeEtiquetaEnUso();

  try {
    const [fila] = await cliente.db
      .update(esquema.etiquetasDeContactos)
      .set({ nombre, ...(color === undefined ? {} : { color }) })
      .where(
        and(
          eq(esquema.etiquetasDeContactos.id, id),
          eq(esquema.etiquetasDeContactos.userId, userId),
        ),
      )
      .returning({ id: esquema.etiquetasDeContactos.id });
    if (!fila) return null;
  } catch (error) {
    if (violaNombreUnico(error)) throw new NombreDeEtiquetaEnUso();
    throw error;
  }

  const etiquetas = await listarEtiquetas(cliente, userId);
  return etiquetas.find((etiqueta) => etiqueta.id === id) ?? null;
}

/** Borra la etiqueta y se la quita a sus contactos. Devuelve false si no existe o es de otra persona. */
export async function eliminarEtiqueta(
  cliente: ClienteDb,
  userId: string,
  id: number,
): Promise<boolean> {
  const filas = await cliente.db
    .delete(esquema.etiquetasDeContactos)
    .where(
      and(eq(esquema.etiquetasDeContactos.id, id), eq(esquema.etiquetasDeContactos.userId, userId)),
    )
    .returning({ id: esquema.etiquetasDeContactos.id });
  return filas.length > 0;
}

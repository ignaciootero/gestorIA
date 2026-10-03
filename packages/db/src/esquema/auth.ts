// Tablas de autenticacion (Better Auth).
//
// El esquema lo impone Better Auth, asi que los *campos* conservan sus nombres
// (`name`, `emailVerified`, `role`, `banned`): son parte de su API y cambiarlos
// obligaria a mapear cada uno a mano. Los nombres de *tabla* si estan en
// español, para que la base se lea igual que el resto del dominio, y los campos
// propios del proyecto tambien (ver docs/guias/convenciones.md).
//
// El mapeo de tablas se declara en apps/api/src/auth/opciones.ts (`modelName`).
// Las columnas salen en snake_case solas, por `casing: "snake_case"` del cliente.

import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Marcas de tiempo en UTC, como toda fecha del sistema (CLAUDE.md). */
const creadoEn = timestamp({ withTimezone: true }).notNull().defaultNow();
const actualizadoEn = timestamp({ withTimezone: true }).notNull().defaultNow();

export const usuarios = pgTable(
  "usuarios",
  {
    id: text().primaryKey(),

    // --- Campos de Better Auth ---
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    // Plugin username: `username` guarda la version normalizada en minusculas
    // (es la que se compara) y `displayUsername` la que escribio la persona.
    username: text(),
    displayUsername: text(),
    // Plugin admin.
    role: text().notNull().default("usuario"),
    banned: boolean().notNull().default(false),
    banReason: text(),
    banExpires: timestamp({ withTimezone: true }),
    createdAt: creadoEn,
    updatedAt: actualizadoEn,

    // --- Campos propios del proyecto ---
    nombre: text().notNull(),
    apellido: text().notNull(),
    /** pendiente | aprobado | rechazado. Ver packages/shared, ESTADOS_CUENTA. */
    estado: text().notNull().default("pendiente"),
    /**
     * Cuándo se fijó el `estado` actual: mientras la cuenta sigue pendiente,
     * coincide con `createdAt` (la fecha de la solicitud); en cuanto se aprueba
     * o se rechaza, pasa a ser esa fecha. Un solo campo alcanza para las tres
     * fechas que el panel de admin necesita mostrar y ordenar.
     */
    estadoActualizadoEn: timestamp({ withTimezone: true }).notNull().defaultNow(),
    zonaHoraria: text().notNull().default("America/Montevideo"),
    monedaPorDefecto: text().notNull().default("UYU"),
    /** Tras un reseteo de contraseña, obliga a cambiarla en el proximo login. */
    debeCambiarPassword: boolean().notNull().default(false),
  },
  (tabla) => [
    uniqueIndex("usuarios_email_unico").on(tabla.email),
    uniqueIndex("usuarios_username_unico").on(tabla.username),
    // El panel de admin lista las solicitudes pendientes: este indice evita que
    // esa consulta recorra toda la tabla cuando crezca.
    index("usuarios_estado_idx").on(tabla.estado),
  ],
);

export const sesiones = pgTable(
  "sesiones",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    token: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    // Lo agrega el plugin de admin. Siempre queda nulo: la impersonacion esta
    // bloqueada en apps/api/src/auth/opciones.ts.
    impersonatedBy: text(),
    createdAt: creadoEn,
    updatedAt: actualizadoEn,
  },
  (tabla) => [
    uniqueIndex("sesiones_token_unico").on(tabla.token),
    // Cerrar todas las sesiones de una persona (reseteo de contraseña, bloqueo)
    // filtra por usuario.
    index("sesiones_usuario_idx").on(tabla.userId),
  ],
);

export const cuentas = pgTable(
  "cuentas",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    idToken: text(),
    /** Hash de la contraseña. Nunca se registra en logs ni sale en respuestas. */
    password: text(),
    createdAt: creadoEn,
    updatedAt: actualizadoEn,
  },
  (tabla) => [
    index("cuentas_usuario_idx").on(tabla.userId),
    uniqueIndex("cuentas_proveedor_unico").on(tabla.providerId, tabla.accountId),
  ],
);

export const verificaciones = pgTable(
  "verificaciones",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: creadoEn,
    updatedAt: actualizadoEn,
  },
  (tabla) => [index("verificaciones_identificador_idx").on(tabla.identifier)],
);

/**
 * Contador de rate limiting de Better Auth.
 *
 * Se guarda en la base y no en memoria para que el limite sobreviva a un
 * reinicio y funcione aunque mañana haya mas de un proceso de la API.
 */
export const limitesPeticiones = pgTable(
  "limites_peticiones",
  {
    id: text().primaryKey(),
    key: text(),
    count: integer(),
    // Better Auth guarda aca milisegundos desde la epoca, no una fecha.
    lastRequest: bigint({ mode: "number" }),
  },
  (tabla) => [index("limites_peticiones_key_idx").on(tabla.key)],
);

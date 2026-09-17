// Estados de una cuenta y roles, compartidos por API, web y movil.

/**
 * Estado de aprobacion de una cuenta.
 *
 * El registro es publico pero con aprobacion manual: toda cuenta nueva entra
 * como "pendiente" y no puede iniciar sesion hasta que un admin la apruebe
 * (ver CLAUDE.md, seccion Autenticacion y administracion).
 */
export const ESTADOS_CUENTA = {
  pendiente: "pendiente",
  aprobado: "aprobado",
  rechazado: "rechazado",
} as const;

export type EstadoCuenta = (typeof ESTADOS_CUENTA)[keyof typeof ESTADOS_CUENTA];

export const ESTADOS_CUENTA_VALIDOS = Object.values(ESTADOS_CUENTA);

/** Roles del sistema. El admin gestiona cuentas; nunca ve datos ajenos. */
export const ROLES = {
  usuario: "usuario",
  admin: "admin",
} as const;

export type Rol = (typeof ROLES)[keyof typeof ROLES];

export const ROLES_VALIDOS = Object.values(ROLES);

/** Zona horaria y moneda por defecto: es-UY (ver docs/guias/convenciones.md). */
export const ZONA_HORARIA_POR_DEFECTO = "America/Montevideo";
export const MONEDA_POR_DEFECTO = "UYU";

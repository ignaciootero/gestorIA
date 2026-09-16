// Punto de entrada del paquete de base de datos.
// Ver docs/funcionalidades.md para el panorama general.

export type { ClienteDb } from "./cliente.ts";
export { crearClienteDb } from "./cliente.ts";
export type { ConfigBaseDatos } from "./entorno.ts";
export { describirConexion, leerConfigBaseDatos } from "./entorno.ts";
export * as esquema from "./esquema/index.ts";

// Punto de entrada de las utilidades de prueba compartidas.
// Fabricas de datos y fixtures que reusan los tests de toda la aplicacion.

export type { DatosUsuarioDePrueba } from "./fabricas/usuarios.ts";
export {
  crearUsuarioDePrueba,
  OTRA_PASSWORD_VALIDA,
  PASSWORD_EN_EL_LIMITE,
} from "./fabricas/usuarios.ts";

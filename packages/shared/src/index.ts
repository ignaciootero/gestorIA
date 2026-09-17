// Punto de entrada del paquete compartido: esquemas Zod, tipos y constantes que
// usan la API, la web y el movil.

export type { CamposAdicionalesUsuario } from "./auth/campos-usuario.ts";
export { CAMPOS_ADICIONALES_USUARIO } from "./auth/campos-usuario.ts";
export type { DatosCambioPassword, DatosLogin, DatosRegistro } from "./auth/esquemas.ts";
export {
  esquemaApellido,
  esquemaCambioPassword,
  esquemaEmail,
  esquemaLogin,
  esquemaNombre,
  esquemaPassword,
  esquemaReenvioVerificacion,
  esquemaRegistro,
  esquemaRegistroServidor,
  esquemaUsuario,
  LARGO_MAXIMO_CAMPO,
  LARGO_MAXIMO_EMAIL,
  LARGO_MAXIMO_PASSWORD,
  LARGO_MAXIMO_USUARIO,
  LARGO_MINIMO_PASSWORD,
  LARGO_MINIMO_USUARIO,
  pareceEmail,
} from "./auth/esquemas.ts";
export type { EstadoCuenta, Rol } from "./auth/estados.ts";
export {
  ESTADOS_CUENTA,
  ESTADOS_CUENTA_VALIDOS,
  MONEDA_POR_DEFECTO,
  ROLES,
  ROLES_VALIDOS,
  ZONA_HORARIA_POR_DEFECTO,
} from "./auth/estados.ts";
export type { CampoInvalido, CodigoError, RespuestaError } from "./errores/codigos.ts";
export { CODIGOS_ERROR, esRespuestaError } from "./errores/codigos.ts";
export {
  DESCRIPCION_APP,
  NOMBRE_APP,
  NOMBRE_APP_PARTES,
  tituloDePantalla,
} from "./marca.ts";

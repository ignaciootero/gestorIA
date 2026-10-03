// Punto de entrada del paquete compartido: esquemas Zod, tipos y constantes que
// usan la API, la web y el movil.

export type { AccionAuditoria } from "./admin/auditoria.ts";
export { ACCIONES_AUDITORIA } from "./admin/auditoria.ts";
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
export { colorMasDistinto, distanciaDeColor } from "./finanzas/colores.ts";
export type { TipoMovimiento } from "./finanzas/constantes.ts";
export {
  CATEGORIA_DE_TRANSFERENCIA,
  CATEGORIAS_POR_DEFECTO,
  CUENTAS_FINANCIERAS_POR_DEFECTO,
  SISTEMA_TRANSFERENCIA,
  TIPOS_MOVIMIENTO,
  TIPOS_MOVIMIENTO_VALIDOS,
} from "./finanzas/constantes.ts";
export type {
  DatosAbrirPeriodo,
  DatosAjusteDeSaldo,
  DatosCategoria,
  DatosCerrarPeriodo,
  DatosCuentaFinanciera,
  DatosMovimiento,
  DatosPresupuesto,
  DatosReemplazarCategoria,
  DatosRenombrarCuentaFinanciera,
  DatosRenombrarPeriodo,
} from "./finanzas/esquemas.ts";
export {
  esquemaAbrirPeriodo,
  esquemaAjusteDeSaldo,
  esquemaCamposDeMovimiento,
  esquemaCerrarPeriodo,
  esquemaColorCategoria,
  esquemaCrearCategoria,
  esquemaCrearCuentaFinanciera,
  esquemaDescripcion,
  esquemaFechaHora,
  esquemaIdCategoria,
  esquemaImporte,
  esquemaMovimiento,
  esquemaNombreCategoria,
  esquemaNombreCuentaFinanciera,
  esquemaNombrePeriodo,
  esquemaPresupuesto,
  esquemaReemplazarCategoria,
  esquemaRenombrarCuentaFinanciera,
  esquemaRenombrarPeriodo,
  esquemaSaldoInicial,
  IMPORTE_MAXIMO,
  LARGO_MAXIMO_DESCRIPCION,
  LARGO_MAXIMO_NOMBRE,
  validarDestinoDeTransferencia,
} from "./finanzas/esquemas.ts";
export { nombreDelMes, nombreDelMesYAnio, sugerirNombreDePeriodo } from "./finanzas/periodos.ts";
export { formatearFecha, formatearFechaHora } from "./formato/fecha.ts";
export {
  darFormatoAImporteEscrito,
  interpretarImporteEscrito,
  normalizarImportePegado,
  separadoresDeImporte,
  textoDeImporte,
} from "./formato/importe-escrito.ts";
export { centavosDesdeImporte, formatearMonto, importeDesdeCentavos } from "./formato/moneda.ts";
export {
  DESCRIPCION_APP,
  NOMBRE_APP,
  NOMBRE_APP_PARTES,
  tituloDePantalla,
} from "./marca.ts";

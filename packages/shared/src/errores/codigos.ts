// Codigos de error estables de la API.
//
// Viven en el paquete compartido porque son un contrato de tres puntas: la API
// los emite, y la web y el movil los traducen a mensajes para el usuario.
// Renombrar uno rompe a los clientes, asi que no se tocan a la ligera.
//
// Se usa un objeto `as const` y no un enum de TypeScript porque el proyecto
// compila con "erasableSyntaxOnly" (ver packages/config/tsconfig.base.json).

export const CODIGOS_ERROR = {
  VALIDACION_INVALIDA: "VALIDACION_INVALIDA",
  NO_AUTENTICADO: "NO_AUTENTICADO",
  SIN_PERMISO: "SIN_PERMISO",
  NO_ENCONTRADO: "NO_ENCONTRADO",
  CONFLICTO: "CONFLICTO",
  DEMASIADOS_INTENTOS: "DEMASIADOS_INTENTOS",
  BASE_NO_DISPONIBLE: "BASE_NO_DISPONIBLE",
  ERROR_INTERNO: "ERROR_INTERNO",

  // Autenticacion
  CREDENCIALES_INVALIDAS: "CREDENCIALES_INVALIDAS",
  EMAIL_NO_VERIFICADO: "EMAIL_NO_VERIFICADO",
  CUENTA_PENDIENTE: "CUENTA_PENDIENTE",
  CUENTA_RECHAZADA: "CUENTA_RECHAZADA",
  CUENTA_BLOQUEADA: "CUENTA_BLOQUEADA",
  USUARIO_EN_USO: "USUARIO_EN_USO",
  EMAIL_EN_USO: "EMAIL_EN_USO",
  DEBE_CAMBIAR_PASSWORD: "DEBE_CAMBIAR_PASSWORD",
} as const;

export type CodigoError = (typeof CODIGOS_ERROR)[keyof typeof CODIGOS_ERROR];

/** Detalle por campo, solo en errores de validacion. */
export type CampoInvalido = {
  campo: string;
  mensaje: string;
};

/**
 * Cuerpo de toda respuesta de error de la API.
 * Nunca incluye stack traces, SQL ni detalles internos: eso va al log.
 */
export type RespuestaError = {
  error: {
    codigo: CodigoError;
    mensaje: string;
    campos?: CampoInvalido[];
    idPeticion: string;
  };
};

/** Distingue una respuesta de error de la API de cualquier otro JSON. */
export function esRespuestaError(valor: unknown): valor is RespuestaError {
  if (typeof valor !== "object" || valor === null || !("error" in valor)) return false;
  const error = (valor as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    "codigo" in error &&
    typeof (error as { codigo: unknown }).codigo === "string"
  );
}

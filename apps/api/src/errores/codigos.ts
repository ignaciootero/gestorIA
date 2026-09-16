// Codigos de error estables de la API.
//
// Son parte del contrato con los clientes: web y movil traducen estos codigos a
// mensajes propios, asi que no se renombran a la ligera (docs/guias/convenciones.md).
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
} as const;

export type CodigoError = (typeof CODIGOS_ERROR)[keyof typeof CODIGOS_ERROR];

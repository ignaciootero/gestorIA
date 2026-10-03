// Acciones de admin que quedan en la tabla de auditoria, compartidas por API y
// web (CLAUDE.md, Panel de admin).

export const ACCIONES_AUDITORIA = {
  cuentaAprobada: "cuenta_aprobada",
  cuentaRechazada: "cuenta_rechazada",
  cuentaBloqueada: "cuenta_bloqueada",
  cuentaDesbloqueada: "cuenta_desbloqueada",
  passwordReseteada: "password_reseteada",
} as const;

export type AccionAuditoria = (typeof ACCIONES_AUDITORIA)[keyof typeof ACCIONES_AUDITORIA];

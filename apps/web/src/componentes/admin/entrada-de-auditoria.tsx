// Una fila del historial de auditoría: quién, qué acción y a quién.
//
// La usan tanto la pestaña de Auditoría (todo el historial) como el perfil de
// una cuenta (solo lo que le pasó a esa cuenta puntual), así que vive aparte
// en vez de duplicarse en los dos lugares.

import type { AccionAuditoria } from "@gestoria/shared";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import type { EntradaAuditoria, PersonaEnAuditoria } from "@/lib/api-admin";

export const DESCRIPCION_DE_ACCION: Record<AccionAuditoria, string> = {
  cuenta_aprobada: "aprobó la cuenta de",
  cuenta_rechazada: "rechazó la cuenta de",
  cuenta_bloqueada: "bloqueó a",
  cuenta_desbloqueada: "desbloqueó a",
  password_reseteada: "reseteó la contraseña de",
};

/**
 * Para cuando se oculta a quién ("esa persona" ya es la cuenta del perfil):
 * sin esto la frase quedaba cortada a mitad de camino ("bloqueó a", sin
 * nadie después).
 */
const DESCRIPCION_DE_ACCION_SIN_OBJETIVO: Record<AccionAuditoria, string> = {
  cuenta_aprobada: "aprobó esta cuenta",
  cuenta_rechazada: "rechazó esta cuenta",
  cuenta_bloqueada: "bloqueó esta cuenta",
  cuenta_desbloqueada: "desbloqueó esta cuenta",
  password_reseteada: "reseteó la contraseña de esta cuenta",
};

export const ETIQUETA_DE_ACCION: Record<AccionAuditoria, string> = {
  cuenta_aprobada: "Cuenta aprobada",
  cuenta_rechazada: "Cuenta rechazada",
  cuenta_bloqueada: "Cuenta bloqueada",
  cuenta_desbloqueada: "Cuenta desbloqueada",
  password_reseteada: "Contraseña reseteada",
};

/**
 * Quien hizo la acción. `null` es "nunca tuvo admin", no "se borró": las
 * aprobaciones y rechazos hechos con `pnpm usuario:aprobar` (sin sesión) se
 * registran igual, para que no falten del historial, pero sin nadie a quien
 * atribuírselos.
 */
function nombreDeAdmin(persona: PersonaEnAuditoria | null): string {
  if (!persona) return "Acción por consola";
  return persona.usuario ?? persona.email;
}

/** A quién le pasó. Acá `null` sí es "la cuenta ya no existe". */
function nombreDeObjetivo(persona: PersonaEnAuditoria | null): string {
  if (!persona) return "(cuenta eliminada)";
  return persona.usuario ?? persona.email;
}

/**
 * `ocultarObjetivo` es para el perfil de una cuenta: repetir su nombre en
 * cada fila ("aprobó la cuenta de Ana Pérez", "bloqueó a Ana Pérez"...) es
 * redundante cuando las diez filas hablan de la misma persona.
 */
export function EntradaDeAuditoria({
  entrada,
  ocultarObjetivo = false,
}: {
  entrada: EntradaAuditoria;
  ocultarObjetivo?: boolean;
}) {
  return (
    <Tarjeta className="flex flex-col gap-1 p-4 text-sm">
      <p>
        <span className="font-medium text-texto">{nombreDeAdmin(entrada.admin)}</span>{" "}
        {ocultarObjetivo ? (
          <span className="text-texto-secundario">
            {DESCRIPCION_DE_ACCION_SIN_OBJETIVO[entrada.accion]}
          </span>
        ) : (
          <>
            <span className="text-texto-secundario">{DESCRIPCION_DE_ACCION[entrada.accion]}</span>{" "}
            <span className="font-medium text-texto">{nombreDeObjetivo(entrada.objetivo)}</span>
          </>
        )}
      </p>
      {entrada.detalle ? <p className="text-texto-secundario">Motivo: {entrada.detalle}</p> : null}
      <p className="text-xs text-texto-secundario">
        {new Date(entrada.creadoEn).toLocaleString("es-UY")}
      </p>
    </Tarjeta>
  );
}

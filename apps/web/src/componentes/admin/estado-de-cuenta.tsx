// Cómo se pinta el estado de una cuenta (insignia y fecha asociada).
//
// Lo usan tanto el listado de cuentas como el perfil de una cuenta puntual.

import type { EstadoCuenta } from "@gestoria/shared";
import { Clock, type LucideIcon, ShieldCheck, XCircle } from "lucide-react";
import type { TonoInsignia } from "@/componentes/ui/insignia";

export const INSIGNIA_DE_ESTADO: Record<
  EstadoCuenta,
  { tono: TonoInsignia; icono: LucideIcon; texto: string }
> = {
  pendiente: { tono: "advertencia", icono: Clock, texto: "Pendiente" },
  aprobado: { tono: "exito", icono: ShieldCheck, texto: "Aprobada" },
  rechazado: { tono: "peligro", icono: XCircle, texto: "Rechazada" },
};

/** Etiqueta de `estadoActualizadoEn`, que cambia de sentido según el estado. */
export const ETIQUETA_FECHA_DE_ESTADO: Record<EstadoCuenta, string> = {
  pendiente: "Solicitada el",
  aprobado: "Aprobada el",
  rechazado: "Rechazada el",
};

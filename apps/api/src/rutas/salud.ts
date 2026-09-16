// Endpoint de salud: sirve para saber si la API está viva y si la base responde.
//
// Lo usan el despliegue (Coolify) y los chequeos manuales. No expone datos ni
// requiere sesion, asi que devuelve solo lo minimo: nada de versiones de
// PostgreSQL, rutas ni configuracion, que serviria de reconocimiento a un atacante.

import type { ClienteDb } from "@gestoria/db";
import { Hono } from "hono";
import { errores } from "../errores/error-api.ts";
import type { EntornoHono } from "../tipos.ts";

const VERSION = process.env["npm_package_version"] ?? "desconocida";

export function rutasDeSalud(cliente: ClienteDb): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.get("/health", async (c) => {
    const inicio = performance.now();

    try {
      await cliente.verificarConexion();
    } catch (error) {
      // El manejador central lo convierte en un 503 con codigo BASE_NO_DISPONIBLE
      // y manda el detalle tecnico al log, no a la respuesta.
      throw errores.baseNoDisponible(error);
    }

    // Un chequeo de salud cacheado no sirve para nada.
    c.header("Cache-Control", "no-store");

    return c.json({
      estado: "ok",
      version: VERSION,
      base: {
        estado: "ok",
        duracionMs: Math.round(performance.now() - inicio),
      },
      tiempo: new Date().toISOString(),
    });
  });

  return rutas;
}

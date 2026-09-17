// Datos de la persona que tiene la sesion abierta.
//
// Better Auth ya expone /api/auth/get-session, pero devuelve su propia forma.
// Este endpoint entrega solo lo que los clientes necesitan para pintar la
// interfaz, en nuestro vocabulario, y sin campos internos de la libreria.

import { Hono } from "hono";
import { errores } from "../errores/error-api.ts";
import type { EntornoHono } from "../tipos.ts";

export function rutasDeSesion(): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.get("/api/yo", (c) => {
    const sesion = c.get("sesion");
    if (!sesion) {
      throw errores.noAutenticado();
    }

    const { user: usuario } = sesion;

    // Lista explicita: si mañana Better Auth agrega un campo interno, no se
    // filtra solo por estar en el objeto.
    return c.json({
      id: usuario.id,
      usuario: usuario.displayUsername ?? usuario.username,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      rol: usuario.role,
      estado: usuario.estado,
      zonaHoraria: usuario.zonaHoraria,
      monedaPorDefecto: usuario.monedaPorDefecto,
      debeCambiarPassword: usuario.debeCambiarPassword,
    });
  });

  return rutas;
}

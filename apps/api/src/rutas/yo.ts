// Datos de la persona que tiene la sesion abierta.
//
// Better Auth ya expone /api/auth/get-session, pero devuelve su propia forma.
// Este endpoint entrega solo lo que los clientes necesitan para pintar la
// interfaz, en nuestro vocabulario, y sin campos internos de la libreria.

import type { ClienteDb } from "@gestoria/db";
import { esquemaColoresDeAcento, esquemaFondos, leerAjustesDelFondo } from "@gestoria/shared";
import { Hono } from "hono";
import type { z } from "zod";
import { errores } from "../errores/error-api.ts";
import { exigirSesion } from "../middlewares/sesion.ts";
import { guardarColoresDeAcento, guardarFondos } from "../servicios/usuarios/colores-de-acento.ts";
import type { EntornoHono } from "../tipos.ts";

function detalleDe(problema: z.ZodError): { campo: string; mensaje: string }[] {
  return problema.issues.map((issue) => ({
    campo: issue.path.join(".") || "(raíz)",
    mensaje: issue.message,
  }));
}

export function rutasDeSesion(cliente: ClienteDb): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  // Solo para cambiar los colores: GET /api/yo tiene que seguir respondiendo a quien debe cambiar
  // la contraseña (así la web sabe que tiene que mandarla a cambiarla).
  rutas.use("/api/yo/colores", exigirSesion);
  rutas.use("/api/yo/fondo", exigirSesion);

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
      coloresDeAcento: {
        claro: usuario.colorDeAcentoClaro ?? null,
        oscuro: usuario.colorDeAcentoOscuro ?? null,
      },
      fondo: {
        claro: leerAjustesDelFondo(usuario.fondoClaro),
        oscuro: leerAjustesDelFondo(usuario.fondoOscuro),
      },
    });
  });

  // Los dos colores de acento (uno por modo); null en uno vuelve al color de la app. El id sale
  // de la sesión: cada persona cambia solo los suyos.
  rutas.put("/api/yo/colores", async (c) => {
    const sesion = c.get("sesion");
    if (!sesion) throw errores.noAutenticado();

    const resultado = esquemaColoresDeAcento.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    return c.json(await guardarColoresDeAcento(cliente, sesion.user.id, resultado.data));
  });

  // Los ajustes del fondo animado de los dos modos; null en uno vuelve al fondo de la app.
  rutas.put("/api/yo/fondo", async (c) => {
    const sesion = c.get("sesion");
    if (!sesion) throw errores.noAutenticado();

    const resultado = esquemaFondos.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    return c.json(await guardarFondos(cliente, sesion.user.id, resultado.data));
  });

  return rutas;
}

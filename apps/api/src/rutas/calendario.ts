// Rutas del módulo de calendario.
//
// Cualquier cuenta con sesión puede usarlas (`exigirSesion`). El `userId` sale siempre de la
// sesión, nunca del cuerpo de la petición (CLAUDE.md, Principios de arquitectura): un evento de otra
// persona responde 404, igual que uno que no existe, para no revelar que está.
//
// `GET /api/calendario/eventos?desde=&hasta=` devuelve, ordenado, todo lo que cae en esos días: los
// eventos anotados a mano y lo que aportan Finanzas, Contactos y Tareas. Los eventos manuales se
// crean, editan y eliminan en `/api/calendario/eventos`; lo que viene de otros módulos se cambia en
// su módulo.

import type { ClienteDb } from "@gestoria/db";
import { esquemaEventoDeCalendario, esquemaRangoDeEventos } from "@gestoria/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { errores } from "../errores/error-api.ts";
import { exigirSesion } from "../middlewares/sesion.ts";
import { listarEventosDelCalendario } from "../servicios/calendario/eventos.ts";
import {
  crearEventoManual,
  editarEventoManual,
  eliminarEventoManual,
  LimiteDeEventos,
} from "../servicios/calendario/eventos-manuales.ts";
import type { EntornoHono } from "../tipos.ts";

const esquemaId = z.uuid();

function usuarioDe(c: Context<EntornoHono>): string {
  const sesion = c.get("sesion");
  if (!sesion) throw errores.noAutenticado();
  return sesion.user.id;
}

function detalleDe(problema: z.ZodError): { campo: string; mensaje: string }[] {
  return problema.issues.map((issue) => ({
    campo: issue.path.join(".") || "(raíz)",
    mensaje: issue.message,
  }));
}

export function rutasDeCalendario(cliente: ClienteDb): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.use("/api/calendario/*", exigirSesion);

  rutas.get("/api/calendario/eventos", async (c) => {
    const rango = esquemaRangoDeEventos.safeParse(c.req.query());
    if (!rango.success) throw errores.validacion(detalleDe(rango.error));
    return c.json({ eventos: await listarEventosDelCalendario(cliente, usuarioDe(c), rango.data) });
  });

  rutas.post("/api/calendario/eventos", async (c) => {
    const resultado = esquemaEventoDeCalendario.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      return c.json(await crearEventoManual(cliente, usuarioDe(c), resultado.data), 201);
    } catch (error) {
      if (error instanceof LimiteDeEventos) {
        throw errores.conflicto("Llegaste al máximo de eventos. Eliminá alguno para agregar otro.");
      }
      throw error;
    }
  });

  rutas.put("/api/calendario/eventos/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaEventoDeCalendario.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    const evento = await editarEventoManual(cliente, usuarioDe(c), id, resultado.data);
    if (!evento) throw errores.noEncontrado("No encontramos ese evento.");
    return c.json(evento);
  });

  rutas.delete("/api/calendario/eventos/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    if (!(await eliminarEventoManual(cliente, usuarioDe(c), id))) {
      throw errores.noEncontrado("No encontramos ese evento.");
    }
    return c.json({ ok: true });
  });

  return rutas;
}

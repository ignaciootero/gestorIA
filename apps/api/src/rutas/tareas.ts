// Rutas del módulo de tareas (la lista de to-do).
//
// Cualquier cuenta con sesión puede usarlas (`exigirSesion`). El `userId` sale siempre de la
// sesión, nunca del cuerpo de la petición (CLAUDE.md, Principios de arquitectura): una tarea de
// otra persona responde 404, igual que una que no existe, para no revelar que está.
//
// Las rutas fijas (`/categorias`, `/widgets`, `/historial`, `/repetitivas`) van antes de `/:id`.

import type { ClienteDb } from "@gestoria/db";
import {
  esquemaCategoriaDeTarea,
  esquemaCompletarTarea,
  esquemaFallarTarea,
  esquemaFiltrosDeHistorial,
  esquemaTarea,
  esquemaTareaRepetitiva,
} from "@gestoria/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { errores } from "../errores/error-api.ts";
import { exigirSesion } from "../middlewares/sesion.ts";
import {
  CategoriaDeTareaEnUso,
  CategoriaDeTareaInvalida,
  crearCategoriaDeTarea,
  editarCategoriaDeTarea,
  eliminarCategoriaDeTarea,
  LimiteDeCategoriasDeTarea,
  listarCategoriasDeTareas,
  NombreDeCategoriaDeTareaEnUso,
} from "../servicios/tareas/categorias.ts";
import {
  crearTareaRepetitiva,
  editarTareaRepetitiva,
  eliminarTareaRepetitiva,
  InicioEnElPasado,
  LimiteDeTareasRepetitivas,
  listarTareasRepetitivas,
} from "../servicios/tareas/repetitivas.ts";
import {
  completarTarea,
  crearTarea,
  editarTarea,
  eliminarTarea,
  fallarTarea,
  LimiteDeTareas,
  listarHistorial,
  listarTareasDeHoy,
  TareaEnElPasado,
  TareaFutura,
} from "../servicios/tareas/tareas.ts";
import { obtenerWidgetsDeTareas } from "../servicios/tareas/widgets.ts";
import type { EntornoHono } from "../tipos.ts";

const esquemaId = z.uuid();
const esquemaIdNumerico = z.coerce.number().int().positive();

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

/** Los errores del servicio que son datos mal elegidos o topes se explican en la pantalla. */
function tareaInvalidaComoError(error: unknown): never {
  if (error instanceof CategoriaDeTareaInvalida) {
    const mensaje = "Esa categoría ya no existe. Elegí otra o dejala en blanco.";
    throw errores.validacion([{ campo: "categoriaId", mensaje }], mensaje);
  }
  if (error instanceof TareaEnElPasado) {
    const mensaje = "Ese día ya pasó. Elegí hoy o una fecha futura.";
    throw errores.validacion([{ campo: "fecha", mensaje }], mensaje);
  }
  if (error instanceof InicioEnElPasado) {
    const mensaje = "Ese día ya pasó. Elegí hoy o una fecha futura.";
    throw errores.validacion([{ campo: "fechaInicio", mensaje }], mensaje);
  }
  if (error instanceof TareaFutura) {
    throw errores.conflicto("Una tarea de un día futuro todavía no puede marcarse como fallida.");
  }
  if (error instanceof LimiteDeTareas) {
    throw errores.conflicto(
      "Tenés muchas tareas pendientes. Completá o eliminá alguna para agregar otra.",
    );
  }
  if (error instanceof LimiteDeTareasRepetitivas) {
    throw errores.conflicto(
      "Llegaste al máximo de tareas repetitivas. Eliminá alguna para agregar otra.",
    );
  }
  throw error;
}

function cantidad(numero: number, singular: string, plural: string): string {
  return numero === 1 ? `1 ${singular}` : `${numero} ${plural}`;
}

/** Qué la retiene, dicho para una persona: "2 tareas pendientes y 1 tarea repetitiva". */
function usosDeCategoria(error: CategoriaDeTareaEnUso): string {
  const partes = [
    ...(error.tareas > 0 ? [cantidad(error.tareas, "tarea pendiente", "tareas pendientes")] : []),
    ...(error.repetitivas > 0
      ? [cantidad(error.repetitivas, "tarea repetitiva", "tareas repetitivas")]
      : []),
  ];
  return partes.join(" y ");
}

export function rutasDeTareas(cliente: ClienteDb): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.use("/api/tareas/*", exigirSesion);
  rutas.use("/api/tareas", exigirSesion);

  // --- Categorías ---

  rutas.get("/api/tareas/categorias", async (c) => {
    return c.json({ categorias: await listarCategoriasDeTareas(cliente, usuarioDe(c)) });
  });

  rutas.post("/api/tareas/categorias", async (c) => {
    const resultado = esquemaCategoriaDeTarea.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const categoria = await crearCategoriaDeTarea(
        cliente,
        usuarioDe(c),
        resultado.data.nombre,
        resultado.data.color,
      );
      return c.json(categoria, 201);
    } catch (error) {
      if (error instanceof NombreDeCategoriaDeTareaEnUso) {
        throw errores.conflicto("Ya tenés una categoría con ese nombre.");
      }
      if (error instanceof LimiteDeCategoriasDeTarea) {
        throw errores.conflicto(
          "Llegaste al máximo de categorías. Eliminá alguna para crear otra.",
        );
      }
      throw error;
    }
  });

  rutas.patch("/api/tareas/categorias/:id", async (c) => {
    const id = esquemaIdNumerico.parse(c.req.param("id"));
    const resultado = esquemaCategoriaDeTarea.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const categoria = await editarCategoriaDeTarea(
        cliente,
        usuarioDe(c),
        id,
        resultado.data.nombre,
        resultado.data.color,
      );
      if (!categoria) throw errores.noEncontrado("No encontramos esa categoría.");
      return c.json(categoria);
    } catch (error) {
      if (error instanceof NombreDeCategoriaDeTareaEnUso) {
        throw errores.conflicto("Ya tenés una categoría con ese nombre.");
      }
      throw error;
    }
  });

  rutas.delete("/api/tareas/categorias/:id", async (c) => {
    const id = esquemaIdNumerico.parse(c.req.param("id"));
    try {
      if (!(await eliminarCategoriaDeTarea(cliente, usuarioDe(c), id))) {
        throw errores.noEncontrado("No encontramos esa categoría.");
      }
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof CategoriaDeTareaEnUso) {
        throw errores.conflicto(
          `No se puede eliminar: la usan ${usosDeCategoria(error)}. Cambiales la categoría o eliminalas primero.`,
        );
      }
      throw error;
    }
  });

  // --- Widgets, historial y tareas repetitivas ---

  rutas.get("/api/tareas/widgets", async (c) => {
    return c.json(await obtenerWidgetsDeTareas(cliente, usuarioDe(c)));
  });

  rutas.get("/api/tareas/historial", async (c) => {
    const filtros = esquemaFiltrosDeHistorial.safeParse(c.req.query());
    if (!filtros.success) throw errores.validacion(detalleDe(filtros.error));
    return c.json(await listarHistorial(cliente, usuarioDe(c), filtros.data));
  });

  rutas.get("/api/tareas/repetitivas", async (c) => {
    return c.json({ repetitivas: await listarTareasRepetitivas(cliente, usuarioDe(c)) });
  });

  rutas.post("/api/tareas/repetitivas", async (c) => {
    const resultado = esquemaTareaRepetitiva.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      return c.json(await crearTareaRepetitiva(cliente, usuarioDe(c), resultado.data), 201);
    } catch (error) {
      return tareaInvalidaComoError(error);
    }
  });

  rutas.put("/api/tareas/repetitivas/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaTareaRepetitiva.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const repetitiva = await editarTareaRepetitiva(cliente, usuarioDe(c), id, resultado.data);
      if (!repetitiva) throw errores.noEncontrado("No encontramos esa tarea repetitiva.");
      return c.json(repetitiva);
    } catch (error) {
      return tareaInvalidaComoError(error);
    }
  });

  rutas.delete("/api/tareas/repetitivas/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    if (!(await eliminarTareaRepetitiva(cliente, usuarioDe(c), id))) {
      throw errores.noEncontrado("No encontramos esa tarea repetitiva.");
    }
    return c.json({ ok: true });
  });

  // --- Tareas ---

  rutas.get("/api/tareas", async (c) => {
    return c.json(await listarTareasDeHoy(cliente, usuarioDe(c)));
  });

  rutas.post("/api/tareas", async (c) => {
    const resultado = esquemaTarea.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      return c.json(await crearTarea(cliente, usuarioDe(c), resultado.data), 201);
    } catch (error) {
      return tareaInvalidaComoError(error);
    }
  });

  rutas.put("/api/tareas/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaTarea.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const tarea = await editarTarea(cliente, usuarioDe(c), id, resultado.data);
      if (!tarea) throw errores.noEncontrado("No encontramos esa tarea.");
      return c.json(tarea);
    } catch (error) {
      return tareaInvalidaComoError(error);
    }
  });

  rutas.patch("/api/tareas/:id/completada", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaCompletarTarea.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    const tarea = await completarTarea(cliente, usuarioDe(c), id, resultado.data.completada);
    if (!tarea) throw errores.noEncontrado("No encontramos esa tarea.");
    return c.json(tarea);
  });

  rutas.patch("/api/tareas/:id/fallida", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaFallarTarea.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const tarea = await fallarTarea(cliente, usuarioDe(c), id, resultado.data.fallida);
      if (!tarea) throw errores.noEncontrado("No encontramos esa tarea.");
      return c.json(tarea);
    } catch (error) {
      return tareaInvalidaComoError(error);
    }
  });

  rutas.delete("/api/tareas/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    if (!(await eliminarTarea(cliente, usuarioDe(c), id))) {
      throw errores.noEncontrado("No encontramos esa tarea.");
    }
    return c.json({ ok: true });
  });

  return rutas;
}

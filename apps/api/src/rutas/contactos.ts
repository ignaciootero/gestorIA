// Rutas del módulo de contactos.
//
// Cualquier cuenta con sesión puede usarlas (`exigirSesion`). El `userId` sale siempre
// de la sesión, nunca del cuerpo de la petición (CLAUDE.md, Principios de
// arquitectura): un contacto, etiqueta o recordatorio de otra persona responde 404,
// igual que uno que no existe, para no revelar que está.
//
// Las rutas fijas (`/etiquetas`, `/recordatorios`, `/widgets`) van antes de `/:id`.

import type { ClienteDb } from "@gestoria/db";
import {
  esquemaContacto,
  esquemaEtiquetaDeContacto,
  esquemaFavorito,
  esquemaRecordatorio,
  REPETICIONES_VALIDAS,
  TIPOS_DE_CONTACTO_VALIDOS,
} from "@gestoria/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { errores } from "../errores/error-api.ts";
import { exigirSesion } from "../middlewares/sesion.ts";
import {
  ContactoConDeudas,
  crearContacto,
  EtiquetaInvalida,
  editarContacto,
  eliminarContacto,
  listarContactos,
  marcarFavorito,
  NacimientoEnElFuturo,
  obtenerContacto,
  TipoDeContactoDistinto,
} from "../servicios/contactos/contactos.ts";
import {
  crearEtiqueta,
  editarEtiqueta,
  eliminarEtiqueta,
  LimiteDeEtiquetas,
  listarEtiquetas,
  NombreDeEtiquetaEnUso,
} from "../servicios/contactos/etiquetas.ts";
import { obtenerFinanzasDeContacto, opcionesDeContactos } from "../servicios/contactos/finanzas.ts";
import {
  eliminarDelHistorial,
  listarHistorial,
  vaciarHistorial,
} from "../servicios/contactos/historial-de-recordatorios.ts";
import {
  crearRecordatorio,
  editarRecordatorio,
  eliminarRecordatorio,
  LimiteDeRecordatorios,
  listarRecordatorios,
  RecordatorioEnElPasado,
} from "../servicios/contactos/recordatorios.ts";
import { obtenerWidgetsDeContactos } from "../servicios/contactos/widgets.ts";
import type { EntornoHono } from "../tipos.ts";

const esquemaId = z.uuid();
const esquemaIdNumerico = z.coerce.number().int().positive();

const esquemaFiltros = z.object({
  tipo: z.enum(TIPOS_DE_CONTACTO_VALIDOS).optional(),
  favoritos: z
    .enum(["true", "false"])
    .transform((valor) => valor === "true")
    .optional(),
  etiquetaId: esquemaIdNumerico.optional(),
  busqueda: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const esquemaFiltrosDeRecordatorios = z.object({
  dias: z.coerce.number().int().min(0).max(366).optional(),
  busqueda: z.string().trim().max(100).optional(),
  repeticion: z.enum(REPETICIONES_VALIDAS).optional(),
  contactoId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const esquemaFiltrosDelHistorial = z.object({
  busqueda: z.string().trim().max(100).optional(),
  repeticion: z.enum(REPETICIONES_VALIDAS).optional(),
  contactoId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

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

/** Los errores del servicio que son datos mal elegidos se muestran junto al campo. */
function contactoInvalidoComoValidacion(error: unknown): never {
  if (error instanceof EtiquetaInvalida) {
    const mensaje = "Alguna de las etiquetas elegidas ya no existe. Revisalas y probá de nuevo.";
    throw errores.validacion([{ campo: "etiquetaIds", mensaje }], mensaje);
  }
  if (error instanceof NacimientoEnElFuturo) {
    const mensaje = "La fecha de nacimiento no puede ser posterior a hoy.";
    throw errores.validacion([{ campo: "fechaNacimiento", mensaje }], mensaje);
  }
  if (error instanceof TipoDeContactoDistinto) {
    throw errores.conflicto(
      "No se puede cambiar una persona por una empresa (ni al revés). Creá otro contacto.",
    );
  }
  throw error;
}

function recordatorioInvalidoComoValidacion(error: unknown): never {
  if (error instanceof RecordatorioEnElPasado) {
    const mensaje =
      "Ese día ya pasó. Elegí hoy o una fecha futura, o hacelo repetir para que siga avisando.";
    throw errores.validacion([{ campo: "fecha", mensaje }], mensaje);
  }
  if (error instanceof LimiteDeRecordatorios) {
    throw errores.conflicto(
      "Este contacto ya tiene muchos recordatorios. Eliminá alguno para agregar otro.",
    );
  }
  throw error;
}

export function rutasDeContactos(cliente: ClienteDb): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.use("/api/contactos/*", exigirSesion);
  rutas.use("/api/contactos", exigirSesion);

  // --- Etiquetas ---

  rutas.get("/api/contactos/etiquetas", async (c) => {
    return c.json({ etiquetas: await listarEtiquetas(cliente, usuarioDe(c)) });
  });

  rutas.post("/api/contactos/etiquetas", async (c) => {
    const resultado = esquemaEtiquetaDeContacto.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const etiqueta = await crearEtiqueta(
        cliente,
        usuarioDe(c),
        resultado.data.nombre,
        resultado.data.color,
      );
      return c.json(etiqueta, 201);
    } catch (error) {
      if (error instanceof NombreDeEtiquetaEnUso) {
        throw errores.conflicto("Ya tenés una etiqueta con ese nombre.");
      }
      if (error instanceof LimiteDeEtiquetas) {
        throw errores.conflicto("Llegaste al máximo de etiquetas. Eliminá alguna para crear otra.");
      }
      throw error;
    }
  });

  rutas.patch("/api/contactos/etiquetas/:id", async (c) => {
    const id = esquemaIdNumerico.parse(c.req.param("id"));
    const resultado = esquemaEtiquetaDeContacto.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const etiqueta = await editarEtiqueta(
        cliente,
        usuarioDe(c),
        id,
        resultado.data.nombre,
        resultado.data.color,
      );
      if (!etiqueta) throw errores.noEncontrado("No encontramos esa etiqueta.");
      return c.json(etiqueta);
    } catch (error) {
      if (error instanceof NombreDeEtiquetaEnUso) {
        throw errores.conflicto("Ya tenés una etiqueta con ese nombre.");
      }
      throw error;
    }
  });

  rutas.delete("/api/contactos/etiquetas/:id", async (c) => {
    const id = esquemaIdNumerico.parse(c.req.param("id"));
    if (!(await eliminarEtiqueta(cliente, usuarioDe(c), id))) {
      throw errores.noEncontrado("No encontramos esa etiqueta.");
    }
    return c.json({ ok: true });
  });

  // --- Recordatorios y widgets (de todos los contactos) ---

  rutas.get("/api/contactos/recordatorios", async (c) => {
    const filtros = esquemaFiltrosDeRecordatorios.safeParse(c.req.query());
    if (!filtros.success) throw errores.validacion(detalleDe(filtros.error));
    return c.json(await listarRecordatorios(cliente, usuarioDe(c), filtros.data));
  });

  // El histórico: cada vez que un recordatorio cayó. Eliminarlo no toca los recordatorios.
  rutas.get("/api/contactos/recordatorios/historial", async (c) => {
    const filtros = esquemaFiltrosDelHistorial.safeParse(c.req.query());
    if (!filtros.success) throw errores.validacion(detalleDe(filtros.error));
    return c.json(await listarHistorial(cliente, usuarioDe(c), filtros.data));
  });

  rutas.delete("/api/contactos/recordatorios/historial", async (c) => {
    return c.json({ eliminadas: await vaciarHistorial(cliente, usuarioDe(c)) });
  });

  rutas.delete("/api/contactos/recordatorios/historial/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    if (!(await eliminarDelHistorial(cliente, usuarioDe(c), id))) {
      throw errores.noEncontrado("No encontramos esa entrada del histórico.");
    }
    return c.json({ ok: true });
  });

  /** Los contactos mínimos (id y nombre) para los selectores de otros módulos. */
  rutas.get("/api/contactos/opciones", async (c) => {
    return c.json({ contactos: await opcionesDeContactos(cliente, usuarioDe(c)) });
  });

  rutas.get("/api/contactos/widgets", async (c) => {
    return c.json(await obtenerWidgetsDeContactos(cliente, usuarioDe(c)));
  });

  // --- Contactos ---

  rutas.get("/api/contactos", async (c) => {
    const filtros = esquemaFiltros.safeParse(c.req.query());
    if (!filtros.success) throw errores.validacion(detalleDe(filtros.error));
    return c.json(await listarContactos(cliente, usuarioDe(c), filtros.data));
  });

  rutas.post("/api/contactos", async (c) => {
    const resultado = esquemaContacto.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      return c.json(await crearContacto(cliente, usuarioDe(c), resultado.data), 201);
    } catch (error) {
      return contactoInvalidoComoValidacion(error);
    }
  });

  rutas.get("/api/contactos/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const contacto = await obtenerContacto(cliente, usuarioDe(c), id);
    if (!contacto) throw errores.noEncontrado("No encontramos ese contacto.");
    return c.json(contacto);
  });

  /** La plata con este contacto: movimientos y deudas (módulo de Finanzas). */
  rutas.get("/api/contactos/:id/finanzas", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const finanzas = await obtenerFinanzasDeContacto(cliente, usuarioDe(c), id);
    if (!finanzas) throw errores.noEncontrado("No encontramos ese contacto.");
    return c.json(finanzas);
  });

  rutas.put("/api/contactos/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaContacto.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const contacto = await editarContacto(cliente, usuarioDe(c), id, resultado.data);
      if (!contacto) throw errores.noEncontrado("No encontramos ese contacto.");
      return c.json(contacto);
    } catch (error) {
      return contactoInvalidoComoValidacion(error);
    }
  });

  rutas.patch("/api/contactos/:id/favorito", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaFavorito.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    if (!(await marcarFavorito(cliente, usuarioDe(c), id, resultado.data.favorito))) {
      throw errores.noEncontrado("No encontramos ese contacto.");
    }
    return c.json({ favorito: resultado.data.favorito });
  });

  rutas.delete("/api/contactos/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    try {
      if (!(await eliminarContacto(cliente, usuarioDe(c), id))) {
        throw errores.noEncontrado("No encontramos ese contacto.");
      }
    } catch (error) {
      if (error instanceof ContactoConDeudas) {
        throw errores.conflicto(
          "Este contacto tiene deudas pendientes, así que no se puede eliminar. Registrá los pagos que falten o eliminá las deudas primero.",
        );
      }
      throw error;
    }
    return c.json({ ok: true });
  });

  // --- Recordatorios de un contacto ---

  rutas.post("/api/contactos/:id/recordatorios", async (c) => {
    const contactoId = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaRecordatorio.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const recordatorio = await crearRecordatorio(
        cliente,
        usuarioDe(c),
        contactoId,
        resultado.data,
      );
      if (!recordatorio) throw errores.noEncontrado("No encontramos ese contacto.");
      return c.json(recordatorio, 201);
    } catch (error) {
      return recordatorioInvalidoComoValidacion(error);
    }
  });

  rutas.put("/api/contactos/:id/recordatorios/:recordatorioId", async (c) => {
    const contactoId = esquemaId.parse(c.req.param("id"));
    const recordatorioId = esquemaId.parse(c.req.param("recordatorioId"));
    const resultado = esquemaRecordatorio.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const recordatorio = await editarRecordatorio(
        cliente,
        usuarioDe(c),
        contactoId,
        recordatorioId,
        resultado.data,
      );
      if (!recordatorio) throw errores.noEncontrado("No encontramos ese recordatorio.");
      return c.json(recordatorio);
    } catch (error) {
      return recordatorioInvalidoComoValidacion(error);
    }
  });

  rutas.delete("/api/contactos/:id/recordatorios/:recordatorioId", async (c) => {
    const contactoId = esquemaId.parse(c.req.param("id"));
    const recordatorioId = esquemaId.parse(c.req.param("recordatorioId"));
    if (!(await eliminarRecordatorio(cliente, usuarioDe(c), contactoId, recordatorioId))) {
      throw errores.noEncontrado("No encontramos ese recordatorio.");
    }
    return c.json({ ok: true });
  });

  return rutas;
}

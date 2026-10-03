// Rutas del módulo de ingresos y gastos.
//
// Cualquier cuenta con sesión puede usarlas (a diferencia de rutas/admin.ts,
// acá no hace falta ser admin): solo `exigirSesion`. El `userId` sale siempre
// de la sesión, nunca del cuerpo de la petición (CLAUDE.md, Principios de
// arquitectura).

import type { ClienteDb } from "@gestoria/db";
import {
  centavosDesdeImporte,
  esquemaAbrirPeriodo,
  esquemaAjusteDeSaldo,
  esquemaCerrarPeriodo,
  esquemaCrearCategoria,
  esquemaCrearCuentaFinanciera,
  esquemaMovimiento,
  esquemaPresupuesto,
  esquemaReemplazarCategoria,
  esquemaRenombrarCuentaFinanciera,
  esquemaRenombrarPeriodo,
  formatearFecha,
  formatearFechaHora,
  TIPOS_MOVIMIENTO_VALIDOS,
} from "@gestoria/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { errores } from "../errores/error-api.ts";
import { exigirSesion } from "../middlewares/sesion.ts";
import {
  CategoriaConMovimientos,
  CategoriaDelSistema,
  CategoriaDeReemplazoInvalida,
  crearCategoria,
  eliminarCategoria,
  listarCategorias,
  NombreDeCategoriaEnUso,
  obtenerCategoria,
  reemplazarCategoria,
  renombrarCategoria,
} from "../servicios/finanzas/categorias.ts";
import {
  ajustarSaldoDeCuenta,
  CuentaConMovimientos,
  cambiarVisibilidadDeCuenta,
  crearCuentaFinanciera,
  eliminarCuentaFinanciera,
  historialDeCuenta,
  listarCuentasFinancieras,
  NombreDeCuentaEnUso,
  obtenerCuentaFinanciera,
  renombrarCuentaFinanciera,
  SaldoSinCambios,
} from "../servicios/finanzas/cuentas-financieras.ts";
import {
  evolucionDeCategoria,
  evolucionPorPeriodo,
  gastosPorCategoria,
} from "../servicios/finanzas/estadisticas.ts";
import {
  crearMovimiento,
  duplicarMovimiento,
  editarMovimiento,
  eliminarMovimiento,
  FechaFueraDePeriodos,
  listarMovimientos,
  ReferenciaInvalida,
} from "../servicios/finanzas/movimientos.ts";
import {
  AperturaEnElFuturo,
  AperturaSolapada,
  abrirPeriodo,
  CierreDejaMovimientosFuera,
  CierreEnElFuturo,
  CierreNoPosteriorALaApertura,
  cerrarPeriodo,
  eliminarPeriodo,
  listarPeriodos,
  MovimientoNuevoAlEliminar,
  NombreDePeriodoEnUso,
  obtenerPeriodo,
  obtenerZonaHoraria,
  PeriodoNoCerrado,
  PeriodoYaCerrado,
  ReaperturaSolapada,
  reabrirPeriodo,
  renombrarPeriodo,
  YaHayPeriodoAbierto,
} from "../servicios/finanzas/periodos.ts";
import {
  CategoriaInexistente,
  CategoriaSinPresupuesto,
  eliminarPresupuesto,
  fijarPresupuesto,
  listarPresupuestos,
} from "../servicios/finanzas/presupuestos.ts";
import { obtenerResumen } from "../servicios/finanzas/resumen.ts";
import type { EntornoHono } from "../tipos.ts";

/** El id de una cuenta o de un movimiento. */
const esquemaId = z.uuid();

/** El número interno de un período o de una categoría (nunca se le muestra a la persona). */
const esquemaIdNumerico = z.coerce.number().int().positive();
const esquemaIdPeriodo = esquemaIdNumerico;
const esquemaIdCategoria = esquemaIdNumerico;

const esquemaPaginacionHistorial = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const esquemaFiltrosMovimientos = z.object({
  periodoId: esquemaIdPeriodo.optional(),
  categoriaId: esquemaIdCategoria.optional(),
  cuentaFinancieraId: z.uuid().optional(),
  tipo: z.enum(TIPOS_MOVIMIENTO_VALIDOS).optional(),
  busqueda: z.string().trim().max(140).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * El importe viaja en pesos en la entrada (lo que escribe la persona) y en
 * centésimos en la salida (mismo criterio que ya usan las cuentas: ver
 * `saldoInicial`/`saldoInicialCentavos` más abajo).
 */
function aMovimientoParaGuardar(datos: z.infer<typeof esquemaMovimiento>) {
  const { importe, fecha, ...resto } = datos;
  return { ...resto, fecha: new Date(fecha), importeCentavos: centavosDesdeImporte(importe) };
}

function usuarioDe(c: Context<EntornoHono>): string {
  const sesion = c.get("sesion");
  if (!sesion) throw errores.noAutenticado();
  return sesion.user.id;
}

export function rutasDeFinanzas(cliente: ClienteDb): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.use("/api/finanzas/*", exigirSesion);

  // --- Categorías ---

  rutas.get("/api/finanzas/categorias", async (c) => {
    const categorias = await listarCategorias(cliente, usuarioDe(c));
    return c.json({ categorias });
  });

  rutas.post("/api/finanzas/categorias", async (c) => {
    const resultado = esquemaCrearCategoria.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const categoria = await crearCategoria(
        cliente,
        usuarioDe(c),
        resultado.data.nombre,
        resultado.data.color,
      );
      return c.json(categoria, 201);
    } catch (error) {
      if (error instanceof NombreDeCategoriaEnUso) {
        throw errores.conflicto("Ya tenés una categoría con ese nombre.");
      }
      throw error;
    }
  });

  rutas.patch("/api/finanzas/categorias/:id", async (c) => {
    const id = esquemaIdCategoria.parse(c.req.param("id"));
    const resultado = esquemaCrearCategoria.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const categoria = await renombrarCategoria(
        cliente,
        usuarioDe(c),
        id,
        resultado.data.nombre,
        resultado.data.color,
      );
      if (!categoria) throw errores.noEncontrado("No encontramos esa categoría.");
      return c.json(categoria);
    } catch (error) {
      if (error instanceof NombreDeCategoriaEnUso) {
        throw errores.conflicto("Ya tenés una categoría con ese nombre.");
      }
      throw error;
    }
  });

  rutas.delete("/api/finanzas/categorias/:id", async (c) => {
    const id = esquemaIdCategoria.parse(c.req.param("id"));

    try {
      const borrada = await eliminarCategoria(cliente, usuarioDe(c), id);
      if (!borrada) throw errores.noEncontrado("No encontramos esa categoría.");
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof CategoriaDelSistema) {
        throw errores.conflicto("Esta categoría es especial y no se puede eliminar.");
      }
      if (error instanceof CategoriaConMovimientos) {
        throw errores.conflicto(
          "Esta categoría tiene movimientos, así que no se puede eliminar. Podés reemplazarla por otra categoría: sus movimientos pasan a la que elijas.",
        );
      }
      throw error;
    }
  });

  /**
   * Reemplaza una categoría con movimientos por otra (existente o nueva): todos
   * sus movimientos, también los históricos, pasan a la categoría elegida y la
   * original se elimina.
   */
  rutas.post("/api/finanzas/categorias/:id/reemplazar", async (c) => {
    const id = esquemaIdCategoria.parse(c.req.param("id"));
    const resultado = esquemaReemplazarCategoria.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const reemplazo = await reemplazarCategoria(cliente, usuarioDe(c), id, resultado.data);
      if (!reemplazo) throw errores.noEncontrado("No encontramos esa categoría.");
      return c.json(reemplazo);
    } catch (error) {
      if (error instanceof CategoriaDelSistema) {
        throw errores.conflicto("Esta categoría es especial y no se puede reemplazar.");
      }
      if (error instanceof CategoriaDeReemplazoInvalida) {
        const mensaje = "Elegí otra categoría para reemplazarla.";
        throw errores.validacion([{ campo: "porCategoriaId", mensaje }], mensaje);
      }
      if (error instanceof NombreDeCategoriaEnUso) {
        const mensaje = "Ya tenés una categoría con ese nombre.";
        throw errores.validacion([{ campo: "nueva.nombre", mensaje }], mensaje);
      }
      throw error;
    }
  });

  // --- Cuentas ---

  rutas.get("/api/finanzas/cuentas", async (c) => {
    const cuentas = await listarCuentasFinancieras(cliente, usuarioDe(c));
    return c.json({ cuentas });
  });

  rutas.post("/api/finanzas/cuentas", async (c) => {
    const resultado = esquemaCrearCuentaFinanciera.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const cuenta = await crearCuentaFinanciera(
        cliente,
        usuarioDe(c),
        resultado.data.nombre,
        centavosDesdeImporte(resultado.data.saldoInicial),
      );
      return c.json(cuenta, 201);
    } catch (error) {
      if (error instanceof NombreDeCuentaEnUso) {
        throw errores.conflicto("Ya tenés una cuenta con ese nombre.");
      }
      throw error;
    }
  });

  rutas.patch("/api/finanzas/cuentas/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaRenombrarCuentaFinanciera.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const cuenta = await renombrarCuentaFinanciera(
        cliente,
        usuarioDe(c),
        id,
        resultado.data.nombre,
      );
      if (!cuenta) throw errores.noEncontrado("No encontramos esa cuenta.");
      return c.json(cuenta);
    } catch (error) {
      if (error instanceof NombreDeCuentaEnUso) {
        throw errores.conflicto("Ya tenés una cuenta con ese nombre.");
      }
      throw error;
    }
  });

  /**
   * Carga manual del saldo ("hoy tengo $X"). No es un movimiento: queda en el
   * historial de la cuenta como un ajuste y suma al saldo y al disponible.
   */
  rutas.post("/api/finanzas/cuentas/:id/ajustar-saldo", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaAjusteDeSaldo.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const ajuste = await ajustarSaldoDeCuenta(
        cliente,
        usuarioDe(c),
        id,
        centavosDesdeImporte(resultado.data.saldo),
      );
      if (!ajuste) throw errores.noEncontrado("No encontramos esa cuenta.");
      return c.json(ajuste, 201);
    } catch (error) {
      if (error instanceof SaldoSinCambios) {
        const mensaje = "Ese ya es el saldo de la cuenta: no hay nada que ajustar.";
        throw errores.validacion([{ campo: "saldo", mensaje }], mensaje);
      }
      throw error;
    }
  });

  rutas.post("/api/finanzas/cuentas/:id/ocultar", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const userId = usuarioDe(c);
    if (!(await cambiarVisibilidadDeCuenta(cliente, userId, id, true))) {
      throw errores.noEncontrado("No encontramos esa cuenta.");
    }
    return c.json(await obtenerCuentaFinanciera(cliente, userId, id));
  });

  rutas.post("/api/finanzas/cuentas/:id/mostrar", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const userId = usuarioDe(c);
    if (!(await cambiarVisibilidadDeCuenta(cliente, userId, id, false))) {
      throw errores.noEncontrado("No encontramos esa cuenta.");
    }
    return c.json(await obtenerCuentaFinanciera(cliente, userId, id));
  });

  /** Movimientos y ajustes manuales de la cuenta, juntos, del más nuevo al más viejo. */
  rutas.get("/api/finanzas/cuentas/:id/historial", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const paginacion = esquemaPaginacionHistorial.safeParse(c.req.query());
    if (!paginacion.success) throw errores.validacion(detalleDe(paginacion.error));

    const historial = await historialDeCuenta(cliente, usuarioDe(c), id, paginacion.data);
    if (!historial) throw errores.noEncontrado("No encontramos esa cuenta.");
    return c.json(historial);
  });

  rutas.delete("/api/finanzas/cuentas/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));

    try {
      const borrada = await eliminarCuentaFinanciera(cliente, usuarioDe(c), id);
      if (!borrada) throw errores.noEncontrado("No encontramos esa cuenta.");
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof CuentaConMovimientos) {
        throw errores.conflicto(
          "Esta cuenta tiene movimientos, así que no se puede eliminar. Podés ocultarla para que no aparezca al cargar movimientos nuevos.",
        );
      }
      throw error;
    }
  });

  // --- Movimientos ---

  /** Errores del servicio de movimientos que son datos mal elegidos: se muestran junto al campo. */
  function movimientoInvalidoComoValidacion(error: unknown): never {
    if (error instanceof ReferenciaInvalida) {
      const generico = {
        categoriaId: "Elegí una categoría válida.",
        cuentaFinancieraId: "Elegí una cuenta válida.",
        cuentaDestinoId: "Elegí una cuenta de destino válida.",
      }[error.campo];
      const mensaje = error.explicacion ?? generico;
      throw errores.validacion([{ campo: error.campo, mensaje }], mensaje);
    }
    if (error instanceof FechaFueraDePeriodos) {
      const mensaje = error.sinPeriodoAbierto
        ? "No tenés un período abierto. Abrí uno para poder cargar movimientos."
        : "Esa fecha no cae dentro de ninguno de tus períodos. Elegí una fecha dentro de un período.";
      throw errores.validacion([{ campo: "fecha", mensaje }], mensaje);
    }
    throw error;
  }

  rutas.get("/api/finanzas/movimientos", async (c) => {
    const resultado = esquemaFiltrosMovimientos.safeParse(c.req.query());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    const { movimientos, total } = await listarMovimientos(cliente, usuarioDe(c), resultado.data);
    return c.json({ movimientos, total });
  });

  rutas.post("/api/finanzas/movimientos", async (c) => {
    const resultado = esquemaMovimiento.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const movimiento = await crearMovimiento(
        cliente,
        usuarioDe(c),
        aMovimientoParaGuardar(resultado.data),
      );
      return c.json(movimiento, 201);
    } catch (error) {
      movimientoInvalidoComoValidacion(error);
    }
  });

  rutas.patch("/api/finanzas/movimientos/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaMovimiento.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const movimiento = await editarMovimiento(
        cliente,
        usuarioDe(c),
        id,
        aMovimientoParaGuardar(resultado.data),
      );
      if (!movimiento) throw errores.noEncontrado("No encontramos ese movimiento.");
      return c.json(movimiento);
    } catch (error) {
      movimientoInvalidoComoValidacion(error);
    }
  });

  rutas.delete("/api/finanzas/movimientos/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const borrado = await eliminarMovimiento(cliente, usuarioDe(c), id);
    if (!borrado) throw errores.noEncontrado("No encontramos ese movimiento.");
    return c.json({ ok: true });
  });

  rutas.post("/api/finanzas/movimientos/:id/duplicar", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    try {
      const movimiento = await duplicarMovimiento(cliente, usuarioDe(c), id);
      if (!movimiento) throw errores.noEncontrado("No encontramos ese movimiento.");
      return c.json(movimiento, 201);
    } catch (error) {
      movimientoInvalidoComoValidacion(error);
    }
  });

  // --- Períodos ---

  rutas.get("/api/finanzas/periodos", async (c) => {
    const periodos = await listarPeriodos(cliente, usuarioDe(c));
    return c.json({ periodos });
  });

  /**
   * Traduce los errores del servicio de períodos. Los que dependen de una fecha
   * la muestran en la zona horaria de la persona, que es lo que ella entiende.
   */
  async function periodoInvalido(error: unknown, userId: string): Promise<never> {
    if (error instanceof YaHayPeriodoAbierto) {
      throw errores.conflicto("Ya tenés un período abierto. Cerralo antes de abrir otro.");
    }
    if (error instanceof NombreDePeriodoEnUso) {
      throw errores.validacion(
        [{ campo: "nombre", mensaje: "Ya tenés un período con ese nombre." }],
        "Ya tenés un período con ese nombre.",
      );
    }
    if (error instanceof AperturaEnElFuturo) {
      const mensaje = "La apertura no puede ser en el futuro.";
      throw errores.validacion([{ campo: "aperturaEn", mensaje }], mensaje);
    }
    if (error instanceof AperturaSolapada) {
      const zona = await obtenerZonaHoraria(cliente, userId);
      const mensaje = `Esa fecha se solapa con el período "${error.nombre}", que termina el ${formatearFecha(error.cierreEn, zona)}. Elegí una apertura posterior.`;
      throw errores.validacion([{ campo: "aperturaEn", mensaje }], mensaje);
    }
    if (error instanceof PeriodoYaCerrado) {
      throw errores.conflicto("Ese período ya está cerrado.");
    }
    if (error instanceof PeriodoNoCerrado) {
      throw errores.conflicto("Ese período ya está abierto.");
    }
    if (error instanceof ReaperturaSolapada) {
      throw errores.conflicto(
        `No se puede reabrir: hay un período posterior ("${error.nombre}"). Solo se puede reabrir el último período.`,
      );
    }
    if (error instanceof MovimientoNuevoAlEliminar) {
      throw errores.conflicto(
        "Se cargó un movimiento en este período mientras se eliminaba, así que no se eliminó nada. Revisalo y probá de nuevo.",
      );
    }
    if (error instanceof CierreEnElFuturo) {
      const mensaje = "El cierre no puede ser en el futuro.";
      throw errores.validacion([{ campo: "cierreEn", mensaje }], mensaje);
    }
    if (error instanceof CierreNoPosteriorALaApertura) {
      const mensaje = "El cierre tiene que ser posterior a la apertura del período.";
      throw errores.validacion([{ campo: "cierreEn", mensaje }], mensaje);
    }
    if (error instanceof CierreDejaMovimientosFuera) {
      const zona = await obtenerZonaHoraria(cliente, userId);
      const cuantos =
        error.cantidad === 1 ? "hay 1 movimiento" : `hay ${error.cantidad} movimientos`;
      const mensaje = `No se puede cerrar en esa fecha: ${cuantos} posterior${error.cantidad === 1 ? "" : "es"} (el último es del ${formatearFechaHora(error.ultimoEn, zona)}). Elegí un cierre posterior o cambiá la fecha de esos movimientos.`;
      throw errores.validacion([{ campo: "cierreEn", mensaje }], mensaje);
    }
    throw error;
  }

  rutas.post("/api/finanzas/periodos", async (c) => {
    const userId = usuarioDe(c);
    const resultado = esquemaAbrirPeriodo.safeParse(await c.req.json().catch(() => ({})));
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const periodo = await abrirPeriodo(cliente, userId, {
        nombre: resultado.data.nombre,
        aperturaEn: resultado.data.aperturaEn ? new Date(resultado.data.aperturaEn) : undefined,
      });
      return c.json(periodo, 201);
    } catch (error) {
      return await periodoInvalido(error, userId);
    }
  });

  rutas.patch("/api/finanzas/periodos/:id", async (c) => {
    const userId = usuarioDe(c);
    const id = esquemaIdPeriodo.parse(c.req.param("id"));
    const resultado = esquemaRenombrarPeriodo.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const periodo = await renombrarPeriodo(cliente, userId, id, resultado.data.nombre);
      if (!periodo) throw errores.noEncontrado("No encontramos ese período.");
      return c.json(periodo);
    } catch (error) {
      return await periodoInvalido(error, userId);
    }
  });

  rutas.post("/api/finanzas/periodos/:id/cerrar", async (c) => {
    const userId = usuarioDe(c);
    const id = esquemaIdPeriodo.parse(c.req.param("id"));
    const resultado = esquemaCerrarPeriodo.safeParse(await c.req.json().catch(() => ({})));
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const periodo = await cerrarPeriodo(cliente, userId, id, {
        cierreEn: resultado.data.cierreEn ? new Date(resultado.data.cierreEn) : undefined,
      });
      if (!periodo) throw errores.noEncontrado("No encontramos ese período.");
      return c.json(periodo);
    } catch (error) {
      return await periodoInvalido(error, userId);
    }
  });

  rutas.post("/api/finanzas/periodos/:id/reabrir", async (c) => {
    const userId = usuarioDe(c);
    const id = esquemaIdPeriodo.parse(c.req.param("id"));

    try {
      const periodo = await reabrirPeriodo(cliente, userId, id);
      if (!periodo) throw errores.noEncontrado("No encontramos ese período.");
      return c.json(periodo);
    } catch (error) {
      return await periodoInvalido(error, userId);
    }
  });

  rutas.delete("/api/finanzas/periodos/:id", async (c) => {
    const userId = usuarioDe(c);
    const id = esquemaIdPeriodo.parse(c.req.param("id"));

    try {
      const resultado = await eliminarPeriodo(cliente, userId, id);
      if (!resultado) throw errores.noEncontrado("No encontramos ese período.");
      return c.json({ ok: true, movimientosEliminados: resultado.movimientosEliminados });
    } catch (error) {
      return await periodoInvalido(error, userId);
    }
  });

  // --- Resumen, estadísticas y presupuestos: siempre de un período ---

  /** El período que pide la query (`periodoId`), verificado como de la persona. */
  async function periodoPedido(c: Context<EntornoHono>, userId: string) {
    const resultado = esquemaIdPeriodo.safeParse(c.req.query("periodoId"));
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    const periodo = await obtenerPeriodo(cliente, userId, resultado.data);
    if (!periodo) throw errores.noEncontrado("No encontramos ese período.");
    return periodo;
  }

  rutas.get("/api/finanzas/resumen", async (c) => {
    const userId = usuarioDe(c);
    const resumen = await obtenerResumen(cliente, userId, await periodoPedido(c, userId));
    return c.json(resumen);
  });

  rutas.get("/api/finanzas/estadisticas", async (c) => {
    const userId = usuarioDe(c);
    const periodo = await periodoPedido(c, userId);

    const [porCategoria, evolucion] = await Promise.all([
      gastosPorCategoria(cliente, userId, periodo.id),
      evolucionPorPeriodo(cliente, userId, periodo),
    ]);

    return c.json({ gastosPorCategoria: porCategoria, evolucionPorPeriodo: evolucion });
  });

  /** Evolución de lo gastado o ingresado en una categoría en los últimos períodos (hasta el elegido). */
  rutas.get("/api/finanzas/estadisticas/categoria", async (c) => {
    const userId = usuarioDe(c);
    const periodo = await periodoPedido(c, userId);

    const id = esquemaIdCategoria.safeParse(c.req.query("categoriaId"));
    if (!id.success) throw errores.validacion(detalleDe(id.error));
    const tipo = z.enum(["gasto", "ingreso"]).default("gasto").safeParse(c.req.query("tipo"));
    if (!tipo.success) throw errores.validacion(detalleDe(tipo.error));
    const categoria = await obtenerCategoria(cliente, userId, id.data);
    if (!categoria) throw errores.noEncontrado("No encontramos esa categoría.");

    return c.json(await evolucionDeCategoria(cliente, userId, periodo, categoria.id, tipo.data));
  });

  // --- Presupuestos ---

  rutas.get("/api/finanzas/presupuestos", async (c) => {
    const userId = usuarioDe(c);
    const periodo = await periodoPedido(c, userId);
    const presupuestos = await listarPresupuestos(cliente, userId, periodo.id);
    return c.json({ presupuestos });
  });

  rutas.put("/api/finanzas/presupuestos/:categoriaId", async (c) => {
    const categoriaId = esquemaIdCategoria.parse(c.req.param("categoriaId"));
    const resultado = esquemaPresupuesto.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      await fijarPresupuesto(
        cliente,
        usuarioDe(c),
        categoriaId,
        centavosDesdeImporte(resultado.data.monto),
      );
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof CategoriaInexistente) {
        throw errores.noEncontrado("No encontramos esa categoría.");
      }
      if (error instanceof CategoriaSinPresupuesto) {
        const mensaje = "Las transferencias no son un gasto: esa categoría no tiene presupuesto.";
        throw errores.validacion([{ campo: "categoriaId", mensaje }], mensaje);
      }
      throw error;
    }
  });

  rutas.delete("/api/finanzas/presupuestos/:categoriaId", async (c) => {
    const categoriaId = esquemaIdCategoria.parse(c.req.param("categoriaId"));
    const borrado = await eliminarPresupuesto(cliente, usuarioDe(c), categoriaId);
    if (!borrado) throw errores.noEncontrado("No encontramos ese presupuesto.");
    return c.json({ ok: true });
  });

  return rutas;
}

function detalleDe(problema: z.ZodError): { campo: string; mensaje: string }[] {
  return problema.issues.map((issue) => ({
    campo: issue.path.join(".") || "(raíz)",
    mensaje: issue.message,
  }));
}

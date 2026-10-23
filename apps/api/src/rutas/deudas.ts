// Rutas de las deudas y préstamos, con un contacto o con alguien que no lo es (módulo de Finanzas).
//
// Cualquier cuenta con sesión puede usarlas (`exigirSesion`). El `userId` sale siempre de la
// sesión: una deuda de otra persona responde 404, igual que una que no existe. Los importes
// viajan en la unidad normal (pesos) y se guardan en centésimos, como en el resto de Finanzas.
//
// La ruta fija `/resumen` va antes de `/:id`.

import type { ClienteDb } from "@gestoria/db";
import {
  centavosDesdeImporte,
  esquemaDeuda,
  esquemaEditarDeuda,
  esquemaPagoDeDeuda,
  SENTIDOS_DE_DEUDA_VALIDOS,
} from "@gestoria/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { errores } from "../errores/error-api.ts";
import { exigirSesion } from "../middlewares/sesion.ts";
import {
  type FuenteDeCotizaciones,
  fuenteDeCotizaciones as fuenteReal,
} from "../servicios/finanzas/cotizaciones.ts";
import {
  ContactoInvalido,
  crearDeuda,
  DeudaSinQuienOConDosQuienes,
  editarDeuda,
  eliminarDeuda,
  eliminarPago,
  FechaEnElFuturo,
  LimiteAnteriorALaDeuda,
  listarDeudas,
  MontoMenorAlPagado,
  obtenerDeuda,
  PagoAnteriorALaDeuda,
  PagoMayorAlPendiente,
  registrarPago,
  resumenDeDeudas,
} from "../servicios/finanzas/deudas.ts";
import {
  CambioInvalido,
  CotizacionNoDisponible,
  FechaFueraDePeriodos,
  ReferenciaInvalida,
} from "../servicios/finanzas/movimientos.ts";
import type { EntornoHono } from "../tipos.ts";

const esquemaId = z.uuid();

const esquemaFiltros = z.object({
  contactoId: z.uuid().optional(),
  sentido: z.enum(SENTIDOS_DE_DEUDA_VALIDOS).optional(),
  estado: z.enum(["pendientes", "saldadas", "todas"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const esquemaFiltrosDelResumen = z.object({ contactoId: z.uuid().optional() });

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

function enCampo(campo: string, mensaje: string): never {
  throw errores.validacion([{ campo, mensaje }], mensaje);
}

/** Los errores del servicio que son datos mal elegidos se muestran junto al campo. */
function deudaInvalidaComoValidacion(error: unknown): never {
  if (error instanceof ContactoInvalido) return enCampo("contactoId", "Elegí un contacto válido.");
  if (error instanceof DeudaSinQuienOConDosQuienes) {
    return enCampo("contactoId", "Elegí un contacto o escribí un nombre, no los dos.");
  }
  if (error instanceof LimiteAnteriorALaDeuda) {
    return enCampo("fechaLimite", "El límite no puede ser anterior al día en que empezó la deuda.");
  }
  if (error instanceof FechaEnElFuturo) {
    return enCampo("fecha", "La fecha no puede ser posterior a hoy.");
  }
  if (error instanceof MontoMenorAlPagado) {
    return enCampo("monto", "El monto no puede ser menor a lo que ya se pagó.");
  }
  if (error instanceof PagoAnteriorALaDeuda) {
    return enCampo("fecha", "El pago no puede ser anterior al día de la deuda.");
  }
  // Los errores del movimiento que se genera con el pago: se dicen junto a la cuenta o categoría.
  if (error instanceof ReferenciaInvalida) {
    const generico =
      error.campo === "categoriaId" ? "Elegí una categoría válida." : "Elegí una cuenta válida.";
    return enCampo(`movimiento.${error.campo}`, error.explicacion ?? generico);
  }
  if (error instanceof FechaFueraDePeriodos) {
    return enCampo(
      "movimiento",
      error.sinPeriodoAbierto
        ? "No tenés un período abierto: abrí uno para poder registrar el ingreso o gasto, o registrá el pago sin generarlo."
        : "Ese día no cae dentro de ninguno de tus períodos: elegí otro día o registrá el pago sin generar el movimiento.",
    );
  }
  if (error instanceof CotizacionNoDisponible) {
    return enCampo(
      "movimiento",
      "No pudimos traer la cotización de la cuenta a tu moneda base. Probá de nuevo más tarde o registrá el pago sin generar el movimiento.",
    );
  }
  if (error instanceof CambioInvalido) return enCampo("movimiento", error.explicacion);
  if (error instanceof PagoMayorAlPendiente) {
    if (error.pendienteCentavos === 0) throw errores.conflicto("Esta deuda ya está saldada.");
    return enCampo("monto", "El pago no puede pasar de lo que falta por pagar.");
  }
  throw error;
}

type OpcionesDeRutasDeDeudas = {
  /** De dónde salen las cotizaciones al convertir el movimiento de un pago (en los tests, una falsa). */
  fuenteDeCotizaciones?: FuenteDeCotizaciones | undefined;
};

export function rutasDeDeudas(
  cliente: ClienteDb,
  { fuenteDeCotizaciones = fuenteReal }: OpcionesDeRutasDeDeudas = {},
): Hono<EntornoHono> {
  const rutas = new Hono<EntornoHono>();

  rutas.use("/api/finanzas/deudas", exigirSesion);
  rutas.use("/api/finanzas/deudas/*", exigirSesion);

  rutas.get("/api/finanzas/deudas", async (c) => {
    const filtros = esquemaFiltros.safeParse(c.req.query());
    if (!filtros.success) throw errores.validacion(detalleDe(filtros.error));
    return c.json(await listarDeudas(cliente, usuarioDe(c), filtros.data));
  });

  rutas.get("/api/finanzas/deudas/resumen", async (c) => {
    const filtros = esquemaFiltrosDelResumen.safeParse(c.req.query());
    if (!filtros.success) throw errores.validacion(detalleDe(filtros.error));
    return c.json(await resumenDeDeudas(cliente, usuarioDe(c), filtros.data));
  });

  rutas.post("/api/finanzas/deudas", async (c) => {
    const resultado = esquemaDeuda.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));
    const { monto, ...resto } = resultado.data;

    try {
      const deuda = await crearDeuda(cliente, usuarioDe(c), {
        ...resto,
        montoCentavos: centavosDesdeImporte(monto),
      });
      return c.json(deuda, 201);
    } catch (error) {
      return deudaInvalidaComoValidacion(error);
    }
  });

  rutas.get("/api/finanzas/deudas/:id", async (c) => {
    const deuda = await obtenerDeuda(cliente, usuarioDe(c), esquemaId.parse(c.req.param("id")));
    if (!deuda) throw errores.noEncontrado("No encontramos esa deuda.");
    return c.json(deuda);
  });

  rutas.put("/api/finanzas/deudas/:id", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaEditarDeuda.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const deuda = await editarDeuda(cliente, usuarioDe(c), id, {
        concepto: resultado.data.concepto,
        montoCentavos: centavosDesdeImporte(resultado.data.monto),
        fecha: resultado.data.fecha,
        fechaLimite: resultado.data.fechaLimite,
      });
      if (!deuda) throw errores.noEncontrado("No encontramos esa deuda.");
      return c.json(deuda);
    } catch (error) {
      return deudaInvalidaComoValidacion(error);
    }
  });

  rutas.delete("/api/finanzas/deudas/:id", async (c) => {
    if (!(await eliminarDeuda(cliente, usuarioDe(c), esquemaId.parse(c.req.param("id"))))) {
      throw errores.noEncontrado("No encontramos esa deuda.");
    }
    return c.json({ ok: true });
  });

  rutas.post("/api/finanzas/deudas/:id/pagos", async (c) => {
    const id = esquemaId.parse(c.req.param("id"));
    const resultado = esquemaPagoDeDeuda.safeParse(await c.req.json());
    if (!resultado.success) throw errores.validacion(detalleDe(resultado.error));

    try {
      const deuda = await registrarPago(
        cliente,
        usuarioDe(c),
        id,
        {
          montoCentavos: centavosDesdeImporte(resultado.data.monto),
          fecha: resultado.data.fecha,
          movimiento: resultado.data.movimiento && {
            cuentaFinancieraId: resultado.data.movimiento.cuentaFinancieraId,
            categoriaId: resultado.data.movimiento.categoriaId,
            // El importe recibido viaja en la unidad normal, como el resto de los importes.
            cambio:
              resultado.data.movimiento.cambio?.modo === "importe"
                ? {
                    modo: "importe",
                    importeConvertidoCentavos: centavosDesdeImporte(
                      resultado.data.movimiento.cambio.importeConvertido,
                    ),
                  }
                : resultado.data.movimiento.cambio,
          },
        },
        new Date(),
        { fuente: fuenteDeCotizaciones },
      );
      if (!deuda) throw errores.noEncontrado("No encontramos esa deuda.");
      return c.json(deuda, 201);
    } catch (error) {
      return deudaInvalidaComoValidacion(error);
    }
  });

  rutas.delete("/api/finanzas/deudas/:id/pagos/:pagoId", async (c) => {
    const deuda = await eliminarPago(
      cliente,
      usuarioDe(c),
      esquemaId.parse(c.req.param("id")),
      esquemaId.parse(c.req.param("pagoId")),
    );
    if (!deuda) throw errores.noEncontrado("No encontramos ese pago.");
    return c.json(deuda);
  });

  return rutas;
}

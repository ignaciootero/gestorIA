// Esquemas Zod del módulo de ingresos y gastos.
//
// Mismo criterio que packages/shared/src/auth/esquemas.ts: los usa el
// formulario de la web y la API valida el cuerpo contra los mismos esquemas
// antes de dejarlo pasar, así que no hay forma de que las reglas del cliente y
// del servidor se desincronicen (docs/guias/seguridad-y-datos.md).
//
// Los importes viajan en la unidad normal (pesos), no en centésimos: es lo que
// escribe la persona en el formulario. La conversión a centésimos para guardar
// en la base vive en packages/shared/src/formato/moneda.ts, no acá.

import { z } from "zod";
import { TIPOS_MOVIMIENTO, TIPOS_MOVIMIENTO_VALIDOS } from "./constantes.ts";

export const LARGO_MAXIMO_NOMBRE = 40;
export const LARGO_MAXIMO_DESCRIPCION = 140;

/**
 * Tope de un importe individual (9.999.999.999). No es un límite técnico: los
 * montos se guardan en un `bigint` de centésimos, y JavaScript los maneja sin
 * perder precisión hasta 2^53 centésimos (unos 90 billones). Es un tope contra
 * un error de tipeo, como escribir ceros de más.
 */
export const IMPORTE_MAXIMO = 9_999_999_999;

const esquemaNombre = (etiqueta: string, articulo: "el" | "la" = "la") =>
  z
    .string()
    .trim()
    .min(1, `Escribí un nombre para ${articulo} ${etiqueta}.`)
    .max(LARGO_MAXIMO_NOMBRE, `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE} caracteres.`);

export const esquemaNombreCategoria = esquemaNombre("categoría");
export const esquemaNombreCuentaFinanciera = esquemaNombre("cuenta");
export const esquemaNombrePeriodo = esquemaNombre("período", "el");

/** "#rrggbb", tal como lo da un <input type="color">. */
export const esquemaColorCategoria = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Ese color no es válido.");

export const esquemaImporte = z
  .number()
  .finite("Ese importe no es válido.")
  .positive("El importe tiene que ser mayor que cero.")
  .max(IMPORTE_MAXIMO, "Ese importe es demasiado grande.");

/** A diferencia de `esquemaImporte`, acepta cero y negativos: es una deuda o un punto de partida, no un movimiento. */
export const esquemaSaldoInicial = z
  .number()
  .finite("Ese saldo no es válido.")
  .min(-IMPORTE_MAXIMO, "Ese saldo es demasiado grande.")
  .max(IMPORTE_MAXIMO, "Ese saldo es demasiado grande.");

export const esquemaDescripcion = z
  .string()
  .trim()
  .min(1, "Escribí una descripción.")
  .max(
    LARGO_MAXIMO_DESCRIPCION,
    `La descripción no puede pasar de ${LARGO_MAXIMO_DESCRIPCION} caracteres.`,
  );

/**
 * Un instante, como texto ISO 8601 con zona (por ejemplo "2026-09-16T14:30:00.000Z").
 * Es lo que viaja entre cliente y API para toda fecha con hora: el cliente
 * convierte lo que escribe la persona (hora local) y el servidor guarda UTC.
 */
export const esquemaFechaHora = z.iso.datetime({
  offset: true,
  error: "Esa fecha y hora no es válida.",
});

/** El número que identifica a una categoría (nunca se le muestra a la persona). */
export const esquemaIdCategoria = z
  .number("Elegí una categoría.")
  .int("Elegí una categoría.")
  .positive("Elegí una categoría.");

/**
 * Crear una categoría. Sin `color`, el servidor elige el más distinto de los que
 * ya tiene la persona (ver colorMasDistinto); después lo puede cambiar.
 */
export const esquemaCrearCategoria = z.object({
  nombre: esquemaNombreCategoria,
  color: esquemaColorCategoria.optional(),
});
export type DatosCategoria = z.infer<typeof esquemaCrearCategoria>;

/**
 * Reemplazar una categoría que tiene movimientos: todos pasan a otra categoría
 * (`porCategoriaId`, ya existente) o a una nueva (`nueva`), y después se elimina.
 * Se pide una de las dos, no ambas ni ninguna.
 */
export const esquemaReemplazarCategoria = z
  .object({
    porCategoriaId: esquemaIdCategoria.optional(),
    nueva: esquemaCrearCategoria.optional(),
  })
  .superRefine((datos, contexto) => {
    if ((datos.porCategoriaId === undefined) === (datos.nueva === undefined)) {
      contexto.addIssue({
        code: "custom",
        path: ["porCategoriaId"],
        message: "Elegí por qué categoría reemplazarla: una existente o una nueva.",
      });
    }
  });
export type DatosReemplazarCategoria = z.infer<typeof esquemaReemplazarCategoria>;

export const esquemaCrearCuentaFinanciera = z.object({
  nombre: esquemaNombreCuentaFinanciera,
  saldoInicial: esquemaSaldoInicial.default(0),
});
export type DatosCuentaFinanciera = z.infer<typeof esquemaCrearCuentaFinanciera>;

/** Renombrar una cuenta. El saldo no se toca acá: para eso está el ajuste de saldo. */
export const esquemaRenombrarCuentaFinanciera = z.object({
  nombre: esquemaNombreCuentaFinanciera,
});
export type DatosRenombrarCuentaFinanciera = z.infer<typeof esquemaRenombrarCuentaFinanciera>;

/**
 * Carga manual del saldo de una cuenta: cuánto dinero tiene hoy. Acepta cero y
 * negativos (una cuenta en rojo o una tarjeta con deuda). No es un movimiento.
 */
export const esquemaAjusteDeSaldo = z.object({ saldo: esquemaSaldoInicial });
export type DatosAjusteDeSaldo = z.infer<typeof esquemaAjusteDeSaldo>;

/**
 * Los campos de un movimiento, sin las reglas que cruzan campos (para poder
 * extenderlo, por ejemplo en un formulario). Lo que se valida de verdad es
 * `esquemaMovimiento`.
 */
export const esquemaCamposDeMovimiento = z.object({
  tipo: z.enum(TIPOS_MOVIMIENTO_VALIDOS),
  importe: esquemaImporte,
  descripcion: esquemaDescripcion,
  categoriaId: esquemaIdCategoria,
  /** La cuenta del movimiento; en una transferencia, la de origen. */
  cuentaFinancieraId: z.uuid("Elegí una cuenta."),
  /** Solo en una transferencia (tipo "neutro"): la cuenta a la que llega la plata. */
  cuentaDestinoId: z.uuid("Elegí la cuenta de destino.").nullish(),
  /** Fecha y hora del movimiento: de ella se deduce el período al que pertenece. */
  fecha: esquemaFechaHora,
});

/** Reglas entre campos: una transferencia lleva destino distinto del origen; el resto no lleva. */
export function validarDestinoDeTransferencia(
  datos: { tipo: string; cuentaFinancieraId: string; cuentaDestinoId?: string | null | undefined },
  contexto: { addIssue: (problema: { code: "custom"; path: string[]; message: string }) => void },
): void {
  const tieneDestino = datos.cuentaDestinoId !== undefined && datos.cuentaDestinoId !== null;

  if (datos.tipo === TIPOS_MOVIMIENTO.neutro) {
    if (!tieneDestino) {
      contexto.addIssue({
        code: "custom",
        path: ["cuentaDestinoId"],
        message: "Elegí la cuenta de destino.",
      });
    } else if (datos.cuentaDestinoId === datos.cuentaFinancieraId) {
      contexto.addIssue({
        code: "custom",
        path: ["cuentaDestinoId"],
        message: "La cuenta de destino tiene que ser distinta de la de origen.",
      });
    }
  } else if (tieneDestino) {
    contexto.addIssue({
      code: "custom",
      path: ["cuentaDestinoId"],
      message: "Solo una transferencia tiene cuenta de destino.",
    });
  }
}

export const esquemaMovimiento = esquemaCamposDeMovimiento.superRefine(
  validarDestinoDeTransferencia,
);
export type DatosMovimiento = z.infer<typeof esquemaMovimiento>;

/**
 * Abrir un período. Ambos campos son opcionales: sin `aperturaEn` abre "ahora"
 * y sin `nombre` se usa el sugerido (ver `sugerirNombreDePeriodo`).
 */
export const esquemaAbrirPeriodo = z.object({
  nombre: esquemaNombrePeriodo.optional(),
  aperturaEn: esquemaFechaHora.optional(),
});
export type DatosAbrirPeriodo = z.infer<typeof esquemaAbrirPeriodo>;

/** Cerrar un período. Sin `cierreEn` se cierra "ahora". */
export const esquemaCerrarPeriodo = z.object({
  cierreEn: esquemaFechaHora.optional(),
});
export type DatosCerrarPeriodo = z.infer<typeof esquemaCerrarPeriodo>;

export const esquemaRenombrarPeriodo = z.object({ nombre: esquemaNombrePeriodo });
export type DatosRenombrarPeriodo = z.infer<typeof esquemaRenombrarPeriodo>;

export const esquemaPresupuesto = z.object({
  monto: esquemaSaldoInicial.min(0, "El presupuesto no puede ser negativo."),
});
export type DatosPresupuesto = z.infer<typeof esquemaPresupuesto>;

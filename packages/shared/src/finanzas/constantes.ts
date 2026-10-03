// Constantes del módulo de ingresos y gastos, compartidas por API y web.

export const TIPOS_MOVIMIENTO = {
  ingreso: "ingreso",
  gasto: "gasto",
  /**
   * Una transferencia entre dos cuentas del usuario: la plata sale de una y entra
   * en la otra, así que no es ni un ingreso ni un gasto (no cuenta en los totales
   * del período ni en los presupuestos).
   */
  neutro: "neutro",
} as const;

export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[keyof typeof TIPOS_MOVIMIENTO];

export const TIPOS_MOVIMIENTO_VALIDOS = Object.values(TIPOS_MOVIMIENTO);

/**
 * Categorías con las que arranca cada usuario, cada una con un color para
 * distinguirla en movimientos y estadísticas. Se siembran solas la primera
 * vez que alguien pide sus categorías (ver apps/api/src/servicios/finanzas),
 * no en una migración: así quedan como datos normales de la persona, que
 * puede renombrarlas, recolorearlas o reemplazarlas igual que a las que crea
 * ella misma (CLAUDE.md, "Categorías, monedas y similares como datos, no
 * hardcodeadas"). "Ingresos" está pensada para sueldos y entradas de dinero en
 * general; el resto son categorías típicas de gasto, aunque nada impide
 * usarlas también para un ingreso puntual.
 *
 * Los colores no son un gusto: salen de `colorMasDistinto` (ver colores.ts)
 * aplicado en cadena, empezando por el amarillo de las transferencias, así que
 * cada uno es el más alejado de los anteriores. Entre cualquier par la
 * distancia (ΔE) supera 40; hay un test que lo verifica.
 */
export const CATEGORIAS_POR_DEFECTO = [
  { nombre: "Alimentación", color: "#cf5417" },
  { nombre: "Transporte", color: "#1717cf" },
  { nombre: "Vivienda", color: "#d6a085" },
  { nombre: "Servicios", color: "#17b0cf" },
  { nombre: "Salud", color: "#cf1754" },
  { nombre: "Entretenimiento", color: "#cf17cf" },
  { nombre: "Compras", color: "#bb85d6" },
  { nombre: "Educación", color: "#333399" },
  { nombre: "Ingresos", color: "#17cf54" },
  { nombre: "Otros", color: "#889933" },
] as const;

/** Código con el que se marca, en la base, a la categoría especial de las transferencias. */
export const SISTEMA_TRANSFERENCIA = "transferencia";

/**
 * La categoría especial de las transferencias entre cuentas. Todos los usuarios
 * la tienen; no se puede eliminar (aunque sí renombrar o recolorear) y las
 * transferencias son el único tipo de movimiento que puede usarla. Su color es
 * el amarillo del tipo "neutro".
 */
export const CATEGORIA_DE_TRANSFERENCIA = {
  nombre: "Transferencia entre Cuentas",
  color: "#facc15",
  sistema: SISTEMA_TRANSFERENCIA,
} as const;

/** Cuentas/medios de pago con los que arranca cada usuario. Mismo criterio que arriba. */
export const CUENTAS_FINANCIERAS_POR_DEFECTO = [
  "Efectivo",
  "Banco",
  "Tarjeta",
  "Billetera digital",
] as const;

// Fábricas de datos del módulo de ingresos y gastos para los tests.
//
// Igual que packages/testing/src/fabricas/usuarios.ts: datos válidos con
// valores por defecto, y lo que el test necesite se sobrescribe
// (ver docs/guias/testing.md). No insertan nada en la base por su cuenta: los
// servicios reales son los que insertan, para que los tests ejerciten el mismo
// camino que usa la aplicación.

let contador = 0;

function siguiente(): string {
  contador += 1;
  return `${Date.now().toString(36)}${contador}`;
}

export type DatosCategoriaDePrueba = { nombre: string };

export function crearCategoriaDePrueba(
  sobrescribir: Partial<DatosCategoriaDePrueba> = {},
): DatosCategoriaDePrueba {
  return { nombre: `Categoría de prueba ${siguiente()}`, ...sobrescribir };
}

export type DatosCuentaFinancieraDePrueba = { nombre: string; saldoInicialCentavos: number };

export function crearCuentaFinancieraDePrueba(
  sobrescribir: Partial<DatosCuentaFinancieraDePrueba> = {},
): DatosCuentaFinancieraDePrueba {
  return { nombre: `Cuenta de prueba ${siguiente()}`, saldoInicialCentavos: 0, ...sobrescribir };
}

export type DatosPeriodoDePrueba = {
  nombre: string;
  /** Instante ISO 8601 (por ejemplo "2026-01-01T00:00:00.000Z"). */
  aperturaEn: string;
  /** Instante ISO 8601, o null si el período está abierto. */
  cierreEn: string | null;
};

/** Un período abierto desde principios de 2026: cubre cualquier fecha fija de 2026 en adelante. */
export function crearPeriodoDePrueba(
  sobrescribir: Partial<DatosPeriodoDePrueba> = {},
): DatosPeriodoDePrueba {
  return {
    nombre: `Período de prueba ${siguiente()}`,
    aperturaEn: "2026-01-01T00:00:00.000Z",
    cierreEn: null,
    ...sobrescribir,
  };
}

export type DatosMovimientoDePrueba = {
  tipo: "ingreso" | "gasto";
  importeCentavos: number;
  descripcion: string;
  categoriaId: number;
  cuentaFinancieraId: string;
  /** Instante ISO 8601: tiene que caer dentro de algún período del usuario. */
  fecha: string;
};

/** Ahora, como instante ISO 8601 en UTC. */
function ahoraComoFecha(): string {
  return new Date().toISOString();
}

export function crearMovimientoDePrueba(
  datos: Pick<DatosMovimientoDePrueba, "categoriaId" | "cuentaFinancieraId"> &
    Partial<DatosMovimientoDePrueba>,
): DatosMovimientoDePrueba {
  return {
    tipo: "gasto",
    importeCentavos: 1500,
    descripcion: `Movimiento de prueba ${siguiente()}`,
    fecha: ahoraComoFecha(),
    ...datos,
  };
}

export type DatosPresupuestoDePrueba = { categoriaId: number; montoCentavos: number };

export function crearPresupuestoDePrueba(
  datos: Pick<DatosPresupuestoDePrueba, "categoriaId"> & Partial<DatosPresupuestoDePrueba>,
): DatosPresupuestoDePrueba {
  return { montoCentavos: 10_000, ...datos };
}

// Reglas de los períodos del módulo de ingresos y gastos que comparten API y web.
//
// Un período es un tramo de tiempo que abre y cierra la persona (no tiene por
// qué coincidir con un mes). Cubre el intervalo [apertura, cierre): incluye el
// instante de apertura y no el de cierre, así el período siguiente puede abrir
// justo cuando cierra el anterior sin que se solapen ni queden movimientos
// "en los dos".

/** Nombre del mes de un instante en la zona dada, con la inicial en mayúscula ("Octubre"). */
export function nombreDelMes(instante: Date | string, zonaHoraria: string): string {
  const nombre = new Intl.DateTimeFormat("es-UY", { month: "long", timeZone: zonaHoraria }).format(
    new Date(instante),
  );
  return nombre.charAt(0).toLocaleUpperCase("es") + nombre.slice(1);
}

/** Mes y año de un instante en la zona dada ("Octubre 2026"). */
export function nombreDelMesYAnio(instante: Date | string, zonaHoraria: string): string {
  const anio = new Intl.DateTimeFormat("es-UY", { year: "numeric", timeZone: zonaHoraria }).format(
    new Date(instante),
  );
  return `${nombreDelMes(instante, zonaHoraria)} ${anio}`;
}

/**
 * El nombre que se le propone a un período nuevo: mes y año de su apertura
 * ("Octubre 2026"). Los nombres son únicos (sin distinguir mayúsculas), así que
 * si ya existe se le agrega un número incremental: "Octubre 2026",
 * "Octubre 2026 2", "Octubre 2026 3"...
 */
export function sugerirNombreDePeriodo(
  aperturaEn: Date | string,
  zonaHoraria: string,
  nombresExistentes: readonly string[],
): string {
  const base = nombreDelMesYAnio(aperturaEn, zonaHoraria);
  const usados = new Set(nombresExistentes.map((nombre) => nombre.trim().toLocaleLowerCase("es")));

  if (!usados.has(base.toLocaleLowerCase("es"))) return base;

  for (let numero = 2; ; numero += 1) {
    const candidato = `${base} ${numero}`;
    if (!usados.has(candidato.toLocaleLowerCase("es"))) return candidato;
  }
}

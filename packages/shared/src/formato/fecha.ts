// Formato de fechas y horas, compartido por API y web.
//
// Siempre con `Intl` (docs/guias/convenciones.md, Formatos regionales): fecha
// "16/09/2026" y hora de 24 horas "14:30". Los instantes se guardan en UTC y
// se muestran en la zona horaria que se indique; sin zona, la del dispositivo.

/** "16/09/2026" */
export function formatearFecha(
  instante: Date | string,
  zonaHoraria?: string,
  region = "es-UY",
): string {
  return new Intl.DateTimeFormat(region, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(zonaHoraria ? { timeZone: zonaHoraria } : {}),
  }).format(new Date(instante));
}

/** "16/09/2026 14:30" */
export function formatearFechaHora(
  instante: Date | string,
  zonaHoraria?: string,
  region = "es-UY",
): string {
  const hora = new Intl.DateTimeFormat(region, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    ...(zonaHoraria ? { timeZone: zonaHoraria } : {}),
  }).format(new Date(instante));

  return `${formatearFecha(instante, zonaHoraria, region)} ${hora}`;
}

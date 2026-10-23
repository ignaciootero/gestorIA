// Marcador de espacio mientras se carga, de forma diferida, un gráfico de Recharts:
// reserva el alto del gráfico para que la pantalla no salte al aparecer.

export function EsqueletoDeGrafico({ alto }: { alto: number }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="animate-pulse rounded-control bg-superficie-suave"
      style={{ height: alto }}
    >
      <span className="solo-lectores">Cargando gráfico</span>
    </div>
  );
}

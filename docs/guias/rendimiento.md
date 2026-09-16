# Guía de rendimiento

Leer antes de crear endpoints, consultas, listados, pantallas con datos o al agregar dependencias al cliente.

El sistema debe sentirse **rápido y fluido en todo momento**. El rendimiento es un requisito de calidad, no una optimización para después: cada funcionalidad se diseña pensando en tiempos de respuesta cortos. Priorizar la **velocidad percibida** por el usuario, pero sin optimizaciones prematuras que compliquen el código: medir primero y optimizar donde haya un problema real.

## Objetivos de referencia

- **API:** operaciones habituales (listar, crear, editar) con respuesta p95 menor a 200 ms en producción; búsquedas y reportes, menor a 500 ms.
- **Web (Core Web Vitals):** LCP menor a 2,5 s, INP menor a 200 ms, CLS menor a 0,1, medidos en un móvil de gama media.
- **Móvil:** arranque de la app hasta la primera pantalla útil lo más breve posible; navegación entre pantallas y scroll a 60 fps sin tirones.
- **Respuesta visual inmediata:** toda interacción muestra reacción en menos de 100 ms, aunque la operación siga en curso.

## Velocidad percibida

- **Actualizaciones optimistas** en acciones frecuentes y de bajo riesgo (tildar una tarea, registrar un gasto): la interfaz se actualiza al instante y se revierte con un mensaje claro si el servidor falla.
- **Caché en el cliente** con TanStack Query: mostrar datos ya cargados de inmediato y revalidar en segundo plano. Precargar lo que el usuario probablemente abra a continuación cuando sea barato hacerlo.
- **Esqueletos de carga** con la forma del contenido en lugar de pantallas en blanco. Evitar indicadores de carga que aparezcan y desaparezcan en un instante (mostrar solo si la espera supera unos 300 ms).
- Sin saltos de diseño: reservar el espacio de imágenes, listas y contenidos que cargan después.

## Backend y base de datos

- **Índices** para las consultas frecuentes (por usuario, fecha, estado, categoría). Revisar con `EXPLAIN ANALYZE` las consultas nuevas o lentas.
- **Paginación** en todos los listados (preferir paginación por cursor en listas que crecen). Nunca devolver colecciones completas sin límite.
- Seleccionar solo las columnas necesarias y evitar el problema N+1 (usar joins o cargas agrupadas).
- Operaciones lentas o no urgentes (envío de notificaciones, limpiezas, cálculos pesados) en jobs de pg-boss, fuera de la respuesta al usuario.
- Compresión de respuestas y conexiones a la base reutilizadas mediante pool.

## Web

- Usar Server Components de Next.js cuando reduzcan JavaScript en el cliente; marcar como cliente solo lo que necesita interactividad.
- Mantener el JavaScript inicial chico: carga diferida de componentes pesados (gráficos, editores, calendarios completos) y revisar el tamaño del bundle al agregar dependencias.
- Fuentes con `next/font` e imágenes optimizadas con el componente de Next.js.

## Móvil

- FlashList para listas largas; evitar renders innecesarios (memoización donde se mida que hace falta).
- Animaciones en el hilo de UI con Reanimated.
- Mostrar datos en caché al abrir la app y actualizar en segundo plano.

## Medición

- La API registra la duración de cada petición y marca en los logs las que superen los objetivos.
- Tests de rendimiento para endpoints críticos usando las fábricas de `packages/testing` con volúmenes de datos realistas (por ejemplo, un usuario con miles de gastos), para detectar consultas que se degradan al crecer.
- Auditorías con Lighthouse sobre las pantallas principales de la web.
- Registrar en `docs/decisiones.md` las optimizaciones relevantes y su motivo, con mediciones antes y después.

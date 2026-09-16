# Guía de usabilidad

Leer antes de trabajar en cualquier pantalla, formulario o flujo de usuario.

Las funcionalidades deben ser **muy intuitivas y simples para cualquier tipo de usuario**, incluidas personas con poca experiencia tecnológica. La facilidad de uso es un criterio de calidad al mismo nivel que el funcionamiento correcto: una funcionalidad que funciona pero confunde no está terminada.

## Principios

- **Lo más usado, a mano:** las acciones frecuentes (por ejemplo registrar un gasto) se hacen en la menor cantidad de pasos posible, con valores por defecto sensatos (fecha de hoy, moneda del usuario).
- **Lenguaje simple:** textos en español cotidiano, sin jerga técnica. Botones que dicen lo que hacen ("Guardar gasto", no "Enviar").
- **Una cosa a la vez:** pantallas despejadas; opciones avanzadas ocultas hasta que se necesiten.
- **Consistencia:** los mismos patrones, nombres, íconos y ubicaciones en todos los módulos, en web y en móvil.
- **Respuesta visible:** toda acción muestra resultado claro (cargando, guardado, error). Nada ocurre "en silencio".
- **Errores que ayudan:** mensajes que explican qué pasó y cómo solucionarlo, junto al campo afectado. Validar mientras se completa el formulario cuando tenga sentido.
- **Prevenir y deshacer:** confirmación antes de acciones destructivas o irreversibles; deshacer cuando sea posible.
- **Estados vacíos útiles:** cuando no hay datos, explicar qué se puede hacer y ofrecer el botón para empezar.
- **Accesibilidad:** buen contraste, tamaños de texto y de áreas táctiles cómodos, navegación por teclado en web, etiquetas para lectores de pantalla y que la información no dependa solo del color.
- **Móvil primero en los formularios:** teclados adecuados (numérico para montos, email para correos) y controles cómodos con una mano.

## Comportamiento sin conexión (móvil y web)

No se requiere funcionamiento offline completo por ahora, pero sí un comportamiento mínimo:

- Detectar la falta de conexión y mostrar un aviso claro y discreto, sin bloquear la lectura de datos ya cargados.
- **No perder lo que el usuario estaba cargando:** conservar los formularios en curso y permitir reintentar el envío cuando vuelva la conexión.
- Deshabilitar o marcar las acciones que requieren conexión, explicando por qué.
- Distinguir en los mensajes entre "sin conexión" y "error del servidor".

## Cómo medir la calidad de uso

Antes de dar por terminada una funcionalidad, revisarla con esta lista e informar el resultado:

1. **Pasos:** ¿cuántos toques o clics requiere la tarea principal? ¿Se puede reducir?
2. **Claridad:** ¿un usuario nuevo entiende qué hacer sin explicaciones? ¿Algún texto, ícono o término es ambiguo?
3. **Errores:** ¿qué pasa ante datos incorrectos, sin conexión o con fallos del servidor? ¿Los mensajes indican cómo resolverlo?
4. **Estados:** ¿están cubiertos los estados de carga, vacío, éxito y error?
5. **Consistencia:** ¿sigue los mismos patrones que el resto del sistema?
6. **Accesibilidad:** tests automáticos con axe-core sin violaciones y revisión manual de teclado y contraste.
7. **Web y móvil:** ¿se usa cómodamente en pantallas chicas y grandes?

Además:
- Los flujos principales tienen tests end-to-end que verifican que la tarea se completa en los pasos esperados y que los mensajes de error son los correctos.
- Proponer mejoras de usabilidad cuando se detecten, aunque no se hayan pedido, pero **consultar antes de implementarlas** si cambian el alcance.
- Las observaciones de usuarios reales (sus dudas, errores frecuentes o sugerencias) se registran en `docs/observaciones-usabilidad.md` junto con los cambios que generaron.

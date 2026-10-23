# Guía de convenciones

Leer al comenzar a trabajar en el proyecto y ante dudas de nombres, estructura, errores, commits o formatos.

## Idioma y nombres

- **En español:** entidades, tablas, funciones, variables y tipos del dominio del negocio (`gasto`, `crearContacto`, `EstadoCuenta`), textos de interfaz, comentarios, documentación y nombres de tests.
- **En inglés:** código de infraestructura y convenciones de frameworks o librerías (`middleware`, `handler`, `hooks`, `useQuery`, `page.tsx`, `layout.tsx`, `config`), nombres de archivos impuestos por herramientas y términos técnicos estándar.
- Nunca mezclar idiomas dentro de un mismo nombre (`getGastos` no; `obtenerGastos` sí).
- Sin tildes ni ñ en identificadores de código ni nombres de archivo (`anio`, `configuracion`); sí en textos visibles y documentación.
- Convenciones de formato: `camelCase` para variables y funciones, `PascalCase` para tipos y componentes, `snake_case` para tablas y columnas de la base, `kebab-case` para archivos y carpetas salvo que el framework indique otra cosa.

## Compatibilidad Windows y Linux

El desarrollo es en Windows nativo y producción corre en Linux, así que todo debe funcionar en ambos:

- **Scripts de `package.json` multiplataforma:** nada de comandos exclusivos de Bash (`rm -rf`, `export VAR=...`, `&&` encadenando cosas específicas de un shell). Resolver con scripts en TypeScript/Node o herramientas multiplataforma, y consultar antes de agregar una dependencia para esto.
- **Rutas con `path.join` / `path.resolve`**, nunca separadores escritos a mano (`/` o `\`).
- **Finales de línea LF** en todo el repositorio, forzados con `.gitattributes` (`* text=auto eol=lf`) y respetados por Biome.
- Nombres de archivo en minúsculas y sin distinguir solo por mayúsculas: Windows no diferencia `Gasto.ts` de `gasto.ts`, Linux sí.
- Variables de entorno cargadas desde archivos `.env`, no desde el shell.
- Instrucciones del README con comandos que funcionen en PowerShell.

## Documentación del proyecto

Mantener una carpeta `docs/` actualizada. **Toda tarea que agregue o cambie funcionalidad o dependencias no está terminada hasta que la documentación refleje el cambio.**

- `docs/funcionalidades.md`: cada funcionalidad implementada, qué hace desde el punto de vista del usuario, cómo funciona a grandes rasgos, dónde está en el código (apps y paquetes involucrados) y sus reglas o limitaciones importantes. Organizado por módulo (autenticación, administración, gastos, etc.).
- `docs/librerias.md`: cada librería o herramienta utilizada, con su propósito en el proyecto, dónde se usa, por qué se eligió y su licencia. Al quitar una dependencia, quitarla también de este archivo.
- `docs/decisiones.md`: registro breve de decisiones de arquitectura (qué se decidió, por qué y alternativas descartadas), con fecha.
- `docs/guias/`: guías de trabajo del proyecto (esta y las demás). Actualizarlas cuando cambie una convención acordada.
- `docs/observaciones-usabilidad.md`: observaciones de usuarios reales y cambios que generaron.
- `README.md`: descripción corta del proyecto, cómo levantarlo, comandos principales, procedimiento de restauración de backups y enlaces a `docs/`.

La documentación se escribe en español, clara y concisa, pensando en alguien que vuelve al proyecto después de meses.

## Comentarios en el código

El objetivo es que, al revisar el código en el futuro, sea fácil entender qué está pasando y por qué. Comentarios simples, en español, **lo justo y necesario**.

Comentar:
- Al inicio de cada archivo o módulo relevante, una o dos líneas sobre su propósito.
- Funciones exportadas y lógica de negocio: qué hacen y para qué sirven (JSDoc breve).
- El **por qué** de decisiones no obvias: reglas de seguridad y permisos, casos borde, soluciones a limitaciones de una librería, manejo de fechas y zonas horarias.
- Pasos de flujos con varias etapas (por ejemplo, el proceso de aprobación de registro o el reseteo de contraseña).

No comentar:
- Lo que el código ya dice por sí mismo (`// incrementa el contador` sobre `contador++`).
- Cada línea o cada bloque trivial.
- Código comentado o desactivado: se elimina, para eso está Git.

Si un fragmento necesita muchos comentarios para entenderse, primero intentar simplificarlo o darle mejores nombres. Mantener los comentarios actualizados cuando cambia el código: un comentario incorrecto es peor que ninguno.

## Manejo de errores

- **Formato uniforme de errores en la API:** toda respuesta de error devuelve la misma estructura, con un `codigo` estable legible por máquina (por ejemplo `CUENTA_PENDIENTE`, `VALIDACION_INVALIDA`), un `mensaje` apto para mostrar al usuario y, en validaciones, el detalle por campo.
- Códigos HTTP correctos (400 validación, 401 sin sesión, 403 sin permiso, 404 inexistente, 409 conflicto, 429 demasiados intentos, 500 error interno).
- **Separar mensajes al usuario de detalles técnicos:** el usuario ve qué pasó y qué hacer; stack traces, consultas y errores internos solo van a los logs, nunca a la respuesta.
- Un manejador de errores central en la API; no repetir `try/catch` para formatear errores en cada endpoint.
- Los errores inesperados se registran siempre con contexto suficiente para diagnosticarlos.
- En los clientes, traducir los códigos de error a mensajes claros y consistentes según la guía de usabilidad.

## Logs

- Logs estructurados en JSON con **Pino** en la API.
- Niveles: `error` (fallos que requieren atención), `warn` (situaciones anómalas o peticiones lentas), `info` (eventos relevantes: inicio del servidor, jobs, acciones de admin), `debug` (solo en desarrollo).
- Cada petición lleva un identificador que aparece en todos sus logs, para seguirla de punta a punta.
- **Nunca registrar datos sensibles:** contraseñas, tokens, cookies, cabeceras de autorización ni contenido de datos personales (montos, contactos, notas). Registrar identificadores, no contenido.

## Git

- **Commits chicos** y enfocados en un solo cambio, con mensajes según **Conventional Commits** en español: `feat: registro de gastos`, `fix: cálculo de fecha en recordatorios`, `docs: guía de testing`, `refactor:`, `test:`, `chore:`.
- **Una rama por funcionalidad o corrección** (`feat/registro-gastos`, `fix/zona-horaria-recordatorios`), integrada a `main` cuando está terminada según la definición de terminado. `main` siempre funciona.
- **Hooks con Lefthook:** antes de cada commit, Biome (lint y formato) sobre los archivos modificados y verificación de tipos; antes de cada push, la suite de tests. No saltear los hooks.
- **El hook revisa el índice, no el árbol de trabajo.** Mientras corre, aparta lo que no está stageado, pero los archivos sin trackear siguen en disco. Un commit parcial (algo stageado, algo no, archivos nuevos sin agregar) produce errores de tipos en cascada aunque `pnpm lint` y `pnpm typecheck` pasen sobre el árbol completo. Por eso: stagear todo lo que compone el paso (incluidos los archivos nuevos), no mezclar en el árbol trabajo de dos pasos al momento de commitear, y antes de proponer el mensaje de commit correr `pnpm lint`, `pnpm typecheck` y `pnpm exec lefthook run pre-commit` (valida el índice tal como se va a commitear).
- Capturas y archivos de depuración (`_falla.png` y similares) no se commitean: borrarlos o dejarlos fuera del índice.
- Nunca commitear secretos, archivos `.env`, datos reales ni archivos generados (builds, dependencias).
- No reescribir el historial de ramas compartidas.

## Formatos regionales

- Idioma y región por defecto: **español de Uruguay** (`es-UY`), configurable por usuario más adelante si hace falta.
- **Formateo siempre con `Intl`** (`Intl.NumberFormat`, `Intl.DateTimeFormat`) mediante utilidades compartidas en `packages/shared`; nunca armar formatos a mano.
- Montos: `$ 1.200,50` para pesos uruguayos y `US$ 1.200,50` para dólares. Fechas: `16/09/2026`. Horas en formato de 24 horas.
- **Montos guardados como enteros en la unidad mínima** (centésimos) o como `numeric` en la base, nunca como números de punto flotante.
- Fechas y horas guardadas en UTC y mostradas en la zona horaria del usuario.
- **Varias monedas, una base.** Cada cuenta financiera tiene su moneda y sus importes están en ella; la moneda base de la persona (`usuarios.monedaPorDefecto`, UYU por defecto) es en la que se expresan totales, balances y estadísticas. Cada movimiento guarda el tipo de cambio con el que se convirtió y el importe ya convertido (ver `docs/decisiones.md`, 2026-10-04, que reemplaza la decisión de moneda única del 2026-09-30). Las conversiones se hacen siempre con `convertirCentavos` (`packages/shared`), con enteros y nunca con punto flotante. Todo campo donde se escribe un importe (`CampoDeImporte`) muestra dentro del propio campo el código de su moneda: la prop `moneda` es obligatoria.

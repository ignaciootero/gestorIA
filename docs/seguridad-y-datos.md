# Guía de seguridad y manejo de datos

Leer antes de crear o modificar endpoints, esquemas de base de datos, migraciones, subida de archivos o cualquier cosa que involucre datos de usuarios.

El sistema guarda información personal de otras personas (gastos, contactos, facturas). La seguridad y la privacidad son la máxima prioridad del proyecto.

## Seguridad de la API

- **Validar con Zod toda entrada** que llegue a la API: cuerpo, parámetros de ruta, query y cabeceras relevantes. Nunca confiar en validaciones del cliente.
- **El id de usuario sale siempre de la sesión**, y toda consulta de datos personales filtra por ese usuario (ver principios de arquitectura en `CLAUDE.md`).
- **CORS restringido** a los dominios propios de la web; nada de `*`.
- **Cabeceras de seguridad** en web y API: Content-Security-Policy, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy` y protección contra embebido (`frame-ancestors`).
- Cookies de sesión `HttpOnly`, `Secure` y `SameSite`; protección CSRF según la configuración de Better Auth.
- **Rate limiting** en autenticación y en endpoints costosos o sensibles (y en la futura entrada por lenguaje natural, que tiene costo por uso).
- Consultas siempre mediante Drizzle o consultas parametrizadas; nunca concatenar SQL con datos del usuario.
- HTTPS obligatorio en producción.

## Secretos y configuración

- Secretos solo en variables de entorno, documentadas en `.env.example` con valores de ejemplo. Nunca en el código ni en commits.
- La API key de Claude vive solo en el backend; los clientes nunca llaman directamente a servicios externos con credenciales.
- Validar las variables de entorno con Zod al iniciar cada app y fallar con un mensaje claro si falta alguna.

## Dependencias

- Ejecutar `pnpm audit` periódicamente y al agregar dependencias; atender las vulnerabilidades altas y críticas.
- Preferir librerías mantenidas, populares y con licencia libre; registrar cada una en `docs/librerias.md`.
- Mantener el archivo de lock versionado.

## Archivos subidos

- Validar **tipo real** (por contenido, no solo por extensión) y **tamaño máximo** en el servidor. Tipos permitidos explícitos (por ejemplo PDF e imágenes para facturas).
- Renombrar los archivos con identificadores generados; nunca usar el nombre original como ruta.
- Guardarlos fuera de las carpetas públicas y servirlos solo tras verificar que pertenecen al usuario de la sesión.

## Logs y privacidad

- No registrar datos sensibles ni contenido personal en logs (ver guía de convenciones).
- Las acciones de admin quedan en la tabla de auditoría.

## Migraciones de base de datos

- Todo cambio de esquema se hace con una **migración nueva** generada con Drizzle. **Nunca modificar una migración ya aplicada**, ni en desarrollo compartido ni en producción.
- Revisar el SQL generado antes de aplicarlo, especialmente si elimina o renombra columnas o tablas.
- Cambios destructivos en dos pasos cuando haya datos: primero agregar y migrar datos, después eliminar lo viejo.
- Las migraciones se prueban contra la base de tests antes de aplicarse en producción.

## Backups

- **Backups automáticos diarios** de la base de producción (configurados en Coolify), con retención de al menos varias semanas y una copia fuera del VPS.
- Incluir en los backups los archivos subidos.
- **Probar la restauración** al configurar los backups y periódicamente después; un backup nunca restaurado no cuenta como backup.
- Documentar en el README el procedimiento de restauración.

## Borrado y control de los datos

- **Borrado lógico** (campo `eliminadoEn`) en entidades de usuario como gastos, contactos, facturas y tareas, para permitir deshacer y evitar pérdidas accidentales. Las consultas excluyen por defecto lo eliminado.
- Borrado definitivo automático de lo eliminado lógicamente después de un plazo (por ejemplo 30 días) mediante un job de pg-boss.
- **Exportación de datos:** cada usuario puede descargar todos sus datos en un formato abierto (JSON y/o CSV).
- **Eliminación de cuenta:** un usuario puede solicitar borrar su cuenta, lo que elimina definitivamente todos sus datos personales (y sus archivos) tras una confirmación clara. El registro de auditoría conserva solo lo mínimo necesario, sin contenido personal.
- Estas funciones se implementan cuando existan módulos con datos, pero el esquema se diseña desde el inicio pensando en ellas.

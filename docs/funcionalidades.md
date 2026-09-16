# Funcionalidades

Qué hace el sistema hoy, cómo funciona a grandes rasgos y dónde está en el código.
Se actualiza con cada funcionalidad nueva (ver `docs/guias/convenciones.md`).

Estado: **paso 1 de la hoja de ruta (infraestructura)**. Todavía no hay autenticación
ni módulos de negocio.

---

## Infraestructura

### Monorepo

Un solo repositorio con pnpm workspaces y Turborepo.

- `apps/api`: la API (Hono). Es el único backend; web y móvil la consumen.
- `apps/web`, `apps/mobile`: placeholders, sin código todavía.
- `packages/config`: `tsconfig` base compartido.
- `packages/db`: cliente de base de datos, esquemas y migraciones.

Turborepo encadena las tareas (`build`, `typecheck`, `test`) respetando las
dependencias entre paquetes y cachea los resultados: si un paquete no cambió, no se
vuelve a compilar.

**Paquetes internos compilados.** `packages/db` se compila a `dist/` con `tsc` y su
`exports` apunta a `dist` para el runtime y a `src` para los tipos. Es lo que
corresponde cuando el consumidor es Node sin bundler, que es el caso de la API.

**Ejecución de TypeScript.** Node 24 ejecuta archivos `.ts` directamente borrando los
tipos, así que en desarrollo la API corre con `node --watch src/index.ts` sin ninguna
herramienta intermedia. Para que el mismo archivo funcione en desarrollo y compilado,
el `tsconfig` usa `erasableSyntaxOnly` (prohíbe sintaxis que Node no puede borrar, como
`enum`) y `rewriteRelativeImportExtensions` (los imports se escriben con `.ts` y `tsc`
los reescribe a `.js` al emitir).

Dónde: `pnpm-workspace.yaml`, `turbo.json`, `packages/config/tsconfig.base.json`.

### Base de datos

PostgreSQL local (sin Docker) con dos bases separadas:

- **`gestion`**: desarrollo.
- **`gestion_test`**: tests de integración. Los tests nunca tocan la de desarrollo.

`pnpm db:crear` crea las dos si no existen. Se conecta con el driver de Node, así que
funciona igual en Windows y en Linux y no necesita `psql` en el PATH.

El acceso es con **Drizzle ORM** sobre un pool de `pg`. El cliente
(`crearClienteDb`) recibe la configuración como parámetro en vez de leerla del entorno:
así la API, las migraciones y los tests pueden apuntar a bases distintas sin trucos, y
se puede probar el caso de base caída con una conexión real que falla.

Migraciones con drizzle-kit: `pnpm db:generar` produce el SQL, `pnpm db:migrar` y
`pnpm db:migrar:test` lo aplican. Todavía no hay tablas de negocio; el esquema está
vacío a propósito.

Dónde: `packages/db/src/cliente.ts`, `packages/db/src/entorno.ts`,
`packages/db/src/crear-bases.ts`, `packages/db/src/migrar.ts`,
`packages/db/drizzle.config.ts`.

### API

Hono sobre Node. La app se construye con `crearApp({ cliente, logger, entorno })`, que
recibe sus dependencias en vez de crearlas: eso es lo que permite testearla sin levantar
un servidor ni tocar variables globales.

Middlewares, en orden:

1. **Id de petición** (`hono/request-id`): un UUID por petición, devuelto en la cabecera
   `X-Request-Id`.
2. **Logs** (ver abajo).
3. **Cabeceras de seguridad**: CSP `default-src 'none'`, `frame-ancestors 'none'`,
   `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` y HSTS solo en
   producción.
4. **CORS restringido** a los orígenes de `ORIGENES_PERMITIDOS`. El comodín `*` está
   rechazado por la validación de entorno: no se puede configurar ni por error.

Dónde: `apps/api/src/app.ts`, `apps/api/src/index.ts`.

### Variables de entorno

Se validan con Zod al arrancar. Si falta o es inválida alguna, el proceso no arranca y
escribe qué variable está mal y que hay que copiar `.env.example`. Es preferible no
arrancar a arrancar a medias y fallar en la primera petición.

Las variables viven en un único `.env` en la raíz, que **no se versiona**. Las carga
Node con `--env-file-if-exists` (o `process.loadEnvFile()` donde no se pueden pasar
flags, como en la configuración de drizzle-kit y de Vitest).

Dónde: `apps/api/src/config/entorno.ts`, `packages/db/src/entorno.ts`, `.env.example`.

### Logs

Pino, en JSON. En desarrollo se embellecen con pino-pretty para poder leerlos; en
producción la salida es JSON plano.

Cada petición genera una línea al cerrarse, con `idPeticion`, `metodo`, `ruta`,
`estado` y `duracionMs`. El `idPeticion` va en un logger hijo, así que **todo** lo que
se loguee durante esa petición lo lleva y se puede seguir de punta a punta.

El nivel depende del resultado:

- `error` si el estado es 500 o más;
- `warn` si la petición superó los **200 ms** (objetivo de `docs/guias/rendimiento.md`);
- `info` en el resto.

No se registran cabeceras, cuerpos ni query strings, que pueden traer datos personales.
Además Pino tiene configurado un `redact` que oculta `authorization`, `cookie`,
`password`, `token` y similares por si alguna vez llegaran a un log.

Dónde: `apps/api/src/logger.ts`, `apps/api/src/middlewares/logs.ts`.

### Manejo de errores

Un único manejador central arma todas las respuestas de error: los endpoints lanzan y no
repiten `try/catch` para formatear.

Formato de toda respuesta de error:

```json
{
  "error": {
    "codigo": "VALIDACION_INVALIDA",
    "mensaje": "Revisá los datos ingresados.",
    "campos": [{ "campo": "email", "mensaje": "Email inválido" }],
    "idPeticion": "ba91b1fb-da58-4a97-aa85-6f7efe374567"
  }
}
```

- `codigo`: estable y legible por máquina. Es parte del contrato con web y móvil, que lo
  traducen a sus propios mensajes. No se renombran a la ligera.
- `mensaje`: apto para mostrarle al usuario.
- `campos`: solo en errores de validación.
- `idPeticion`: el mismo que aparece en los logs, para poder diagnosticar un problema
  que reporta un usuario sin pedirle nada más.

Códigos definidos hoy: `VALIDACION_INVALIDA` (400), `NO_AUTENTICADO` (401),
`SIN_PERMISO` (403), `NO_ENCONTRADO` (404), `CONFLICTO` (409),
`DEMASIADOS_INTENTOS` (429), `BASE_NO_DISPONIBLE` (503), `ERROR_INTERNO` (500).

El manejador reconoce tres cosas y todo lo demás lo trata como 500 genérico: `ErrorApi`
(los errores propios), `ZodError` (validaciones sin envolver) y `HTTPException` (errores
del propio Hono, como un cuerpo malformado).

**Los detalles técnicos nunca salen en la respuesta.** Stack traces, SQL y mensajes del
driver van al log; el usuario ve qué pasó y qué hacer.

Dónde: `apps/api/src/errores/`, `apps/api/src/middlewares/errores.ts`.

### `GET /health`

Dice si la API está viva y si la base responde. Lo usan el despliegue y los chequeos
manuales. No requiere sesión.

Con la base disponible devuelve **200**:

```json
{
  "estado": "ok",
  "version": "0.1.0",
  "base": { "estado": "ok", "duracionMs": 2 },
  "tiempo": "2026-09-16T20:59:10.205Z"
}
```

Si la base no responde devuelve **503** con el formato de error y el código
`BASE_NO_DISPONIBLE`. El motivo real queda en el log.

A propósito no expone la versión de PostgreSQL, rutas ni configuración: para alguien que
esté haciendo reconocimiento, eso es información gratis. La respuesta lleva
`Cache-Control: no-store`, porque un chequeo de salud cacheado no sirve de nada.

Dónde: `apps/api/src/rutas/salud.ts`.

---

## Calidad

- **Biome** para lint y formato, con finales de línea LF forzados.
- **Lefthook**: antes de cada commit, Biome sobre los archivos modificados y
  verificación de tipos de todo el monorepo; antes de cada push, la suite de tests.
- **Vitest**: 20 tests. Los de integración corren contra `gestion_test` real, sin mocks
  de la base, e incluyen el caso de base no disponible, el formato de error, las
  cabeceras de seguridad, CORS y que la respuesta de error no filtre nada técnico.

Dónde: `biome.json`, `lefthook.yml`, `apps/api/vitest.config.ts`,
`apps/api/src/**/*.test.ts`.

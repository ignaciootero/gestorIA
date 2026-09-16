# Librerías y herramientas

Cada dependencia del proyecto, para qué está, dónde se usa, por qué se eligió y su
licencia. **Al quitar una dependencia, quitarla también de acá**
(ver `docs/guias/convenciones.md`).

Todas las licencias son libres y sin costo, según la restricción de `CLAUDE.md`.

## Entorno base

| Herramienta | Versión | Licencia | Para qué |
|---|---|---|---|
| Node.js | 24 | MIT | Runtime de la API y de todos los scripts. Se eligió la 24 porque ejecuta TypeScript directamente y trae `--env-file` y `process.loadEnvFile()`, lo que nos ahorra `tsx` y `dotenv`. |
| pnpm | 12 | MIT | Gestor de paquetes y workspaces del monorepo. Instala rápido y sin duplicar, y el catálogo centraliza las versiones compartidas. |
| PostgreSQL | 18 | PostgreSQL License | Base de datos. Instalado localmente en Windows, sin Docker. |

## Monorepo y lenguaje

| Librería | Versión | Licencia | Dónde | Para qué |
|---|---|---|---|---|
| `turbo` | 2.10 | MIT | raíz | Orquesta y cachea las tareas (`build`, `typecheck`, `test`) respetando las dependencias entre paquetes. |
| `typescript` | 7.0 | Apache-2.0 | todo el repo | Tipado estático estricto. La 7 es el compilador reescrito en Go: mismo `tsc`, entre 8 y 12 veces más rápido. |
| `@types/node` | 24 | MIT | todo el repo | Tipos de las APIs de Node. |

## API

| Librería | Versión | Licencia | Dónde | Para qué |
|---|---|---|---|---|
| `hono` | 4.13 | MIT | `apps/api` | Framework HTTP. Chico, rápido, tipado de punta a punta y basado en las APIs web estándar (`Request`/`Response`), lo que permite testear la app sin levantar un servidor. Trae de fábrica lo que necesitamos: id de petición, CORS, cabeceras de seguridad y manejador central de errores. |
| `@hono/node-server` | 2.1 | MIT | `apps/api` | Adaptador para correr Hono sobre Node. |
| `pino` | 10.3 | MIT | `apps/api` | Logs estructurados en JSON. Es el logger más rápido del ecosistema Node y el que pide la guía de convenciones. |
| `pino-pretty` | 13.1 | MIT | `apps/api` (solo desarrollo) | Formatea los logs para leerlos en la consola. No se carga en producción. |
| `zod` | 4.6 | MIT | `apps/api`, `packages/db` | Validación de variables de entorno hoy, y de toda entrada de la API más adelante. Elegido por `CLAUDE.md` como validador único para formularios, API y las futuras herramientas de la IA. |

## Base de datos

| Librería | Versión | Licencia | Dónde | Para qué |
|---|---|---|---|---|
| `drizzle-orm` | 0.45 | Apache-2.0 | `packages/db` | ORM. Genera SQL predecible y tipado, sin capa de magia encima: se ve qué consulta sale. |
| `drizzle-kit` | 0.31 | MIT | `packages/db` | Genera las migraciones a partir del esquema y permite revisar el SQL antes de aplicarlo. |
| `pg` | 8.23 | MIT | `packages/db` | Driver de PostgreSQL para Node, con pool de conexiones. Es el driver que usa Drizzle y el que permite crear las bases desde un script multiplataforma. |
| `@types/pg` | 8.23 | MIT | `packages/db` | Tipos de `pg`. |

## Calidad y tests

| Librería | Versión | Licencia | Dónde | Para qué |
|---|---|---|---|---|
| `@biomejs/biome` | 2.5 | MIT OR Apache-2.0 | raíz | Lint y formato en una sola herramienta, escrita en Rust. Reemplaza a ESLint + Prettier con una configuración y sin plugins. Fuerza finales de línea LF, que es lo que necesitamos trabajando entre Windows y Linux. |
| `lefthook` | 2.1 | MIT | raíz | Hooks de Git. Es un binario propio, así que no depende de scripts de shell y funciona igual en Windows y en Linux. |
| `vitest` | 5.0 | MIT | `apps/api` | Tests unitarios y de integración. Entiende TypeScript y ESM sin configuración extra. |

## Pendientes del stack

Definidas en `CLAUDE.md` pero todavía sin instalar, porque corresponden a pasos
posteriores de la hoja de ruta: Next.js, Tailwind CSS, shadcn/ui, Motion, Expo,
NativeWind, Reanimated, Better Auth, TanStack Query, FlashList, pg-boss, Nodemailer,
Playwright, axe-core, jest-expo y React Native Testing Library.

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
| `vitest` | 5.0 | MIT | `apps/api`, `packages/shared`, `packages/ui-tokens` | Tests unitarios y de integración. Entiende TypeScript y ESM sin configuración extra. |
| `@playwright/test` | 1.63 | Apache-2.0 | `apps/web` | Tests end-to-end en un navegador real. Levanta la API y la web por su cuenta y las apunta a `gestion_test`. |
| `@axe-core/playwright` | 4.13 | MPL-2.0 | `apps/web` | Auditoría automática de accesibilidad dentro de los tests end-to-end. Ya encontró un problema real de contraste. |

## Autenticación

| Librería | Versión | Licencia | Dónde | Para qué |
|---|---|---|---|---|
| `better-auth` | 1.7 | MIT | `apps/api`, `apps/web` | Registro, login, sesiones, verificación de correo y administración de cuentas. Corre en nuestro servidor: ningún dato de las personas sale a un servicio externo. Se usan sus plugins `username` (entrar con usuario además de con correo) y `admin` (roles y bloqueo). |
| `nodemailer` | 10.0 | MIT-0 | `apps/api` | Envío de los correos de verificación por SMTP. Es la librería de correo estándar de Node y no depende de ningún servicio pago: funciona con cualquier SMTP. Sin SMTP configurado, la API escribe los correos en el log en vez de fallar. |
| `@types/nodemailer` | 8.0 | MIT | `apps/api` | Tipos de `nodemailer`. |

## Web

| Librería | Versión | Licencia | Dónde | Para qué |
|---|---|---|---|---|
| `next` | 16.3 | MIT | `apps/web` | Framework de la web. En la 16 el middleware pasó a llamarse `proxy` y `cookies()` es asíncrono. |
| `react` / `react-dom` | 19.3 | MIT | `apps/web` | Interfaz. |
| `tailwindcss` | 4.3 | MIT | `apps/web` | Estilos. La v4 se configura en CSS con `@theme`, sin `tailwind.config.ts`. Los valores salen de `packages/ui-tokens`. |
| `@tailwindcss/postcss` | 4.3 | MIT | `apps/web` | Integración de Tailwind con PostCSS. |
| `geist` | 1.7 | SIL OFL | `apps/web` | Tipografía del proyecto, cargada con `next/font`: se sirve desde nuestro dominio, sin pedidos a servidores ajenos. |
| `lucide-react` | 1.46 | ISC | `apps/web` | Íconos de trazo fino. |
| `motion` | 13.4 | MIT | `apps/web` | Animaciones. Solo `transform` y `opacity`, y respeta la preferencia de reducir movimiento. |
| `@tanstack/react-query` | 5.103 | MIT | `apps/web` | Datos en el cliente: caché, revalidación en segundo plano y estados de carga y error. |
| `react-hook-form` | 7.88 | MIT | `apps/web` | Estado y validación de formularios sin re-renderizar en cada tecla. |
| `@hookform/resolvers` | 5.9 | MIT | `apps/web` | Conecta react-hook-form con los esquemas Zod de `packages/shared`, para no duplicar reglas entre cliente y servidor. |
| `clsx` | 2.1 | MIT | `apps/web` | Arma listas de clases condicionales. |
| `tailwind-merge` | 3.7 | MIT | `apps/web` | Resuelve clases de Tailwind en conflicto, para que lo que pasa quien usa un componente gane sobre el valor por defecto. |
| `recharts` | 3.10 | MIT | `apps/web` | Gráficos del módulo de ingresos y gastos (gastos por categoría, evolución por período). Es la librería de gráficos para React más usada y mantenida; se eligió antes que armar los gráficos a mano porque la guía de estadísticas pide varios tipos (barras, líneas) con interacción básica, y Recharts los da con poco código, cargados de forma diferida para no engordar el resto de la aplicación. |

## Pendientes del stack

Definidas en `CLAUDE.md` pero todavía sin instalar, porque corresponden a pasos
posteriores de la hoja de ruta: Expo, NativeWind, Reanimated, FlashList, pg-boss,
jest-expo y React Native Testing Library.

**Sobre shadcn/ui.** Está en el stack de `CLAUDE.md` pero todavía no se instaló.
Los componentes que necesitan estas pantallas (botón, campo, tarjeta, aviso) son
pocos y simples, y escribirlos sobre nuestros propios tokens evitó traer Radix y
su configuración para cinco componentes. Se incorpora cuando haga falta algo que
sí lo justifique: diálogos, menús o selects accesibles, donde Radix resuelve
problemas difíciles de teclado y foco que no conviene reimplementar.

# gestorIA

Sistema de gestión personal (gastos, contactos, calendario, facturas, tareas y
notificaciones) para un grupo reducido de usuarios conocidos, con clientes web y móvil
sobre una misma API.

El nombre es un juego de palabras entre **gestoría** e **IA**, por la entrada por
lenguaje natural que se suma al final de la hoja de ruta. Se escribe siempre así, con
la g minúscula y las dos últimas letras en mayúscula.

Estado actual: **pasos 1 a 7 de la hoja de ruta**. Hay monorepo, base de datos, API con
autenticación, sistema visual, panel de admin y dos módulos de negocio: ingresos y
gastos, con transferencias entre cuentas, organizados en períodos que abre y cierra cada
persona (no en meses calendario), contactos (personas y empresas o servicios, con etiquetas,
favoritos y recordatorios), tareas (to-do con tareas repetitivas, categorías, historial y tareas fallidas) y un calendario
que junta los vencimientos de deudas, los recordatorios de contactos y las tareas pendientes, y permite
anotar eventos a mano.
Todavía no hay móvil ni entrada por lenguaje natural. Ver `CLAUDE.md` para el
panorama completo.

## Requisitos

| | Versión |
|---|---|
| Node.js | 24 o superior |
| pnpm | 12 o superior (`npm install -g pnpm`) |
| PostgreSQL | 16 o superior, instalado localmente (sin Docker) |

## Puesta en marcha

Todos los comandos se corren desde la raíz del proyecto, en PowerShell.

```powershell
# 1. Instalar dependencias (también deja instalados los hooks de Git)
pnpm install

# 2. Crear el archivo de variables de entorno
Copy-Item .env.example .env
```

Abrí `.env` y completá dos cosas. Ese archivo no se versiona.

- **`POSTGRES_PASSWORD`**: la contraseña que pusiste al instalar PostgreSQL.
- **`BETTER_AUTH_SECRET`**: una clave de al menos 32 caracteres, propia y distinta en
  cada entorno. Para generarla:

  ```powershell
  [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
  ```

  En Linux: `openssl rand -base64 32`.

```powershell
# 3. Crear las bases de datos "gestion" (desarrollo) y "gestion_test" (tests)
pnpm db:crear

# 4. Aplicar las migraciones a las dos bases
pnpm db:migrar
pnpm db:migrar:test

# 5. Crear tu cuenta de administrador (pide la contraseña por consola)
pnpm usuario:admin

# 6. Levantar la API y la web
pnpm dev
```

La web queda en `http://localhost:3000` y la API en `http://localhost:3001`.

Al entrar a la web sin sesión vas directo a **`/ingresar`**, donde podés entrar con tu
usuario **o** con tu correo, indistinto. Después del login llegás a `/inicio`.

### Cómo entra alguien nuevo

Para poder entrar hacen falta **dos cosas**, y con una sola no alcanza:

1. **Confirmar el correo.** Al registrarse sale un mail con un enlace que vale 24 horas.
2. **Que un admin apruebe la cuenta**, con `pnpm usuario:aprobar <usuario>`.

Mientras falte alguna, el login se rechaza explicando cuál.

### Ver los correos en desarrollo

Sin SMTP configurado —que es lo normal en desarrollo— **los correos no se mandan: se
escriben en el log de la API**, con el enlace completo. Buscá en la consola de `pnpm dev`
la línea `correo NO enviado (SMTP sin configurar)` y copiá el enlace al navegador.

Para mandar correos de verdad hay que completar las variables `SMTP_*` del `.env`. Sirve
cualquier servidor SMTP. En producción es obligatorio: sin eso, nadie puede confirmar su
cuenta.

Para probar la API sola:

```powershell
Invoke-RestMethod http://localhost:3001/health
```

Respuesta esperada:

```json
{
  "estado": "ok",
  "version": "0.1.0",
  "base": { "estado": "ok", "duracionMs": 2 },
  "tiempo": "2026-09-16T12:00:00.000Z"
}
```

### Sobre la contraseña del admin

`pnpm usuario:admin` la pide por consola y no la guarda en ningún lado. El script es
idempotente: si la cuenta ya existe, no la duplica ni le pisa la contraseña.

La cuenta del admin queda con el correo dado por confirmado: la creás vos desde el
servidor, así que no hay nada que verificar. Si no fuera así, el primer admin quedaría
sin poder entrar y sin nadie que lo aprobara.

En un entorno sin terminal (el seed automático en el VPS) se puede pasar en la variable
`ADMIN_PASSWORD` **solo para ese comando**, sin dejarla en el `.env`.

### Crear las bases a mano (alternativa)

`pnpm db:crear` usa el driver de Node y no necesita que `psql` esté en el PATH, así que
es la forma recomendada. Si preferís hacerlo con `psql`, en una instalación estándar de
PostgreSQL 18 en Windows:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE gestion;"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE gestion_test;"
```

En Linux: `sudo -u postgres createdb gestion && sudo -u postgres createdb gestion_test`.

## Comandos

### Desarrollo

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Levanta la API y la web en modo desarrollo, recargando al guardar |
| `pnpm build` | Compila todos los paquetes a `dist/` |
| `pnpm typecheck` | Verifica tipos en todo el monorepo |

### Calidad

| Comando | Qué hace |
|---|---|
| `pnpm lint` | Biome: lint y formato (solo revisa) |
| `pnpm lint:fix` | Biome: arregla lo que puede |
| `pnpm format` | Biome: solo formatea |

### Tests

| Comando | Qué hace |
|---|---|
| `pnpm test` | Toda la suite |
| `pnpm test:unitarios` | Solo unitarios (no tocan la base) |
| `pnpm test:integracion` | Solo integración (contra `gestion_test`) |
| `pnpm test:e2e` | End-to-end con Playwright, en un navegador real |

Los tests de integración usan la base **`gestion_test`**, nunca la de desarrollo. Tiene
que existir y tener las migraciones aplicadas (pasos 3 y 4 de la puesta en marcha).

El e2e levanta su propia API (puerto 3101) y su propia web (puerto 3100, carpeta de
compilación `.next-e2e`), así que se puede correr con `pnpm dev` abierto. Las cotizaciones de
monedas nunca salen a internet en los tests: los de la API usan una fuente falsa y los del
navegador interceptan el pedido.

### Base de datos

| Comando | Qué hace |
|---|---|
| `pnpm db:crear` | Crea `gestion` y `gestion_test` si no existen |
| `pnpm db:generar` | Genera una migración nueva a partir de los cambios del esquema |
| `pnpm db:migrar` | Aplica las migraciones pendientes a la base de desarrollo |
| `pnpm db:migrar:test` | Aplica las migraciones pendientes a la base de tests |

Una migración ya aplicada **nunca se edita**: se genera una nueva
(ver `docs/guias/seguridad-y-datos.md`).

### Cuentas

| Comando | Qué hace |
|---|---|
| `pnpm usuario:admin` | Crea el primer administrador. Pide la contraseña por consola |
| `pnpm usuario:aprobar --listar` | Muestra las solicitudes pendientes y si ya confirmaron el correo |
| `pnpm usuario:aprobar <usuario>` | Aprueba una cuenta. Acepta el usuario o el correo |
| `pnpm usuario:aprobar <usuario> --rechazar` | La rechaza y le cierra las sesiones abiertas |
| `pnpm usuario:sembrar` | Carga los datos de prueba: `iotero`/`iotero` (admin, con el panel lleno), `dpaolillo1`/`dpaolillo1` (un año de uso) y `dpaolillo2`/`dpaolillo2` (vacía), más cuentas en distintos estados para el panel (contraseña `prueba1234`). No pisa cuentas que ya existen ni manda correos. Ver docs/funcionalidades.md |
| `pnpm usuario:sembrar --borrar-todo` | Antes de cargar, borra todas las cuentas con sus datos (pide confirmación; con `--forzar` no pregunta). Es la forma de volver a empezar de cero |

Hasta que exista el panel de admin, estos comandos son la única forma de aprobar una
cuenta que se registró y quedó pendiente.

## Guía de estilo

En desarrollo, `http://localhost:3000/guia-de-estilo` muestra todos los tokens y
componentes del sistema visual en un solo lugar, para revisar contraste y consistencia
en modo claro y oscuro. En producción devuelve 404.

## Estructura

```
apps/
  api/        Hono + Pino + Better Auth + pg-boss (tareas programadas). Único backend, lo consumen web y móvil
  web/        Next.js: ingreso, inicio, panel de admin y los módulos de ingresos y gastos (por períodos), contactos, tareas y calendario
  mobile/     Expo (placeholder, paso 6)
packages/
  config/     tsconfig base y configuración compartida
  db/         Cliente Drizzle, esquemas y migraciones
  shared/     Esquemas Zod, códigos de error y constantes compartidas
  ui-tokens/  Colores, tipografía, espaciado y animaciones
  testing/    Fábricas de datos de prueba
docs/
  guias/      Guías de trabajo del proyecto
```

## Hooks de Git

Lefthook se instala solo con `pnpm install`:

- **antes de cada commit:** Biome sobre los archivos modificados (arregla y los vuelve a
  agregar) y verificación de tipos de todo el monorepo;
- **antes de cada push:** la suite de tests.

No se saltean. Si un hook falla, se arregla la causa.

## Ambiente de prueba en Render

Hay un ambiente de prueba gratuito en [Render](https://render.com), descrito en `render.yaml`: la web y la
API en un solo servicio y una base PostgreSQL gratuita, sin correo. No es la producción. Cómo ponerlo en
marcha, cargar las cuentas de prueba desde tu máquina y sus límites (se duerme sin visitas, la base vence a los 30 días):
[docs/despliegue-render.md](docs/despliegue-render.md).

## Restauración de backups

Todavía no aplica: no hay entorno de producción. Se documenta acá al configurar los
backups automáticos en Coolify, junto con la prueba de restauración
(ver `docs/guias/seguridad-y-datos.md`).

## Documentación

| Archivo | Contenido |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Contexto del proyecto, stack, arquitectura y hoja de ruta |
| [docs/funcionalidades.md](docs/funcionalidades.md) | Qué hace el sistema hoy y dónde está en el código |
| [docs/librerias.md](docs/librerias.md) | Cada dependencia, para qué está y con qué licencia |
| [docs/decisiones.md](docs/decisiones.md) | Decisiones de arquitectura, con fecha y alternativas |
| [docs/despliegue-render.md](docs/despliegue-render.md) | El ambiente de prueba en Render: cómo está armado y cómo ponerlo en marcha |
| [docs/guias/](docs/guias/) | Convenciones, seguridad, testing, usabilidad, estética y rendimiento |

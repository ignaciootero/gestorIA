# Sistema de gestión personal

Sistema de gestión general (gastos, contactos, calendario, facturas, tareas y
notificaciones) para un grupo reducido de usuarios conocidos, con clientes web y móvil
sobre una misma API.

Estado actual: **paso 1 de la hoja de ruta (infraestructura)**. Hay monorepo, base de
datos, API con endpoint de salud y las herramientas de calidad. Todavía no hay
autenticación ni módulos de negocio. Ver `CLAUDE.md` para el panorama completo.

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

Abrí `.env` y completá **`POSTGRES_PASSWORD`** con la contraseña que pusiste al
instalar PostgreSQL. Ese archivo no se versiona: es el único lugar donde vive la
contraseña.

```powershell
# 3. Crear las bases de datos "gestion" (desarrollo) y "gestion_test" (tests)
pnpm db:crear

# 4. Aplicar las migraciones a las dos bases
pnpm db:migrar
pnpm db:migrar:test

# 5. Levantar la API
pnpm dev
```

La API queda en `http://localhost:3001`. Para probarla:

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
| `pnpm dev` | Levanta la API en modo desarrollo, recargando al guardar |
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

Los tests de integración usan la base **`gestion_test`**, nunca la de desarrollo. Tiene
que existir y tener las migraciones aplicadas (pasos 3 y 4 de la puesta en marcha).

### Base de datos

| Comando | Qué hace |
|---|---|
| `pnpm db:crear` | Crea `gestion` y `gestion_test` si no existen |
| `pnpm db:generar` | Genera una migración nueva a partir de los cambios del esquema |
| `pnpm db:migrar` | Aplica las migraciones pendientes a la base de desarrollo |
| `pnpm db:migrar:test` | Aplica las migraciones pendientes a la base de tests |

Una migración ya aplicada **nunca se edita**: se genera una nueva
(ver `docs/guias/seguridad-y-datos.md`).

## Estructura

```
apps/
  api/        Hono + Pino. Único backend, lo consumen web y móvil
  web/        Next.js (placeholder, paso 3 de la hoja de ruta)
  mobile/     Expo (placeholder, paso 6)
packages/
  config/     tsconfig base y configuración compartida
  db/         Cliente Drizzle, esquemas y migraciones
docs/
  guias/      Guías de trabajo del proyecto
```

## Hooks de Git

Lefthook se instala solo con `pnpm install`:

- **antes de cada commit:** Biome sobre los archivos modificados (arregla y los vuelve a
  agregar) y verificación de tipos de todo el monorepo;
- **antes de cada push:** la suite de tests.

No se saltean. Si un hook falla, se arregla la causa.

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
| [docs/guias/](docs/guias/) | Convenciones, seguridad, testing, usabilidad, estética y rendimiento |

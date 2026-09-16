# Sistema de gestión personal

Sistema de gestión general para un grupo reducido de usuarios conocidos. Web y móvil, con módulos muy integrados entre sí. Los módulos se definen a pedido (ver hoja de ruta); ideas iniciales: gastos, contactos, calendario con recordatorios, facturas, lista de tareas (to-do) y notificaciones. Al final se sumará entrada por lenguaje natural (por ejemplo "hoy gasté 1200 en comida") usando la API de Claude con tool use.

El proyecto también es de aprendizaje: explicá las decisiones importantes y no ocultes complejidad detrás de magia.

## Guías de trabajo

Este archivo tiene lo esencial. El detalle está en `docs/guias/`. **Leer la guía correspondiente antes de empezar cada tarea**:

| Guía | Leer antes de… |
|---|---|
| `convenciones.md` | Empezar a trabajar en el proyecto; ante dudas de nombres, idioma, errores, logs, commits, documentación, comentarios o formatos regionales |
| `seguridad-y-datos.md` | Crear o modificar endpoints, esquemas, migraciones, subida de archivos o manejo de datos de usuarios |
| `testing.md` | Implementar o modificar cualquier funcionalidad |
| `usabilidad.md` | Trabajar en pantallas, formularios o flujos de usuario |
| `estetica.md` | Trabajar en interfaz, componentes, estilos o animaciones |
| `rendimiento.md` | Crear endpoints, consultas, listados o pantallas con datos, o agregar dependencias al cliente |

## Prioridades ante conflictos

Cuando dos requisitos choquen, se resuelve en este orden:

1. **Seguridad y privacidad** de los datos.
2. **Correctitud:** que los datos sean exactos y no se pierdan.
3. **Usabilidad:** claridad y facilidad de uso.
4. **Rendimiento:** respuesta rápida y navegación fluida.
5. **Estética:** consistencia visual y animaciones.

La **simplicidad del código** es un criterio transversal: ante soluciones equivalentes, elegir la más simple. Si un conflicto no se resuelve claramente con este orden, consultar.

## Restricciones generales

- **Todo open source y sin costo.** No agregar servicios ni dependencias pagas o con plan gratuito limitado. Únicos gastos previstos: API de Claude (al final), VPS y dominio.
- **Consultar antes de agregar una dependencia nueva** que no esté en el stack definido.
- **Verificar la documentación actual** de cada librería antes de usarla (Next.js, Expo, Better Auth y Drizzle cambian seguido). No asumir APIs de memoria.
- **Entorno de desarrollo: Windows nativo** (sin WSL ni Docker). Producción: VPS Linux con Coolify. Todo script, comando y configuración debe funcionar en Windows y en Linux (ver guía de convenciones).

## Stack

- **Lenguaje:** TypeScript en modo estricto en todo el proyecto.
- **Monorepo:** pnpm workspaces + Turborepo.
- **Web:** Next.js (`apps/web`) con Tailwind CSS, shadcn/ui (sobre Radix) y Motion.
- **Móvil:** Expo / React Native (`apps/mobile`) con NativeWind y React Native Reanimated. Compilación local, sin EAS.
- **API:** Hono sobre Node (`apps/api`). Web y móvil consumen la misma API.
- **Base de datos:** PostgreSQL instalado localmente en Windows (base de desarrollo y base de tests separadas) + Drizzle ORM (`packages/db`).
- **Validación y tipos compartidos:** Zod (`packages/shared`).
- **Autenticación:** Better Auth con plugin de admin.
- **Datos en el cliente:** TanStack Query en web y móvil; FlashList para listas largas en móvil.
- **Tareas programadas:** pg-boss.
- **Logs:** Pino.
- **Email (futuro):** Nodemailer por SMTP.
- **Diseño:** tipografía Geist, íconos Lucide, tokens en `packages/ui-tokens`.
- **Calidad:** Biome (lint y formato), Lefthook (hooks de Git).
- **Testing:** Vitest, Playwright con axe-core, Jest con jest-expo y React Native Testing Library.

## Estructura

```
apps/
  web/              Next.js
  mobile/           Expo
  api/              Hono + Better Auth
    src/servicios/  Lógica de negocio, organizada por módulo
    src/rutas/      Endpoints: validan, llaman a servicios y responden
packages/
  db/               Esquemas Drizzle, migraciones, cliente
  shared/           Esquemas Zod, tipos, constantes, utilidades de formato
  config/           tsconfig y configuración compartida
  ui-tokens/        Colores, tipografía, espaciado y animaciones
  testing/          Fábricas de datos, fixtures y utilidades de prueba
docs/
  guias/            Guías de trabajo
.gitattributes      Finales de línea LF en todo el repositorio
```

## Principios de arquitectura

- **La lógica de negocio vive en `apps/api/src/servicios/<modulo>/`**, como funciones reutilizables (por ejemplo `crearGasto(usuarioId, datos)`). Las rutas solo validan, obtienen el usuario de la sesión, llaman al servicio y responden. Formularios, endpoints, jobs y la futura IA usan los mismos servicios. Nunca lógica de negocio en rutas ni en los clientes.
- **Esquemas Zod por entidad** en `packages/shared`, usados en formularios, API y futuras herramientas de la IA.
- **El id de usuario sale siempre de la sesión**, nunca del cuerpo de la petición.
- **Privacidad:** toda consulta de datos personales filtra por el usuario de la sesión, sin excepción para el rol admin. El admin gestiona cuentas pero no ve datos ajenos. Impersonación desactivada.
- **Permisos verificados en el backend.** Ocultar opciones en la UI es solo cosmético.
- **Fechas en UTC** en la base; cada usuario tiene zona horaria y moneda por defecto.
- **Categorías, monedas y similares como datos**, no hardcodeadas.
- **Modelo de datos integrado:** las entidades se referencian entre sí (factura ↔ contacto ↔ gasto ↔ recordatorio) y existe una tabla central de notificaciones/actividad que cualquier módulo puede alimentar.
- Recurrencias de calendario con el estándar RRULE.

## Autenticación y administración

- Email y contraseña con Better Auth.
- **Registro público con aprobación manual:** campo `estado` (`pendiente`, `aprobado`, `rechazado`). Los registros nuevos entran como `pendiente`, sin inicio de sesión automático. El login rechaza cuentas no aprobadas, y el middleware lo vuelve a verificar.
- Formulario de registro con campo opcional "¿Quién sos?" y honeypot anti-bots. Rate limiting en registro y login.
- Campos adicionales del usuario: `estado`, `mensajeRegistro`, `zonaHoraria`, `monedaPorDefecto`, `debeCambiarPassword`.
- **Primer admin creado por script de seed** con datos de variables de entorno. Ningún endpoint permite volverse admin.
- **Panel de admin (solo web):** solicitudes de registro, listado de usuarios, reseteo de contraseña (contraseña temporal, cierre de sesiones y cambio obligatorio en el próximo login) y bloqueo de cuentas.
- Tabla de auditoría de acciones de admin (quién, qué, a quién, cuándo).
- Sin recuperación de contraseña por email por ahora.

## Hoja de ruta

1. Infraestructura: monorepo, Postgres, Drizzle, Pino, Lefthook, API con endpoint de salud.
2. Better Auth en la API: email y contraseña, estados de cuenta, plugin de admin, rate limiting, seed del admin.
3. Sistema visual: tokens, Tailwind/shadcn y NativeWind, Geist, modo claro/oscuro, animaciones base y guía de estilo interna.
4. Web: registro, login, logout, página protegida, cambio de contraseña obligatorio.
5. Web: panel de admin y auditoría.
6. Móvil: registro, login y logout.
7. Módulos: **el alcance todavía no está definido al 100%.** Las ideas iniciales pueden cambiar, ampliarse o reducirse. Cada módulo se implementa solo cuando se pida explícitamente, con su alcance definido en ese momento. No crear módulos, tablas ni pantallas por adelantado ni asumir funcionalidades no pedidas; ante dudas, preguntar antes de implementar.
8. Entrada por lenguaje natural con la API de Claude.
9. Pendientes: recuperación de contraseña por email, invitaciones, login con Google, push de nuevas solicitudes, exportación de datos y eliminación de cuenta (ver guía de seguridad y datos).

## Forma de trabajo

- Pasos chicos y verificables. No implementar fases futuras sin que se pida.
- Leer las guías que correspondan antes de empezar (tabla al inicio).
- **Definición de terminado.** Una tarea está terminada solo cuando:
  - funciona y respeta las guías de seguridad y datos;
  - es clara y fácil de usar según la guía de usabilidad;
  - responde rápido según la guía de rendimiento;
  - está testeada en profundidad, incluidos casos borde, y todos los tests pasan;
  - la documentación en `docs/` y el README están actualizados.
- **Al terminar cada paso,** informar: qué se hizo, qué se testeó, el resultado de la revisión de usabilidad, cualquier impacto relevante en rendimiento o seguridad, cómo probarlo y los comandos necesarios. Proponer el mensaje de commit.
- Si durante el trabajo se toma una decisión que cambia una convención o una guía, actualizar el archivo correspondiente y registrarla en `docs/decisiones.md`.

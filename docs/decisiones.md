# Decisiones de arquitectura

Registro breve de las decisiones importantes: qué se decidió, por qué y qué se descartó.
Las más nuevas arriba.

---

## 2026-09-16 — Guías movidas a `docs/guias/`

**Decisión.** Las guías de trabajo pasaron de `docs/` a `docs/guias/`.

**Por qué.** `CLAUDE.md` y las propias guías ya referenciaban `docs/guias/`, y la carpeta
existía vacía. Se corrigió la ubicación real en vez de las referencias.

---

## 2026-09-16 — Node 24 ejecuta TypeScript, sin `tsx` ni `dotenv`

**Decisión.** En desarrollo la API corre con `node --watch src/index.ts`, sin
transpilador intermedio. Las variables de entorno se cargan con `--env-file-if-exists` y
`process.loadEnvFile()`.

**Por qué.** Node 24 borra los tipos de los archivos `.ts` de forma nativa y trae carga
de `.env` incorporada. Nos ahorra dos dependencias, una capa de indirección y la
posibilidad de que lo que corre en desarrollo no sea lo mismo que se compila.

**Qué hace falta para que funcione.** Node borra tipos pero no transforma sintaxis, así
que el `tsconfig` activa `erasableSyntaxOnly`: prohíbe `enum`, `namespace` y parámetros
con modificador de acceso. Por eso los códigos de error son un objeto `as const` y no un
`enum`. Además `rewriteRelativeImportExtensions` permite escribir los imports relativos
con `.ts` (lo que Node necesita para ejecutarlos) y que `tsc` los reescriba a `.js` al
emitir (lo que Node necesita en `dist/`).

**Alternativas descartadas.**
- `tsx`: funciona bien, pero es una dependencia más y una capa más entre lo que escribís
  y lo que corre.
- `tsup` / `esbuild` para el build de producción: no hace falta. `tsc` alcanza.
- Ejecutar los paquetes internos sin compilar ("just-in-time"): Node no borra tipos
  dentro de `node_modules`, y la API corre sin bundler. Ver la decisión siguiente.

---

## 2026-09-16 — `packages/db` se compila con `tsc`

**Decisión.** Los paquetes internos se compilan a `dist/` y su `exports` apunta a `dist`
para el runtime y a `src` para los tipos.

**Por qué.** Es lo que recomienda Turborepo cuando el consumidor no tiene bundler, que
es el caso de la API sobre Node. Además Turborepo puede cachear el `build`.

**Alternativa descartada.** Exportar el `src` directamente. Es más simple de escribir,
pero requiere que quien importa transpile TypeScript, y Node no lo hace dentro de
`node_modules`.

---

## 2026-09-16 — TypeScript 7 (compilador nativo)

**Decisión.** Se adopta TypeScript 7.0, el compilador reescrito en Go, estable desde
julio de 2026.

**Por qué.** Mismo paquete y mismo comando `tsc`, entre 8 y 12 veces más rápido. En un
hook de pre-commit que verifica tipos de todo el monorepo, eso se nota en cada commit.

**Riesgo conocido y por qué no nos afecta hoy.** TypeScript 7 no tiene API programática
estable hasta la 7.1, lo que rompe herramientas que importan el compilador
(typescript-eslint, ts-morph, transformadores propios). Ninguna de las nuestras lo hace:
Biome está escrito en Rust, Vitest transpila con esbuild y drizzle-kit también.

**A revisar.** Al incorporar Next.js (paso 3) y Expo (paso 6) hay que verificar que
soporten TypeScript 7. Si alguno no, la salida es fijar `typescript` en `6.0.3` en el
catálogo de `pnpm-workspace.yaml`: es un solo cambio en un solo archivo.

---

## 2026-09-16 — Un único `.env` en la raíz, con variables sueltas y no una URL

**Decisión.** Un solo archivo `.env` en la raíz del monorepo. La conexión a PostgreSQL
se configura con variables sueltas (`POSTGRES_HOST`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`…) y no con una `DATABASE_URL`.

**Por qué.** Con una URL, una contraseña con caracteres especiales (`@`, `:`, `/`) hay
que codificarla, y es una fuente de errores difíciles de diagnosticar. Con variables
sueltas se pasan tal cual al driver. Además el script que crea las bases necesita
conectarse a la base `postgres` con las mismas credenciales pero otra base: con
variables sueltas es cambiar un campo.

**Consecuencia.** El nombre de la base de tests es una variable propia
(`POSTGRES_DB_TEST`), y el mismo código elige una u otra con un parámetro. No hay un
segundo archivo `.env.test` que mantener sincronizado.

---

## 2026-09-16 — El cliente de base de datos recibe su configuración

**Decisión.** `crearClienteDb(config)` recibe la configuración como parámetro en vez de
leer el entorno por su cuenta. Lo mismo `crearApp({ cliente, logger, entorno })`.

**Por qué.** Es lo que permite que los tests apunten a `gestion_test`, o directamente a
una base inexistente para probar el camino de fallo, sin variables globales ni mocks.
El test de "base no disponible" usa un error real del driver, no un mock: es la única
forma de saber que el 503 y el formato de error salen bien de verdad.

---

## 2026-09-16 — El comodín `*` en CORS no se puede configurar

**Decisión.** La validación con Zod de `ORIGENES_PERMITIDOS` rechaza `*` y rechaza una
lista vacía.

**Por qué.** La guía de seguridad prohíbe `*`. Dejarlo como una regla escrita que alguien
puede violar copiando un `.env` de ejemplo es más frágil que hacer que la API
directamente no arranque.

---

## 2026-09-16 — Errores: un formato único con `idPeticion`

**Decisión.** Toda respuesta de error tiene la forma
`{ error: { codigo, mensaje, campos?, idPeticion } }`. El `idPeticion` es el mismo que
aparece en los logs de esa petición.

**Por qué.** El formato lo pide la guía de convenciones. El `idPeticion` en la respuesta
es un agregado: cuando un usuario reporta un problema, alcanza con ese identificador
para encontrar en los logs todo lo que pasó, sin pedirle nada más y sin haberle mostrado
ningún detalle técnico.

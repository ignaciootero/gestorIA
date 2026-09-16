# Guía de testing

Leer antes de implementar o modificar cualquier funcionalidad.

**Ninguna funcionalidad nueva se da por finalizada hasta estar testeada en profundidad y con todos los tests pasando**, incluidos los existentes. Los tests se escriben junto con la funcionalidad, no después.

## Qué testear

- **Camino feliz:** la funcionalidad hace lo esperado con datos válidos.
- **Casos borde:** valores vacíos, nulos, límites (montos 0, negativos, muy grandes, decimales), textos largos o con caracteres especiales, fechas límite (fin de mes, año bisiesto, cambios de día por zona horaria), listas vacías, duplicados.
- **Errores y validaciones:** datos inválidos rechazados con el mensaje adecuado, recursos inexistentes, operaciones repetidas.
- **Seguridad y permisos:** acceso sin sesión, con cuenta `pendiente`, `rechazado` o bloqueada; un usuario intentando leer o modificar datos de otro; un usuario común intentando acciones de admin; el admin intentando ver datos personales ajenos.
- **Integración entre módulos:** efectos en otras entidades (por ejemplo, una factura que genera un gasto y un recordatorio).

## Tipos de test

- **Unitarios (Vitest):** lógica de negocio, esquemas Zod y utilidades.
- **Integración (Vitest):** endpoints de la API contra una base PostgreSQL de pruebas real (base separada en el PostgreSQL local, por ejemplo `gestion_test`), no mocks de la base. Cada test parte de un estado conocido y no depende del orden de ejecución.
- **End-to-end (Playwright):** flujos críticos en la web (registro, aprobación, login, reseteo de contraseña y los flujos principales de cada módulo).
- **Móvil (jest-expo + React Native Testing Library):** pantallas y flujos clave.

## Datos y archivos de prueba

Los datos de prueba se guardan en el repositorio para reutilizarlos en el futuro:

- `packages/testing/fabricas/`: funciones que crean entidades válidas con valores por defecto modificables (por ejemplo `crearUsuarioDePrueba({ estado: "pendiente" })`).
- `packages/testing/fixtures/`: datos y archivos fijos (JSON, PDFs de facturas de ejemplo, imágenes, etc.) con nombres descriptivos y, si hace falta, un README que explique qué representa cada uno.
- Casos borde descubiertos o bugs corregidos se agregan como tests nuevos para evitar regresiones.
- Datos siempre ficticios: nunca información real de personas.

## Organización

- Tests junto al código que prueban (`archivo.test.ts`) salvo los end-to-end, que van en `apps/web/e2e/`.
- Comandos documentados en el README: correr todos los tests, solo unitarios, solo integración y end-to-end.
- Nombres de tests en español que describan el comportamiento esperado (por ejemplo "rechaza el login de una cuenta pendiente").

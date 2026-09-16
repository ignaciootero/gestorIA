// Punto unico donde se registran los esquemas de tablas de Drizzle.
//
// Todavia no hay tablas de negocio: el paso 1 de la hoja de ruta solo deja la
// infraestructura de migraciones funcionando. Cada modulo futuro agrega su
// archivo aca (por ejemplo `usuarios.ts`) y lo reexporta desde este indice, para
// que tanto el cliente como drizzle-kit vean un solo lugar con todo el esquema.

export {};

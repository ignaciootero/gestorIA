// Punto unico donde se registran los esquemas de tablas de Drizzle.
// Cada modulo agrega su archivo y lo reexporta desde aca, para que el cliente,
// drizzle-kit y Better Auth vean un solo lugar con todo el esquema.

export * from "./auth.ts";

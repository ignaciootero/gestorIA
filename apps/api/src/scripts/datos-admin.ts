// Lee la identidad del primer admin desde el .env.
//
// La comparten crear-admin.ts (que crea la cuenta de verdad, con la
// contraseña pedida por consola) y sembrar-datos-de-prueba.ts (que la crea
// con una contraseña fija de prueba si todavía no existe, para tener a quién
// atribuirle las acciones sembradas): las dos necesitan la misma identidad,
// no dos formas de leerla que puedan desincronizarse.

import { esquemaEmail, esquemaUsuario } from "@gestoria/shared";
import { z } from "zod";

const esquemaDatosAdmin = z.object({
  ADMIN_USUARIO: esquemaUsuario,
  ADMIN_NOMBRE: z.string().trim().min(1, "Completá ADMIN_NOMBRE."),
  ADMIN_APELLIDO: z.string().trim().min(1, "Completá ADMIN_APELLIDO."),
  ADMIN_EMAIL: esquemaEmail,
});

export type DatosAdmin = z.infer<typeof esquemaDatosAdmin>;

export function leerDatosAdmin(): DatosAdmin {
  const resultado = esquemaDatosAdmin.safeParse(process.env);

  if (!resultado.success) {
    const detalle = resultado.error.issues
      .map((problema) => `  - ${problema.path.join(".")}: ${problema.message}`)
      .join("\n");
    throw new Error(
      `Faltan datos del admin en el .env o son inválidos:\n${detalle}\n` +
        "Están documentados en .env.example.",
    );
  }

  return resultado.data;
}

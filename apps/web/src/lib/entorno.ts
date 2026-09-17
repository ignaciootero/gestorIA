// Variables de entorno de la web, validadas con Zod.
//
// Next reemplaza las NEXT_PUBLIC_* en tiempo de compilación, así que hay que
// nombrarlas enteras y no armarlas con process.env[variable].

import { z } from "zod";

const esquema = z.object({
  NEXT_PUBLIC_URL_API: z
    .url("NEXT_PUBLIC_URL_API tiene que ser una URL completa, por ejemplo http://localhost:3001")
    .refine((valor) => /^https?:\/\//.test(valor), {
      message: "NEXT_PUBLIC_URL_API tiene que empezar con http:// o https://",
    }),
});

const resultado = esquema.safeParse({
  NEXT_PUBLIC_URL_API: process.env.NEXT_PUBLIC_URL_API,
});

if (!resultado.success) {
  const detalle = resultado.error.issues.map((problema) => `  - ${problema.message}`).join("\n");
  throw new Error(`Variables de entorno de la web inválidas:\n${detalle}`);
}

export const entorno = resultado.data;

/** Dónde vive la API. Web y móvil consumen la misma. */
export const URL_API = entorno.NEXT_PUBLIC_URL_API;

// Cliente de Better Auth para el navegador.
//
// Habla con la API (apps/api), no con un backend propio de Next: la web es un
// cliente más, igual que va a ser el móvil (CLAUDE.md, Stack).

import { CAMPOS_ADICIONALES_USUARIO } from "@gestoria/shared";
import { adminClient, inferAdditionalFields, usernameClient } from "better-auth/client/plugins";
// Sin uso directo: sin este import, TS no puede nombrar el tipo inferido de
// `authCliente` (error TS2883) porque adminClient() lo arma con estos tipos
// internos de Better Auth, que si no están en el alcance del archivo quedan
// "innombrables" para el chequeo de tipos.
import type { AccessControl, Role } from "better-auth/plugins/access";
import { createAuthClient } from "better-auth/react";
import { URL_API } from "./entorno";

export type { AccessControl, Role };

export const authCliente = createAuthClient({
  baseURL: URL_API,
  basePath: "/api/auth",
  plugins: [
    usernameClient(),
    // Le da forma tipada a `authCliente.admin.*` (bloquear, desbloquear,
    // listar). El panel llama estos métodos directo: son rutas de Better Auth,
    // no se reimplementan (apps/api/src/rutas/admin.ts tiene el porqué).
    adminClient(),
    // Le enseña al cliente los campos propios del usuario, para que acepte
    // mandarlos al registrar y los devuelva tipados en la sesión. La lista es la
    // misma que declara el servidor (packages/shared).
    inferAdditionalFields({ user: CAMPOS_ADICIONALES_USUARIO }),
  ],
  fetchOptions: {
    // Sin esto la cookie de sesión no viaja: la web y la API están en orígenes
    // distintos (puertos distintos en desarrollo, subdominios en producción).
    credentials: "include",
  },
});

export const { useSession, signOut } = authCliente;

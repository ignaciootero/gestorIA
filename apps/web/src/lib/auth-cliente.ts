// Cliente de Better Auth para el navegador.
//
// Habla con la API (apps/api), no con un backend propio de Next: la web es un
// cliente más, igual que va a ser el móvil (CLAUDE.md, Stack).

import { CAMPOS_ADICIONALES_USUARIO } from "@gestoria/shared";
import { inferAdditionalFields, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { URL_API } from "./entorno";

export const authCliente = createAuthClient({
  baseURL: URL_API,
  basePath: "/api/auth",
  // Sin el plugin de admin: la web todavía no tiene panel de administración
  // (paso 5 de la hoja de ruta). Se suma cuando se implemente.
  plugins: [
    usernameClient(),
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

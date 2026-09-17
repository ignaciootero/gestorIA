// Raíz del sitio.
//
// No tiene contenido propio: manda a la pantalla que corresponda según haya
// sesión o no. Quién decide eso es el proxy (src/proxy.ts), que corre antes.

import { redirect } from "next/navigation";

export default function Raiz() {
  redirect("/ingresar");
}

// Compila lo que corre en el ambiente de prueba: la web y la API (con los paquetes de los que
// dependen). Lo usa el "build command" de Render; ver docs/despliegue-render.md.
//
// La web necesita sus URLs al compilar (Next las deja fijas en el código y en el reenvío de `/api`),
// así que se completan antes de compilar.
//
// Uso: node scripts/ambiente-de-prueba/construir.ts

import { spawnSync } from "node:child_process";
import { completarEntorno } from "./comun.ts";

completarEntorno(process.env);

const resultado = spawnSync(
  "pnpm",
  ["exec", "turbo", "run", "build", "--filter=@gestoria/web", "--filter=@gestoria/api"],
  { stdio: "inherit", env: process.env, shell: process.platform === "win32" },
);

process.exit(resultado.status ?? 1);

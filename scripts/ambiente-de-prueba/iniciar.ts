// Arranca el ambiente de prueba: aplica las migraciones y levanta la API y la web en el mismo
// servicio. Lo usa el "start command" de Render; ver docs/despliegue-render.md.
//
// - Las migraciones van acá porque el plan gratuito de Render no tiene "pre-deploy command" ni
//   consola. Si fallan, no arranca nada: mejor no arrancar que arrancar con la base a medias.
// - La API escucha solo adentro (PUERTO_API_INTERNO) y la web en el puerto que da Render (PORT),
//   reenviándole `/api/...` a la API.
// - Si cualquiera de los dos se cae, se baja el otro y el proceso termina con error: Render lo vuelve
//   a levantar entero, en vez de quedar una web sin API (o al revés) que parece andar.
//
// Uso: node scripts/ambiente-de-prueba/iniciar.ts

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { completarEntorno, PUERTO_API_INTERNO } from "./comun.ts";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const DIRECTORIO_WEB = path.join(RAIZ, "apps", "web");

completarEntorno(process.env);
// Render ya lo define al arrancar; por si se corre en otro lado.
process.env["NODE_ENV"] ??= "production";
const puertoWeb = process.env["PORT"] ?? "3000";

const migracion = spawnSync(process.execPath, [path.join(RAIZ, "packages/db/src/migrar.ts")], {
  stdio: "inherit",
  env: process.env,
});
if (migracion.status !== 0) {
  console.error("No arranca: fallaron las migraciones.");
  process.exit(1);
}

const procesos: ChildProcess[] = [];
let terminando = false;

function levantar(
  nombre: string,
  argumentos: string[],
  opciones: { cwd?: string; env?: NodeJS.ProcessEnv },
) {
  const proceso = spawn(process.execPath, argumentos, {
    stdio: "inherit",
    cwd: opciones.cwd ?? RAIZ,
    env: opciones.env ?? process.env,
  });
  proceso.on("exit", (codigo, senal) => {
    if (terminando) return;
    console.error(
      `${nombre} terminó (código ${codigo ?? "-"}, señal ${senal ?? "-"}): se baja todo.`,
    );
    terminar(1);
  });
  procesos.push(proceso);
}

function terminar(codigo: number): void {
  terminando = true;
  for (const proceso of procesos) proceso.kill("SIGTERM");
  // Si alguno no termina solo, no se espera para siempre.
  setTimeout(() => process.exit(codigo), 10_000).unref();
  Promise.all(
    procesos.map((proceso) =>
      proceso.exitCode === null ? new Promise((listo) => proceso.once("exit", listo)) : null,
    ),
  ).then(() => process.exit(codigo));
}

levantar("La API", [path.join(RAIZ, "apps/api/dist/index.js")], {
  env: { ...process.env, PORT: String(PUERTO_API_INTERNO) },
});

const next = createRequire(path.join(DIRECTORIO_WEB, "package.json")).resolve("next/dist/bin/next");
levantar("La web", [next, "start", "--port", puertoWeb, "--hostname", "0.0.0.0"], {
  cwd: DIRECTORIO_WEB,
});

for (const senal of ["SIGTERM", "SIGINT"] as const) {
  process.on(senal, () => terminar(0));
}

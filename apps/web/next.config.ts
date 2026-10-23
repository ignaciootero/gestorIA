// Configuracion de Next.js.

import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,

  // Carpeta de compilación. Los tests e2e levantan su propio servidor de desarrollo con otra
  // (NEXT_DIST_DIR en playwright.config.ts) porque Next no deja correr dos servidores de
  // desarrollo sobre la misma carpeta: así se pueden correr con `pnpm dev` abierto.
  distDir: process.env["NEXT_DIST_DIR"] ?? ".next",

  // Los paquetes internos exportan TypeScript sin compilar hacia el bundler, que
  // es el modo recomendado cuando quien consume sí transpila (Turbopack).
  transpilePackages: ["@gestoria/shared", "@gestoria/ui-tokens"],

  // Cabeceras de seguridad de la web. La CSP permite 'unsafe-inline' en estilos
  // porque Tailwind y Next inyectan estilos en línea; los scripts no lo llevan.
  async headers() {
    const api = process.env["NEXT_PUBLIC_URL_API"] ?? "http://localhost:3001";
    // React usa eval() en desarrollo para reconstruir los stack traces. En
    // producción nunca lo hace, así que ahí la CSP queda sin 'unsafe-eval'.
    const enDesarrollo = process.env.NODE_ENV !== "production";

    return [
      {
        source: "/:ruta*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `script-src 'self' 'unsafe-inline'${enDesarrollo ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self' data:",
              `connect-src 'self' ${api}${enDesarrollo ? " ws: http://localhost:*" : ""}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default config;

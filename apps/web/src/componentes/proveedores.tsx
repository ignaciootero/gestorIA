// Proveedores de la aplicación: datos en el cliente y tema.

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { ProveedorDeColorDeAcento } from "./color-de-acento";
import { ProveedorDeTema } from "./tema";
import { ProveedorDeBrillo } from "./ui/brillo/proveedor-de-brillo";

export function Proveedores({ children }: { children: ReactNode }) {
  // Se crea dentro del componente y no en el módulo: si fuera un singleton del
  // módulo, en el servidor se compartiría entre peticiones de personas distintas.
  const [clienteDeConsultas] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Mostrar lo que ya está y revalidar en segundo plano
            // (docs/guias/rendimiento.md, Velocidad percibida).
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={clienteDeConsultas}>
      {/*
        El color de acento va dentro del tema (cada modo tiene el suyo) y el
        brillo de bordes dentro de los dos: necesita releer el acento cada vez
        que cambia el tema o el color elegido.
      */}
      <ProveedorDeTema>
        <ProveedorDeColorDeAcento>
          <ProveedorDeBrillo>{children}</ProveedorDeBrillo>
        </ProveedorDeColorDeAcento>
      </ProveedorDeTema>
    </QueryClientProvider>
  );
}

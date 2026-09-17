// Contenido de la pantalla de inicio.
//
// Verifica la sesión contra la API antes de mostrar nada. El proxy ya redirige
// a quien no tiene cookie, pero eso es solo para evitar un destello de pantalla
// equivocada: quien decide de verdad es el servidor (CLAUDE.md, Permisos
// verificados en el backend).

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { URL_API } from "@/lib/entorno";
import { interpretarError } from "@/lib/mensajes-de-error";

type Yo = {
  id: string;
  usuario: string | null;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  estado: string;
};

async function obtenerYo(): Promise<Yo> {
  const respuesta = await fetch(`${URL_API}/api/yo`, { credentials: "include" });

  if (!respuesta.ok) {
    throw await respuesta.json();
  }

  return respuesta.json() as Promise<Yo>;
}

export function PanelDeInicio() {
  const router = useRouter();
  const { data: yo, error, isPending } = useQuery({ queryKey: ["yo"], queryFn: obtenerYo });

  if (isPending) {
    // Esqueleto con la forma del contenido, no una pantalla en blanco
    // (docs/guias/rendimiento.md, Velocidad percibida).
    return (
      <main className="mx-auto flex flex-1 max-w-3xl flex-col gap-8 p-4 sm:p-8">
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
          <span className="solo-lectores">Cargando tus datos</span>
          <div className="h-8 w-48 animate-pulse rounded-control bg-superficie-suave" />
          <div className="h-40 animate-pulse rounded-tarjeta bg-superficie-suave" />
        </div>
      </main>
    );
  }

  if (error) {
    const interpretado = interpretarError(error);
    return (
      <main className="mx-auto flex flex-1 max-w-3xl flex-col justify-center gap-4 p-4 sm:p-8">
        <Aviso tono="peligro" titulo="No pudimos cargar tus datos">
          {interpretado.mensaje}
        </Aviso>
        <Boton variante="secundario" onClick={() => router.replace("/ingresar")}>
          Volver a entrar
        </Boton>
      </main>
    );
  }

  return (
    <main className="mx-auto flex flex-1 max-w-3xl flex-col gap-8 p-4 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {yo.nombre}</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Entraste como <span className="font-medium text-texto">{yo.usuario ?? yo.email}</span>
          {yo.rol === "admin" ? " · administrador" : null}
        </p>
      </header>

      <Tarjeta className="p-6">
        <h2 className="text-lg font-medium">Todavía no hay módulos</h2>
        <p className="mt-2 text-sm text-texto-secundario">
          Los módulos de gastos, contactos, calendario, facturas y tareas se van a ir sumando de a
          uno. Por ahora lo que funciona es la cuenta: entrar, salir y el control de acceso.
        </p>
      </Tarjeta>
    </main>
  );
}

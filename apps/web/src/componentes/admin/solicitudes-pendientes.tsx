// Solicitudes de registro pendientes de aprobación.

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MailCheck, Search, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { ItemAnimado, ListaAnimada } from "@/componentes/ui/lista-animada";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import {
  aprobarCuenta,
  type CuentaResumen,
  obtenerPendientes,
  rechazarCuenta,
} from "@/lib/api-admin";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";

export function SolicitudesPendientes() {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "pendientes"],
    queryFn: obtenerPendientes,
  });
  const [aRechazar, setARechazar] = useState<CuentaResumen | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // Las solicitudes pendientes suelen ser pocas: filtrar en el cliente sobre
  // lo que ya se trajo evita un viaje al servidor por cada tecla, y no hace
  // falta la paginación que sí tiene el listado completo de cuentas.
  const cuentasFiltradas = useMemo(() => {
    if (!data) return [];
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return data.cuentas;

    return data.cuentas.filter((cuenta) =>
      [cuenta.nombre, cuenta.apellido, cuenta.usuario, cuenta.email]
        .filter((valor): valor is string => valor !== null)
        .some((valor) => valor.toLowerCase().includes(termino)),
    );
  }, [data, busqueda]);

  const aprobar = useMutation({
    mutationFn: aprobarCuenta,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const rechazar = useMutation({
    mutationFn: rechazarCuenta,
    onSuccess: () => {
      setARechazar(null);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  if (isPending) {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
        <span className="solo-lectores">Cargando solicitudes</span>
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-tarjeta bg-superficie-suave" />
        ))}
      </div>
    );
  }

  if (error) {
    return <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>;
  }

  if (data.cuentas.length === 0) {
    return (
      <Tarjeta className="p-6 text-center text-sm text-texto-secundario">
        No hay solicitudes pendientes.
      </Tarjeta>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="p-4">
        <Campo
          etiqueta="Buscar"
          icono={Search}
          placeholder="Nombre, usuario o correo"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
      </Tarjeta>

      {cuentasFiltradas.length === 0 ? (
        <Tarjeta className="p-6 text-center text-sm text-texto-secundario">
          Ninguna solicitud coincide con la búsqueda.
        </Tarjeta>
      ) : (
        <ListaAnimada className="gap-3">
          {cuentasFiltradas.map((cuenta) => (
            <ItemAnimado key={cuenta.id}>
              <Tarjeta className="group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-texto">
                    {cuenta.nombre} {cuenta.apellido}
                    {cuenta.usuario ? (
                      <span className="ml-2 text-sm text-texto-secundario">@{cuenta.usuario}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-texto-secundario">{cuenta.email}</p>
                  <p className="text-xs text-texto-secundario">
                    Solicitada el {new Date(cuenta.creadaEn).toLocaleString("es-UY")}
                  </p>
                  <div className="mt-2">
                    <Insignia
                      tono={cuenta.emailVerificado ? "exito" : "advertencia"}
                      icono={cuenta.emailVerificado ? MailCheck : Mail}
                    >
                      {cuenta.emailVerificado ? "Correo confirmado" : "Correo sin confirmar"}
                    </Insignia>
                  </div>
                </div>

                <div
                  className={cn(
                    "flex shrink-0 gap-2",
                    "con-mouse:translate-x-1 con-mouse:opacity-0",
                    "con-mouse:group-hover:translate-x-0 con-mouse:group-hover:opacity-100",
                    "con-mouse:group-focus-within:translate-x-0 con-mouse:group-focus-within:opacity-100",
                    "transition-[opacity,transform] duration-(--anim-duracion) ease-(--anim-curva)",
                  )}
                >
                  <Boton
                    tamano="chico"
                    variante="secundario"
                    onClick={() => setARechazar(cuenta)}
                    disabled={rechazar.isPending}
                  >
                    Rechazar
                  </Boton>
                  <Boton
                    tamano="chico"
                    onClick={() => aprobar.mutate(cuenta.id)}
                    cargando={aprobar.isPending && aprobar.variables === cuenta.id}
                    textoCargando="Aprobando"
                  >
                    Aprobar
                  </Boton>
                </div>
              </Tarjeta>
            </ItemAnimado>
          ))}
        </ListaAnimada>
      )}

      <Dialogo
        abierto={aRechazar !== null}
        onCerrar={() => setARechazar(null)}
        titulo="Rechazar solicitud"
        icono={UserX}
        tono="peligro"
      >
        {aRechazar ? (
          <>
            <p className="text-sm text-texto-secundario">
              {aRechazar.nombre} {aRechazar.apellido} ({aRechazar.email}) no va a poder entrar. Se
              le puede volver a cambiar el estado más adelante si hace falta.
            </p>
            {rechazar.isError ? (
              <Aviso tono="peligro">{interpretarError(rechazar.error).mensaje}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => setARechazar(null)}>
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                onClick={() => rechazar.mutate(aRechazar.id)}
                cargando={rechazar.isPending}
                textoCargando="Rechazando"
              >
                Rechazar
              </Boton>
            </div>
          </>
        ) : null}
      </Dialogo>
    </div>
  );
}

// Perfil de una cuenta: todos sus datos y el historial de acciones de admin
// que le tocaron, para la pantalla a la que se llega al tocar su nombre en el
// listado de cuentas.

"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Ban, Mail, MailCheck, Shield } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Insignia } from "@/componentes/ui/insignia";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { obtenerAuditoriaDeCuenta, obtenerPerfilDeCuenta } from "@/lib/api-admin";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { EntradaDeAuditoria } from "./entrada-de-auditoria";
import { ETIQUETA_FECHA_DE_ESTADO, INSIGNIA_DE_ESTADO } from "./estado-de-cuenta";

const POR_PAGINA = 20;

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-texto-secundario">{etiqueta}</dt>
      <dd className="font-medium text-texto">{children}</dd>
    </div>
  );
}

function fechaOGuion(valor: string | null): string {
  return valor ? new Date(valor).toLocaleString("es-UY") : "—";
}

export function PerfilDeCuenta({ id }: { id: string }) {
  const [pagina, setPagina] = useState(0);

  const {
    data: perfil,
    isPending,
    error,
  } = useQuery({
    queryKey: ["admin", "cuentas", id],
    queryFn: () => obtenerPerfilDeCuenta(id),
  });

  const historial = useQuery({
    queryKey: ["admin", "cuentas", id, "auditoria", pagina],
    queryFn: () => obtenerAuditoriaDeCuenta(id, { limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
    // El perfil tiene que estar cargado (para saber que la cuenta existe) antes
    // de pedir su historial.
    enabled: perfil !== undefined,
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-texto-secundario hover:text-texto hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a cuentas
      </Link>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-4">
          <span className="solo-lectores">Cargando perfil</span>
          <div className="h-32 animate-pulse rounded-tarjeta bg-superficie-suave" />
          <div className="h-48 animate-pulse rounded-tarjeta bg-superficie-suave" />
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : (
        <>
          <Tarjeta className="flex flex-col gap-4 p-6">
            <div>
              <h1
                className={cn(
                  "flex items-center gap-1.5 text-xl font-semibold tracking-tight",
                  perfil.bloqueada ? "text-peligro" : "text-texto",
                )}
              >
                {perfil.bloqueada ? <Ban aria-hidden="true" className="size-5 shrink-0" /> : null}
                {perfil.nombre} {perfil.apellido}
              </h1>
              <p className="text-sm text-texto-secundario">{perfil.email}</p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Insignia
                tono={INSIGNIA_DE_ESTADO[perfil.estado].tono}
                icono={INSIGNIA_DE_ESTADO[perfil.estado].icono}
              >
                {INSIGNIA_DE_ESTADO[perfil.estado].texto}
              </Insignia>
              <Insignia
                tono={perfil.emailVerificado ? "exito" : "advertencia"}
                icono={perfil.emailVerificado ? MailCheck : Mail}
              >
                {perfil.emailVerificado ? "Correo confirmado" : "Correo sin confirmar"}
              </Insignia>
              {perfil.bloqueada ? (
                <Insignia tono="peligro" icono={Ban}>
                  Bloqueada
                </Insignia>
              ) : null}
              {perfil.rol === "admin" ? (
                <Insignia icono={Shield} className="bg-acento-suave text-acento-suave-texto">
                  Admin
                </Insignia>
              ) : null}
            </div>

            {perfil.bloqueada && perfil.motivoBloqueo ? (
              <p className="text-sm text-texto-secundario">Motivo: {perfil.motivoBloqueo}</p>
            ) : null}

            <dl className="grid grid-cols-1 gap-4 border-t border-borde pt-4 sm:grid-cols-3">
              <Dato etiqueta="Usuario">{perfil.usuario ? `@${perfil.usuario}` : "—"}</Dato>
              <Dato etiqueta={ETIQUETA_FECHA_DE_ESTADO[perfil.estado]}>
                {fechaOGuion(perfil.estadoActualizadoEn)}
              </Dato>
              <Dato etiqueta="Creada el">{fechaOGuion(perfil.creadaEn)}</Dato>
              <Dato etiqueta="Última conexión">{fechaOGuion(perfil.ultimaConexion)}</Dato>
              <Dato etiqueta="Zona horaria">{perfil.zonaHoraria}</Dato>
              <Dato etiqueta="Moneda por defecto">{perfil.monedaPorDefecto}</Dato>
              <Dato etiqueta="Debe cambiar la contraseña">
                {perfil.debeCambiarPassword ? "Sí" : "No"}
              </Dato>
              {perfil.bloqueada ? (
                <Dato etiqueta="Bloqueada hasta">{fechaOGuion(perfil.bloqueadaHasta)}</Dato>
              ) : null}
            </dl>
          </Tarjeta>

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Historial de acciones</h2>

            {historial.isPending ? (
              <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
                <span className="solo-lectores">Cargando historial</span>
                {[0, 1].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-tarjeta bg-superficie-suave" />
                ))}
              </div>
            ) : historial.error ? (
              <Aviso tono="peligro">{interpretarError(historial.error).mensaje}</Aviso>
            ) : historial.data.entradas.length === 0 ? (
              <Tarjeta className="p-6 text-center text-sm text-texto-secundario">
                Todavía no hay acciones de admin registradas sobre esta cuenta.
              </Tarjeta>
            ) : (
              <>
                {historial.data.entradas.map((entrada) => (
                  <EntradaDeAuditoria key={entrada.id} entrada={entrada} ocultarObjetivo />
                ))}

                <div className="flex items-center justify-between pt-2 text-sm text-texto-secundario">
                  <span>
                    {historial.data.total === 0 ? 0 : pagina * POR_PAGINA + 1}–
                    {Math.min((pagina + 1) * POR_PAGINA, historial.data.total)} de{" "}
                    {historial.data.total}
                  </span>
                  <div className="flex gap-2">
                    <Boton
                      tamano="chico"
                      variante="sutil"
                      disabled={pagina === 0}
                      onClick={() => setPagina((p) => p - 1)}
                    >
                      Anterior
                    </Boton>
                    <Boton
                      tamano="chico"
                      variante="sutil"
                      disabled={(pagina + 1) * POR_PAGINA >= historial.data.total}
                      onClick={() => setPagina((p) => p + 1)}
                    >
                      Siguiente
                    </Boton>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

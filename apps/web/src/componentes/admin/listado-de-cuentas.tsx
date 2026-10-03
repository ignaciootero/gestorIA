// Listado general de cuentas: buscar, filtrar por estado, bloquear/desbloquear
// y resetear contraseña.

"use client";

import { ESTADOS_CUENTA, type EstadoCuenta } from "@gestoria/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, KeyRound, Mail, MailCheck, Search, Shield, Unlock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Insignia } from "@/componentes/ui/insignia";
import { SelectorDeSegmentos } from "@/componentes/ui/selector-de-segmentos";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { type CuentaAdmin, obtenerCuentas, resetearPassword } from "@/lib/api-admin";
import { authCliente, useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { interpretarError } from "@/lib/mensajes-de-error";
import { ETIQUETA_FECHA_DE_ESTADO, INSIGNIA_DE_ESTADO } from "./estado-de-cuenta";

const POR_PAGINA = 20;

const FILTROS = [
  { valor: "", etiqueta: "Todas" },
  { valor: ESTADOS_CUENTA.pendiente, etiqueta: "Pendientes" },
  { valor: ESTADOS_CUENTA.aprobado, etiqueta: "Aprobadas" },
  { valor: ESTADOS_CUENTA.rechazado, etiqueta: "Rechazadas" },
] as const;

type AccionDeFila = { tipo: "bloquear" | "desbloquear"; cuenta: CuentaAdmin } | null;

export function ListadoDeCuentas() {
  const queryClient = useQueryClient();
  const { data: sesion } = useSession();
  const [busquedaEscrita, setBusquedaEscrita] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<EstadoCuenta | "">("");
  const [pagina, setPagina] = useState(0);
  const [accion, setAccion] = useState<AccionDeFila>(null);
  const [motivo, setMotivo] = useState("");
  const [aResetear, setAResetear] = useState<CuentaAdmin | null>(null);
  const [passwordGenerada, setPasswordGenerada] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Búsqueda con una pequeña espera: evita un pedido por cada tecla.
  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(busquedaEscrita);
      setPagina(0);
    }, 300);
    return () => clearTimeout(espera);
  }, [busquedaEscrita]);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "cuentas", { busqueda, estado, pagina }],
    queryFn: () =>
      obtenerCuentas({ busqueda, estado, limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
  });

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  const bloquear = useMutation({
    mutationFn: ({ id, banReason }: { id: string; banReason: string }) =>
      authCliente.admin.banUser({ userId: id, banReason: banReason || undefined }),
    onSuccess: () => {
      setAccion(null);
      setMotivo("");
      invalidar();
    },
  });

  const desbloquear = useMutation({
    mutationFn: (id: string) => authCliente.admin.unbanUser({ userId: id }),
    onSuccess: () => {
      setAccion(null);
      invalidar();
    },
  });

  const resetear = useMutation({
    mutationFn: resetearPassword,
    onSuccess: (resultado) => {
      setPasswordGenerada(resultado.passwordTemporal);
      invalidar();
    },
  });

  async function copiarPassword() {
    if (!passwordGenerada) return;
    await navigator.clipboard.writeText(passwordGenerada);
    setCopiado(true);
  }

  function cerrarReseteo() {
    setAResetear(null);
    setPasswordGenerada(null);
    setCopiado(false);
    resetear.reset();
  }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Campo
          etiqueta="Buscar"
          icono={Search}
          placeholder="Nombre, usuario o correo"
          value={busquedaEscrita}
          onChange={(evento) => setBusquedaEscrita(evento.target.value)}
          className="sm:flex-1"
        />
        <SelectorDeSegmentos
          id="filtro-estado"
          etiqueta="Filtrar por estado"
          modo="filtro"
          segmentos={FILTROS}
          activo={estado}
          onCambiar={(valor) => {
            setEstado(valor);
            setPagina(0);
          }}
        />
      </Tarjeta>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando cuentas</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : data.cuentas.length === 0 ? (
        <Tarjeta className="p-6 text-center text-sm text-texto-secundario">
          Ninguna cuenta coincide con la búsqueda.
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-2">
          {data.cuentas.map((cuenta) => {
            const esUnoMismo = cuenta.id === sesion?.user.id;
            const insigniaEstado = INSIGNIA_DE_ESTADO[cuenta.estado];

            return (
              <Tarjeta
                key={cuenta.id}
                className="group flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Nombre, email e insignias en una sola columna: así los
                    botones (hermanos, más abajo) se centran verticalmente
                    contra toda la fila y no solo contra el nombre. */}
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "flex items-center gap-1.5 font-medium",
                        cuenta.bloqueada ? "text-peligro" : "text-texto",
                      )}
                    >
                      {cuenta.bloqueada ? (
                        <Ban aria-hidden="true" className="size-4 shrink-0" />
                      ) : null}
                      <span>
                        <Link href={`/admin/cuentas/${cuenta.id}`} className="hover:underline">
                          {cuenta.nombre} {cuenta.apellido}
                          {cuenta.usuario ? (
                            <span className="ml-2 text-sm text-texto-secundario">
                              @{cuenta.usuario}
                            </span>
                          ) : null}
                        </Link>
                        {cuenta.rol === "admin" ? (
                          // El acento suave, no el fuerte: ese queda reservado
                          // para la acción principal de la pantalla
                          // (docs/guias/estetica.md, Colores). Insignia no lo
                          // ofrece entre sus tonos por eso mismo, así que se
                          // pisa acá con el mismo tratamiento que ya usan
                          // Aviso y Dialogo para su tono "info".
                          <Insignia
                            icono={Shield}
                            className="ml-2 bg-acento-suave text-acento-suave-texto"
                          >
                            Admin
                          </Insignia>
                        ) : null}
                      </span>
                    </p>
                    <p className="truncate text-sm text-texto-secundario">{cuenta.email}</p>
                    <p className="text-xs text-texto-secundario">
                      {ETIQUETA_FECHA_DE_ESTADO[cuenta.estado]}{" "}
                      {new Date(cuenta.estadoActualizadoEn).toLocaleString("es-UY")}
                    </p>
                    {cuenta.bloqueada && cuenta.motivoBloqueo ? (
                      <p className="truncate text-xs text-texto-secundario">
                        Motivo: {cuenta.motivoBloqueo}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Insignia tono={insigniaEstado.tono} icono={insigniaEstado.icono}>
                      {insigniaEstado.texto}
                    </Insignia>
                    <Insignia
                      tono={cuenta.emailVerificado ? "exito" : "advertencia"}
                      icono={cuenta.emailVerificado ? MailCheck : Mail}
                    >
                      {cuenta.emailVerificado ? "Correo confirmado" : "Correo sin confirmar"}
                    </Insignia>
                    {cuenta.bloqueada ? (
                      <Insignia tono="peligro" icono={Ban}>
                        Bloqueada
                      </Insignia>
                    ) : null}
                  </div>
                </div>

                {esUnoMismo ? (
                  <p className="shrink-0 text-xs text-texto-secundario">Esta es tu cuenta</p>
                ) : (
                  <div
                    className={cn(
                      "flex shrink-0 flex-wrap gap-2",
                      // Solo con mouse de verdad quedan ocultos hasta pasar el
                      // cursor por la fila; con teclado, el foco los revela
                      // igual (docs/guias/estetica.md, Animar solo transform y
                      // opacity). En touch, la variante ni se evalúa: siempre
                      // visibles.
                      "con-mouse:translate-x-1 con-mouse:opacity-0",
                      "con-mouse:group-hover:translate-x-0 con-mouse:group-hover:opacity-100",
                      "con-mouse:group-focus-within:translate-x-0 con-mouse:group-focus-within:opacity-100",
                      "transition-[opacity,transform] duration-(--anim-duracion) ease-(--anim-curva)",
                    )}
                  >
                    <Boton
                      tamano="chico"
                      variante="secundario"
                      onClick={() => {
                        setAResetear(cuenta);
                        setPasswordGenerada(null);
                      }}
                    >
                      Resetear contraseña
                    </Boton>
                    {cuenta.bloqueada ? (
                      <Boton
                        tamano="chico"
                        variante="secundario"
                        onClick={() => setAccion({ tipo: "desbloquear", cuenta })}
                      >
                        Desbloquear
                      </Boton>
                    ) : (
                      <Boton
                        tamano="chico"
                        variante="peligro"
                        onClick={() => setAccion({ tipo: "bloquear", cuenta })}
                      >
                        Bloquear
                      </Boton>
                    )}
                  </div>
                )}
              </Tarjeta>
            );
          })}

          <div className="flex items-center justify-between pt-2 text-sm text-texto-secundario">
            <span>
              {data.total === 0 ? 0 : pagina * POR_PAGINA + 1}–
              {Math.min((pagina + 1) * POR_PAGINA, data.total)} de {data.total}
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
                disabled={(pagina + 1) * POR_PAGINA >= data.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
            </div>
          </div>
        </div>
      )}

      {/* Bloquear / desbloquear */}
      <Dialogo
        abierto={accion !== null}
        onCerrar={() => {
          setAccion(null);
          setMotivo("");
        }}
        titulo={accion?.tipo === "bloquear" ? "Bloquear cuenta" : "Desbloquear cuenta"}
        icono={accion?.tipo === "bloquear" ? Ban : Unlock}
        tono={accion?.tipo === "bloquear" ? "peligro" : "exito"}
      >
        {accion ? (
          <>
            <p className="text-sm text-texto-secundario">
              {accion.cuenta.nombre} {accion.cuenta.apellido} ({accion.cuenta.email})
              {accion.tipo === "bloquear"
                ? ": no va a poder iniciar sesión y se le cierran las sesiones abiertas."
                : ": va a poder volver a iniciar sesión."}
            </p>

            {accion.tipo === "bloquear" ? (
              <Campo
                etiqueta="Motivo (opcional)"
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
              />
            ) : null}

            {bloquear.isError || desbloquear.isError ? (
              <Aviso tono="peligro">
                {interpretarError(bloquear.error ?? desbloquear.error).mensaje}
              </Aviso>
            ) : null}

            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => setAccion(null)}>
                Cancelar
              </Boton>
              <Boton
                variante={accion.tipo === "bloquear" ? "peligro" : "secundario"}
                cargando={bloquear.isPending || desbloquear.isPending}
                textoCargando={accion.tipo === "bloquear" ? "Bloqueando" : "Desbloqueando"}
                onClick={() =>
                  accion.tipo === "bloquear"
                    ? bloquear.mutate({ id: accion.cuenta.id, banReason: motivo })
                    : desbloquear.mutate(accion.cuenta.id)
                }
              >
                {accion.tipo === "bloquear" ? "Bloquear" : "Desbloquear"}
              </Boton>
            </div>
          </>
        ) : null}
      </Dialogo>

      {/* Resetear contraseña */}
      <Dialogo
        abierto={aResetear !== null}
        onCerrar={cerrarReseteo}
        titulo="Resetear contraseña"
        icono={KeyRound}
        tono="advertencia"
      >
        {aResetear && !passwordGenerada ? (
          <>
            <p className="text-sm text-texto-secundario">
              Se genera una contraseña temporal para {aResetear.nombre} {aResetear.apellido}. Se le
              cierran las sesiones abiertas y va a tener que cambiarla en el próximo ingreso.
            </p>
            {resetear.isError ? (
              <Aviso tono="peligro">{interpretarError(resetear.error).mensaje}</Aviso>
            ) : null}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={cerrarReseteo}>
                Cancelar
              </Boton>
              <Boton
                variante="secundario"
                cargando={resetear.isPending}
                textoCargando="Generando"
                onClick={() => resetear.mutate(aResetear.id)}
              >
                Generar contraseña
              </Boton>
            </div>
          </>
        ) : null}

        {passwordGenerada ? (
          <>
            <Aviso tono="advertencia">
              Comunicásela a la persona por otro medio. No se puede volver a ver.
            </Aviso>
            <div className="flex items-center gap-2 rounded-control border border-borde-fuerte bg-superficie-suave px-3 py-2">
              <code className="flex-1 select-all font-mono text-sm">{passwordGenerada}</code>
              <Boton tamano="chico" variante="sutil" onClick={() => void copiarPassword()}>
                {copiado ? (
                  <>
                    <Check aria-hidden="true" className="size-4" /> Copiada
                  </>
                ) : (
                  <>
                    <Copy aria-hidden="true" className="size-4" /> Copiar
                  </>
                )}
              </Boton>
            </div>
            <div className="flex justify-end">
              <Boton onClick={cerrarReseteo}>Listo</Boton>
            </div>
          </>
        ) : null}
      </Dialogo>
    </div>
  );
}

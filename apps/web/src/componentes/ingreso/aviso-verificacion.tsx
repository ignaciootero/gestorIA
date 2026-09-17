// Aviso de "confirmá tu correo", con la opción de reenviar el mensaje.
//
// Se muestra en dos momentos: justo después de registrarse, y cuando alguien
// intenta entrar con una cuenta cuyo correo todavía no confirmó. Los dos casos
// necesitan lo mismo: explicar qué falta y poder pedir el correo de nuevo.

"use client";

import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { authCliente } from "@/lib/auth-cliente";
import { interpretarError } from "@/lib/mensajes-de-error";

type EstadoReenvio = "inicial" | "enviado" | "error";

type PropsAvisoVerificacion = {
  email: string;
  /** true cuando viene de registrarse recién; false cuando viene de un login rechazado. */
  reciénRegistrado?: boolean;
};

export function AvisoDeVerificacion({ email, reciénRegistrado = false }: PropsAvisoVerificacion) {
  const [estado, setEstado] = useState<EstadoReenvio>("inicial");
  const [mensajeDeError, setMensajeDeError] = useState<string | null>(null);
  const [reenviando, setReenviando] = useState(false);

  async function reenviar(): Promise<void> {
    setReenviando(true);
    setMensajeDeError(null);

    const resultado = await authCliente.sendVerificationEmail({
      email,
      callbackURL: "/correo-confirmado",
    });

    setReenviando(false);

    if (resultado.error) {
      setEstado("error");
      setMensajeDeError(interpretarError(resultado.error).mensaje);
      return;
    }

    setEstado("enviado");
  }

  return (
    <div className="flex flex-col gap-4">
      <Aviso
        tono={reciénRegistrado ? "exito" : "advertencia"}
        titulo={reciénRegistrado ? "Revisá tu correo" : "Falta confirmar tu correo"}
      >
        <p>
          Te mandamos un mensaje a <span className="font-medium">{email}</span>. Tocá el enlace para
          confirmar que la dirección es tuya. Vale por 24 horas.
        </p>
      </Aviso>

      {/*
        Los dos pasos se explican juntos y desde el principio. Si solo dijéramos
        "confirmá tu correo", la persona lo confirmaría, intentaría entrar y se
        encontraría con otro rechazo sin entender por qué.
      */}
      <div className="rounded-tarjeta border border-borde p-4 text-sm">
        <p className="font-medium">Para poder entrar hacen falta dos cosas:</p>
        <ol className="mt-2 flex flex-col gap-2 text-texto-secundario">
          <li className="flex gap-2">
            <MailCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>Que confirmes tu correo con el enlace que te mandamos.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="mt-0.5 w-4 shrink-0 text-center">
              2
            </span>
            <span>
              Que un administrador apruebe tu cuenta. Te avisamos cuando esté; no hace falta que te
              registres de nuevo.
            </span>
          </li>
        </ol>
      </div>

      {estado === "enviado" ? (
        <Aviso tono="info">Te lo mandamos de nuevo. Puede tardar un par de minutos.</Aviso>
      ) : null}

      {estado === "error" && mensajeDeError ? <Aviso tono="peligro">{mensajeDeError}</Aviso> : null}

      <Boton
        variante="secundario"
        onClick={reenviar}
        cargando={reenviando}
        textoCargando="Reenviando"
      >
        No me llegó, reenviar
      </Boton>
    </div>
  );
}

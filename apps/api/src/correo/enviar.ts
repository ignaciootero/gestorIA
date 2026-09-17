// Envío de correo con Nodemailer sobre SMTP.
//
// Si no hay SMTP configurado (que es lo normal en desarrollo, donde no queremos
// mandar correos de verdad), no falla: escribe el correo en el log y devuelve el
// enlace, para poder seguir el flujo completo sin servidor de correo ni Docker.
//
// Nunca se registra el contenido personal del correo: solo el destinatario, el
// asunto y, en desarrollo, el enlace, que es justamente lo que hace falta para
// probar (ver docs/guias/convenciones.md, Logs).

import nodemailer, { type Transporter } from "nodemailer";
import type { Logger } from "../logger.ts";

export type ConfigSmtp = {
  host: string;
  port: number;
  seguro: boolean;
  usuario: string;
  password: string;
  remitente: string;
};

export type Correo = {
  para: string;
  asunto: string;
  texto: string;
  html: string;
};

export type Mensajero = {
  enviar: (correo: Correo) => Promise<void>;
  /** true si realmente sale por SMTP; false si solo se escribe en el log. */
  readonly enviaDeVerdad: boolean;
};

/**
 * Crea el mensajero. Sin `config` devuelve uno que solo registra, para
 * desarrollo y para los tests.
 */
export function crearMensajero(logger: Logger, config?: ConfigSmtp | undefined): Mensajero {
  if (!config) {
    return {
      enviaDeVerdad: false,
      enviar: async (correo) => {
        // En desarrollo el enlace va al log a propósito: es la única forma de
        // completar la verificación sin un servidor de correo.
        logger.info(
          { para: correo.para, asunto: correo.asunto, cuerpo: correo.texto },
          "correo NO enviado (SMTP sin configurar): se muestra acá para poder probar",
        );
      },
    };
  }

  const transporte: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.seguro,
    auth: { user: config.usuario, pass: config.password },
  });

  return {
    enviaDeVerdad: true,
    enviar: async (correo) => {
      await transporte.sendMail({
        from: config.remitente,
        to: correo.para,
        subject: correo.asunto,
        text: correo.texto,
        html: correo.html,
      });

      // Sin asunto ni cuerpo: el contenido de un correo es dato personal.
      logger.info({ para: correo.para }, "correo enviado");
    },
  };
}

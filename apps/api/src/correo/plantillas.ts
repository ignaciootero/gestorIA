// Textos de los correos que manda el sistema.
//
// En español, claros y cortos: dicen qué pasó, qué hay que hacer y qué va a
// pasar después. Cada correo se manda en texto plano y en HTML, porque no todos
// los clientes de correo muestran HTML.
//
// El HTML es deliberadamente simple y con estilos en línea: los clientes de
// correo no soportan hojas de estilo externas ni la mayoría del CSS moderno.

import { NOMBRE_APP } from "@gestoria/shared";
import type { Correo } from "./enviar.ts";

/** Escapa el texto que se interpola en el HTML, por si trae < o &. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function envolver(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#fafafa;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#18181b;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
      <h1 style="margin:0 0 16px;font-size:18px;font-weight:600;">${escapar(titulo)}</h1>
      ${cuerpo}
    </div>
  </body>
</html>`;
}

function boton(enlace: string, texto: string): string {
  return `<p style="margin:24px 0;">
      <a href="${escapar(enlace)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;">${escapar(texto)}</a>
    </p>
    <p style="margin:0;font-size:13px;color:#52525b;">
      Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br />
      <span style="word-break:break-all;">${escapar(enlace)}</span>
    </p>`;
}

/**
 * Correo de verificación de la dirección.
 *
 * Aclara desde el principio que verificar el correo no alcanza: después hace
 * falta la aprobación de un administrador. Es mejor decirlo ahora que dejar a la
 * persona esperando poder entrar y sin entender por qué no puede.
 */
export function correoDeVerificacion(datos: {
  para: string;
  nombre: string;
  enlace: string;
  horasDeValidez: number;
}): Correo {
  const asunto = `Confirmá tu correo · ${NOMBRE_APP}`;

  const texto = [
    `Hola ${datos.nombre}:`,
    "",
    "Para confirmar que este correo es tuyo, entrá en este enlace:",
    datos.enlace,
    "",
    `El enlace vale por ${datos.horasDeValidez} horas.`,
    "",
    "Después de confirmarlo, un administrador tiene que aprobar tu cuenta.",
    "Te avisamos cuando puedas entrar.",
    "",
    "Si no pediste esta cuenta, ignorá este mensaje: no se creó nada a tu nombre que puedas usar.",
  ].join("\n");

  const html = envolver(
    "Confirmá tu correo",
    `<p style="margin:0 0 12px;">Hola ${escapar(datos.nombre)}:</p>
    <p style="margin:0;">Para confirmar que este correo es tuyo, tocá el botón. El enlace vale por ${datos.horasDeValidez} horas.</p>
    ${boton(datos.enlace, "Confirmar mi correo")}
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e4e4e7;font-size:13px;color:#52525b;">
      Después de confirmarlo, un administrador tiene que aprobar tu cuenta. Te avisamos cuando puedas entrar.
    </p>
    <p style="margin:12px 0 0;font-size:13px;color:#52525b;">
      Si no pediste esta cuenta, ignorá este mensaje.
    </p>`,
  );

  return { para: datos.para, asunto, texto, html };
}

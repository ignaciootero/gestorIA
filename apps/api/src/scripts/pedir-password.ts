// Lee una contraseña por consola sin mostrarla en pantalla.
//
// Existe para que la contraseña del admin no tenga que vivir en el .env ni
// pasarse como argumento (donde quedaría en el historial del shell). Se escribe,
// se usa y se olvida.
//
// Funciona igual en Windows y en Linux: usa el modo crudo de stdin, sin
// depender de APIs internas de Node ni de comandos del sistema.

const ENTER = ["\r", "\n"];
const CTRL_C = "";
const BORRAR = ["", "\b"];

/**
 * Pide una contraseña por consola. Muestra un asterisco por carácter, para que
 * se vea que la escritura está entrando sin revelar el contenido.
 *
 * Falla con un mensaje claro si no hay terminal interactiva (por ejemplo en un
 * script automático), donde corresponde usar la variable de entorno.
 */
export function pedirPasswordOculta(mensaje: string): Promise<string> {
  const entrada = process.stdin;

  if (!entrada.isTTY) {
    return Promise.reject(
      new Error(
        "No hay una terminal interactiva para pedir la contraseña.\n" +
          "En entornos automáticos, pasala en la variable ADMIN_PASSWORD solo para ese comando.",
      ),
    );
  }

  process.stdout.write(mensaje);

  return new Promise((resolver, rechazar) => {
    let valor = "";

    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding("utf8");

    function terminar(): void {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener("data", alRecibir);
      process.stdout.write("\n");
    }

    function alRecibir(bloque: string): void {
      // En modo crudo puede llegar más de un carácter por evento (al pegar).
      for (const tecla of bloque) {
        if (ENTER.includes(tecla)) {
          terminar();
          resolver(valor);
          return;
        }

        if (tecla === CTRL_C) {
          terminar();
          rechazar(new Error("Cancelado."));
          return;
        }

        if (BORRAR.includes(tecla)) {
          if (valor.length > 0) {
            valor = valor.slice(0, -1);
            // Retrocede, pisa el asterisco con un espacio y retrocede de nuevo.
            process.stdout.write("\b \b");
          }
          continue;
        }

        // Se ignoran las teclas de control (flechas, escape) para que no
        // terminen dentro de la contraseña.
        if (tecla < " ") continue;

        valor += tecla;
        process.stdout.write("*");
      }
    }

    entrada.on("data", alRecibir);
  });
}

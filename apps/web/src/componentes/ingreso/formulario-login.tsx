// Formulario de inicio de sesión.
//
// Un solo campo para el identificador: acepta usuario o correo, indistinto.
// Quien vuelve después de meses no tiene por qué acordarse con cuál se registró
// (docs/guias/usabilidad.md).

"use client";

import { type DatosLogin, esquemaLogin, pareceEmail } from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { authCliente } from "@/lib/auth-cliente";
import { type ErrorParaMostrar, interpretarError } from "@/lib/mensajes-de-error";
import { AvisoDeVerificacion } from "./aviso-verificacion";

export function FormularioLogin() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<ErrorParaMostrar | null>(null);
  // Cuando el rechazo es por correo sin confirmar, no alcanza con un mensaje:
  // hay que poder reenviarlo desde acá mismo.
  const [emailSinConfirmar, setEmailSinConfirmar] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosLogin>({
    resolver: zodResolver(esquemaLogin),
    // Valida al salir del campo y no en cada tecla: avisar "correo inválido"
    // mientras la persona todavía está escribiendo es molesto y no ayuda.
    mode: "onBlur",
    defaultValues: { identificador: "", password: "" },
  });

  async function entrar(datos: DatosLogin): Promise<void> {
    setErrorGeneral(null);
    setEmailSinConfirmar(null);

    // La API tiene dos endpoints distintos; cuál usar lo decide la forma del
    // identificador, no la persona.
    const resultado = pareceEmail(datos.identificador)
      ? await authCliente.signIn.email({
          email: datos.identificador,
          password: datos.password,
        })
      : await authCliente.signIn.username({
          username: datos.identificador,
          password: datos.password,
        });

    if (resultado.error) {
      const interpretado = interpretarError(resultado.error);

      if (interpretado.codigo === "EMAIL_NO_VERIFICADO") {
        // Solo sabemos el correo si lo escribió; con el usuario no lo tenemos,
        // así que en ese caso se muestra el mensaje sin el botón de reenvío.
        if (pareceEmail(datos.identificador)) {
          setEmailSinConfirmar(datos.identificador);
          return;
        }
        setErrorGeneral(interpretado);
        return;
      }

      if (interpretado.campo === "password") {
        setError("password", { message: interpretado.mensaje });
        return;
      }

      setErrorGeneral(interpretado);
      return;
    }

    // `refresh` revalida los datos del servidor antes de navegar, así la pantalla
    // de inicio ya se pinta con la sesión al llegar.
    router.replace("/inicio");
    router.refresh();
  }

  if (emailSinConfirmar) {
    return <AvisoDeVerificacion email={emailSinConfirmar} />;
  }

  return (
    <form onSubmit={handleSubmit(entrar)} noValidate className="flex flex-col gap-4">
      {errorGeneral ? (
        <Aviso tono={errorGeneral.definitivo ? "advertencia" : "peligro"}>
          {errorGeneral.mensaje}
        </Aviso>
      ) : null}

      <Campo
        {...register("identificador")}
        etiqueta="Usuario o correo"
        // "username" ayuda a que el navegador y el gestor de contraseñas
        // reconozcan el campo y ofrezcan autocompletar.
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={errors.identificador?.message}
      />

      <Campo
        {...register("password")}
        etiqueta="Contraseña"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
      />

      <Boton type="submit" cargando={isSubmitting} textoCargando="Entrando" className="mt-2">
        Entrar
      </Boton>
    </form>
  );
}

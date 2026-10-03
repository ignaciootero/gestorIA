// Formulario de cambio de contraseña.
//
// Sirve para las dos situaciones en las que hace falta: cuando el sistema lo
// exige (después de un reseteo de un admin) y, más adelante, cuando alguien lo
// elija por su cuenta desde una futura pantalla de ajustes. La validación es la
// misma en los dos casos.

"use client";

import { type DatosCambioPassword, esquemaCambioPassword } from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { authCliente } from "@/lib/auth-cliente";
import { type ErrorParaMostrar, interpretarError } from "@/lib/mensajes-de-error";

export function FormularioCambioPassword() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = useState<ErrorParaMostrar | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosCambioPassword>({
    resolver: zodResolver(esquemaCambioPassword),
    mode: "onBlur",
    defaultValues: { passwordActual: "", passwordNueva: "", passwordNuevaRepetida: "" },
  });

  async function cambiar(datos: DatosCambioPassword): Promise<void> {
    setErrorGeneral(null);

    const resultado = await authCliente.changePassword({
      currentPassword: datos.passwordActual,
      newPassword: datos.passwordNueva,
      // Después de un reseteo la contraseña vieja pudo quedar en otro
      // dispositivo o habérsela dado otra persona: no tiene sentido dejar
      // sesiones abiertas con ella.
      revokeOtherSessions: true,
    });

    if (resultado.error) {
      const interpretado = interpretarError(resultado.error);

      // Better Auth devuelve el mismo código que credenciales inválidas del
      // login: acá el único campo que puede estar mal es la contraseña
      // actual, así que el mensaje genérico se reemplaza por uno específico.
      if (interpretado.codigo === "CREDENCIALES_INVALIDAS") {
        setError("passwordActual", { message: "Tu contraseña actual no es correcta." });
        return;
      }

      setErrorGeneral(interpretado);
      return;
    }

    router.replace("/inicio");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(cambiar)} noValidate className="flex flex-col gap-4">
      {errorGeneral ? <Aviso tono="peligro">{errorGeneral.mensaje}</Aviso> : null}

      <Campo
        {...register("passwordActual")}
        etiqueta="Contraseña actual"
        type="password"
        autoComplete="current-password"
        error={errors.passwordActual?.message}
      />

      <Campo
        {...register("passwordNueva")}
        etiqueta="Contraseña nueva"
        type="password"
        autoComplete="new-password"
        error={errors.passwordNueva?.message}
      />

      <Campo
        {...register("passwordNuevaRepetida")}
        etiqueta="Repetí la contraseña nueva"
        type="password"
        autoComplete="new-password"
        error={errors.passwordNuevaRepetida?.message}
      />

      <Boton type="submit" cargando={isSubmitting} textoCargando="Cambiando" className="mt-2">
        Cambiar contraseña
      </Boton>
    </form>
  );
}

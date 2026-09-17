// Formulario de registro.
//
// Registrarse NO inicia sesión: la cuenta queda pendiente de aprobación manual
// (CLAUDE.md). Por eso al terminar no se navega a ningún lado, sino que se
// explica qué pasó y qué va a pasar después.

"use client";

import {
  type DatosRegistro,
  esquemaRegistro,
  LARGO_MAXIMO_CAMPO,
  LARGO_MAXIMO_PASSWORD,
  LARGO_MAXIMO_USUARIO,
  LARGO_MINIMO_PASSWORD,
} from "@gestoria/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { authCliente } from "@/lib/auth-cliente";
import { type ErrorParaMostrar, interpretarError } from "@/lib/mensajes-de-error";

type PropsRegistro = {
  /** Se avisa al terminar bien, con el correo al que se mandó la verificación. */
  alRegistrarse: (email: string) => void;
};

export function FormularioRegistro({ alRegistrarse }: PropsRegistro) {
  const [errorGeneral, setErrorGeneral] = useState<ErrorParaMostrar | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DatosRegistro>({
    resolver: zodResolver(esquemaRegistro),
    mode: "onBlur",
    defaultValues: {
      usuario: "",
      nombre: "",
      apellido: "",
      email: "",
      password: "",
      honeypot: "",
    },
  });

  async function crearCuenta(datos: DatosRegistro): Promise<void> {
    setErrorGeneral(null);

    const resultado = await authCliente.signUp.email({
      email: datos.email,
      password: datos.password,
      name: `${datos.nombre} ${datos.apellido}`,
      username: datos.usuario,
      nombre: datos.nombre,
      apellido: datos.apellido,
      ...(datos.honeypot ? { honeypot: datos.honeypot } : {}),
    });

    if (resultado.error) {
      const interpretado = interpretarError(resultado.error);

      // Si el problema es de un campo concreto, el mensaje va junto a ese campo
      // y no arriba de todo: es donde la persona está mirando.
      if (interpretado.campo === "usuario" || interpretado.campo === "email") {
        setError(interpretado.campo, { message: interpretado.mensaje });
        return;
      }

      setErrorGeneral(interpretado);
      return;
    }

    alRegistrarse(datos.email);
  }

  return (
    <form onSubmit={handleSubmit(crearCuenta)} noValidate className="flex flex-col gap-4">
      {errorGeneral ? <Aviso tono="peligro">{errorGeneral.mensaje}</Aviso> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          {...register("nombre")}
          etiqueta="Nombre"
          autoComplete="given-name"
          maxLength={LARGO_MAXIMO_CAMPO}
          error={errors.nombre?.message}
        />
        <Campo
          {...register("apellido")}
          etiqueta="Apellido"
          autoComplete="family-name"
          maxLength={LARGO_MAXIMO_CAMPO}
          error={errors.apellido?.message}
        />
      </div>

      <Campo
        {...register("usuario")}
        etiqueta="Usuario"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={LARGO_MAXIMO_USUARIO}
        ayuda={`Con esto vas a entrar. Minúsculas, números, puntos y guiones, hasta ${LARGO_MAXIMO_USUARIO} caracteres.`}
        error={errors.usuario?.message}
      />

      <Campo
        {...register("email")}
        etiqueta="Correo"
        type="email"
        // inputMode="email" abre el teclado con arroba en el teléfono.
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        error={errors.email?.message}
      />

      <Campo
        {...register("password")}
        etiqueta="Contraseña"
        type="password"
        autoComplete="new-password"
        maxLength={LARGO_MAXIMO_PASSWORD}
        ayuda={`Entre ${LARGO_MINIMO_PASSWORD} y ${LARGO_MAXIMO_PASSWORD} caracteres.`}
        error={errors.password?.message}
      />

      {/*
        Honeypot: invisible y fuera del orden de tabulación. Una persona no lo ve
        ni llega a él con el teclado; un bot que completa todo el formulario sí.
        El servidor vuelve a verificarlo (apps/api/src/auth/opciones.ts).
      */}
      <div className="trampa-bots" aria-hidden="true">
        <label htmlFor="sitio-web">No completar este campo</label>
        <input
          id="sitio-web"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("honeypot")}
        />
      </div>

      <Boton
        type="submit"
        cargando={isSubmitting}
        textoCargando="Creando la cuenta"
        className="mt-2"
      >
        Crear cuenta
      </Boton>
    </form>
  );
}

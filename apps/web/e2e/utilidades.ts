// Utilidades para los tests end-to-end.
//
// Preparan el estado de la base de pruebas hablando directamente con ella, en
// vez de hacerlo desde la interfaz: un test de la pantalla de login no tiene por
// qué registrar y aprobar una cuenta a mano cada vez.

import { crearClienteDb, esquema, leerConfigBaseDatos } from "@gestoria/db";
import { eq, sql } from "drizzle-orm";

// Puerto fijo de la API que levanta Playwright (ver playwright.config.ts). No se
// lee de NEXT_PUBLIC_URL_API a propósito: esa variable apunta a la API de
// desarrollo, y estos tests nunca deben tocar la base de desarrollo.
const URL_API = "http://localhost:3101";

/** Cliente contra gestion_test. Nunca contra la base de desarrollo. */
function cliente() {
  return crearClienteDb(leerConfigBaseDatos(true));
}

export async function limpiarBaseDePruebas(): Promise<void> {
  const db = cliente();
  try {
    await db.db.execute(
      sql`truncate table ${esquema.usuarios}, ${esquema.sesiones}, ${esquema.cuentas}, ${esquema.verificaciones}, ${esquema.limitesPeticiones}, ${esquema.movimientos}, ${esquema.presupuestos}, ${esquema.cuentasFinancieras}, ${esquema.categorias} restart identity cascade`,
    );
  } finally {
    await db.cerrar();
  }
}

export type CuentaDePrueba = {
  usuario: string;
  nombre: string;
  apellido: string;
  email: string;
  password: string;
};

let contador = 0;

/**
 * Registra una cuenta pasando por la API real (para que la contraseña quede con
 * el hash correcto) y después le pone el estado que pida el test.
 */
export async function crearCuentaAprobada(
  opciones: {
    estado?: "pendiente" | "aprobado" | "rechazado";
    emailVerificado?: boolean;
    debeCambiarPassword?: boolean;
    esAdmin?: boolean;
  } = {},
): Promise<CuentaDePrueba> {
  contador += 1;
  const sufijo = `${Date.now().toString(36)}${contador}`;

  const cuenta: CuentaDePrueba = {
    usuario: `p.${sufijo}`.slice(0, 20),
    nombre: "Ana",
    apellido: "Pérez",
    email: `ana.${sufijo}@ejemplo.test`,
    password: "clave-de-prueba",
  };

  const respuesta = await fetch(`${URL_API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: cuenta.email,
      password: cuenta.password,
      name: `${cuenta.nombre} ${cuenta.apellido}`,
      username: cuenta.usuario,
      nombre: cuenta.nombre,
      apellido: cuenta.apellido,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`No se pudo crear la cuenta de prueba: ${await respuesta.text()}`);
  }

  const db = cliente();
  try {
    // Para entrar hacen falta las dos cosas: correo confirmado y cuenta aprobada.
    await db.db
      .update(esquema.usuarios)
      .set({
        estado: opciones.estado ?? "aprobado",
        emailVerified: opciones.emailVerificado ?? true,
        debeCambiarPassword: opciones.debeCambiarPassword ?? false,
        role: opciones.esAdmin ? "admin" : "usuario",
      })
      .where(eq(esquema.usuarios.email, cuenta.email));
  } finally {
    await db.cerrar();
  }

  return cuenta;
}

// Campos propios del usuario, mas alla de los que trae Better Auth.
//
// Viven en el paquete compartido porque los necesitan los dos lados: la API para
// declararlos en el servidor y la web para que su cliente sepa que existen y los
// acepte al registrar. Si estuvieran duplicados, agregar un campo obligaria a
// acordarse de tocar los dos.
//
// `input: false` significa que el campo lo maneja solo el servidor: aunque
// alguien lo mande en el cuerpo del registro, no se acepta. Es lo que impide que
// una persona se registre directamente como aprobada o como admin.

import { MONEDA_POR_DEFECTO, ZONA_HORARIA_POR_DEFECTO } from "./estados.ts";

export const CAMPOS_ADICIONALES_USUARIO = {
  nombre: { type: "string", required: true, input: true },
  apellido: { type: "string", required: true, input: true },
  estado: {
    type: "string",
    required: false,
    defaultValue: "pendiente",
    input: false,
  },
  zonaHoraria: {
    type: "string",
    required: false,
    defaultValue: ZONA_HORARIA_POR_DEFECTO,
    input: false,
  },
  monedaPorDefecto: {
    type: "string",
    required: false,
    defaultValue: MONEDA_POR_DEFECTO,
    input: false,
  },
  debeCambiarPassword: {
    type: "boolean",
    required: false,
    defaultValue: false,
    input: false,
  },
  // Colores de acento elegidos ("#rrggbb"); null es el de la app. Se cambian con
  // PUT /api/yo/colores, nunca al registrarse (ver auth/colores-de-acento.ts).
  colorDeAcentoClaro: { type: "string", required: false, input: false },
  colorDeAcentoOscuro: { type: "string", required: false, input: false },
} as const;

export type CamposAdicionalesUsuario = typeof CAMPOS_ADICIONALES_USUARIO;

// Deudas y préstamos con un contacto o con alguien que no es un contacto: constantes y esquemas Zod, compartidos por la API y la web.
//
// Una deuda es un registro aparte de los movimientos: no mueve los saldos de las cuentas ni
// entra en los totales (ver esquema/finanzas.ts). Se define con quién (un contacto, o solo un
// nombre escrito a mano), el sentido ("me deben" o "debo"), de qué es, el monto, la moneda y el día. Se va saldando con pagos parciales.
// Como el resto de los importes, viajan en la unidad normal (pesos) y se guardan en centésimos.

import { z } from "zod";
import { esquemaDiaDeCalendario } from "../contactos/esquemas.ts";
import { esquemaCambio, esquemaIdCategoria, esquemaMoneda, IMPORTE_MAXIMO } from "./esquemas.ts";

/** "me_deben": la persona prestó o espera cobrar. "debo": ella debe pagar. */
export const SENTIDOS_DE_DEUDA = { me_deben: "me_deben", debo: "debo" } as const;
export const SENTIDOS_DE_DEUDA_VALIDOS = ["me_deben", "debo"] as const;
export type SentidoDeDeuda = (typeof SENTIDOS_DE_DEUDA_VALIDOS)[number];

export const NOMBRES_DE_SENTIDO: Record<SentidoDeDeuda, string> = {
  me_deben: "Me deben",
  debo: "Debo",
};

export const LARGO_MAXIMO_CONCEPTO_DE_DEUDA = 140;
export const LARGO_MAXIMO_NOMBRE_LIBRE_DE_DEUDA = 80;

/** Un día de calendario opcional: vacío ("") cuenta como "sin fecha". */
const esquemaDiaOpcional = z.union([esquemaDiaDeCalendario, z.literal("")]).optional();

/**
 * Qué está mal en la fecha límite de una deuda, o undefined si está bien: no puede ser anterior al
 * día en que se originó. Es una función aparte, como `avisosDeConQuien`, porque Zod no corre las
 * reglas entre campos si otro campo ya falló y el formulario necesita avisar todo junto.
 */
export function avisoDeFechaLimite(datos: {
  fecha?: string | undefined;
  fechaLimite?: string | undefined;
}): string | undefined {
  if (!datos.fechaLimite || !datos.fecha) return undefined;
  return datos.fechaLimite < datos.fecha
    ? "El límite no puede ser anterior al día en que empezó la deuda."
    : undefined;
}

/** Como `esquemaImporte`, pero con un mensaje propio si el campo está vacío. */
const esquemaMonto = z
  .number("Escribí el importe.")
  .finite("Ese importe no es válido.")
  .positive("El importe tiene que ser mayor que cero.")
  .max(IMPORTE_MAXIMO, "Ese importe es demasiado grande.");

const esquemaConcepto = z
  .string()
  .trim()
  .min(1, "Escribí de qué es la deuda.")
  .max(
    LARGO_MAXIMO_CONCEPTO_DE_DEUDA,
    `El concepto no puede pasar de ${LARGO_MAXIMO_CONCEPTO_DE_DEUDA} caracteres.`,
  );

/**
 * Qué está mal en el "con quién" de una deuda, por campo. Vacío si está bien: un contacto o un
 * nombre, uno solo de los dos. Sin ninguno avisa en los dos campos (la pantalla muestra el del que
 * tenga a la vista). Es una función aparte porque Zod no corre las reglas entre campos si otro campo
 * ya falló, y el formulario necesita este aviso junto con los demás.
 */
export function avisosDeConQuien(datos: {
  contactoId?: string | undefined;
  nombreLibre?: string | undefined;
}): { contactoId?: string; nombreLibre?: string } {
  const hayContacto = Boolean(datos.contactoId);
  const hayNombre = Boolean(datos.nombreLibre?.trim());
  if (hayContacto && hayNombre) {
    return { nombreLibre: "Elegí un contacto o escribí un nombre, no los dos." };
  }
  if (!hayContacto && !hayNombre) {
    return { contactoId: "Elegí un contacto.", nombreLibre: "Escribí con quién es la deuda." };
  }
  return {};
}

/**
 * Registrar una deuda. Es con un contacto (`contactoId`) o con alguien que no está en los
 * contactos (`nombreLibre`, un texto): uno de los dos, nunca los dos ni ninguno. Un texto vacío
 * cuenta como "no vino", así un formulario puede mandar los dos campos y dejar uno en blanco.
 */
export const esquemaDeuda = z
  .object({
    contactoId: z.union([z.uuid("Elegí un contacto."), z.literal("")]).optional(),
    nombreLibre: z
      .string()
      .trim()
      .max(
        LARGO_MAXIMO_NOMBRE_LIBRE_DE_DEUDA,
        `El nombre no puede pasar de ${LARGO_MAXIMO_NOMBRE_LIBRE_DE_DEUDA} caracteres.`,
      )
      .optional(),
    sentido: z.enum(SENTIDOS_DE_DEUDA_VALIDOS, { error: "Elegí si te deben o si debés." }),
    concepto: esquemaConcepto,
    monto: esquemaMonto,
    moneda: esquemaMoneda,
    /** El día en que se originó. */
    fecha: esquemaDiaDeCalendario,
    /** Hasta qué día debería saldarse. Opcional. */
    fechaLimite: esquemaDiaOpcional,
  })
  .superRefine((datos, contexto) => {
    const limite = avisoDeFechaLimite(datos);
    if (limite) contexto.addIssue({ code: "custom", path: ["fechaLimite"], message: limite });
    const avisos = avisosDeConQuien(datos);
    if (avisos.contactoId) {
      contexto.addIssue({ code: "custom", path: ["contactoId"], message: avisos.contactoId });
    }
    if (avisos.nombreLibre) {
      contexto.addIssue({ code: "custom", path: ["nombreLibre"], message: avisos.nombreLibre });
    }
  });
export type DatosDeDeuda = z.infer<typeof esquemaDeuda>;

/**
 * Editar una deuda. Con quién, el sentido y la moneda no se cambian (si estaban mal, se elimina
 * y se registra de nuevo); el monto no puede quedar por debajo de lo ya pagado, y eso lo valida
 * el servicio.
 */
export const esquemaEditarDeuda = z
  .object({
    concepto: esquemaConcepto,
    monto: esquemaMonto,
    fecha: esquemaDiaDeCalendario,
    /**
     * Hasta qué día debería saldarse. Sin el campo, queda como estaba; vacío ("") la quita.
     */
    fechaLimite: esquemaDiaOpcional,
  })
  .superRefine((datos, contexto) => {
    const limite = avisoDeFechaLimite(datos);
    if (limite) contexto.addIssue({ code: "custom", path: ["fechaLimite"], message: limite });
  });
export type DatosEditarDeuda = z.infer<typeof esquemaEditarDeuda>;

/**
 * Registrar un pago (o cobro) de una deuda. No puede pasar de lo que falta, y eso lo valida el
 * servicio. Con `movimiento`, además se genera un ingreso (si le deben a la persona) o un gasto (si
 * ella debe) en la cuenta elegida. Si la cuenta es de otra moneda que la deuda, el importe se
 * convierte como en una transferencia: con la cotización del día (por defecto) o con `cambio`.
 */
export const esquemaPagoDeDeuda = z.object({
  monto: esquemaMonto,
  fecha: esquemaDiaDeCalendario,
  movimiento: z
    .object({
      cuentaFinancieraId: z.uuid("Elegí una cuenta."),
      categoriaId: esquemaIdCategoria,
      /** Solo si la cuenta es de otra moneda que la deuda (ver esquemaCambio). */
      cambio: esquemaCambio.optional(),
    })
    .optional(),
});
export type DatosDePagoDeDeuda = z.infer<typeof esquemaPagoDeDeuda>;

// Tests de integración de la limpieza periódica de contactos, contra gestion_test.

import { type ClienteDb, esquema } from "@gestoria/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  crearContactoPorApi,
  crearDeudaPorApi,
  crearEtiquetaPorApi,
  entrarComoPersona,
  type PersonaDePrueba,
  personaValida,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba } from "../../pruebas/entorno-de-prueba.ts";
import { listarHistorial } from "./historial-de-recordatorios.ts";
import { DIAS_ANTES_DE_BORRAR, limpiarContactos } from "./limpieza.ts";
import { crearRecordatorio } from "./recordatorios.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let contactoId: string;

/** 12:00 en Montevideo del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");
const MS_POR_DIA = 86_400_000;

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente);
  contactoId = await crearContactoPorApi(app, ana.cookies, personaValida());
});

afterAll(async () => {
  await cliente.cerrar();
});

/** Inserta directo en la base un recordatorio que ya está en el pasado (la API no deja crearlo). */
async function insertarRecordatorio(datos: {
  /** Solo para los de una sola vez; los demás llevan los campos de su repetición. */
  fecha?: string;
  repeticion: "unica" | "diaria" | "anual";
  userId?: string;
  contacto?: string;
  eliminadoEn?: Date;
}) {
  const [fila] = await cliente.db
    .insert(esquema.recordatoriosDeContactos)
    .values({
      userId: datos.userId ?? ana.userId,
      contactoId: datos.contacto ?? contactoId,
      titulo: "Recordatorio",
      repeticion: datos.repeticion,
      // Cada repetición lleva solo sus campos (lo exige un `check` de la base).
      ...(datos.repeticion === "unica" ? { fecha: datos.fecha ?? "2026-10-01" } : {}),
      ...(datos.repeticion === "diaria" ? { hora: "08:00" } : {}),
      ...(datos.repeticion === "anual" ? { diaDelMes: 12, mes: 5 } : {}),
      ...(datos.eliminadoEn ? { eliminadoEn: datos.eliminadoEn } : {}),
    })
    .returning({ id: esquema.recordatoriosDeContactos.id });
  return fila?.id ?? "";
}

async function eliminadoEn(id: string): Promise<Date | null | undefined> {
  const fila = await cliente.db.query.recordatoriosDeContactos.findFirst({
    where: (tabla, { eq: igual }) => igual(tabla.id, id),
  });
  return fila === undefined ? undefined : fila.eliminadoEn;
}

describe("recordatorios de una sola vez que ya pasaron", () => {
  it("los pasa al histórico y los da de baja; deja los de hoy, los futuros y los que se repiten", async () => {
    const ayer = await insertarRecordatorio({ fecha: "2026-10-19", repeticion: "unica" });
    const antiguo = await insertarRecordatorio({ fecha: "2020-01-01", repeticion: "unica" });
    const hoy = await insertarRecordatorio({ fecha: "2026-10-20", repeticion: "unica" });
    const manana = await insertarRecordatorio({ fecha: "2026-10-21", repeticion: "unica" });
    const anualViejo = await insertarRecordatorio({ repeticion: "anual" });
    const diarioViejo = await insertarRecordatorio({ repeticion: "diaria" });

    const resultado = await limpiarContactos(cliente, AHORA);

    expect(resultado.historialAgregado).toBe(2);
    expect(await eliminadoEn(ayer)).toBeInstanceOf(Date);
    expect(await eliminadoEn(antiguo)).toBeInstanceOf(Date);
    for (const intacto of [hoy, manana, anualViejo, diarioViejo]) {
      expect(await eliminadoEn(intacto)).toBeNull();
    }
    expect((await listarHistorial(cliente, ana.userId, { ahora: AHORA })).total).toBe(2);
  });

  it("el histórico no se borra solo, ni con el paso del tiempo", async () => {
    await insertarRecordatorio({ fecha: "2026-09-01", repeticion: "unica" });
    await limpiarContactos(cliente, AHORA);
    await limpiarContactos(cliente, new Date(AHORA.getTime() + 400 * MS_POR_DIA));

    const unicas = await cliente.db.query.historialDeRecordatorios.findMany({
      where: (tabla, { eq: igual }) => igual(tabla.repeticion, "unica"),
    });
    expect(unicas).toHaveLength(1);
  });

  it("es idempotente: volver a correrla no agrega nada", async () => {
    await insertarRecordatorio({ fecha: "2026-10-01", repeticion: "unica" });
    expect((await limpiarContactos(cliente, AHORA)).historialAgregado).toBe(1);
    expect((await limpiarContactos(cliente, AHORA)).historialAgregado).toBe(0);
  });

  it("sin nada para limpiar no falla", async () => {
    expect(await limpiarContactos(cliente, AHORA)).toEqual({
      historialAgregado: 0,
      contactosBorrados: 0,
      recordatoriosBorrados: 0,
      deudasBorradas: 0,
      pagosBorrados: 0,
    });
  });
});

describe("borrado definitivo de lo eliminado", () => {
  const hace = (dias: number) => new Date(AHORA.getTime() - dias * MS_POR_DIA);

  it("borra los contactos eliminados hace más del plazo, con todo lo que cuelga de ellos", async () => {
    const etiqueta = await crearEtiquetaPorApi(app, ana.cookies, "Familia");
    const viejo = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({
        nombre: "Viejo",
        telefonos: [{ numero: "099 123 456", tipo: "celular" }],
        correos: ["a@ejemplo.com"],
        etiquetaIds: [etiqueta],
      }),
    );
    await crearRecordatorio(
      cliente,
      ana.userId,
      viejo,
      { titulo: "Aviso", fecha: "2999-01-01", repeticion: "unica", hora: "" },
      AHORA,
    );
    await cliente.db
      .update(esquema.contactos)
      .set({ eliminadoEn: hace(DIAS_ANTES_DE_BORRAR + 1) })
      .where(eq(esquema.contactos.id, viejo));

    const resultado = await limpiarContactos(cliente, AHORA);

    expect(resultado.contactosBorrados).toBe(1);
    expect(
      await cliente.db.select().from(esquema.contactos).where(eq(esquema.contactos.id, viejo)),
    ).toEqual([]);
    expect(
      await cliente.db
        .select()
        .from(esquema.telefonosDeContactos)
        .where(eq(esquema.telefonosDeContactos.contactoId, viejo)),
    ).toEqual([]);
    expect(
      await cliente.db
        .select()
        .from(esquema.correosDeContactos)
        .where(eq(esquema.correosDeContactos.contactoId, viejo)),
    ).toEqual([]);
    expect(
      await cliente.db
        .select()
        .from(esquema.etiquetasPorContacto)
        .where(eq(esquema.etiquetasPorContacto.contactoId, viejo)),
    ).toEqual([]);
    expect(
      await cliente.db
        .select()
        .from(esquema.recordatoriosDeContactos)
        .where(eq(esquema.recordatoriosDeContactos.contactoId, viejo)),
    ).toEqual([]);
    // La etiqueta en sí no era del contacto: sigue.
    expect(await cliente.db.select().from(esquema.etiquetasDeContactos)).toHaveLength(1);
  });

  it("conserva lo eliminado dentro del plazo y lo que nunca se eliminó", async () => {
    const reciente = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Reciente" }),
    );
    await cliente.db
      .update(esquema.contactos)
      .set({ eliminadoEn: hace(DIAS_ANTES_DE_BORRAR - 1) })
      .where(eq(esquema.contactos.id, reciente));

    const resultado = await limpiarContactos(cliente, AHORA);

    expect(resultado.contactosBorrados).toBe(0);
    expect(await cliente.db.select().from(esquema.contactos)).toHaveLength(2);
  });

  it("borra los recordatorios eliminados hace más del plazo y deja los recientes", async () => {
    const viejo = await insertarRecordatorio({
      fecha: "2999-01-01",
      repeticion: "unica",
      eliminadoEn: hace(DIAS_ANTES_DE_BORRAR + 1),
    });
    const reciente = await insertarRecordatorio({
      fecha: "2999-01-01",
      repeticion: "unica",
      eliminadoEn: hace(1),
    });

    const resultado = await limpiarContactos(cliente, AHORA);

    expect(resultado.recordatoriosBorrados).toBe(1);
    expect(await eliminadoEn(viejo)).toBeUndefined();
    expect(await eliminadoEn(reciente)).toBeInstanceOf(Date);
  });

  it("un recordatorio de una sola vez que pasó se da de baja y a los 30 días se borra en definitivo, pero su entrada del histórico queda", async () => {
    const id = await insertarRecordatorio({ fecha: "2026-09-01", repeticion: "unica" });
    await limpiarContactos(cliente, AHORA);
    expect(await eliminadoEn(id)).toBeInstanceOf(Date);

    await limpiarContactos(
      cliente,
      new Date(AHORA.getTime() + (DIAS_ANTES_DE_BORRAR + 1) * MS_POR_DIA),
    );
    expect(await eliminadoEn(id)).toBeUndefined();
    const historial = await cliente.db.query.historialDeRecordatorios.findMany();
    expect(historial.map((entrada) => entrada.recordatorioId)).toEqual([id]);
  });
});

describe("deudas", () => {
  const hace = (dias: number) => new Date(AHORA.getTime() - dias * MS_POR_DIA);

  async function crearDeuda(estado: { eliminadaHace?: number } = {}) {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId });
    if (estado.eliminadaHace !== undefined) {
      await cliente.db
        .update(esquema.deudas)
        .set({ eliminadoEn: hace(estado.eliminadaHace) })
        .where(eq(esquema.deudas.id, id));
    }
    return id;
  }

  const contactoExiste = async () =>
    (await cliente.db.query.contactos.findFirst({
      where: eq(esquema.contactos.id, contactoId),
    })) !== undefined;

  async function eliminarContactoHace(dias: number) {
    await cliente.db
      .update(esquema.contactos)
      .set({ eliminadoEn: hace(dias) })
      .where(eq(esquema.contactos.id, contactoId));
  }

  it("un contacto en la papelera con una deuda vigente no se borra en definitivo, por viejo que sea", async () => {
    await crearDeuda();
    await eliminarContactoHace(DIAS_ANTES_DE_BORRAR + 100);

    const resultado = await limpiarContactos(cliente, AHORA);

    expect(resultado.contactosBorrados).toBe(0);
    expect(await contactoExiste()).toBe(true);
  });

  it("borra las deudas eliminadas hace más del plazo, con sus pagos, y deja las recientes", async () => {
    const vieja = await crearDeuda({ eliminadaHace: DIAS_ANTES_DE_BORRAR + 1 });
    const reciente = await crearDeuda({ eliminadaHace: 2 });
    await cliente.db.insert(esquema.pagosDeDeudas).values({
      userId: ana.userId,
      deudaId: vieja,
      montoCentavos: 100,
      fecha: "2026-10-05",
    });

    const resultado = await limpiarContactos(cliente, AHORA);

    expect(resultado.deudasBorradas).toBe(1);
    expect(
      await cliente.db.select().from(esquema.deudas).where(eq(esquema.deudas.id, vieja)),
    ).toEqual([]);
    expect(
      await cliente.db
        .select()
        .from(esquema.pagosDeDeudas)
        .where(eq(esquema.pagosDeDeudas.deudaId, vieja)),
    ).toEqual([]);
    expect(
      await cliente.db.select().from(esquema.deudas).where(eq(esquema.deudas.id, reciente)),
    ).toHaveLength(1);
  });

  it("borra los pagos eliminados hace más del plazo sin tocar la deuda", async () => {
    const deuda = await crearDeuda();
    const [pago] = await cliente.db
      .insert(esquema.pagosDeDeudas)
      .values({
        userId: ana.userId,
        deudaId: deuda,
        montoCentavos: 100,
        fecha: "2026-10-05",
        eliminadoEn: hace(DIAS_ANTES_DE_BORRAR + 1),
      })
      .returning({ id: esquema.pagosDeDeudas.id });

    const resultado = await limpiarContactos(cliente, AHORA);

    expect(resultado.pagosBorrados).toBe(1);
    expect(
      await cliente.db
        .select()
        .from(esquema.pagosDeDeudas)
        .where(eq(esquema.pagosDeDeudas.id, pago?.id ?? "")),
    ).toEqual([]);
    expect(
      await cliente.db.select().from(esquema.deudas).where(eq(esquema.deudas.id, deuda)),
    ).toHaveLength(1);
  });

  it("cuando la única deuda del contacto ya se borró, el contacto viejo se borra en el mismo pasaje", async () => {
    await crearDeuda({ eliminadaHace: DIAS_ANTES_DE_BORRAR + 1 });
    await eliminarContactoHace(DIAS_ANTES_DE_BORRAR + 5);

    const resultado = await limpiarContactos(cliente, AHORA);

    expect(resultado).toMatchObject({ deudasBorradas: 1, contactosBorrados: 1 });
    expect(await contactoExiste()).toBe(false);
  });
});

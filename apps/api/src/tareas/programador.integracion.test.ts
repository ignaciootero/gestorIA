// Prueba de punta a punta del programador de tareas: arranca pg-boss de verdad contra
// gestion_test y comprueba que la tarea de limpieza corre, sin llamarla a mano.
//
// pg-boss crea su propio esquema (`pgboss`) en la base la primera vez; los tests no lo
// vacían (no tiene datos de la aplicación).

import { type ClienteDb, esquema, leerConfigBaseDatos } from "@gestoria/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { crearLogger } from "../logger.ts";
import { limpiarBase } from "../pruebas/auth-de-prueba.ts";
import {
  crearContactoPorApi,
  entrarComoPersona,
  type PersonaDePrueba,
  personaValida,
} from "../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, entornoDePrueba } from "../pruebas/entorno-de-prueba.ts";
import { iniciarProgramador, type Programador } from "./programador.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let programador: Programador | null = null;

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente);
});

afterAll(async () => {
  await programador?.detener();
  await cliente.cerrar();
});

async function esperarA(condicion: () => Promise<boolean>, maximoMs = 20_000) {
  const limite = Date.now() + maximoMs;
  while (Date.now() < limite) {
    if (await condicion()) return;
    await new Promise((resolver) => setTimeout(resolver, 250));
  }
  throw new Error("La condición no se cumplió a tiempo.");
}

/** Un contacto eliminado hace 40 días: la limpieza lo borra en definitivo. */
async function contactoEliminadoHaceMucho(): Promise<string> {
  const contactoId = await crearContactoPorApi(app, ana.cookies, personaValida());
  await cliente.db
    .update(esquema.contactos)
    .set({ eliminadoEn: new Date(Date.now() - 40 * 86_400_000) })
    .where(eq(esquema.contactos.id, contactoId));
  return contactoId;
}

async function existeElContacto(id: string): Promise<boolean> {
  const fila = await cliente.db.query.contactos.findFirst({
    where: eq(esquema.contactos.id, id),
  });
  return fila !== undefined;
}

describe("programador de tareas", () => {
  it("al arrancar corre la limpieza: borra en definitivo un contacto eliminado hace mucho", async () => {
    const viejo = await contactoEliminadoHaceMucho();

    programador = await iniciarProgramador({
      cliente,
      config: leerConfigBaseDatos(true),
      logger: crearLogger(entornoDePrueba()),
    });

    await esperarA(async () => !(await existeElContacto(viejo)));
  });

  it("se puede pedir otra limpieza cuando se quiera", async () => {
    if (!programador)
      throw new Error("El programador debería estar iniciado por el test anterior.");
    const viejo = await contactoEliminadoHaceMucho();

    await programador.correrLimpiezaAhora();

    await esperarA(async () => !(await existeElContacto(viejo)));
  });
});

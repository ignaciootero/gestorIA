// Tareas programadas de la API (pg-boss).
//
// pg-boss guarda sus colas en la misma base de PostgreSQL, en su propio esquema
// (`pgboss`): no hace falta Redis ni ningún servicio aparte. Crea ese esquema solo al
// arrancar. Cada tarea es una cola con un trabajador; el calendario (`schedule`) manda
// un trabajo a la cola cada tanto.
//
// Si la API corre en más de una copia, pg-boss reparte los trabajos y cada uno se
// ejecuta una sola vez. Si la API está caída cuando toca, el trabajo corre al volver:
// todas las tareas son idempotentes (volver a correrlas no cambia el resultado).
//
// En los tests no se arranca: cada tarea es una función común que se prueba aparte, y
// una prueba de punta a punta (programador.integracion.test.ts) cubre el cableado.

import type { ClienteDb, ConfigBaseDatos } from "@gestoria/db";
import { PgBoss } from "pg-boss";
import type { Logger } from "../logger.ts";
import { limpiarCalendario } from "../servicios/calendario/limpieza.ts";
import { limpiarContactos } from "../servicios/contactos/limpieza.ts";
import { limpiarTareas } from "../servicios/tareas/limpieza.ts";

export const COLA_LIMPIEZA_DE_CONTACTOS = "limpieza-de-contactos";

/** Cada hora, en punto: alcanza para que lo vencido deje de estar en la base poco después de medianoche. */
const CADA_HORA = "0 * * * *";

const ESPERA_AL_APAGAR_MS = 10_000;

export type Programador = {
  /** Termina los trabajos en curso y cierra las conexiones. */
  detener: () => Promise<void>;
  /** Manda un trabajo ya, sin esperar al calendario (lo usan el arranque y los tests). */
  correrLimpiezaAhora: () => Promise<void>;
};

export async function iniciarProgramador(opciones: {
  cliente: ClienteDb;
  config: ConfigBaseDatos;
  logger: Logger;
}): Promise<Programador> {
  const { cliente, config, logger } = opciones;

  const boss = new PgBoss({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    // Pocas conexiones: las tareas son livianas y el pool de la API tiene las suyas.
    max: 2,
  });
  boss.on("error", (error) => logger.error({ err: error }, "error en pg-boss"));

  await boss.start();

  await boss.createQueue(COLA_LIMPIEZA_DE_CONTACTOS);
  await boss.work(COLA_LIMPIEZA_DE_CONTACTOS, async () => {
    const resultado = await limpiarContactos(cliente);
    logger.info(resultado, "limpieza de contactos");
    logger.info(await limpiarTareas(cliente), "limpieza de tareas");
    logger.info(await limpiarCalendario(cliente), "limpieza del calendario");
  });
  await boss.schedule(COLA_LIMPIEZA_DE_CONTACTOS, CADA_HORA);

  const correrLimpiezaAhora = async () => {
    await boss.send(COLA_LIMPIEZA_DE_CONTACTOS, {});
  };
  // Al arrancar se corre una vez, por si la API estuvo apagada en una hora en punto.
  await correrLimpiezaAhora();

  logger.info("tareas programadas iniciadas");

  return {
    correrLimpiezaAhora,
    detener: async () => {
      await boss.stop({ graceful: true, timeout: ESPERA_AL_APAGAR_MS });
    },
  };
}

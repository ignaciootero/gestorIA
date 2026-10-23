// Datos de los widgets del módulo de contactos (GET /api/contactos/widgets).
//
// Devuelve datos, no frases: la web decide cómo escribirlos (mismo criterio que los
// widgets de Finanzas). Todo filtra por la persona de la sesión.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import {
  diasEntre,
  proximaOcurrencia,
  REPETICIONES_VALIDAS,
  type Repeticion,
  type TipoDeContacto,
} from "@gestoria/shared";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { obtenerMonedaBase } from "../finanzas/moneda-base.ts";
import { listarEtiquetas } from "./etiquetas.ts";
import { listarHistorial } from "./historial-de-recordatorios.ts";
import { hoyDeLaPersona, listarRecordatorios } from "./recordatorios.ts";

/** Cuántas semanas hacia adelante cuenta el gráfico de recordatorios. */
const SEMANAS_DEL_GRAFICO = 4;
const DIAS_DE_LA_SEMANA = 7;
const CANTIDAD_EN_LISTAS = 3;
/** Cuántos días hacia atrás cuenta el gráfico del histórico (ayer es el último). */
const DIAS_DEL_HISTORIAL = 7;
/** Cuántos días hacia atrás cuenta "con quién más gastaste". */
const DIAS_DE_GASTOS = 90;

export type WidgetsDeContactos = {
  totales: {
    personas: number;
    empresas: number;
    favoritos: number;
    /** Contactos sin ningún teléfono ni correo: no hay cómo comunicarse con ellos. */
    sinDatosDeContacto: number;
  };
  /** Las etiquetas con más contactos (solo las que tienen alguno). */
  etiquetas: { nombre: string; color: string; contactos: number }[];
  /** Los rubros que más se repiten entre las empresas. */
  rubros: { rubro: string; empresas: number }[];
  /** Hasta tres favoritos, para nombrarlos. */
  favoritos: { nombre: string; apellido: string | null }[];
  recordatorios: {
    hoy: number;
    proximos7: number;
    proximos30: number;
    /** Cuántos caen en cada una de las próximas cuatro semanas (la primera arranca hoy). */
    porSemana: number[];
    /** Los que vienen, los más cercanos primero (hoy incluido). */
    proximos: {
      titulo: string;
      repeticion: string;
      fecha: string;
      /** "HH:MM"; null es "todo el día". */
      hora: string | null;
      dias: number;
      contacto: { tipo: TipoDeContacto; nombre: string; apellido: string | null };
    }[];
  };
  /** Los recordatorios vigentes por cómo se repiten (solo los que tienen alguno), de más a menos. */
  porRepeticion: { repeticion: Repeticion; total: number }[];
  /** Lo que ya pasó de los recordatorios (ver historial-de-recordatorios.ts). */
  historial: {
    /** Cuántas entradas tiene el histórico. */
    total: number;
    /** Cuántas en los últimos 7 días (ayer incluido, hoy no: todavía no terminó). */
    ultimos7: number;
    /** Cuántas cayeron cada uno de los últimos 7 días; el último es ayer. */
    porDia: number[];
    /** Las más recientes. */
    ultimas: {
      titulo: string;
      repeticion: Repeticion;
      diasAtras: number;
      contacto: { tipo: TipoDeContacto; nombre: string; apellido: string | null };
    }[];
  };
  /** Con quién más se gastó en los últimos 90 días, en la moneda base (hasta tres). */
  masGastado: {
    nombre: string;
    apellido: string | null;
    gastoCentavos: number;
    movimientos: number;
  }[];
  monedaBase: string;
  /** El próximo cumpleaños de una persona con fecha de nacimiento; null si no hay ninguna. */
  proximoCumpleanos: {
    nombre: string;
    apellido: string | null;
    /** El día en que cae (este año o el que viene). */
    fecha: string;
    dias: number;
    nacimiento: string;
  } | null;
};

export async function obtenerWidgetsDeContactos(
  cliente: ClienteDb,
  userId: string,
  ahora: Date = new Date(),
): Promise<WidgetsDeContactos> {
  const { contactos } = esquema;
  const activos = and(eq(contactos.userId, userId), isNull(contactos.eliminadoEn));

  const desde = new Date(ahora.getTime() - DIAS_DE_GASTOS * 86_400_000);
  const { movimientos } = esquema;

  const [hoy, filas, etiquetas, sinDatos, { recordatorios }, gastos, monedaBase, historial] =
    await Promise.all([
      hoyDeLaPersona(cliente, userId, ahora),
      cliente.db
        .select({
          tipo: contactos.tipo,
          nombre: contactos.nombre,
          apellido: contactos.apellido,
          rubro: contactos.rubro,
          favorito: contactos.favorito,
          fechaNacimiento: contactos.fechaNacimiento,
        })
        .from(contactos)
        .where(activos),
      listarEtiquetas(cliente, userId),
      cliente.db
        .select({ total: sql<number>`count(*)::int` })
        .from(contactos)
        .where(
          and(
            activos,
            sql`not exists (select 1 from ${esquema.telefonosDeContactos} where ${esquema.telefonosDeContactos.contactoId} = ${contactos.id})`,
            sql`not exists (select 1 from ${esquema.correosDeContactos} where ${esquema.correosDeContactos.contactoId} = ${contactos.id})`,
          ),
        ),
      listarRecordatorios(cliente, userId, { ahora, limit: 500 }),
      // Con quién más se gastó: el importe ya convertido a la moneda base que guarda cada movimiento.
      cliente.db
        .select({
          nombre: contactos.nombre,
          apellido: contactos.apellido,
          gastoCentavos: sql<number>`sum(${movimientos.importeConvertidoCentavos})`.mapWith(Number),
          movimientos: sql<number>`count(*)`.mapWith(Number),
        })
        .from(movimientos)
        .innerJoin(contactos, eq(contactos.id, movimientos.contactoId))
        .where(
          and(
            eq(movimientos.userId, userId),
            eq(movimientos.tipo, "gasto"),
            isNull(movimientos.eliminadoEn),
            gte(movimientos.fecha, desde),
            lte(movimientos.fecha, ahora),
            isNull(contactos.eliminadoEn),
          ),
        )
        .groupBy(contactos.id, contactos.nombre, contactos.apellido)
        .orderBy(desc(sql`sum(${movimientos.importeConvertidoCentavos})`), contactos.nombre)
        .limit(CANTIDAD_EN_LISTAS),
      obtenerMonedaBase(cliente, userId),
      listarHistorial(cliente, userId, { ahora, limit: 500 }),
    ]);

  const personas = filas.filter((fila) => fila.tipo === "persona");
  const empresas = filas.filter((fila) => fila.tipo === "empresa");

  // Sin distinguir mayúsculas ("Electricista" y "electricista" son el mismo rubro); se
  // muestra como lo escribió la primera empresa que lo tiene.
  const rubros = new Map<string, { rubro: string; empresas: number }>();
  for (const empresa of empresas) {
    const rubro = empresa.rubro?.trim();
    if (!rubro) continue;
    const clave = rubro.toLocaleLowerCase("es");
    const actual = rubros.get(clave);
    rubros.set(clave, { rubro: actual?.rubro ?? rubro, empresas: (actual?.empresas ?? 0) + 1 });
  }

  let proximoCumpleanos: WidgetsDeContactos["proximoCumpleanos"] = null;
  for (const persona of personas) {
    if (!persona.fechaNacimiento) continue;
    // El cumpleaños es un recordatorio anual: el día y el mes de la fecha de nacimiento.
    const fecha = proximaOcurrencia(
      {
        repeticion: "anual",
        fecha: null,
        diaSemana: null,
        diaDelMes: Number(persona.fechaNacimiento.slice(8, 10)),
        mes: Number(persona.fechaNacimiento.slice(5, 7)),
      },
      hoy,
    );
    if (fecha === null) continue;
    const dias = diasEntre(hoy, fecha);
    if (proximoCumpleanos === null || dias < proximoCumpleanos.dias) {
      proximoCumpleanos = {
        nombre: persona.nombre,
        apellido: persona.apellido,
        fecha,
        dias,
        nacimiento: persona.fechaNacimiento,
      };
    }
  }

  const porSemana = Array.from({ length: SEMANAS_DEL_GRAFICO }, () => 0);
  for (const recordatorio of recordatorios) {
    const semana = Math.floor(recordatorio.diasRestantes / DIAS_DE_LA_SEMANA);
    if (semana < SEMANAS_DEL_GRAFICO && porSemana[semana] !== undefined) porSemana[semana] += 1;
  }

  const porDiaDelHistorial = Array.from({ length: DIAS_DEL_HISTORIAL }, () => 0);
  for (const entrada of historial.entradas) {
    // diasAtras 1 es ayer: va en el último lugar del gráfico.
    const lugar = DIAS_DEL_HISTORIAL - entrada.diasAtras;
    if (lugar >= 0 && lugar < DIAS_DEL_HISTORIAL && porDiaDelHistorial[lugar] !== undefined) {
      porDiaDelHistorial[lugar] += 1;
    }
  }

  const porRepeticion = new Map<Repeticion, number>();
  for (const recordatorio of recordatorios) {
    porRepeticion.set(
      recordatorio.repeticion,
      (porRepeticion.get(recordatorio.repeticion) ?? 0) + 1,
    );
  }

  return {
    totales: {
      personas: personas.length,
      empresas: empresas.length,
      favoritos: filas.filter((fila) => fila.favorito).length,
      sinDatosDeContacto: sinDatos[0]?.total ?? 0,
    },
    etiquetas: etiquetas
      .filter((etiqueta) => etiqueta.contactos > 0)
      .sort((a, b) => b.contactos - a.contactos || a.nombre.localeCompare(b.nombre, "es"))
      .slice(0, CANTIDAD_EN_LISTAS)
      .map(({ nombre, color, contactos: cantidad }) => ({ nombre, color, contactos: cantidad })),
    rubros: [...rubros.values()]
      .sort((a, b) => b.empresas - a.empresas || a.rubro.localeCompare(b.rubro, "es"))
      .slice(0, CANTIDAD_EN_LISTAS),
    favoritos: filas
      .filter((fila) => fila.favorito)
      .slice(0, CANTIDAD_EN_LISTAS)
      .map(({ nombre, apellido }) => ({ nombre, apellido })),
    recordatorios: {
      hoy: recordatorios.filter((recordatorio) => recordatorio.diasRestantes === 0).length,
      proximos7: recordatorios.filter((recordatorio) => recordatorio.diasRestantes < 7).length,
      proximos30: recordatorios.filter((recordatorio) => recordatorio.diasRestantes < 30).length,
      porSemana,
      proximos: recordatorios.slice(0, 5).map((recordatorio) => ({
        titulo: recordatorio.titulo,
        repeticion: recordatorio.repeticion,
        fecha: recordatorio.proximaFecha,
        hora: recordatorio.hora,
        dias: recordatorio.diasRestantes,
        contacto: {
          tipo: recordatorio.contacto.tipo,
          nombre: recordatorio.contacto.nombre,
          apellido: recordatorio.contacto.apellido,
        },
      })),
    },
    porRepeticion: [...porRepeticion.entries()]
      .map(([repeticion, total]) => ({ repeticion, total }))
      // A igual cantidad, en el orden de siempre de las repeticiones (una vez, diaria, semanal...).
      .sort(
        (a, b) =>
          b.total - a.total ||
          REPETICIONES_VALIDAS.indexOf(a.repeticion) - REPETICIONES_VALIDAS.indexOf(b.repeticion),
      ),
    historial: {
      total: historial.total,
      ultimos7: porDiaDelHistorial.reduce((suma, cantidad) => suma + cantidad, 0),
      porDia: porDiaDelHistorial,
      ultimas: historial.entradas.slice(0, CANTIDAD_EN_LISTAS).map((entrada) => ({
        titulo: entrada.titulo,
        repeticion: entrada.repeticion,
        diasAtras: entrada.diasAtras,
        contacto: {
          tipo: entrada.contacto.tipo,
          nombre: entrada.contacto.nombre,
          apellido: entrada.contacto.apellido,
        },
      })),
    },
    masGastado: gastos,
    monedaBase,
    proximoCumpleanos,
  };
}

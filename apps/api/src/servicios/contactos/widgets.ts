// Datos de los widgets del módulo de contactos (GET /api/contactos/widgets).
//
// Devuelve datos, no frases: la web decide cómo escribirlos (mismo criterio que los
// widgets de Finanzas). Todo filtra por la persona de la sesión.
//
// Solo lo que le sirve a la persona en el día a día: el próximo cumpleaños, los recordatorios
// que vienen (el próximo y los de la semana), los cumpleaños por mes, las deudas con sus
// contactos y los contactos sin forma de comunicarse. Lo demás (etiquetas, rubros, favoritos,
// el historial) ya está en sus pestañas.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { diasEntre, proximaOcurrencia, type TipoDeContacto } from "@gestoria/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { type Deuda, deudasPendientesConContactos } from "../finanzas/deudas.ts";
import {
  hoyDeLaPersona,
  listarRecordatorios,
  type RecordatorioConContacto,
} from "./recordatorios.ts";

/** Cuántas semanas hacia adelante cuenta el gráfico de recordatorios (lo usa el inicio). */
const SEMANAS_DEL_GRAFICO = 4;
const DIAS_DE_LA_SEMANA = 7;
/** Cuántos recordatorios que vienen se mandan con su detalle. */
const RECORDATORIOS_PROXIMOS = 5;
/** Hasta cuántos de los próximos 7 días se listan (el resto se cuenta). */
const RECORDATORIOS_DE_LA_SEMANA = 8;
/** Cuántos contactos se nombran en cada widget de deudas. */
const CONTACTOS_POR_DEUDA = 3;
const MESES = 12;

type ContactoBreve = { tipo: TipoDeContacto; nombre: string; apellido: string | null };

type RecordatorioQueViene = {
  titulo: string;
  repeticion: string;
  fecha: string;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  dias: number;
  contacto: ContactoBreve;
};

/** Lo que falta cobrar o pagar, por moneda: las monedas nunca se mezclan. */
export type TotalDeDeudas = { moneda: string; centavos: number; deudas: number };

export type DeudasConContactos = {
  totales: TotalDeDeudas[];
  /** Cuántos contactos distintos. */
  contactos: number;
  /** Los contactos con más plata pendiente (por moneda), hasta tres. */
  mayores: (ContactoBreve & { moneda: string; centavos: number })[];
};

export type WidgetsDeContactos = {
  /** El día de hoy para la persona ("AAAA-MM-DD"), en su zona horaria. */
  hoy: string;
  totales: {
    personas: number;
    empresas: number;
    /** Contactos sin ningún teléfono ni correo: no hay cómo comunicarse con ellos. */
    sinDatosDeContacto: number;
  };
  recordatorios: {
    hoy: number;
    proximos7: number;
    proximos30: number;
    /** Cuántos caen en cada una de las próximas cuatro semanas (la primera arranca hoy). */
    porSemana: number[];
    /** Los que vienen, los más cercanos primero (hoy incluido). */
    proximos: RecordatorioQueViene[];
    /** Los de los próximos 7 días (hoy incluido), los más cercanos primero; hasta ocho. */
    deLaSemana: RecordatorioQueViene[];
  };
  /** El próximo cumpleaños de una persona con fecha de nacimiento; null si no hay ninguna. */
  proximoCumpleanos: {
    nombre: string;
    apellido: string | null;
    /** El día en que cae (este año o el que viene). */
    fecha: string;
    dias: number;
    nacimiento: string;
  } | null;
  /** Cuántos cumpleaños caen en cada mes, de enero a diciembre. */
  cumpleanosPorMes: number[];
  deudas: {
    /** Lo que los contactos le deben a la persona. */
    teDeben: DeudasConContactos;
    /** Lo que la persona les debe. */
    debes: DeudasConContactos;
    /**
     * La deuda pendiente con fecha límite que vence antes (o que ya venció). `dias` es negativo
     * si ya pasó. Null si ninguna tiene fecha límite.
     */
    proximoVencimiento: {
      concepto: string;
      sentido: Deuda["sentido"];
      contacto: ContactoBreve;
      moneda: string;
      centavos: number;
      fechaLimite: string;
      dias: number;
    } | null;
  };
};

function queViene(recordatorio: RecordatorioConContacto): RecordatorioQueViene {
  return {
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
  };
}

/** Suma las deudas de un sentido por moneda y arma el ranking de contactos. */
function resumirDeudas(lista: Deuda[]): DeudasConContactos {
  const porMoneda = new Map<string, TotalDeDeudas>();
  // Por contacto y moneda: una deuda en pesos y otra en dólares con la misma persona no se suman.
  const porContacto = new Map<string, DeudasConContactos["mayores"][number]>();

  for (const deuda of lista) {
    if (!deuda.contacto) continue;
    const total = porMoneda.get(deuda.moneda) ?? { moneda: deuda.moneda, centavos: 0, deudas: 0 };
    total.centavos += deuda.pendienteCentavos;
    total.deudas += 1;
    porMoneda.set(deuda.moneda, total);

    const clave = `${deuda.contacto.id}:${deuda.moneda}`;
    const deEse = porContacto.get(clave) ?? {
      tipo: deuda.contacto.tipo,
      nombre: deuda.contacto.nombre,
      apellido: deuda.contacto.apellido,
      moneda: deuda.moneda,
      centavos: 0,
    };
    deEse.centavos += deuda.pendienteCentavos;
    porContacto.set(clave, deEse);
  }

  return {
    totales: [...porMoneda.values()].sort((a, b) => a.moneda.localeCompare(b.moneda)),
    contactos: new Set(lista.flatMap((deuda) => (deuda.contacto ? [deuda.contacto.id] : []))).size,
    // Los montos de monedas distintas no se comparan entre sí: se ordena por moneda y, dentro de
    // cada una, de mayor a menor.
    mayores: [...porContacto.values()]
      .sort(
        (a, b) =>
          a.moneda.localeCompare(b.moneda) ||
          b.centavos - a.centavos ||
          a.nombre.localeCompare(b.nombre, "es"),
      )
      .slice(0, CONTACTOS_POR_DEUDA),
  };
}

export async function obtenerWidgetsDeContactos(
  cliente: ClienteDb,
  userId: string,
  ahora: Date = new Date(),
): Promise<WidgetsDeContactos> {
  const { contactos } = esquema;
  const activos = and(eq(contactos.userId, userId), isNull(contactos.eliminadoEn));

  const [hoy, filas, sinDatos, { recordatorios }, deudas] = await Promise.all([
    hoyDeLaPersona(cliente, userId, ahora),
    cliente.db
      .select({
        tipo: contactos.tipo,
        nombre: contactos.nombre,
        apellido: contactos.apellido,
        fechaNacimiento: contactos.fechaNacimiento,
      })
      .from(contactos)
      .where(activos),
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
    deudasPendientesConContactos(cliente, userId),
  ]);

  const personas = filas.filter((fila) => fila.tipo === "persona");

  let proximoCumpleanos: WidgetsDeContactos["proximoCumpleanos"] = null;
  const cumpleanosPorMes = Array.from({ length: MESES }, () => 0);
  for (const persona of personas) {
    if (!persona.fechaNacimiento) continue;
    const mes = Number(persona.fechaNacimiento.slice(5, 7));
    const lugar = mes - 1;
    if (cumpleanosPorMes[lugar] !== undefined) cumpleanosPorMes[lugar] += 1;

    // El cumpleaños es un recordatorio anual: el día y el mes de la fecha de nacimiento.
    const fecha = proximaOcurrencia(
      {
        repeticion: "anual",
        fecha: null,
        diaSemana: null,
        diaDelMes: Number(persona.fechaNacimiento.slice(8, 10)),
        mes,
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

  // La lista ya viene ordenada por cercanía.
  const deLaSemana = recordatorios.filter(
    (recordatorio) => recordatorio.diasRestantes < DIAS_DE_LA_SEMANA,
  );
  const porSemana = Array.from({ length: SEMANAS_DEL_GRAFICO }, () => 0);
  for (const recordatorio of recordatorios) {
    const semana = Math.floor(recordatorio.diasRestantes / DIAS_DE_LA_SEMANA);
    if (semana < SEMANAS_DEL_GRAFICO && porSemana[semana] !== undefined) porSemana[semana] += 1;
  }

  // La que vence antes, aunque ya haya vencido: una vencida es la que más urge.
  let proximoVencimiento: WidgetsDeContactos["deudas"]["proximoVencimiento"] = null;
  for (const deuda of deudas) {
    if (!deuda.contacto || !deuda.fechaLimite) continue;
    const antes = proximoVencimiento?.fechaLimite;
    if (antes !== undefined && deuda.fechaLimite >= antes) continue;
    proximoVencimiento = {
      concepto: deuda.concepto,
      sentido: deuda.sentido,
      contacto: {
        tipo: deuda.contacto.tipo,
        nombre: deuda.contacto.nombre,
        apellido: deuda.contacto.apellido,
      },
      moneda: deuda.moneda,
      centavos: deuda.pendienteCentavos,
      fechaLimite: deuda.fechaLimite,
      dias: diasEntre(hoy, deuda.fechaLimite),
    };
  }

  return {
    hoy,
    totales: {
      personas: personas.length,
      empresas: filas.length - personas.length,
      sinDatosDeContacto: sinDatos[0]?.total ?? 0,
    },
    recordatorios: {
      hoy: recordatorios.filter((recordatorio) => recordatorio.diasRestantes === 0).length,
      proximos7: deLaSemana.length,
      proximos30: recordatorios.filter((recordatorio) => recordatorio.diasRestantes < 30).length,
      porSemana,
      proximos: recordatorios.slice(0, RECORDATORIOS_PROXIMOS).map(queViene),
      deLaSemana: deLaSemana.slice(0, RECORDATORIOS_DE_LA_SEMANA).map(queViene),
    },
    proximoCumpleanos,
    cumpleanosPorMes,
    deudas: {
      teDeben: resumirDeudas(deudas.filter((deuda) => deuda.sentido === "me_deben")),
      debes: resumirDeudas(deudas.filter((deuda) => deuda.sentido === "debo")),
      proximoVencimiento,
    },
  };
}

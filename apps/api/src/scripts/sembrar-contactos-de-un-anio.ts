// Siembra los contactos de una cuenta que usa la aplicación hace un año (dpaolillo1, ver
// cuentas-de-prueba.ts): su familia, sus amigos, gente del trabajo y los servicios que usa, con sus
// etiquetas, y lo que se recuerda de cada uno.
//
// Los recordatorios son lo que la gente anota de verdad sobre un contacto: **fechas puntuales**. Sobre
// todo cumpleaños (con la casilla "Crear un recordatorio de su cumpleaños"), aniversarios, y alguna
// cita o vencimiento de una sola vez. Lo que se repite seguido (llamar a la abuela, pagar una cuota)
// va en Tareas, no acá.
//
// Un año de historia: los contactos se fechan a lo largo del año (la mayoría al empezar a usarla) y lo
// que ya ocurrió de cada recordatorio se pasa al histórico por tramos, como lo haría la limpieza
// periódica con la aplicación en uso (cada pasada recupera como mucho DIAS_DE_HISTORIAL_A_RECUPERAR
// días). Las deudas también se reparten en el año: algunas saldadas hace meses, otras abiertas.
//
// Es distinta de la de sembrar-contactos.ts (la del admin), para que las dos cuentas no se vean iguales.

import { type ClienteDb, esquema } from "@gestoria/db";
import { diaDeHoy, sumarDias } from "@gestoria/shared";
import { and, eq } from "drizzle-orm";
import { crearContacto } from "../servicios/contactos/contactos.ts";
import { crearEtiqueta, listarEtiquetas } from "../servicios/contactos/etiquetas.ts";
import {
  DIAS_DE_HISTORIAL_A_RECUPERAR,
  generarHistorial,
} from "../servicios/contactos/historial-de-recordatorios.ts";
import { crearRecordatorio } from "../servicios/contactos/recordatorios.ts";
import { crearDeuda, registrarPago } from "../servicios/finanzas/deudas.ts";
import { obtenerZonaHoraria } from "../servicios/finanzas/periodos.ts";

const DIA = 24 * 60 * 60 * 1000;

/** Hace cuántos días empezó a usar la aplicación. */
const DIAS_DE_USO = 365;

type Contexto = { cliente: ClienteDb; userId: string; ahora: Date };

export type ResumenDeContactosDeUnAnio = {
  contactos: number;
  recordatorios: number;
  historial: number;
  deudas: number;
};

type Persona = {
  nombre: string;
  apellido?: string;
  /** "AAAA-MM-DD". Con fecha, se le pide el recordatorio de cumpleaños. */
  nacimiento?: string;
  telefono?: string;
  correo?: string;
  notas?: string;
  favorito?: boolean;
  etiquetas: string[];
  /** Hace cuántos días se agregó (por defecto, al empezar a usar la aplicación). */
  agregadoHace?: number;
};

type Empresa = {
  nombre: string;
  rubro: string;
  telefono?: string;
  horario?: string;
  direccion?: string;
  notas?: string;
  etiquetas: string[];
  agregadoHace?: number;
};

export async function sembrarContactosDeUnAnio(
  contexto: Contexto,
): Promise<ResumenDeContactosDeUnAnio> {
  const { cliente, userId, ahora } = contexto;
  const zona = await obtenerZonaHoraria(cliente, userId);
  const hoy = diaDeHoy(zona, ahora);
  const hace = (dias: number): string => sumarDias(hoy, -dias);
  const momento = (dias: number): Date => new Date(ahora.getTime() - dias * DIA);
  /** Una fecha de nacimiento: el día y el mes de dentro de `dias` días, en ese año. */
  const nacidoEl = (anio: number, dias: number): string => `${anio}${hace(-dias).slice(4)}`;
  const resumen: ResumenDeContactosDeUnAnio = {
    contactos: 0,
    recordatorios: 0,
    historial: 0,
    deudas: 0,
  };

  // ---------- Etiquetas: las de siempre y una propia ----------
  const existentes = await listarEtiquetas(cliente, userId);
  const etiqueta = new Map(existentes.map((fila) => [fila.nombre, fila.id]));
  etiqueta.set("Facultad", (await crearEtiqueta(cliente, userId, "Facultad", "#7c3aed")).id);
  const ids = (nombres: string[]) =>
    nombres.map((nombre) => etiqueta.get(nombre)).filter((id): id is number => id !== undefined);

  const agregados: { id: string; hace: number }[] = [];

  async function persona(datos: Persona): Promise<string> {
    const contacto = await crearContacto(cliente, userId, {
      tipo: "persona",
      nombre: datos.nombre,
      apellido: datos.apellido ?? "",
      fechaNacimiento: datos.nacimiento ?? "",
      recordarCumpleanos: Boolean(datos.nacimiento),
      telefonos: datos.telefono ? [{ numero: datos.telefono, tipo: "celular" }] : [],
      correos: datos.correo ? [datos.correo] : [],
      direccion: "",
      notas: datos.notas ?? "",
      favorito: datos.favorito ?? false,
      etiquetaIds: ids(datos.etiquetas),
    });
    resumen.contactos += 1;
    if (datos.nacimiento) resumen.recordatorios += 1;
    agregados.push({ id: contacto.id, hace: datos.agregadoHace ?? DIAS_DE_USO });
    return contacto.id;
  }

  async function empresa(datos: Empresa): Promise<string> {
    const contacto = await crearContacto(cliente, userId, {
      tipo: "empresa",
      nombre: datos.nombre,
      rubro: datos.rubro,
      sitioWeb: "",
      horario: datos.horario ?? "",
      documento: "",
      personaDeContacto: "",
      telefonos: datos.telefono ? [{ numero: datos.telefono, tipo: "fijo" }] : [],
      correos: [],
      direccion: datos.direccion ?? "",
      notas: datos.notas ?? "",
      favorito: false,
      etiquetaIds: ids(datos.etiquetas),
    });
    resumen.contactos += 1;
    agregados.push({ id: contacto.id, hace: datos.agregadoHace ?? DIAS_DE_USO });
    return contacto.id;
  }

  // ---------- Familia ----------
  const mama = await persona({
    nombre: "Graciela",
    apellido: "Fernández",
    nacimiento: nacidoEl(1964, 47),
    telefono: "099 412 873",
    favorito: true,
    notas: "Mamá.",
    etiquetas: ["Familia"],
  });
  const papa = await persona({
    nombre: "Roberto",
    apellido: "Paolillo",
    nacimiento: nacidoEl(1961, 128),
    telefono: "098 220 145",
    favorito: true,
    notas: "Papá.",
    etiquetas: ["Familia"],
  });
  const hermana = await persona({
    nombre: "Lucía",
    apellido: "Paolillo",
    nacimiento: nacidoEl(1995, 9),
    telefono: "091 334 908",
    correo: "lucia.paolillo@ejemplo.test",
    favorito: true,
    etiquetas: ["Familia"],
  });
  const abuela = await persona({
    nombre: "Nelly",
    apellido: "Rodríguez",
    nacimiento: nacidoEl(1940, 203),
    telefono: "2 487 33 21",
    notas: "Abuela. Llamarla los domingos de mañana.",
    etiquetas: ["Familia"],
  });
  await persona({
    nombre: "Mirta",
    apellido: "Fernández",
    nacimiento: nacidoEl(1958, 266),
    notas: "Tía, hermana de mamá.",
    etiquetas: ["Familia"],
  });
  const pareja = await persona({
    nombre: "Valentina",
    apellido: "Sosa",
    nacimiento: nacidoEl(1997, 152),
    telefono: "094 778 312",
    favorito: true,
    etiquetas: ["Familia"],
  });

  // ---------- Amigos y facultad ----------
  const martin = await persona({
    nombre: "Martín",
    apellido: "Pereira",
    nacimiento: nacidoEl(1994, 71),
    telefono: "099 556 210",
    etiquetas: ["Amigos"],
  });
  const sofia = await persona({
    nombre: "Sofía",
    apellido: "Méndez",
    nacimiento: nacidoEl(1996, 18),
    telefono: "092 109 447",
    etiquetas: ["Amigos", "Facultad"],
  });
  const joaquin = await persona({
    nombre: "Joaquín",
    apellido: "Silva",
    nacimiento: nacidoEl(1995, 233),
    telefono: "098 641 002",
    etiquetas: ["Amigos"],
  });
  await persona({
    nombre: "Florencia",
    apellido: "Castro",
    nacimiento: nacidoEl(1996, 305),
    etiquetas: ["Amigos", "Facultad"],
    agregadoHace: 210,
  });
  await persona({
    nombre: "Nico",
    notas: "El del fútbol de los jueves. Falta el apellido.",
    etiquetas: ["Amigos"],
    agregadoHace: 95,
  });

  // ---------- Trabajo ----------
  await persona({
    nombre: "Andrea",
    apellido: "Gómez",
    nacimiento: nacidoEl(1985, 176),
    correo: "andrea.gomez@empresa.test",
    notas: "Jefa del área.",
    etiquetas: ["Trabajo"],
  });
  const pablo = await persona({
    nombre: "Pablo",
    apellido: "Núñez",
    correo: "pablo.nunez@empresa.test",
    etiquetas: ["Trabajo"],
    agregadoHace: 140,
  });

  // ---------- Servicios ----------
  const veterinaria = await empresa({
    nombre: "Veterinaria Patitas",
    rubro: "Veterinaria",
    telefono: "2 600 45 12",
    horario: "Lunes a sábados de 9 a 20",
    notas: "Luna: vacuna anual y desparasitación.",
    etiquetas: ["Servicios"],
  });
  await empresa({
    nombre: "Taller Don Julio",
    rubro: "Mecánica",
    telefono: "2 208 77 30",
    direccion: "Av. Millán 3410, Montevideo",
    etiquetas: ["Servicios"],
    agregadoHace: 250,
  });
  const inmobiliaria = await empresa({
    nombre: "Inmobiliaria del Centro",
    rubro: "Inmobiliaria",
    telefono: "2 901 10 20",
    notas: "Administra el alquiler. Contrato por dos años.",
    etiquetas: ["Servicios"],
  });
  const dentista = await empresa({
    nombre: "Consultorio Odontológico Rivera",
    rubro: "Odontología",
    telefono: "2 707 55 61",
    horario: "Lunes a viernes de 14 a 20",
    etiquetas: ["Servicios"],
    agregadoHace: 60,
  });

  // ---------- Recordatorios: aniversarios y fechas puntuales ----------
  /** Una fecha anual: el día y el mes de hace `dias` días (negativo: dentro de tantos). */
  const anualEl = (dias: number) => ({
    repeticion: "anual" as const,
    diaDelMes: Number(hace(dias).slice(8, 10)),
    mes: Number(hace(dias).slice(5, 7)),
  });
  const recordatorios: [string, Parameters<typeof crearRecordatorio>[3]][] = [
    [pareja, { titulo: "Aniversario con Vale", ...anualEl(-63), hora: "", importante: true }],
    [mama, { titulo: "Aniversario de casados de mamá y papá", ...anualEl(117), hora: "" }],
    [abuela, { titulo: "Aniversario del abuelo", ...anualEl(188), hora: "" }],
    [hermana, { titulo: "Día que se recibió Lucía", ...anualEl(240), hora: "" }],
    [
      martin,
      {
        titulo: "Casamiento de Martín y Caro",
        repeticion: "unica",
        fecha: hace(-26),
        hora: "20:30",
        importante: true,
      },
    ],
    [
      veterinaria,
      {
        titulo: "Vacuna anual de Luna",
        repeticion: "unica",
        fecha: hace(-11),
        hora: "10:00",
      },
    ],
    [
      dentista,
      { titulo: "Control con el dentista", repeticion: "unica", fecha: hace(-5), hora: "17:30" },
    ],
    [
      inmobiliaria,
      { titulo: "Vence el contrato de alquiler", repeticion: "unica", fecha: hace(-48), hora: "" },
    ],
  ];
  for (const [contactoId, datos] of recordatorios) {
    await crearRecordatorio(cliente, userId, contactoId, datos, ahora);
    resumen.recordatorios += 1;
  }

  // De una sola vez que ya pasaron en el año (la API no deja crearlos en el pasado): van al histórico.
  for (const [contactoId, titulo, dias, hora] of [
    [papa, "Operación de rodilla de papá", 290, "08:00"],
    [joaquin, "Despedida de Joaquín antes de irse a Madrid", 214, "21:00"],
    [sofia, "Defensa de la tesis de Sofía", 131, "15:00"],
    [veterinaria, "Castración de Luna", 87, "09:30"],
    [pablo, "Cena de fin de año del trabajo", 310, "21:30"],
  ] as const) {
    await cliente.db.insert(esquema.recordatoriosDeContactos).values({
      userId,
      contactoId,
      titulo,
      repeticion: "unica",
      fecha: hace(dias),
      hora,
      historialHasta: hace(DIAS_DE_USO + 1),
    });
    resumen.recordatorios += 1;
  }

  // ---------- Un año de historia ----------
  // Los contactos, fechados cuando se agregaron.
  for (const { id, hace: dias } of agregados) {
    await cliente.db
      .update(esquema.contactos)
      .set({ creadoEn: momento(dias) })
      .where(and(eq(esquema.contactos.userId, userId), eq(esquema.contactos.id, id)));
  }
  // Los recordatorios nacen "hoy", sin historia: se los lleva al día en que se empezó a usar la
  // aplicación, y se pasa al histórico lo que ocurrió desde entonces, por tramos.
  await cliente.db
    .update(esquema.recordatoriosDeContactos)
    .set({ historialHasta: hace(DIAS_DE_USO + 1), creadoEn: momento(DIAS_DE_USO) })
    .where(eq(esquema.recordatoriosDeContactos.userId, userId));
  const tramo = DIAS_DE_HISTORIAL_A_RECUPERAR - 30;
  for (let dias = DIAS_DE_USO - tramo; dias > 0; dias -= tramo) {
    resumen.historial += await generarHistorial(cliente, userId, momento(dias));
  }
  resumen.historial += await generarHistorial(cliente, userId, ahora);

  // ---------- Deudas a lo largo del año ----------
  async function deuda(datos: {
    con: { contactoId: string } | { nombreLibre: string };
    sentido: "me_deben" | "debo";
    concepto: string;
    monto: number;
    moneda?: string;
    haceDias: number;
    limiteEnDias?: number;
    pagos?: { monto: number; haceDias: number }[];
  }): Promise<void> {
    const creada = await crearDeuda(
      cliente,
      userId,
      {
        ...datos.con,
        sentido: datos.sentido,
        concepto: datos.concepto,
        montoCentavos: Math.round(datos.monto * 100),
        moneda: datos.moneda ?? "UYU",
        fecha: hace(datos.haceDias),
        fechaLimite: datos.limiteEnDias === undefined ? null : hace(-datos.limiteEnDias),
      },
      ahora,
    );
    resumen.deudas += 1;
    for (const pago of datos.pagos ?? []) {
      await registrarPago(
        cliente,
        userId,
        creada.id,
        { montoCentavos: Math.round(pago.monto * 100), fecha: hace(pago.haceDias) },
        ahora,
      );
    }
  }

  // Saldadas hace meses.
  await deuda({
    con: { contactoId: joaquin },
    sentido: "me_deben",
    concepto: "Entradas para el partido",
    monto: 1_600,
    haceDias: 300,
    pagos: [{ monto: 1_600, haceDias: 285 }],
  });
  await deuda({
    con: { contactoId: hermana },
    sentido: "debo",
    concepto: "Mitad del regalo de mamá",
    monto: 2_250,
    haceDias: 60,
    pagos: [{ monto: 2_250, haceDias: 52 }],
  });
  await deuda({
    con: { contactoId: martin },
    sentido: "me_deben",
    concepto: "Préstamo para la seña del salón",
    monto: 20_000,
    haceDias: 150,
    pagos: [
      { monto: 5_000, haceDias: 120 },
      { monto: 5_000, haceDias: 90 },
      { monto: 10_000, haceDias: 40 },
    ],
  });
  // Abiertas.
  await deuda({
    con: { contactoId: sofia },
    sentido: "me_deben",
    concepto: "Pasajes a Florianópolis",
    monto: 180,
    moneda: "USD",
    haceDias: 35,
    limiteEnDias: 10,
    pagos: [{ monto: 60, haceDias: 12 }],
  });
  await deuda({
    con: { contactoId: papa },
    sentido: "debo",
    concepto: "Préstamo para el service del auto",
    monto: 8_500,
    haceDias: 20,
    limiteEnDias: 25,
    pagos: [{ monto: 3_000, haceDias: 5 }],
  });
  await deuda({
    con: { nombreLibre: "Compañeros del fútbol" },
    sentido: "me_deben",
    concepto: "Alquiler de la cancha del mes",
    monto: 1_200,
    haceDias: 9,
    limiteEnDias: -2, // ya venció
  });

  // Las deudas, fechadas cuando se anotaron (las de este año y no "hoy").
  const deudas = await cliente.db
    .select({ id: esquema.deudas.id, fecha: esquema.deudas.fecha })
    .from(esquema.deudas)
    .where(eq(esquema.deudas.userId, userId));
  for (const fila of deudas) {
    await cliente.db
      .update(esquema.deudas)
      .set({ creadoEn: new Date(`${fila.fecha}T15:00:00Z`) })
      .where(eq(esquema.deudas.id, fila.id));
  }

  return resumen;
}

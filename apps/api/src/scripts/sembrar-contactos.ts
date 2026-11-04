// Siembra contactos y deudas realistas para una cuenta (la del admin): personas y empresas con sus
// etiquetas, teléfonos, correos y recordatorios, y deudas en los dos sentidos, con un contacto o
// con alguien que no lo es, con fecha límite (vencida, próxima y lejana), pagos parciales, deudas
// saldadas y pagos que generan su ingreso o gasto en una cuenta (con conversión de moneda incluida).
//
// Igual que sembrar-finanzas.ts, pasa por los mismos servicios que usa la API, así los datos salen
// con las mismas reglas que los que carga la interfaz. Las fechas se calculan hacia atrás desde
// hoy, de modo que siempre hay deudas vencidas, por vencer y recientes.
//
// Los recordatorios son fechas puntuales: cumpleaños, aniversarios, citas y vencimientos (lo que se repite
// seguido va en Tareas). También el histórico: algunos anuales se crean "hace unas
// semanas" (con un `ahora` anterior) y de una sola vez que ya pasaron se insertan directo, y después se
// pasa al histórico lo que ya ocurrió, como lo haría la limpieza periódica. Y personas dadas de alta con
// la casilla "Crear un recordatorio de su cumpleaños" marcada (y una sin marcar).
//
// Los pagos que generan un movimiento necesitan un período abierto y cuentas (las que deja
// sembrar-finanzas.ts, que corre antes); sin ellas, esos pagos se registran sin movimiento.
//
// Es parte de la carga general de sembrar-datos-de-prueba.ts, que decide si corre (no pisa datos).

import { type ClienteDb, esquema } from "@gestoria/db";
import { diaDeHoy } from "@gestoria/shared";
import { and, count, eq, isNull } from "drizzle-orm";
import { crearContacto, marcarFavorito } from "../servicios/contactos/contactos.ts";
import { crearEtiqueta, listarEtiquetas } from "../servicios/contactos/etiquetas.ts";
import { generarHistorial } from "../servicios/contactos/historial-de-recordatorios.ts";
import { crearRecordatorio } from "../servicios/contactos/recordatorios.ts";
import { listarCategorias } from "../servicios/finanzas/categorias.ts";
import { listarCuentasFinancieras } from "../servicios/finanzas/cuentas-financieras.ts";
import { crearDeuda, registrarPago } from "../servicios/finanzas/deudas.ts";
import type { CambioPedido } from "../servicios/finanzas/movimientos.ts";
import { listarPeriodos, obtenerZonaHoraria } from "../servicios/finanzas/periodos.ts";

const DIA = 24 * 60 * 60 * 1000;

type Contexto = {
  cliente: ClienteDb;
  userId: string;
  ahora: Date;
};

export type ResumenDeSiembraDeContactos = {
  contactos: number;
  deudas: number;
  pagos: number;
  recordatorios: number;
  /** Entradas que quedaron en el histórico de recordatorios. */
  historial: number;
};

/** true si la cuenta ya tiene contactos o deudas cargados. */
export async function tieneContactos(cliente: ClienteDb, userId: string): Promise<boolean> {
  const [contactos] = await cliente.db
    .select({ total: count() })
    .from(esquema.contactos)
    .where(and(eq(esquema.contactos.userId, userId), isNull(esquema.contactos.eliminadoEn)));
  const [deudas] = await cliente.db
    .select({ total: count() })
    .from(esquema.deudas)
    .where(and(eq(esquema.deudas.userId, userId), isNull(esquema.deudas.eliminadoEn)));
  return (contactos?.total ?? 0) + (deudas?.total ?? 0) > 0;
}

/** Las etiquetas por defecto más una propia; las que falten se crean. Devuelve nombre → id. */
async function asegurarEtiquetas(cliente: ClienteDb, userId: string): Promise<Map<string, number>> {
  const etiquetas = await listarEtiquetas(cliente, userId);
  const porNombre = new Map(etiquetas.map((etiqueta) => [etiqueta.nombre.toLowerCase(), etiqueta]));
  const ids = new Map<string, number>();
  for (const [nombre, color] of [
    ["Familia", "#cf1754"],
    ["Amigos", "#17b0cf"],
    ["Trabajo", "#1717cf"],
    ["Servicios", "#889933"],
    // Una que la persona fue creando por su cuenta.
    ["Fútbol", "#2f9e44"],
  ] as const) {
    const existente = porNombre.get(nombre.toLowerCase());
    ids.set(
      nombre,
      existente ? existente.id : (await crearEtiqueta(cliente, userId, nombre, color)).id,
    );
  }
  return ids;
}

export async function sembrarContactosDe(contexto: Contexto): Promise<ResumenDeSiembraDeContactos> {
  const { cliente, userId, ahora } = contexto;
  const zona = await obtenerZonaHoraria(cliente, userId);
  /** El día "AAAA-MM-DD" de hace `dias` días (negativo: dentro de tantos días). */
  const hace = (dias: number): string => diaDeHoy(zona, new Date(ahora.getTime() - dias * DIA));
  const resumen: ResumenDeSiembraDeContactos = {
    contactos: 0,
    deudas: 0,
    pagos: 0,
    recordatorios: 0,
    historial: 0,
  };

  const etiqueta = await asegurarEtiquetas(cliente, userId);
  const ids = (...nombres: string[]): number[] =>
    nombres.map((nombre) => etiqueta.get(nombre) as number);

  // ---------- Contactos ----------
  const personaVacia = {
    tipo: "persona" as const,
    apellido: "",
    fechaNacimiento: "",
    telefonos: [],
    correos: [],
    direccion: "",
    notas: "",
    favorito: false,
    etiquetaIds: [],
  };
  const empresaVacia = {
    tipo: "empresa" as const,
    rubro: "",
    sitioWeb: "",
    horario: "",
    documento: "",
    personaDeContacto: "",
    telefonos: [],
    correos: [],
    direccion: "",
    notas: "",
    favorito: false,
    etiquetaIds: [],
  };

  async function contacto(datos: Parameters<typeof crearContacto>[2]): Promise<string> {
    const creado = await crearContacto(cliente, userId, datos, ahora);
    resumen.contactos += 1;
    if (datos.favorito) await marcarFavorito(cliente, userId, creado.id, true);
    return creado.id;
  }

  const marta = await contacto({
    ...personaVacia,
    nombre: "Marta",
    apellido: "Rodríguez",
    fechaNacimiento: "1962-03-14",
    telefonos: [
      { numero: "+598 99 123 456", tipo: "celular" },
      { numero: "2 487 55 21", tipo: "fijo" },
    ],
    correos: ["marta.rodriguez@ejemplo.test"],
    direccion: "Av. Italia 3456, Montevideo",
    notas: "Mamá. Los domingos almorzamos en su casa.",
    favorito: true,
    etiquetaIds: ids("Familia"),
  });
  const diego = await contacto({
    ...personaVacia,
    nombre: "Diego",
    apellido: "Pereira",
    fechaNacimiento: "1990-08-02",
    telefonos: [{ numero: "+598 98 765 432", tipo: "celular" }],
    notas: "Mi hermano. Vive en Canelones.",
    favorito: true,
    etiquetaIds: ids("Familia", "Fútbol"),
  });
  const elsa = await contacto({
    ...personaVacia,
    nombre: "Elsa",
    apellido: "Pereira",
    fechaNacimiento: "1938-11-23",
    telefonos: [{ numero: "2 355 10 87", tipo: "fijo" }],
    direccion: "Bulevar Artigas 1520, Montevideo",
    etiquetaIds: ids("Familia"),
  });
  const lucia = await contacto({
    ...personaVacia,
    nombre: "Lucía",
    apellido: "Fernández",
    fechaNacimiento: "1994-05-30",
    telefonos: [{ numero: "+598 94 222 333", tipo: "celular" }],
    correos: ["lucia.fernandez@ejemplo.test"],
    favorito: true,
    etiquetaIds: ids("Amigos"),
  });
  const martin = await contacto({
    ...personaVacia,
    nombre: "Martín",
    apellido: "Silva",
    telefonos: [{ numero: "+598 91 400 500", tipo: "celular" }],
    correos: ["martin.silva@ejemplo.test"],
    notas: "Compañero de la facultad. Trabaja en una consultora.",
    etiquetaIds: ids("Amigos", "Trabajo", "Fútbol"),
  });
  const camila = await contacto({
    ...personaVacia,
    nombre: "Camila",
    apellido: "Costa",
    fechaNacimiento: "1991-12-09",
    telefonos: [{ numero: "+598 92 111 222", tipo: "celular" }],
    correos: ["camila.costa@ejemplo.test", "camila@estudiocosta.test"],
    notas: "Diseñadora, me pasa trabajos freelance.",
    etiquetaIds: ids("Trabajo"),
  });
  const rodrigo = await contacto({
    ...personaVacia,
    nombre: "Rodrigo",
    apellido: "Benítez",
    telefonos: [{ numero: "+598 99 888 777", tipo: "celular" }],
    etiquetaIds: ids("Trabajo", "Amigos"),
  });
  await contacto({
    ...personaVacia,
    nombre: "Nico",
    notas: "El vecino de al lado. Falta anotar el apellido.",
  });
  const antel = await contacto({
    ...empresaVacia,
    nombre: "Antel",
    rubro: "Telecomunicaciones",
    sitioWeb: "www.antel.com.uy",
    horario: "Lunes a viernes de 9 a 18",
    telefonos: [{ numero: "0800 2000", tipo: "fijo" }],
    notas: "Número de cliente: 4455667.",
    etiquetaIds: ids("Servicios"),
  });
  await contacto({
    ...empresaVacia,
    nombre: "UTE",
    rubro: "Energía eléctrica",
    sitioWeb: "https://www.ute.com.uy",
    telefonos: [{ numero: "0800 1930", tipo: "fijo" }],
    etiquetaIds: ids("Servicios"),
  });
  await contacto({
    ...empresaVacia,
    nombre: "Plomería Hernández",
    rubro: "Plomería",
    horario: "Todos los días de 8 a 20",
    telefonos: [{ numero: "+598 99 303 404", tipo: "celular" }],
    personaDeContacto: "Julio Hernández",
    notas: "Vino a arreglar la pérdida del baño. Cobra un 10% menos en efectivo.",
    etiquetaIds: ids("Servicios"),
  });
  const clinica = await contacto({
    ...empresaVacia,
    nombre: "Clínica Dental Sonrisa",
    rubro: "Odontología",
    sitioWeb: "clinicasonrisa.com.uy",
    horario: "Lunes a sábados de 10 a 19",
    documento: "21.345.678.0012",
    telefonos: [{ numero: "2 601 22 33", tipo: "fijo" }],
    correos: ["turnos@clinicasonrisa.test"],
    direccion: "18 de Julio 1234, Montevideo",
    etiquetaIds: ids("Servicios"),
  });
  await contacto({
    ...empresaVacia,
    nombre: "Ferretería El Tornillo",
    rubro: "Ferretería",
    telefonos: [{ numero: "2 700 11 22", tipo: "fijo" }],
  });

  // ---------- Recordatorios ----------
  // Fechas puntuales de cada contacto: cumpleaños y aniversarios (anuales) y citas o vencimientos de
  // una sola vez. Lo que se repite seguido (llamar a la abuela, revisar una factura) va en Tareas.
  const recordatorios: [string, Parameters<typeof crearRecordatorio>[3]][] = [
    // Los importantes llevan el distintivo.
    [
      marta,
      {
        titulo: "Cumpleaños de mamá",
        repeticion: "anual",
        diaDelMes: 14,
        mes: 3,
        hora: "",
        importante: true,
      },
    ],
    [
      marta,
      {
        titulo: "Aniversario de casados de mamá y papá",
        repeticion: "anual",
        diaDelMes: 21,
        mes: 9,
        hora: "",
      },
    ],
    [
      diego,
      { titulo: "Cumpleaños de Diego", repeticion: "anual", diaDelMes: 2, mes: 8, hora: "09:00" },
    ],
    [
      elsa,
      {
        titulo: "Cumpleaños de la abuela",
        repeticion: "anual",
        diaDelMes: 23,
        mes: 11,
        hora: "",
        importante: true,
      },
    ],
    [
      lucia,
      { titulo: "Cumpleaños de Lucía", repeticion: "anual", diaDelMes: 30, mes: 5, hora: "" },
    ],
    [
      lucia,
      { titulo: "Devolver el libro prestado", repeticion: "unica", fecha: hace(-9), hora: "" },
    ],
    [
      martin,
      { titulo: "Casamiento de Martín", repeticion: "unica", fecha: hace(-38), hora: "20:00" },
    ],
    [
      clinica,
      { titulo: "Turno con el dentista", repeticion: "unica", fecha: hace(-6), hora: "15:30" },
    ],
    [
      antel,
      { titulo: "Vence el contrato de fibra", repeticion: "unica", fecha: hace(-52), hora: "" },
    ],
  ];
  for (const [contactoId, datos] of recordatorios) {
    await crearRecordatorio(cliente, userId, contactoId, datos, ahora);
    resumen.recordatorios += 1;
  }

  // ---------- Cumpleaños automáticos ----------
  // Dos personas dadas de alta con fecha de nacimiento: a una se le pidió el recordatorio de su
  // cumpleaños (la casilla viene marcada) y a la otra no.
  const cumpleEn = (dias: number, anio: number): string => `${anio}${hace(-dias).slice(4)}`;
  await contacto({
    ...personaVacia,
    nombre: "Valentina",
    apellido: "Suárez",
    fechaNacimiento: cumpleEn(12, 1996),
    telefonos: [{ numero: "099 555 121", tipo: "celular" }],
    etiquetaIds: ids("Amigos"),
    recordarCumpleanos: true,
  });
  resumen.recordatorios += 1;
  await contacto({
    ...personaVacia,
    nombre: "Tomás",
    apellido: "Ferreira",
    fechaNacimiento: cumpleEn(40, 1988),
    etiquetaIds: ids("Trabajo"),
    recordarCumpleanos: false,
  });

  // ---------- Recordatorios que ya acumularon historia ----------
  // Anuales que cayeron hace pocas semanas: se crean con un "ahora" anterior y, al pasar al histórico,
  // dejan su entrada de este año.
  const antes = (dias: number): Date => new Date(ahora.getTime() - dias * DIA);
  const anualHace = (dias: number) => ({
    repeticion: "anual" as const,
    diaDelMes: Number(hace(dias).slice(8, 10)),
    mes: Number(hace(dias).slice(5, 7)),
  });
  const conHistoria: [string, Date, Parameters<typeof crearRecordatorio>[3]][] = [
    [diego, antes(10), { titulo: "Aniversario de la sociedad", ...anualHace(3), hora: "" }],
    [
      camila,
      antes(30),
      { titulo: "Cumpleaños de su hija Sofía", ...anualHace(18), hora: "", importante: true },
    ],
    [rodrigo, antes(60), { titulo: "Cumpleaños de Rodrigo", ...anualHace(41), hora: "" }],
    [elsa, antes(80), { titulo: "Aniversario del abuelo", ...anualHace(67), hora: "" }],
  ];
  for (const [contactoId, creado, datos] of conHistoria) {
    await crearRecordatorio(cliente, userId, contactoId, datos, creado);
    resumen.recordatorios += 1;
  }
  // De una sola vez que ya pasaron (la API no deja crearlos en el pasado): dejan su única entrada.
  for (const [contactoId, titulo, dias, hora, importante] of [
    [lucia, "Entregar los papeles del seguro", 5, "10:00", false],
    [antel, "Instalación de la fibra", 12, null, false],
    [marta, "Llevar a mamá al control", 21, "16:30", true],
  ] as const) {
    await cliente.db.insert(esquema.recordatoriosDeContactos).values({
      userId,
      contactoId,
      titulo,
      repeticion: "unica",
      fecha: hace(dias),
      hora,
      importante,
    });
    resumen.recordatorios += 1;
  }
  resumen.historial = await generarHistorial(cliente, userId, ahora);

  // ---------- Cuentas y categorías para los pagos que generan movimiento ----------
  const [cuentas, categorias, periodos] = await Promise.all([
    listarCuentasFinancieras(cliente, userId),
    listarCategorias(cliente, userId),
    listarPeriodos(cliente, userId),
  ]);
  const periodoAbierto = periodos.find((periodo) => periodo.abierto);
  const cuentaPorNombre = (nombre: string) =>
    cuentas.find(
      (cuenta) => !cuenta.oculta && cuenta.nombre.toLowerCase() === nombre.toLowerCase(),
    );
  const categoriaPorNombre = (nombre: string) =>
    categorias.find((categoria) => categoria.sistema === null && categoria.nombre === nombre);
  const categoriaDeIngreso = categoriaPorNombre("Ingresos");
  const categoriaDeGasto = categoriaPorNombre("Otros") ?? categoriaPorNombre("Regalos");
  const brou = cuentaPorNombre("BROU");
  const dolares = cuentaPorNombre("Ahorro en dólares");
  // El día más viejo en que un movimiento cae dentro del período abierto.
  const inicioDelPeriodo = periodoAbierto
    ? diaDeHoy(zona, new Date(periodoAbierto.aperturaEn.getTime() + 12 * 60 * 60 * 1000))
    : null;

  type Generar = { cuenta: "BROU" | "dolares"; cambio?: CambioPedido };
  type PagoSembrado = { montoPesos: number; haceDias: number; generar?: Generar };

  /** Registra los pagos de una deuda; los que piden movimiento lo generan si hay con qué. */
  async function pagar(deudaId: string, sentido: "me_deben" | "debo", pagos: PagoSembrado[]) {
    for (const pago of pagos) {
      let fecha = hace(pago.haceDias);
      let movimiento: Parameters<typeof registrarPago>[3]["movimiento"];
      const cuenta = pago.generar?.cuenta === "dolares" ? dolares : brou;
      const categoriaId = (sentido === "me_deben" ? categoriaDeIngreso : categoriaDeGasto)?.id;
      if (pago.generar && cuenta && categoriaId !== undefined && inicioDelPeriodo !== null) {
        // El movimiento tiene que caer dentro del período abierto.
        if (fecha < inicioDelPeriodo) fecha = inicioDelPeriodo;
        movimiento = {
          cuentaFinancieraId: cuenta.id,
          categoriaId,
          ...(pago.generar.cambio ? { cambio: pago.generar.cambio } : {}),
        };
      }
      await registrarPago(
        cliente,
        userId,
        deudaId,
        { montoCentavos: Math.round(pago.montoPesos * 100), fecha, movimiento },
        ahora,
      );
      resumen.pagos += 1;
    }
  }

  type DeudaSembrada = {
    con: { contactoId: string } | { nombreLibre: string };
    sentido: "me_deben" | "debo";
    concepto: string;
    monto: number;
    moneda?: string;
    haceDias: number;
    /** Días hasta la fecha límite (negativo: ya venció). */
    limiteEnDias?: number;
    pagos?: PagoSembrado[];
  };

  async function deuda(datos: DeudaSembrada): Promise<void> {
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
    if (datos.pagos) await pagar(creada.id, datos.sentido, datos.pagos);
  }

  // ---------- Deudas ----------
  // Me deben
  await deuda({
    con: { contactoId: lucia },
    sentido: "me_deben",
    concepto: "Entradas al recital",
    monto: 3_200,
    haceDias: 40,
    limiteEnDias: -5, // ya venció
    pagos: [{ montoPesos: 1_000, haceDias: 20 }],
  });
  await deuda({
    con: { contactoId: martin },
    sentido: "me_deben",
    concepto: "Préstamo para la cuota del auto",
    monto: 15_000,
    haceDias: 25,
    limiteEnDias: 20,
    pagos: [{ montoPesos: 5_000, haceDias: 2, generar: { cuenta: "BROU" } }],
  });
  await deuda({
    con: { contactoId: camila },
    sentido: "me_deben",
    concepto: "Compra de libros de diseño",
    monto: 120,
    moneda: "USD",
    haceDias: 12,
    limiteEnDias: 30,
    pagos: [{ montoPesos: 40, haceDias: 1, generar: { cuenta: "dolares" } }],
  });
  await deuda({
    con: { contactoId: diego },
    sentido: "me_deben",
    concepto: "Pasajes de ómnibus del viaje",
    monto: 50,
    moneda: "USD",
    haceDias: 15,
    // Cobrado entero en pesos, con la cotización que se acordó entre los dos (1 USD = 40 UYU).
    pagos: [
      {
        montoPesos: 50,
        haceDias: 1,
        generar: { cuenta: "BROU", cambio: { modo: "tasa", tasa: 40 } },
      },
    ],
  });
  await deuda({
    con: { nombreLibre: "Vecino del 4B" },
    sentido: "me_deben",
    concepto: "Reparación del portón",
    monto: 4_000,
    haceDias: 60,
    pagos: [{ montoPesos: 1_500, haceDias: 35 }],
  });
  await deuda({
    con: { nombreLibre: "Gimnasio Kinetic" },
    sentido: "me_deben",
    concepto: "Reintegro de la matrícula",
    monto: 2_100,
    haceDias: 3,
    limiteEnDias: 12,
  });

  // Debo
  await deuda({
    con: { contactoId: marta },
    sentido: "debo",
    concepto: "Adelanto del regalo de cumpleaños",
    monto: 2_500,
    haceDias: 8,
    pagos: [{ montoPesos: 2_500, haceDias: 1, generar: { cuenta: "BROU" } }], // saldada
  });
  await deuda({
    con: { contactoId: rodrigo },
    sentido: "debo",
    concepto: "Nafta del viaje a Punta del Este",
    monto: 1_800,
    haceDias: 18,
    limiteEnDias: 4,
    pagos: [
      { montoPesos: 600, haceDias: 10 },
      { montoPesos: 400, haceDias: 3 },
    ],
  });
  await deuda({
    con: { contactoId: antel },
    sentido: "debo",
    concepto: "Diferencia de la factura",
    monto: 650,
    haceDias: 5,
    limiteEnDias: 10,
  });
  await deuda({
    con: { nombreLibre: "Almacén de la esquina" },
    sentido: "debo",
    concepto: "Fiado del mes",
    monto: 2_340,
    haceDias: 14,
    limiteEnDias: 3,
  });
  await deuda({
    con: { nombreLibre: "Club de pádel" },
    sentido: "debo",
    concepto: "Cancha del sábado",
    monto: 900,
    haceDias: 30,
    pagos: [{ montoPesos: 900, haceDias: 28 }], // saldada, sin movimiento
  });

  return resumen;
}

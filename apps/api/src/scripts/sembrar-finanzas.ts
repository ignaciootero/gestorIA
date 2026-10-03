// Siembra datos de finanzas realistas para una cuenta (la del admin), simulando
// varios meses de uso natural: cuentas, categorías, períodos que se abren y se
// cierran, ingresos y gastos del día a día, transferencias, y también lo que la
// gente hace de verdad: corregir un importe mal tipeado, borrar un movimiento
// repetido, ocultar una cuenta vieja, reemplazar una categoría por otra,
// contar el efectivo y ajustar el saldo, reabrir un período.
//
// Pasa por los mismos servicios que usa la API (no escribe tablas a mano, salvo
// los ajustes de saldo iniciales, que llevan fecha pasada), así que los datos
// salen con las mismas reglas que los que carga la interfaz.
//
// Es determinista: el "azar" sale de un generador con semilla fija, así que
// corrido dos veces en el mismo día da lo mismo. Las fechas se calculan hacia
// atrás desde hoy (los períodos arrancan el día 5, "día de cobro"), de modo que
// siempre hay un período abierto con movimientos de esta semana.
//
// No pisa nada: si la cuenta ya tiene períodos, no hace nada (ver
// `--reiniciar-finanzas` en sembrar-datos-de-prueba.ts).

import { type ClienteDb, esquema } from "@gestoria/db";
import { and, count, eq, isNull } from "drizzle-orm";
import {
  crearCategoria,
  eliminarCategoria,
  listarCategorias,
  reemplazarCategoria,
  renombrarCategoria,
} from "../servicios/finanzas/categorias.ts";
import {
  ajustarSaldoDeCuenta,
  cambiarVisibilidadDeCuenta,
  crearCuentaFinanciera,
  eliminarCuentaFinanciera,
  listarCuentasFinancieras,
  renombrarCuentaFinanciera,
} from "../servicios/finanzas/cuentas-financieras.ts";
import {
  crearMovimiento,
  duplicarMovimiento,
  editarMovimiento,
  eliminarMovimiento,
  type Movimiento,
} from "../servicios/finanzas/movimientos.ts";
import {
  abrirPeriodo,
  cerrarPeriodo,
  eliminarPeriodo,
  listarPeriodos,
  type Periodo,
  reabrirPeriodo,
  renombrarPeriodo,
} from "../servicios/finanzas/periodos.ts";
import { eliminarPresupuesto, fijarPresupuesto } from "../servicios/finanzas/presupuestos.ts";

const DIA = 24 * 60 * 60 * 1000;
/** Cuántos períodos reales se siembran (el último queda abierto). */
const CANTIDAD_DE_PERIODOS = 6;
/** Día del mes en que arranca cada período: el "día de cobro". */
const DIA_DE_COBRO = 5;
/** 03:00 UTC es la medianoche de Montevideo (UTC-3): la fecha se ve bien en pantalla. */
const HORA_UTC_DE_MEDIANOCHE = 3;

/** Generador pseudoaleatorio con semilla (mulberry32): mismos números en cada corrida. */
function crearAzar(semilla: number) {
  let estado = semilla;
  const siguiente = (): number => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** Entero entre `min` y `max`, ambos incluidos. */
    entre: (min: number, max: number): number => min + Math.floor(siguiente() * (max - min + 1)),
    /** Uno de los elementos al azar. */
    uno: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)] as T,
    /** true con la probabilidad dada (0 a 1). */
    suerte: (probabilidad: number): boolean => siguiente() < probabilidad,
  };
}

/** Redondea a múltiplos de 10 pesos: los importes "de la vida real" rara vez terminan en 7. */
function redondear(pesos: number, multiplo = 10): number {
  return Math.round(pesos / multiplo) * multiplo;
}

/** El primer día de cobro (a medianoche local) que ya pasó, y los `cantidad - 1` anteriores. */
function iniciosDePeriodos(ahora: Date, cantidad: number): Date[] {
  const esteMes = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), DIA_DE_COBRO, HORA_UTC_DE_MEDIANOCHE),
  );
  const ultimo =
    esteMes <= ahora
      ? esteMes
      : new Date(
          Date.UTC(
            ahora.getUTCFullYear(),
            ahora.getUTCMonth() - 1,
            DIA_DE_COBRO,
            HORA_UTC_DE_MEDIANOCHE,
          ),
        );

  const inicios: Date[] = [];
  for (let atras = cantidad - 1; atras >= 0; atras -= 1) {
    inicios.push(
      new Date(
        Date.UTC(
          ultimo.getUTCFullYear(),
          ultimo.getUTCMonth() - atras,
          DIA_DE_COBRO,
          HORA_UTC_DE_MEDIANOCHE,
        ),
      ),
    );
  }
  return inicios;
}

type Entrada = {
  /** Días desde el inicio del período. */
  dia: number;
  /** Hora local (0 a 23.99). */
  hora: number;
  tipo: "ingreso" | "gasto" | "neutro";
  pesos: number;
  descripcion: string;
  /** Nombre de la categoría (en una transferencia no hace falta). */
  categoria?: string;
  cuenta: string;
  /** Solo en una transferencia. */
  destino?: string;
  /** Para poder encontrarla después y corregirla o borrarla. */
  clave?: string;
};

type Contexto = {
  cliente: ClienteDb;
  userId: string;
  ahora: Date;
};

/** Borra todas las finanzas de la cuenta (para volver a sembrar desde cero). */
export async function borrarFinanzasDe(cliente: ClienteDb, userId: string): Promise<void> {
  await cliente.db.transaction(async (tx) => {
    // El orden respeta las claves foráneas: lo que apunta a otras tablas, primero.
    await tx.delete(esquema.movimientos).where(eq(esquema.movimientos.userId, userId));
    await tx.delete(esquema.presupuestos).where(eq(esquema.presupuestos.userId, userId));
    await tx.delete(esquema.ajustesDeSaldo).where(eq(esquema.ajustesDeSaldo.userId, userId));
    await tx.delete(esquema.periodos).where(eq(esquema.periodos.userId, userId));
    await tx.delete(esquema.categorias).where(eq(esquema.categorias.userId, userId));
    await tx
      .delete(esquema.cuentasFinancieras)
      .where(eq(esquema.cuentasFinancieras.userId, userId));
  });
}

/** true si la cuenta ya tiene finanzas cargadas (alcanza con un período). */
export async function tieneFinanzas(cliente: ClienteDb, userId: string): Promise<boolean> {
  return (await listarPeriodos(cliente, userId)).length > 0;
}

/**
 * Los movimientos de un período, uno por uno. Las cantidades y los importes
 * varían con el azar, pero la estructura es la de un mes real: cobro, alquiler,
 * servicios, supermercado cada semana, transporte, suscripciones, salidas...
 */
function movimientosDelPeriodo(k: number, azar: ReturnType<typeof crearAzar>): Entrada[] {
  const e: Entrada[] = [];
  const agregar = (entrada: Entrada) => e.push(entrada);

  // --- Ingresos ---
  agregar({
    dia: 0,
    hora: 9.5,
    tipo: "ingreso",
    pesos: k < 3 ? 63_500 : 67_000, // un ajuste salarial a mitad de recorrido
    descripcion: "Sueldo",
    categoria: "Ingresos",
    cuenta: "BROU",
    clave: `sueldo-${k}`,
  });
  if (k === 1 || k === 3) {
    agregar({
      dia: 12,
      hora: 18,
      tipo: "ingreso",
      pesos: k === 1 ? 12_000 : 15_500,
      descripcion: "Freelance: diseño de una web",
      categoria: "Ingresos",
      cuenta: "BROU",
    });
  }
  if (k === 2) {
    agregar({
      dia: 9,
      hora: 16,
      tipo: "ingreso",
      pesos: 9_500,
      descripcion: "Venta de bicicleta usada",
      categoria: "Ingresos",
      cuenta: "Efectivo",
    });
  }
  if (k % 2 === 0) {
    agregar({
      dia: 17,
      hora: 11,
      tipo: "ingreso",
      pesos: azar.entre(900, 1_400),
      descripcion: "Reintegro de la mutualista",
      categoria: "Ingresos",
      cuenta: "BROU",
    });
  }

  // --- Vivienda y servicios ---
  agregar({
    dia: 1,
    hora: 10,
    tipo: "gasto",
    pesos: k < 4 ? 21_500 : 23_000,
    descripcion: "Alquiler",
    categoria: "Vivienda",
    cuenta: "BROU",
    clave: `alquiler-${k}`,
  });
  agregar({
    dia: 3,
    hora: 12,
    tipo: "gasto",
    pesos: redondear(azar.entre(1_900, 3_100)),
    descripcion: "UTE",
    categoria: "Servicios",
    cuenta: "BROU",
  });
  agregar({
    dia: 5,
    hora: 12,
    tipo: "gasto",
    pesos: redondear(azar.entre(650, 900)),
    descripcion: "OSE",
    categoria: "Servicios",
    cuenta: "BROU",
  });
  agregar({
    dia: 6,
    hora: 9,
    tipo: "gasto",
    pesos: 1_350,
    descripcion: "Antel Fibra",
    categoria: "Servicios",
    cuenta: "BROU",
  });
  if (k % 3 === 1) {
    agregar({
      dia: 13,
      hora: 19,
      tipo: "gasto",
      pesos: azar.entre(1_800, 2_600),
      descripcion: "Gastos comunes",
      categoria: "Vivienda",
      cuenta: "BROU",
    });
  }

  // --- Suscripciones y deporte ---
  agregar({
    dia: 4,
    hora: 8,
    tipo: "gasto",
    pesos: 520,
    descripcion: "Netflix",
    categoria: "Suscripciones",
    cuenta: "Tarjeta",
  });
  agregar({
    dia: 4,
    hora: 8.5,
    tipo: "gasto",
    pesos: 249,
    descripcion: "Spotify",
    categoria: "Suscripciones",
    cuenta: "Tarjeta",
  });
  agregar({
    dia: 2,
    hora: 19,
    tipo: "gasto",
    pesos: 1_900,
    descripcion: "Cuota del gimnasio",
    categoria: "Gimnasio y deporte",
    cuenta: "BROU",
    clave: `gimnasio-${k}`,
  });

  // --- Supermercado y comida ---
  const supers = ["Tienda Inglesa", "Disco", "Devoto", "Ta-Ta"] as const;
  for (const dia of [2, 8, 15, 22]) {
    agregar({
      dia: dia + azar.entre(0, 1),
      hora: azar.entre(17, 20),
      tipo: "gasto",
      pesos: redondear(azar.entre(1_800, 5_200)),
      descripcion: azar.uno(supers),
      categoria: "Alimentación",
      cuenta: azar.suerte(0.6) ? "Tarjeta" : "BROU",
      clave: `super-${k}-${dia}`,
    });
  }
  agregar({
    dia: azar.entre(5, 20),
    hora: 10,
    tipo: "gasto",
    pesos: redondear(azar.entre(500, 1_100)),
    descripcion: "Feria",
    categoria: "Alimentación",
    cuenta: "Efectivo",
  });
  const pedidos = azar.entre(2, 4);
  for (let i = 0; i < pedidos; i += 1) {
    agregar({
      dia: azar.entre(3, 27),
      hora: azar.entre(20, 22),
      tipo: "gasto",
      pesos: redondear(azar.entre(450, 950)),
      descripcion: azar.uno(["PedidosYa", "PedidosYa: pizza", "Rappi"]),
      categoria: "Delivery",
      cuenta: azar.suerte(0.5) ? "Tarjeta" : "Mercado Pago",
    });
  }

  // --- Transporte ---
  agregar({
    dia: 3,
    hora: 8,
    tipo: "gasto",
    pesos: 1_200,
    descripcion: "Recarga STM",
    categoria: "Transporte",
    cuenta: "Efectivo",
  });
  const viajes = azar.entre(1, 3);
  for (let i = 0; i < viajes; i += 1) {
    agregar({
      dia: azar.entre(4, 28),
      hora: azar.entre(7, 23),
      tipo: "gasto",
      pesos: redondear(azar.entre(220, 650)),
      descripcion: azar.uno(["Uber", "Cabify"]),
      categoria: "Transporte",
      cuenta: "Mercado Pago",
    });
  }
  if (k % 2 === 1) {
    agregar({
      dia: azar.entre(6, 24),
      hora: 14,
      tipo: "gasto",
      pesos: redondear(azar.entre(1_600, 2_200)),
      descripcion: "Nafta",
      categoria: "Transporte",
      cuenta: "Tarjeta",
    });
  }

  // --- Salud ---
  agregar({
    dia: azar.entre(5, 25),
    hora: 11,
    tipo: "gasto",
    pesos: redondear(azar.entre(400, 1_800)),
    descripcion: azar.uno(["Farmashop", "Farmacia", "San Roque"]),
    categoria: "Salud",
    cuenta: "Tarjeta",
    clave: `farmacia-${k}`,
  });
  if (k % 2 === 0) {
    agregar({
      dia: 10,
      hora: 17,
      tipo: "gasto",
      pesos: 1_200,
      descripcion: "Consulta médica",
      categoria: "Salud",
      cuenta: "BROU",
    });
  }

  // --- Entretenimiento y compras ---
  agregar({
    dia: azar.entre(6, 26),
    hora: 21,
    tipo: "gasto",
    pesos: redondear(azar.entre(2_200, 3_800)),
    descripcion: "Salida a cenar",
    categoria: "Entretenimiento",
    cuenta: "Tarjeta",
  });
  if (azar.suerte(0.7)) {
    agregar({
      dia: azar.entre(6, 26),
      hora: 22,
      tipo: "gasto",
      pesos: 650,
      descripcion: "Cine",
      categoria: "Entretenimiento",
      cuenta: "Efectivo",
    });
  }
  if (azar.suerte(0.55)) {
    agregar({
      dia: azar.entre(8, 26),
      hora: 16,
      tipo: "gasto",
      pesos: redondear(azar.entre(1_500, 6_000)),
      descripcion: azar.uno(["Ropa", "MercadoLibre", "Zapatillas", "Auriculares"]),
      categoria: "Compras",
      cuenta: "Tarjeta",
    });
  }

  // --- Mascotas, educación, regalos, viajes ---
  agregar({
    dia: 7,
    hora: 18,
    tipo: "gasto",
    pesos: redondear(azar.entre(1_500, 1_900)),
    descripcion: "Alimento para el perro",
    categoria: "Mascotas",
    cuenta: "BROU",
  });
  if (k === 2) {
    agregar({
      dia: 14,
      hora: 12,
      tipo: "gasto",
      pesos: 2_400,
      descripcion: "Veterinaria: vacuna anual",
      categoria: "Mascotas",
      cuenta: "Efectivo",
    });
  }
  if (k < 4) {
    agregar({
      dia: 9,
      hora: 19,
      tipo: "gasto",
      pesos: 3_200,
      descripcion: "Curso de inglés",
      categoria: "Educación",
      cuenta: "BROU",
    });
  }
  if (k === 4) {
    agregar({
      dia: 11,
      hora: 20,
      tipo: "gasto",
      pesos: 5_500,
      descripcion: "Curso de Excel avanzado",
      categoria: "Educación",
      cuenta: "Tarjeta",
    });
  }
  if (k === 1 || k === 3) {
    agregar({
      dia: 18,
      hora: 17,
      tipo: "gasto",
      pesos: azar.entre(1_500, 2_400),
      descripcion: k === 1 ? "Regalo de cumpleaños" : "Regalo para mamá",
      categoria: "Regalos",
      cuenta: "Tarjeta",
    });
  }
  if (k === 3) {
    agregar({
      dia: 20,
      hora: 9,
      tipo: "gasto",
      pesos: 7_400,
      descripcion: "Pasajes Buquebus",
      categoria: "Viajes",
      cuenta: "Tarjeta",
    });
    agregar({
      dia: 20,
      hora: 9.2,
      tipo: "gasto",
      pesos: 6_200,
      descripcion: "Hotel en Colonia",
      categoria: "Viajes",
      cuenta: "Tarjeta",
    });
    agregar({
      dia: 21,
      hora: 12,
      tipo: "neutro",
      pesos: 3_000,
      descripcion: "Efectivo para el viaje",
      cuenta: "BROU",
      destino: "Efectivo",
    });
  }

  // --- Transferencias entre cuentas ---
  agregar({
    dia: 2,
    hora: 13,
    tipo: "neutro",
    pesos: 4_000,
    descripcion: "Retiro del cajero",
    cuenta: "BROU",
    destino: "Efectivo",
  });
  if (k !== 2) {
    agregar({
      dia: 2,
      hora: 13.5,
      tipo: "neutro",
      pesos: k < 3 ? 8_000 : 10_000,
      descripcion: "Ahorro del mes",
      cuenta: "BROU",
      destino: "Ahorros",
    });
  }
  agregar({
    dia: azar.entre(9, 14),
    hora: 15,
    tipo: "neutro",
    pesos: 2_000,
    descripcion: "Recarga de Mercado Pago",
    cuenta: "BROU",
    destino: "Mercado Pago",
  });
  agregar({
    dia: 20,
    hora: 10,
    tipo: "neutro",
    pesos: redondear(azar.entre(15_000, 21_000), 100),
    descripcion: "Pago de la tarjeta",
    cuenta: "BROU",
    destino: "Tarjeta",
  });

  return e;
}

export type ResumenDeSiembra = { periodos: number; movimientos: number; cuentas: number };

/** Siembra las finanzas y devuelve cuántas cosas quedaron, para mostrarlo al terminar. */
export async function sembrarFinanzasDe(contexto: Contexto): Promise<ResumenDeSiembra> {
  const { cliente, userId, ahora } = contexto;
  const azar = crearAzar(2026);
  const inicios = iniciosDePeriodos(ahora, CANTIDAD_DE_PERIODOS);
  const primerInicio = inicios[0] as Date;

  // ---------- Cuentas ----------
  const cuentas = new Map<string, string>();
  const cuentasExistentes = await listarCuentasFinancieras(cliente, userId);
  const buscarCuenta = (nombre: string) =>
    cuentasExistentes.find((c) => c.nombre.toLowerCase() === nombre.toLowerCase());

  /** Usa la cuenta si ya existe; si no, la crea con ese saldo inicial. */
  async function cuentaConNombre(nombre: string, saldoInicialPesos: number): Promise<string> {
    const existente = buscarCuenta(nombre);
    if (existente) return existente.id;
    const nueva = await crearCuentaFinanciera(cliente, userId, nombre, saldoInicialPesos * 100);
    return nueva.id;
  }

  /** Renombra una cuenta por defecto (como haría la persona) o crea la nueva si no estaba. */
  async function renombrarOCrear(
    nombreViejo: string,
    nombreNuevo: string,
    saldoInicialPesos: number,
  ): Promise<string> {
    const nueva = buscarCuenta(nombreNuevo);
    if (nueva) return nueva.id;
    const vieja = buscarCuenta(nombreViejo);
    if (vieja) {
      await renombrarCuentaFinanciera(cliente, userId, vieja.id, nombreNuevo);
      return vieja.id;
    }
    return (await crearCuentaFinanciera(cliente, userId, nombreNuevo, saldoInicialPesos * 100)).id;
  }

  cuentas.set("Efectivo", await cuentaConNombre("Efectivo", 0));
  cuentas.set("BROU", await renombrarOCrear("Banco", "BROU", 0));
  cuentas.set("Tarjeta", await cuentaConNombre("Tarjeta", 0));
  cuentas.set("Mercado Pago", await renombrarOCrear("Billetera digital", "Mercado Pago", 0));
  // Con saldo desde el principio: su "Carga inicial" figura en el historial.
  cuentas.set("Ahorros", await cuentaConNombre("Ahorros", 150_000));
  const santander = await cuentaConNombre("Santander (vieja)", 8_500);
  cuentas.set("Santander (vieja)", santander);

  // Una cuenta creada por error y eliminada enseguida (sin movimientos se puede).
  const prueba = await crearCuentaFinanciera(cliente, userId, "Cuenta de prueba", 0);
  await eliminarCuentaFinanciera(cliente, userId, prueba.id);

  // Lo que la persona dijo tener al empezar, en cuentas que arrancaron en cero: ajustes
  // manuales con la fecha del primer día (se insertan directo para ponerles fecha pasada).
  const saldosDeArranque: [string, number][] = [
    ["Efectivo", 6_500],
    ["BROU", 31_200],
    ["Mercado Pago", 1_800],
  ];
  for (const [nombre, pesos] of saldosDeArranque) {
    await cliente.db.insert(esquema.ajustesDeSaldo).values({
      userId,
      cuentaFinancieraId: cuentas.get(nombre) as string,
      saldoIndicadoCentavos: pesos * 100,
      diferenciaCentavos: pesos * 100,
      fecha: new Date(primerInicio.getTime() - 20 * DIA + 11 * 60 * 60 * 1000),
    });
  }

  // ---------- Categorías ----------
  const categoriasExistentes = await listarCategorias(cliente, userId);
  const categorias = new Map<string, number>();
  async function categoriaConNombre(nombre: string): Promise<number> {
    const guardada = categorias.get(nombre);
    if (guardada !== undefined) return guardada;
    const existente = categoriasExistentes.find(
      (c) => c.nombre.toLowerCase() === nombre.toLowerCase() && c.sistema === null,
    );
    const id = existente ? existente.id : (await crearCategoria(cliente, userId, nombre)).id;
    categorias.set(nombre, id);
    return id;
  }

  for (const nombre of [
    "Alimentación",
    "Transporte",
    "Vivienda",
    "Servicios",
    "Salud",
    "Entretenimiento",
    "Compras",
    "Educación",
    "Ingresos",
    // Las que creó la persona a lo largo del tiempo:
    "Mascotas",
    "Gimnasio y deporte",
    "Suscripciones",
    "Regalos",
    "Viajes",
    "Delivery",
  ]) {
    await categoriaConNombre(nombre);
  }
  const categoriaDeTransferencia = categoriasExistentes.find((c) => c.sistema === "transferencia");

  // Una categoría creada por error y eliminada (sin movimientos se puede).
  const pruebaCategoria = await crearCategoria(cliente, userId, "Borrar");
  await eliminarCategoria(cliente, userId, pruebaCategoria.id);

  // ---------- Períodos y movimientos ----------
  const porClave = new Map<string, Movimiento>();
  const periodos: Periodo[] = [];

  /** Carga una entrada tal cual la cargaría la persona. Devuelve null si cae en el futuro. */
  async function cargar(entrada: Entrada, inicio: Date, fin: Date): Promise<Movimiento | null> {
    const fecha = new Date(
      inicio.getTime() + entrada.dia * DIA + Math.round(entrada.hora * 60) * 60_000,
    );
    if (fecha > ahora || fecha >= fin) return null;
    const esTransferencia = entrada.tipo === "neutro";
    const categoriaId = esTransferencia
      ? (categoriaDeTransferencia?.id ?? 0)
      : await categoriaConNombre(entrada.categoria ?? "Otros");

    const movimiento = await crearMovimiento(cliente, userId, {
      tipo: entrada.tipo,
      importeCentavos: Math.round(entrada.pesos * 100),
      descripcion: entrada.descripcion,
      categoriaId,
      cuentaFinancieraId: cuentas.get(entrada.cuenta) as string,
      cuentaDestinoId: esTransferencia ? (cuentas.get(entrada.destino ?? "") ?? null) : null,
      fecha,
    });
    if (entrada.clave) porClave.set(entrada.clave, movimiento);
    return movimiento;
  }

  // Un período de "pruebas" de cuando la persona recién probaba la aplicación; al final se elimina.
  const inicioDePruebas = new Date(primerInicio.getTime() - 25 * DIA);
  const finDePruebas = new Date(primerInicio.getTime() - 10 * DIA);
  const periodoDePruebas = await abrirPeriodo(
    cliente,
    userId,
    { nombre: "Pruebas", aperturaEn: inicioDePruebas },
    ahora,
  );
  for (const entrada of [
    { dia: 1, hora: 10, pesos: 100, descripcion: "Probando", categoria: "Otros" },
    { dia: 2, hora: 11, pesos: 250, descripcion: "Otro de prueba", categoria: "Otros" },
    { dia: 3, hora: 12, pesos: 90, descripcion: "Café de prueba", categoria: "Alimentación" },
  ]) {
    await cargar({ ...entrada, tipo: "gasto", cuenta: "Efectivo" }, inicioDePruebas, finDePruebas);
  }
  await cerrarPeriodo(cliente, userId, periodoDePruebas.id, { cierreEn: finDePruebas }, ahora);

  // Los períodos reales: cada uno cierra justo donde empieza el siguiente.
  for (let k = 0; k < inicios.length; k += 1) {
    const inicio = inicios[k] as Date;
    const siguiente = inicios[k + 1];
    const fin = siguiente ?? new Date(ahora.getTime() + DIA);

    const periodo = await abrirPeriodo(cliente, userId, { aperturaEn: inicio }, ahora);
    periodos.push(periodo);

    const entradas = movimientosDelPeriodo(k, azar).sort(
      (a, b) => a.dia * 24 + a.hora - (b.dia * 24 + b.hora),
    );
    for (const entrada of entradas) await cargar(entrada, inicio, fin);

    // La cuenta vieja se usó un par de meses y después se dejó de usar.
    if (k === 0) {
      await cargar(
        {
          dia: 6,
          hora: 15,
          tipo: "gasto",
          pesos: 2_300,
          descripcion: "Compra con débito",
          categoria: "Compras",
          cuenta: "Santander (vieja)",
        },
        inicio,
        fin,
      );
      await cargar(
        {
          dia: 15,
          hora: 10,
          tipo: "gasto",
          pesos: 1_100,
          descripcion: "Farmacia",
          categoria: "Salud",
          cuenta: "Santander (vieja)",
        },
        inicio,
        fin,
      );
    }
    if (k === 1) {
      await cargar(
        {
          dia: 3,
          hora: 9,
          tipo: "neutro",
          pesos: 4_000,
          descripcion: "Paso lo que queda al BROU",
          cuenta: "Santander (vieja)",
          destino: "BROU",
        },
        inicio,
        fin,
      );
    }

    if (siguiente) await cerrarPeriodo(cliente, userId, periodo.id, { cierreEn: siguiente }, ahora);
  }

  // ---------- Presupuestos ----------
  const presupuestos: [string, number][] = [
    ["Alimentación", 14_000],
    ["Transporte", 4_500],
    ["Entretenimiento", 4_000],
    ["Suscripciones", 1_200],
    ["Delivery", 2_500],
    ["Compras", 5_000],
  ];
  for (const [nombre, pesos] of presupuestos) {
    await fijarPresupuesto(cliente, userId, await categoriaConNombre(nombre), pesos * 100);
  }
  // Se ajusta uno que quedó corto y se descarta uno que no se usó.
  await fijarPresupuesto(cliente, userId, await categoriaConNombre("Transporte"), 5_500 * 100);
  await fijarPresupuesto(cliente, userId, await categoriaConNombre("Compras"), 3_000 * 100);
  await eliminarPresupuesto(cliente, userId, await categoriaConNombre("Compras"));

  // ---------- Correcciones, como las haría una persona ----------
  // 1. Un importe mal tipeado (35.000 en lugar de 3.500) que se corrige después.
  const errado = porClave.get("super-2-8");
  if (errado) {
    const typo = await editarMovimiento(cliente, userId, errado.id, {
      tipo: "gasto",
      importeCentavos: 35_000 * 100,
      descripcion: errado.descripcion,
      categoriaId: errado.categoria.id,
      cuentaFinancieraId: errado.cuentaFinanciera.id,
      fecha: errado.fecha,
    });
    if (typo) {
      await editarMovimiento(cliente, userId, typo.id, {
        tipo: "gasto",
        importeCentavos: 3_500 * 100,
        descripcion: typo.descripcion,
        categoriaId: typo.categoria.id,
        cuentaFinancieraId: typo.cuentaFinanciera.id,
        fecha: typo.fecha,
      });
    }
  }

  // 2. Una compra cargada en la categoría equivocada: la farmacia estaba en Compras.
  const farmacia = porClave.get("farmacia-1");
  if (farmacia) {
    await editarMovimiento(cliente, userId, farmacia.id, {
      tipo: "gasto",
      importeCentavos: farmacia.importeCentavos,
      descripcion: `${farmacia.descripcion} (receta)`,
      categoriaId: await categoriaConNombre("Salud"),
      cuentaFinancieraId: farmacia.cuentaFinanciera.id,
      fecha: farmacia.fecha,
    });
  }

  // 3. Un sueldo cargado dos veces: se elimina el repetido.
  const sueldo = porClave.get("sueldo-2");
  if (sueldo) {
    const repetido = await crearMovimiento(cliente, userId, {
      tipo: "ingreso",
      importeCentavos: sueldo.importeCentavos,
      descripcion: "Sueldo",
      categoriaId: sueldo.categoria.id,
      cuentaFinancieraId: sueldo.cuentaFinanciera.id,
      fecha: new Date(sueldo.fecha.getTime() + 60 * 60_000),
    });
    await eliminarMovimiento(cliente, userId, repetido.id);
  }

  // 3b. El supermercado cargado dos veces (se le dio a "guardar" dos veces): se elimina uno.
  const compra = porClave.get("super-3-15");
  if (compra) {
    const repetida = await crearMovimiento(cliente, userId, {
      tipo: "gasto",
      importeCentavos: compra.importeCentavos,
      descripcion: compra.descripcion,
      categoriaId: compra.categoria.id,
      cuentaFinancieraId: compra.cuentaFinanciera.id,
      fecha: new Date(compra.fecha.getTime() + 5 * 60_000),
    });
    await eliminarMovimiento(cliente, userId, repetida.id);
  }
  // 3c. Una farmacia que se cargó pero al final no se compró: se elimina.
  const sinComprar = porClave.get("farmacia-4");
  if (sinComprar) await eliminarMovimiento(cliente, userId, sinComprar.id);

  // 4. Un alquiler que sube: no se toca el pasado, pero se corrige la descripción de uno.
  const alquiler = porClave.get("alquiler-4");
  if (alquiler) {
    await editarMovimiento(cliente, userId, alquiler.id, {
      tipo: "gasto",
      importeCentavos: alquiler.importeCentavos,
      descripcion: "Alquiler (nuevo contrato)",
      categoriaId: alquiler.categoria.id,
      cuentaFinancieraId: alquiler.cuentaFinanciera.id,
      fecha: alquiler.fecha,
    });
  }

  // 5. Se duplica el gimnasio del período actual para cargar una clase extra, y se ajusta.
  const gimnasioActual = porClave.get(`gimnasio-${CANTIDAD_DE_PERIODOS - 1}`);
  if (gimnasioActual) {
    const copia = await duplicarMovimiento(cliente, userId, gimnasioActual.id);
    if (copia) {
      await editarMovimiento(cliente, userId, copia.id, {
        tipo: "gasto",
        importeCentavos: 600 * 100,
        descripcion: "Clase extra de spinning",
        categoriaId: copia.categoria.id,
        cuentaFinancieraId: copia.cuentaFinanciera.id,
        fecha: copia.fecha,
      });
    }
  }

  // 6. Dos categorías parecidas: "Delivery" se funde en una nueva, "Restaurantes y delivery".
  await reemplazarCategoria(cliente, userId, await categoriaConNombre("Delivery"), {
    nueva: { nombre: "Restaurantes y delivery" },
  });
  categorias.delete("Delivery");

  // 7. "Gimnasio y deporte" se acorta, y "Compras" se aclara.
  await renombrarCategoria(
    cliente,
    userId,
    await categoriaConNombre("Gimnasio y deporte"),
    "Deporte",
  );
  categorias.delete("Gimnasio y deporte");
  await renombrarCategoria(
    cliente,
    userId,
    await categoriaConNombre("Compras"),
    "Compras personales",
  );
  categorias.delete("Compras");

  // 8. Un período se renombra para recordar de qué fue.
  const periodoDelViaje = periodos[3];
  if (periodoDelViaje) {
    await renombrarPeriodo(
      cliente,
      userId,
      periodoDelViaje.id,
      `${periodoDelViaje.nombre} (viaje a Colonia)`,
    );
  }

  // 9. La cuenta vieja ya no se usa: tiene movimientos, así que no se puede eliminar; se oculta.
  await cambiarVisibilidadDeCuenta(cliente, userId, santander, true);

  // 10. El período de pruebas se elimina, con sus movimientos.
  await eliminarPeriodo(cliente, userId, periodoDePruebas.id);

  // 11. Se cuenta el efectivo que hay de verdad y se ajusta el saldo (no es un movimiento).
  const efectivoAhora = (await listarCuentasFinancieras(cliente, userId)).find(
    (c) => c.id === cuentas.get("Efectivo"),
  );
  if (efectivoAhora) {
    const contado = Math.max(0, Math.floor(efectivoAhora.saldoCentavos / 100) - 340);
    await ajustarSaldoDeCuenta(cliente, userId, efectivoAhora.id, contado * 100);
  }

  // 12. Se cierra el período actual por equivocación y se reabre.
  const actual = periodos[periodos.length - 1];
  if (actual) {
    await cerrarPeriodo(cliente, userId, actual.id, {}, new Date());
    await reabrirPeriodo(cliente, userId, actual.id);
  }

  const [movimientos] = await cliente.db
    .select({ total: count() })
    .from(esquema.movimientos)
    .where(and(eq(esquema.movimientos.userId, userId), isNull(esquema.movimientos.eliminadoEn)));
  return {
    periodos: (await listarPeriodos(cliente, userId)).length,
    movimientos: movimientos?.total ?? 0,
    cuentas: (await listarCuentasFinancieras(cliente, userId)).length,
  };
}

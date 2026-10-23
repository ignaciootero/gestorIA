// Utilidades para los tests end-to-end.
//
// Preparan el estado de la base de pruebas hablando directamente con ella, en
// vez de hacerlo desde la interfaz: un test de la pantalla de login no tiene por
// qué registrar y aprobar una cuenta a mano cada vez.

import { crearClienteDb, esquema, leerConfigBaseDatos } from "@gestoria/db";
import { eq, sql } from "drizzle-orm";

// Puerto fijo de la API que levanta Playwright (ver playwright.config.ts). No se
// lee de NEXT_PUBLIC_URL_API a propósito: esa variable apunta a la API de
// desarrollo, y estos tests nunca deben tocar la base de desarrollo.
const URL_API = "http://localhost:3101";

/** Cliente contra gestion_test. Nunca contra la base de desarrollo. */
function cliente() {
  return crearClienteDb(leerConfigBaseDatos(true));
}

export async function limpiarBaseDePruebas(): Promise<void> {
  const db = cliente();
  try {
    await db.db.execute(
      sql`truncate table ${esquema.usuarios}, ${esquema.sesiones}, ${esquema.cuentas}, ${esquema.verificaciones}, ${esquema.limitesPeticiones}, ${esquema.movimientos}, ${esquema.presupuestos}, ${esquema.cuentasFinancieras}, ${esquema.categorias}, ${esquema.cotizaciones}, ${esquema.contactos}, ${esquema.etiquetasDeContactos}, ${esquema.recordatoriosDeContactos}, ${esquema.deudas}, ${esquema.pagosDeDeudas}, ${esquema.tareas}, ${esquema.tareasRepetitivas}, ${esquema.categoriasDeTareas}, ${esquema.eventosDeCalendario} restart identity cascade`,
    );
  } finally {
    await db.cerrar();
  }
}

export type CuentaDePrueba = {
  usuario: string;
  nombre: string;
  apellido: string;
  email: string;
  password: string;
};

let contador = 0;

/**
 * Registra una cuenta pasando por la API real (para que la contraseña quede con
 * el hash correcto) y después le pone el estado que pida el test.
 */
export async function crearCuentaAprobada(
  opciones: {
    estado?: "pendiente" | "aprobado" | "rechazado";
    emailVerificado?: boolean;
    debeCambiarPassword?: boolean;
    esAdmin?: boolean;
    /** Deja la cuenta como recién registrada, con las etiquetas de contactos por defecto. Si no, arranca sin etiquetas. */
    conEtiquetasIniciales?: boolean;
    /** Lo mismo con las categorías de tareas por defecto. */
    conCategoriasDeTareaIniciales?: boolean;
  } = {},
): Promise<CuentaDePrueba> {
  contador += 1;
  const sufijo = `${Date.now().toString(36)}${contador}`;

  const cuenta: CuentaDePrueba = {
    usuario: `p.${sufijo}`.slice(0, 20),
    nombre: "Ana",
    apellido: "Pérez",
    email: `ana.${sufijo}@ejemplo.test`,
    password: "clave-de-prueba",
  };

  const respuesta = await fetch(`${URL_API}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: cuenta.email,
      password: cuenta.password,
      name: `${cuenta.nombre} ${cuenta.apellido}`,
      username: cuenta.usuario,
      nombre: cuenta.nombre,
      apellido: cuenta.apellido,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`No se pudo crear la cuenta de prueba: ${await respuesta.text()}`);
  }

  const db = cliente();
  try {
    // Para entrar hacen falta las dos cosas: correo confirmado y cuenta aprobada.
    await db.db
      .update(esquema.usuarios)
      .set({
        estado: opciones.estado ?? "aprobado",
        emailVerified: opciones.emailVerificado ?? true,
        debeCambiarPassword: opciones.debeCambiarPassword ?? false,
        role: opciones.esAdmin ? "admin" : "usuario",
        // Por defecto se la marca como que ya las recibió, para que los tests cuenten solo lo que crean.
        etiquetasInicialesCreadas: !opciones.conEtiquetasIniciales,
        categoriasDeTareasInicialesCreadas: !opciones.conCategoriasDeTareaIniciales,
      })
      .where(eq(esquema.usuarios.email, cuenta.email));
  } finally {
    await db.cerrar();
  }

  return cuenta;
}

export type TareaDePrueba = {
  titulo: string;
  /** "AAAA-MM-DD". */
  dia: string;
  hecha?: boolean;
  /** Si viene, la tarea está marcada como fallida (solo tiene sentido en un día anterior a hoy). */
  fallida?: boolean;
  /** Lleva el distintivo de importante. */
  importante?: boolean;
  /** El nombre de una categoría de tareas que ya exista en la cuenta (ver sembrarCategoriasDeTareaDePrueba). */
  categoria?: string;
  /** Si viene, la tarea sale de una tarea repetitiva (se crea una sola, diaria, para todas). */
  deRepetitiva?: boolean;
};

/**
 * Inserta tareas directo en la base de pruebas, con el día que se pida: la API no deja crear
 * tareas en el pasado, y los tests de atrasadas e historial necesitan días anteriores.
 */
export async function sembrarTareasDePrueba(
  email: string,
  tareas: TareaDePrueba[],
  hoy: string,
): Promise<void> {
  const db = cliente();
  try {
    const usuario = await db.db.query.usuarios.findFirst({
      where: (tabla, { eq: igual }) => igual(tabla.email, email),
      columns: { id: true },
    });
    if (!usuario) throw new Error(`No existe la cuenta ${email}`);

    const categorias = await db.db.query.categoriasDeTareas.findMany({
      where: (tabla, { eq: igual }) => igual(tabla.userId, usuario.id),
      columns: { id: true, nombre: true },
    });
    const idDeCategoria = (nombre: string | undefined): number | null => {
      if (nombre === undefined) return null;
      const categoria = categorias.find((otra) => otra.nombre === nombre);
      if (!categoria) throw new Error(`No existe la categoría ${nombre}`);
      return categoria.id;
    };

    // Una repetitiva ya armada hasta hoy, para que la lista no invente días por su cuenta.
    const [repetitiva] = await db.db
      .insert(esquema.tareasRepetitivas)
      .values({
        userId: usuario.id,
        titulo: "Rutina de prueba",
        repeticion: "diaria",
        desde: "2000-01-01",
        generadaHasta: hoy,
        eliminadoEn: new Date(),
      })
      .returning({ id: esquema.tareasRepetitivas.id });

    await db.db.insert(esquema.tareas).values(
      tareas.map((tarea) => ({
        userId: usuario.id,
        titulo: tarea.titulo,
        dia: tarea.dia,
        completadaEn: tarea.hecha ? new Date() : null,
        falladaEn: tarea.fallida ? new Date() : null,
        importante: tarea.importante ?? false,
        categoriaId: idDeCategoria(tarea.categoria),
        repetitivaId: tarea.deRepetitiva ? (repetitiva?.id ?? null) : null,
      })),
    );
  } finally {
    await db.cerrar();
  }
}

/**
 * Inserta recordatorios de una sola vez cuyo día ya pasó, directo en la base de pruebas: la API no deja
 * crearlos en el pasado y el histórico de Contactos necesita de esos.
 */
export async function sembrarRecordatoriosPasadosDePrueba(
  email: string,
  contactoId: string,
  recordatorios: { titulo: string; fecha: string; importante?: boolean }[],
): Promise<void> {
  const db = cliente();
  try {
    const usuario = await db.db.query.usuarios.findFirst({
      where: (tabla, { eq: igual }) => igual(tabla.email, email),
      columns: { id: true },
    });
    if (!usuario) throw new Error(`No existe la cuenta ${email}`);

    await db.db.insert(esquema.recordatoriosDeContactos).values(
      recordatorios.map((recordatorio) => ({
        userId: usuario.id,
        contactoId,
        titulo: recordatorio.titulo,
        repeticion: "unica" as const,
        fecha: recordatorio.fecha,
        importante: recordatorio.importante ?? false,
      })),
    );
  } finally {
    await db.cerrar();
  }
}

/**
 * Inserta un recordatorio diario que existe desde hace `dias` días, directo en la base de pruebas: al
 * leer el histórico tiene que pasar al histórico una entrada por cada uno de esos días.
 */
export async function sembrarRecordatorioDiarioAntiguoDePrueba(
  email: string,
  contactoId: string,
  titulo: string,
  dias: number,
  hoy: string,
): Promise<void> {
  const db = cliente();
  try {
    const usuario = await db.db.query.usuarios.findFirst({
      where: (tabla, { eq: igual }) => igual(tabla.email, email),
      columns: { id: true },
    });
    if (!usuario) throw new Error(`No existe la cuenta ${email}`);

    const fecha = new Date(`${hoy}T00:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() - dias - 1);
    await db.db.insert(esquema.recordatoriosDeContactos).values({
      userId: usuario.id,
      contactoId,
      titulo,
      repeticion: "diaria",
      hora: "09:00",
      // Lo último ya pasado al histórico es el día anterior al primero que tiene que aparecer.
      historialHasta: fecha.toISOString().slice(0, 10),
    });
  } finally {
    await db.cerrar();
  }
}

export type RepetitivaDePrueba = {
  titulo: string;
  repeticion: "diaria" | "intervalo" | "semanal" | "mensual" | "anual";
  notas?: string;
  /** Se da por fallida sola si pasa el día sin hacerla. */
  fallaSola?: boolean;
};

/**
 * Inserta tareas repetitivas vigentes directo en la base de pruebas, ya armadas hasta hoy. Sirve
 * para tener de varias periodicidades sin pasar por el formulario una por una. Las semanales caen
 * los lunes, las mensuales el día 15, las anuales el 15 de junio y las de cada varios días cada 3 días,
 * desde hoy.
 */
export async function sembrarRepetitivasDePrueba(
  email: string,
  repetitivas: RepetitivaDePrueba[],
  hoy: string,
): Promise<void> {
  const db = cliente();
  try {
    const usuario = await db.db.query.usuarios.findFirst({
      where: (tabla, { eq: igual }) => igual(tabla.email, email),
      columns: { id: true },
    });
    if (!usuario) throw new Error(`No existe la cuenta ${email}`);

    await db.db.insert(esquema.tareasRepetitivas).values(
      repetitivas.map((repetitiva) => ({
        userId: usuario.id,
        titulo: repetitiva.titulo,
        notas: repetitiva.notas ?? null,
        repeticion: repetitiva.repeticion,
        diasSemana: repetitiva.repeticion === "semanal" ? [1] : null,
        diaDelMes:
          repetitiva.repeticion === "mensual" || repetitiva.repeticion === "anual" ? 15 : null,
        mes: repetitiva.repeticion === "anual" ? 6 : null,
        cadaDias: repetitiva.repeticion === "intervalo" ? 3 : null,
        fechaInicio: repetitiva.repeticion === "intervalo" ? hoy : null,
        fallaSola: repetitiva.fallaSola ?? false,
        desde: "2000-01-01",
        generadaHasta: hoy,
      })),
    );
  } finally {
    await db.cerrar();
  }
}

/** Crea categorías de tareas directo en la base de pruebas (con colores distintos entre sí). */
export async function sembrarCategoriasDeTareaDePrueba(
  email: string,
  nombres: string[],
): Promise<void> {
  const db = cliente();
  try {
    const usuario = await db.db.query.usuarios.findFirst({
      where: (tabla, { eq: igual }) => igual(tabla.email, email),
      columns: { id: true },
    });
    if (!usuario) throw new Error(`No existe la cuenta ${email}`);

    const colores = ["#cf5417", "#1717cf", "#17b0cf", "#cf1754", "#17cf54", "#889933"];
    await db.db.insert(esquema.categoriasDeTareas).values(
      nombres.map((nombre, indice) => ({
        userId: usuario.id,
        nombre,
        color: colores[indice % colores.length] ?? "#64748b",
      })),
    );
  } finally {
    await db.cerrar();
  }
}

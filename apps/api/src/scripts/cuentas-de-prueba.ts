// Las cuentas de la carga de datos de prueba (la usa sembrar-datos-de-prueba.ts):
//
// 1. **iotero** (contraseña "iotero"): el admin. Tiene datos en todos los módulos y, sobre todo, lo que
//    solo ve un admin: solicitudes de registro pendientes, cuentas en cada estado (aprobadas,
//    rechazadas, bloqueadas, desbloqueadas, con la contraseña reseteada) y su historial de auditoría,
//    repartido en el último año.
// 2. **dpaolillo1** (contraseña "dpaolillo1"): una persona que usa la aplicación hace un año. Doce meses
//    de finanzas, contactos con sus cumpleaños y aniversarios (y el histórico del año), un año de
//    tareas y eventos en el calendario.
// 3. **dpaolillo2** (contraseña "dpaolillo2"): recién aprobada y vacía. Solo tiene lo que la aplicación
//    crea sola para cualquier cuenta nueva (categorías, etiquetas y cuentas por defecto), que aparece
//    al entrar por primera vez.
//
// Las tres contraseñas son las que se pidieron, aunque las dos primeras son más cortas que el mínimo de
// LARGO_MINIMO_PASSWORD: son cuentas de prueba, no de personas. El registro no las aceptaría, así que se
// registran con otra y después se les guarda el hash de la pedida (con el mismo algoritmo de Better
// Auth). El ingreso no exige largo mínimo (a propósito, para contraseñas viejas), así que entran.
//
// Todo lo que el panel de admin muestra con fecha (alta, cambio de estado, auditoría, última
// conexión) se fecha hacia atrás, para que se vea como un año de uso y no como "todo pasó hoy".

import { randomUUID } from "node:crypto";
import { type ClienteDb, esquema } from "@gestoria/db";
import {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
  diaDeHoy,
  ESTADOS_CUENTA,
  type EstadoCuenta,
} from "@gestoria/shared";
import { and, eq } from "drizzle-orm";
import type { Auth } from "../auth/crear-auth.ts";
import { crearEventoManual } from "../servicios/calendario/eventos-manuales.ts";
import { obtenerZonaHoraria } from "../servicios/finanzas/periodos.ts";
import { buscarCuenta } from "../servicios/usuarios/cuentas.ts";
import { sembrarContactosDe } from "./sembrar-contactos.ts";
import { sembrarContactosDeUnAnio } from "./sembrar-contactos-de-un-anio.ts";
import { sembrarFinanzasDe } from "./sembrar-finanzas.ts";
import { sembrarTareasDe } from "./sembrar-tareas.ts";

const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;

/** La contraseña de las cuentas que solo están para poblar el panel de admin. */
export const PASSWORD_DE_LAS_OTRAS_CUENTAS = "prueba1234";

/** Con la que se registran las que piden una contraseña más corta que el mínimo (se reemplaza enseguida). */
const PASSWORD_DE_REGISTRO = "registro-de-la-siembra";

export type DatosDeCuenta = {
  usuario: string;
  nombre: string;
  apellido: string;
  email: string;
  password: string;
};

export const CUENTA_ADMIN: DatosDeCuenta = {
  usuario: "iotero",
  nombre: "Ignacio",
  apellido: "Otero",
  email: "iotero@ejemplo.test",
  password: "iotero",
};

export const CUENTA_CON_UN_ANIO: DatosDeCuenta = {
  usuario: "dpaolillo1",
  nombre: "Paolillo",
  apellido: "Uno",
  email: "dpaolillo1@ejemplo.test",
  password: "dpaolillo1",
};

export const CUENTA_VACIA: DatosDeCuenta = {
  usuario: "dpaolillo2",
  nombre: "Paolillo",
  apellido: "Dos",
  email: "dpaolillo2@ejemplo.test",
  password: "dpaolillo2",
};

export type ContextoDeSiembra = { cliente: ClienteDb; auth: Auth; ahora: Date };

/** El instante de hace tantos días (y horas) desde `ahora`. */
function hace(ahora: Date, dias: number, horas = 0): Date {
  return new Date(ahora.getTime() - dias * DIA - horas * HORA);
}

/** true si ya existe una cuenta con ese usuario o ese correo. */
export async function existeCuenta(cliente: ClienteDb, datos: DatosDeCuenta): Promise<boolean> {
  return (
    (await buscarCuenta(cliente, datos.usuario)) !== null ||
    (await buscarCuenta(cliente, datos.email)) !== null
  );
}

/**
 * Registra una cuenta por Better Auth (para que la contraseña quede con su hash de verdad) y la deja en
 * el estado pedido, fechada: se dio de alta hace `altaHace` días y su estado actual es de hace
 * `estadoHace` (por defecto, el mismo día del alta).
 */
async function crearCuenta(
  { cliente, auth, ahora }: ContextoDeSiembra,
  datos: DatosDeCuenta,
  opciones: {
    altaHace: number;
    estado: EstadoCuenta;
    estadoHace?: number;
    correoConfirmado?: boolean;
    admin?: boolean;
  },
): Promise<string> {
  const corta = datos.password.length < 8;
  const creado = await auth.api.signUpEmail({
    body: {
      email: datos.email,
      password: corta ? PASSWORD_DE_REGISTRO : datos.password,
      name: `${datos.nombre} ${datos.apellido}`,
      username: datos.usuario,
      nombre: datos.nombre,
      apellido: datos.apellido,
    },
  });
  const id = creado.user.id;

  if (corta) {
    const contexto = await auth.$context;
    await cliente.db
      .update(esquema.cuentas)
      .set({ password: await contexto.password.hash(datos.password) })
      .where(and(eq(esquema.cuentas.userId, id), eq(esquema.cuentas.providerId, "credential")));
  }

  const alta = hace(ahora, opciones.altaHace);
  await cliente.db
    .update(esquema.usuarios)
    .set({
      emailVerified: opciones.correoConfirmado ?? true,
      estado: opciones.estado,
      role: opciones.admin ? "admin" : "usuario",
      createdAt: alta,
      updatedAt: hace(ahora, opciones.estadoHace ?? opciones.altaHace),
      estadoActualizadoEn: hace(ahora, opciones.estadoHace ?? opciones.altaHace),
    })
    .where(eq(esquema.usuarios.id, id));
  return id;
}

/** Una entrada de la auditoría, con su fecha. */
async function auditar(
  { cliente, ahora }: ContextoDeSiembra,
  adminId: string,
  accion: AccionAuditoria,
  objetivoId: string,
  dias: number,
  detalle: string | null = null,
): Promise<void> {
  await cliente.db
    .insert(esquema.auditoria)
    .values({ adminId, accion, objetivoId, detalle, creadoEn: hace(ahora, dias) });
}

/**
 * Una sesión vencida de hace tanto: es lo que el panel muestra como "última conexión". Vencida para que
 * no sirva para entrar (y su token es al azar).
 */
async function conexion(
  { cliente, ahora }: ContextoDeSiembra,
  userId: string,
  dias: number,
  horas = 0,
): Promise<void> {
  const cuando = hace(ahora, dias, horas);
  await cliente.db.insert(esquema.sesiones).values({
    id: randomUUID(),
    token: randomUUID(),
    userId,
    expiresAt: new Date(Math.min(cuando.getTime() + HORA, ahora.getTime() - 1000)),
    userAgent: "Mozilla/5.0 (siembra de datos de prueba)",
    createdAt: cuando,
    updatedAt: cuando,
  });
}

/** Eventos propios del calendario; `dias` es hace cuántos días (negativo: dentro de tantos). */
async function eventos(
  { cliente, ahora }: ContextoDeSiembra,
  userId: string,
  lista: { titulo: string; dias: number; hora?: string; notas?: string }[],
): Promise<void> {
  const zona = await obtenerZonaHoraria(cliente, userId);
  for (const evento of lista) {
    await crearEventoManual(cliente, userId, {
      titulo: evento.titulo,
      notas: evento.notas ?? "",
      fecha: diaDeHoy(zona, hace(ahora, evento.dias)),
      hora: evento.hora ?? "",
    });
  }
}

/** 1. El admin, con datos en todos los módulos. Devuelve su id. */
export async function sembrarAdmin(contexto: ContextoDeSiembra): Promise<string> {
  const { cliente, ahora } = contexto;
  const id = await crearCuenta(contexto, CUENTA_ADMIN, {
    altaHace: 400,
    estado: ESTADOS_CUENTA.aprobado,
    admin: true,
  });
  await sembrarFinanzasDe({ cliente, userId: id, ahora });
  await sembrarContactosDe({ cliente, userId: id, ahora });
  await sembrarTareasDe({ cliente, userId: id, ahora });
  await eventos(contexto, id, [
    { titulo: "Revisar las solicitudes de cuentas", dias: 0, hora: "09:00" },
    { titulo: "Reunión de equipo", dias: -1, hora: "10:00", notas: "Llevar el informe del mes" },
    { titulo: "Asado en lo de Diego", dias: -4, hora: "13:00" },
    { titulo: "Feriado", dias: -10 },
    { titulo: "Charla de seguridad informática", dias: 6, hora: "18:30" },
  ]);
  return id;
}

/** 2. La cuenta con un año de uso. Devuelve su id. */
export async function sembrarCuentaConUnAnio(
  contexto: ContextoDeSiembra,
  adminId: string,
): Promise<string> {
  const { cliente, ahora } = contexto;
  const id = await crearCuenta(contexto, CUENTA_CON_UN_ANIO, {
    altaHace: 366,
    estado: ESTADOS_CUENTA.aprobado,
    estadoHace: 365,
  });
  await auditar(contexto, adminId, ACCIONES_AUDITORIA.cuentaAprobada, id, 365);
  await conexion(contexto, id, 0, 2);

  await sembrarFinanzasDe({ cliente, userId: id, ahora, periodos: 12, semilla: 1985 });
  await sembrarContactosDeUnAnio({ cliente, userId: id, ahora });
  await sembrarTareasDe({ cliente, userId: id, ahora, diasDeHistorial: 360 });
  await eventos(contexto, id, [
    { titulo: "Vacaciones en Florianópolis", dias: 250, notas: "Vuelo a las 7:40" },
    { titulo: "Mudanza", dias: 180, hora: "08:00", notas: "Pedir el flete con tiempo" },
    { titulo: "Recital en el Antel Arena", dias: 100, hora: "21:00" },
    { titulo: "Examen de inglés", dias: 45, hora: "09:00" },
    { titulo: "Partido de Uruguay", dias: -8, hora: "20:00" },
    { titulo: "Fin de semana en Colonia", dias: -19 },
  ]);
  return id;
}

/** 3. La cuenta vacía: aprobada hace poco y sin ningún dato propio. Devuelve su id. */
export async function sembrarCuentaVacia(
  contexto: ContextoDeSiembra,
  adminId: string,
): Promise<string> {
  const id = await crearCuenta(contexto, CUENTA_VACIA, {
    altaHace: 3,
    estado: ESTADOS_CUENTA.aprobado,
    estadoHace: 2,
  });
  await auditar(contexto, adminId, ACCIONES_AUDITORIA.cuentaAprobada, id, 2);
  return id;
}

/** Una cuenta más para el panel de admin: quién es y qué le pasó. */
type CuentaDelPanel = {
  usuario: string;
  nombre: string;
  apellido: string;
  altaHace: number;
  correoConfirmado?: boolean;
  /** Lo que hizo el admin con ella, en orden; el último deja su estado actual. */
  historia: (
    | { accion: "aprobar" | "rechazar" | "desbloquear" | "resetear"; dias: number }
    | { accion: "bloquear"; dias: number; motivo: string }
  )[];
  /** Hace cuántos días se conectó por última vez (sin esto, nunca). */
  conexionHace?: number;
};

const CUENTAS_DEL_PANEL: CuentaDelPanel[] = [
  // Solicitudes pendientes, de distinta antigüedad; una sin el correo confirmado.
  { usuario: "bruno.martinez", nombre: "Bruno", apellido: "Martínez", altaHace: 1, historia: [] },
  { usuario: "carolina.diaz", nombre: "Carolina", apellido: "Díaz", altaHace: 6, historia: [] },
  { usuario: "ana.benitez", nombre: "Ana", apellido: "Benítez", altaHace: 12, historia: [] },
  {
    usuario: "tomas.ferreira",
    nombre: "Tomás",
    apellido: "Ferreira",
    altaHace: 2,
    correoConfirmado: false,
    historia: [],
  },
  // Aprobadas y en uso.
  {
    usuario: "carla.gomez",
    nombre: "Carla",
    apellido: "Gómez",
    altaHace: 330,
    historia: [{ accion: "aprobar", dias: 329 }],
    conexionHace: 3,
  },
  {
    usuario: "martin.suarez",
    nombre: "Martín",
    apellido: "Suárez",
    altaHace: 120,
    historia: [{ accion: "aprobar", dias: 119 }],
    conexionHace: 20,
  },
  // Rechazada y, más tarde, aprobada (se la conoció después).
  {
    usuario: "nicolas.pereira",
    nombre: "Nicolás",
    apellido: "Pereira",
    altaHace: 200,
    historia: [
      { accion: "rechazar", dias: 199 },
      { accion: "aprobar", dias: 150 },
    ],
    conexionHace: 1,
  },
  // Rechazadas.
  {
    usuario: "promo.ofertas",
    nombre: "Promo",
    apellido: "Ofertas",
    altaHace: 240,
    historia: [{ accion: "rechazar", dias: 240 }],
  },
  {
    usuario: "elena.ruiz",
    nombre: "Elena",
    apellido: "Ruiz",
    altaHace: 60,
    historia: [{ accion: "rechazar", dias: 58 }],
  },
  // Bloqueada.
  {
    usuario: "franco.acosta",
    nombre: "Franco",
    apellido: "Acosta",
    altaHace: 210,
    historia: [
      { accion: "aprobar", dias: 209 },
      { accion: "bloquear", dias: 30, motivo: "Compartía la cuenta con otras personas" },
    ],
    conexionHace: 31,
  },
  // Bloqueada y desbloqueada después de aclararlo.
  {
    usuario: "paula.vera",
    nombre: "Paula",
    apellido: "Vera",
    altaHace: 180,
    historia: [
      { accion: "aprobar", dias: 179 },
      { accion: "bloquear", dias: 90, motivo: "Intentos de ingreso desde otro país" },
      { accion: "desbloquear", dias: 85 },
    ],
    conexionHace: 4,
  },
  // Con la contraseña reseteada hace poco: tiene que cambiarla al entrar.
  {
    usuario: "gabriela.lopez",
    nombre: "Gabriela",
    apellido: "López",
    altaHace: 150,
    historia: [
      { accion: "aprobar", dias: 149 },
      { accion: "resetear", dias: 3 },
    ],
    conexionHace: 10,
  },
];

/** Las demás cuentas, para que el panel de admin tenga de todo. Devuelve cuántas creó. */
export async function sembrarCuentasDelPanel(
  contexto: ContextoDeSiembra,
  adminId: string,
): Promise<number> {
  const { cliente } = contexto;
  let creadas = 0;
  for (const cuenta of CUENTAS_DEL_PANEL) {
    const datos: DatosDeCuenta = {
      usuario: cuenta.usuario,
      nombre: cuenta.nombre,
      apellido: cuenta.apellido,
      email: `${cuenta.usuario}@ejemplo.test`,
      password: PASSWORD_DE_LAS_OTRAS_CUENTAS,
    };
    if (await existeCuenta(cliente, datos)) continue;

    // El estado final sale de la última aprobación o rechazo.
    const decisiones = cuenta.historia.filter(
      (paso) => paso.accion === "aprobar" || paso.accion === "rechazar",
    );
    const ultima = decisiones.at(-1);
    const estado =
      ultima?.accion === "aprobar"
        ? ESTADOS_CUENTA.aprobado
        : ultima?.accion === "rechazar"
          ? ESTADOS_CUENTA.rechazado
          : ESTADOS_CUENTA.pendiente;
    const id = await crearCuenta(contexto, datos, {
      altaHace: cuenta.altaHace,
      estado,
      ...(ultima ? { estadoHace: ultima.dias } : {}),
      correoConfirmado: cuenta.correoConfirmado ?? true,
    });

    for (const paso of cuenta.historia) {
      switch (paso.accion) {
        case "aprobar":
          await auditar(contexto, adminId, ACCIONES_AUDITORIA.cuentaAprobada, id, paso.dias);
          break;
        case "rechazar":
          await auditar(contexto, adminId, ACCIONES_AUDITORIA.cuentaRechazada, id, paso.dias);
          break;
        case "bloquear":
          await cliente.db
            .update(esquema.usuarios)
            .set({ banned: true, banReason: paso.motivo })
            .where(eq(esquema.usuarios.id, id));
          await auditar(
            contexto,
            adminId,
            ACCIONES_AUDITORIA.cuentaBloqueada,
            id,
            paso.dias,
            paso.motivo,
          );
          break;
        case "desbloquear":
          await cliente.db
            .update(esquema.usuarios)
            .set({ banned: false, banReason: null })
            .where(eq(esquema.usuarios.id, id));
          await auditar(contexto, adminId, ACCIONES_AUDITORIA.cuentaDesbloqueada, id, paso.dias);
          break;
        case "resetear":
          await cliente.db
            .update(esquema.usuarios)
            .set({ debeCambiarPassword: true })
            .where(eq(esquema.usuarios.id, id));
          await auditar(contexto, adminId, ACCIONES_AUDITORIA.passwordReseteada, id, paso.dias);
          break;
      }
    }
    if (cuenta.conexionHace !== undefined) await conexion(contexto, id, cuenta.conexionHace, 5);
    creadas += 1;
  }
  // El admin también se conectó hace un rato.
  await conexion(contexto, adminId, 0, 1);
  return creadas;
}

/** Carga lo que falte de las cuentas de prueba. Cada cuenta que ya existe se deja como está. */
export async function sembrarCuentasDePrueba(contexto: ContextoDeSiembra): Promise<void> {
  const { cliente } = contexto;

  let adminId: string;
  const adminExistente = await buscarCuenta(cliente, CUENTA_ADMIN.usuario);
  if (adminExistente) {
    adminId = adminExistente.id;
    console.log(`- ${CUENTA_ADMIN.usuario}: ya existía, no se toca.`);
  } else {
    adminId = await sembrarAdmin(contexto);
    console.log(`✓ ${CUENTA_ADMIN.usuario}: admin, con datos en todos los módulos.`);
  }

  const otras = await sembrarCuentasDelPanel(contexto, adminId);
  console.log(`✓ Panel de admin: ${otras} cuentas nuevas en distintos estados, con su auditoría.`);

  if (await existeCuenta(cliente, CUENTA_CON_UN_ANIO)) {
    console.log(`- ${CUENTA_CON_UN_ANIO.usuario}: ya existía, no se toca.`);
  } else {
    await sembrarCuentaConUnAnio(contexto, adminId);
    console.log(`✓ ${CUENTA_CON_UN_ANIO.usuario}: un año de uso.`);
  }

  if (await existeCuenta(cliente, CUENTA_VACIA)) {
    console.log(`- ${CUENTA_VACIA.usuario}: ya existía, no se toca.`);
  } else {
    await sembrarCuentaVacia(contexto, adminId);
    console.log(`✓ ${CUENTA_VACIA.usuario}: aprobada y vacía.`);
  }
}

// La carga de datos de prueba: las tres cuentas pedidas (iotero, dpaolillo1, dpaolillo2) y las que
// pueblan el panel de admin, contra gestion_test. Se mira que se pueda entrar con cada una, que cada una
// tenga lo que tiene que tener (y la vacía, nada) y que correrla dos veces no duplique nada.

import type { ClienteDb } from "@gestoria/db";
import { esquema } from "@gestoria/db";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { limpiarBase } from "../pruebas/auth-de-prueba.ts";
import { appDePrueba, authDePrueba, clienteDePrueba } from "../pruebas/entorno-de-prueba.ts";
import { listarHistorial } from "../servicios/contactos/historial-de-recordatorios.ts";
import { listarPeriodos } from "../servicios/finanzas/periodos.ts";
import { listarAuditoria } from "../servicios/usuarios/auditoria.ts";
import {
  buscarCuenta,
  buscarPerfilDeCuenta,
  listarCuentasPendientes,
} from "../servicios/usuarios/cuentas.ts";
import {
  CUENTA_ADMIN,
  CUENTA_CON_UN_ANIO,
  CUENTA_VACIA,
  PASSWORD_DE_LAS_OTRAS_CUENTAS,
  sembrarCuentasDePrueba,
} from "./cuentas-de-prueba.ts";

let cliente: ClienteDb;
const AHORA = new Date();
const DIA = 24 * 60 * 60 * 1000;

/** Lo que tiene una cuenta, contado por tabla. */
async function cuantos(
  tabla: "tareas" | "contactos" | "eventosDeCalendario" | "movimientos",
  userId: string,
) {
  const fuente = esquema[tabla];
  const [fila] = await cliente.db
    .select({ total: count() })
    .from(fuente)
    .where(eq(fuente.userId, userId));
  return fila?.total ?? 0;
}

async function idDe(usuario: string): Promise<string> {
  const cuenta = await buscarCuenta(cliente, usuario);
  if (!cuenta) throw new Error(`No se creó ${usuario}`);
  return cuenta.id;
}

beforeAll(async () => {
  cliente = clienteDePrueba();
  await limpiarBase(cliente);
  // Sin internet: la fuente de cotizaciones responde siempre lo mismo (1 dólar = 40 pesos), con la
  // fecha que se le pide.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const fecha = /\d{4}-\d{2}-\d{2}/.exec(String(url))?.[0] ?? AHORA.toISOString().slice(0, 10);
      const cuerpo = { date: fecha, usd: { uyu: 40, ars: 1500, eur: 0.8, brl: 5 } };
      return new Response(JSON.stringify(cuerpo), { status: 200 });
    }),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  await sembrarCuentasDePrueba({ cliente, auth: authDePrueba(cliente), ahora: AHORA });
}, 600_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await limpiarBase(cliente);
  await cliente.cerrar();
});

describe("la carga de datos de prueba", () => {
  it("iotero es admin y tiene datos en todos los módulos", async () => {
    const id = await idDe(CUENTA_ADMIN.usuario);
    const perfil = await buscarPerfilDeCuenta(cliente, id);
    expect(perfil?.rol).toBe("admin");
    expect(perfil?.estado).toBe("aprobado");
    expect((await listarPeriodos(cliente, id)).length).toBeGreaterThanOrEqual(6);
    expect(await cuantos("contactos", id)).toBeGreaterThan(5);
    expect(await cuantos("tareas", id)).toBeGreaterThan(20);
    expect(await cuantos("eventosDeCalendario", id)).toBeGreaterThan(0);
  });

  it("el panel de admin tiene solicitudes pendientes, cuentas en cada estado y un año de auditoría", async () => {
    const pendientes = await listarCuentasPendientes(cliente);
    expect(pendientes.length).toBe(4);
    expect(pendientes.some((cuenta) => !cuenta.emailVerificado)).toBe(true);

    const usuarios = await cliente.db.select().from(esquema.usuarios);
    expect(usuarios.filter((u) => u.estado === "rechazado").length).toBeGreaterThanOrEqual(2);
    expect(usuarios.filter((u) => u.banned).length).toBe(1);
    expect(usuarios.filter((u) => u.debeCambiarPassword).length).toBe(1);
    // Las altas se reparten en el tiempo: no "todo pasó hoy".
    const masVieja = Math.min(...usuarios.map((u) => u.createdAt.getTime()));
    expect(AHORA.getTime() - masVieja).toBeGreaterThan(300 * DIA);

    const { entradas } = await listarAuditoria(cliente, { limit: 200 });
    const acciones = new Set(entradas.map((entrada) => entrada.accion));
    expect(acciones).toEqual(
      new Set([
        "cuenta_aprobada",
        "cuenta_rechazada",
        "cuenta_bloqueada",
        "cuenta_desbloqueada",
        "password_reseteada",
      ]),
    );
    expect(entradas.every((entrada) => entrada.admin?.usuario === CUENTA_ADMIN.usuario)).toBe(true);
    const fechas = entradas.map((entrada) => entrada.creadoEn.getTime());
    expect(AHORA.getTime() - Math.min(...fechas)).toBeGreaterThan(300 * DIA);
    expect(Math.max(...fechas)).toBeLessThanOrEqual(AHORA.getTime());

    // La última conexión: dpaolillo1 entró hace un rato; dpaolillo2, nunca.
    const conUso = await buscarPerfilDeCuenta(cliente, await idDe(CUENTA_CON_UN_ANIO.usuario));
    expect(conUso?.ultimaConexion).not.toBeNull();
    const vacia = await buscarPerfilDeCuenta(cliente, await idDe(CUENTA_VACIA.usuario));
    expect(vacia?.ultimaConexion).toBeNull();
  });

  it("dpaolillo1 tiene un año de uso: doce meses de finanzas, un año de tareas y de recordatorios", async () => {
    const id = await idDe(CUENTA_CON_UN_ANIO.usuario);
    const perfil = await buscarPerfilDeCuenta(cliente, id);
    expect(perfil?.rol).toBe("usuario");

    expect((await listarPeriodos(cliente, id)).length).toBe(12);
    expect(await cuantos("movimientos", id)).toBeGreaterThan(300);

    const tareas = await cliente.db
      .select({ dia: esquema.tareas.dia })
      .from(esquema.tareas)
      .where(eq(esquema.tareas.userId, id));
    const primerDia = tareas.map((tarea) => tarea.dia).sort()[0] ?? "";
    expect(AHORA.getTime() - new Date(`${primerDia}T12:00:00Z`).getTime()).toBeGreaterThan(
      330 * DIA,
    );

    // Los recordatorios son fechas puntuales (anuales o de una sola vez), y tienen un año de historia.
    const recordatorios = await cliente.db
      .select({ repeticion: esquema.recordatoriosDeContactos.repeticion })
      .from(esquema.recordatoriosDeContactos)
      .where(eq(esquema.recordatoriosDeContactos.userId, id));
    expect(new Set(recordatorios.map((r) => r.repeticion))).toEqual(new Set(["anual", "unica"]));
    const { entradas } = await listarHistorial(cliente, id, { ahora: AHORA, limit: 500 });
    expect(entradas.length).toBeGreaterThan(10);
    expect(Math.max(...entradas.map((entrada) => entrada.diasAtras))).toBeGreaterThan(250);
    expect(entradas.some((entrada) => entrada.titulo === "Cumpleaños")).toBe(true);

    expect(await cuantos("eventosDeCalendario", id)).toBeGreaterThan(3);
  });

  it("dpaolillo2 está vacía: aprobada, sin datos propios", async () => {
    const id = await idDe(CUENTA_VACIA.usuario);
    const perfil = await buscarPerfilDeCuenta(cliente, id);
    expect(perfil?.estado).toBe("aprobado");
    expect(perfil?.rol).toBe("usuario");
    expect((await listarPeriodos(cliente, id)).length).toBe(0);
    for (const tabla of ["tareas", "contactos", "eventosDeCalendario", "movimientos"] as const) {
      expect(await cuantos(tabla, id), tabla).toBe(0);
    }
  });

  // Al final: entrar deja una sesión, y antes se mira que la cuenta vacía nunca se conectó.
  it("se puede entrar con las tres cuentas pedidas, con sus contraseñas aunque sean cortas", async () => {
    const app = appDePrueba(cliente);
    for (const cuenta of [CUENTA_ADMIN, CUENTA_CON_UN_ANIO, CUENTA_VACIA]) {
      const respuesta = await app.request("/api/auth/sign-in/username", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ username: cuenta.usuario, password: cuenta.password }),
      });
      expect(respuesta.status, cuenta.usuario).toBe(200);
    }
    // Y con otra contraseña, no.
    const mal = await app.request("/api/auth/sign-in/username", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({
        username: CUENTA_ADMIN.usuario,
        password: PASSWORD_DE_LAS_OTRAS_CUENTAS,
      }),
    });
    expect(mal.status).not.toBe(200);
  });

  it("correrla otra vez no duplica nada ni toca lo que ya estaba", async () => {
    const antes = await cliente.db.select({ total: count() }).from(esquema.usuarios);
    const movimientosAntes = await cuantos("movimientos", await idDe(CUENTA_CON_UN_ANIO.usuario));

    await sembrarCuentasDePrueba({ cliente, auth: authDePrueba(cliente), ahora: AHORA });

    const despues = await cliente.db.select({ total: count() }).from(esquema.usuarios);
    expect(despues[0]?.total).toBe(antes[0]?.total);
    expect(await cuantos("movimientos", await idDe(CUENTA_CON_UN_ANIO.usuario))).toBe(
      movimientosAntes,
    );
  });
});

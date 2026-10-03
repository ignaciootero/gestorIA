// Tests de integracion del panel de admin, contra la base gestion_test real.

import type { ClienteDb } from "@gestoria/db";
import { ACCIONES_AUDITORIA, ESTADOS_CUENTA, type RespuestaError, ROLES } from "@gestoria/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RUTA_BASE_AUTH } from "../auth/opciones.ts";
import {
  cookiesDe,
  entrarConUsuario,
  limpiarBase,
  registrarAprobado,
} from "../pruebas/auth-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../pruebas/entorno-de-prueba.ts";
import { registrarAuditoria } from "../servicios/usuarios/auditoria.ts";
import { ascenderAAdmin, buscarCuenta, buscarCuentaPorId } from "../servicios/usuarios/cuentas.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
});

afterAll(async () => {
  await cliente.cerrar();
});

/** Registra, aprueba, asciende a admin y entra. Devuelve las cookies y el id. */
async function entrarComoAdmin(): Promise<{ cookies: string; id: string }> {
  const datos = await registrarAprobado(app, cliente);
  const cuenta = await buscarCuenta(cliente, datos.usuario);
  await ascenderAAdmin(cliente, cuenta?.id ?? "");

  const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);
  return { cookies: cookiesDe(respuesta), id: cuenta?.id ?? "" };
}

/** Registra, aprueba y entra como cuenta común. */
async function entrarComoUsuario(): Promise<{ cookies: string; id: string; password: string }> {
  const datos = await registrarAprobado(app, cliente);
  const cuenta = await buscarCuenta(cliente, datos.usuario);
  const respuesta = await entrarConUsuario(app, datos.usuario, datos.password);
  return { cookies: cookiesDe(respuesta), id: cuenta?.id ?? "", password: datos.password };
}

describe("permisos de /api/admin", () => {
  it("responde 401 sin sesión", async () => {
    const respuesta = await app.request("/api/admin/pendientes");
    expect(respuesta.status).toBe(401);
  });

  it("responde 403 con una cuenta que no es admin", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await app.request("/api/admin/pendientes", { headers: { cookie: cookies } });

    expect(respuesta.status).toBe(403);
    const cuerpo = await leerJson<RespuestaError>(respuesta);
    expect(cuerpo.error.codigo).toBe("SIN_PERMISO");
  });
});

describe("GET /api/admin/pendientes", () => {
  it("lista las cuentas pendientes de aprobación", async () => {
    const { cookies } = await entrarComoAdmin();
    await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });

    const respuesta = await app.request("/api/admin/pendientes", { headers: { cookie: cookies } });

    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<{ cuentas: { estado: string }[] }>(respuesta);
    expect(cuerpo.cuentas).toHaveLength(1);
    expect(cuerpo.cuentas[0]?.estado).toBe(ESTADOS_CUENTA.pendiente);
  });
});

describe("POST /api/admin/cuentas/:id/aprobar y /rechazar", () => {
  it("aprueba una cuenta pendiente y lo deja en la auditoría", async () => {
    const admin = await entrarComoAdmin();
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    const respuesta = await app.request(`/api/admin/cuentas/${cuenta?.id}/aprobar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(200);
    const actualizada = await buscarCuenta(cliente, datos.usuario);
    expect(actualizada?.estado).toBe(ESTADOS_CUENTA.aprobado);

    const auditoria = await app.request("/api/admin/auditoria", {
      headers: { cookie: admin.cookies },
    });
    const cuerpo = await leerJson<{
      entradas: { accion: string; objetivo: { id: string } | null }[];
    }>(auditoria);
    expect(cuerpo.entradas[0]?.accion).toBe("cuenta_aprobada");
    expect(cuerpo.entradas[0]?.objetivo?.id).toBe(cuenta?.id);
  });

  it("rechazar cierra las sesiones abiertas de esa cuenta", async () => {
    const admin = await entrarComoAdmin();
    const usuario = await entrarComoUsuario();

    const respuesta = await app.request(`/api/admin/cuentas/${usuario.id}/rechazar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });
    expect(respuesta.status).toBe(200);

    const sesionSiguio = await app.request("/api/yo", { headers: { cookie: usuario.cookies } });
    expect(sesionSiguio.status).toBe(401);
  });

  it("responde 404 con un id que no existe", async () => {
    const admin = await entrarComoAdmin();

    const respuesta = await app.request("/api/admin/cuentas/no-existe/aprobar", {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(404);
  });

  it("aprobar dos veces no duplica la entrada de auditoría", async () => {
    const admin = await entrarComoAdmin();
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    await app.request(`/api/admin/cuentas/${cuenta?.id}/aprobar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });
    await app.request(`/api/admin/cuentas/${cuenta?.id}/aprobar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    const auditoria = await app.request("/api/admin/auditoria", {
      headers: { cookie: admin.cookies },
    });
    const cuerpo = await leerJson<{ total: number }>(auditoria);
    expect(cuerpo.total).toBe(1);
  });
});

describe("GET /api/admin/cuentas", () => {
  it("pagina y busca por nombre, usuario o correo", async () => {
    const admin = await entrarComoAdmin();
    await registrarAprobado(app, cliente, { usuario: "ana.buscable", nombre: "Ana" });
    // Email explícito: el de la fábrica siempre arranca con "ana." y arruinaría
    // la distinción que este test quiere probar.
    await registrarAprobado(app, cliente, {
      usuario: "otra.persona",
      nombre: "Otra",
      email: "otra.persona@ejemplo.test",
    });

    const respuesta = await app.request("/api/admin/cuentas?busqueda=ana", {
      headers: { cookie: admin.cookies },
    });

    const cuerpo = await leerJson<{ cuentas: { usuario: string | null }[]; total: number }>(
      respuesta,
    );
    expect(cuerpo.cuentas.some((c) => c.usuario === "ana.buscable")).toBe(true);
    expect(cuerpo.cuentas.some((c) => c.usuario === "otra.persona")).toBe(false);
  });

  it("filtra por estado", async () => {
    const admin = await entrarComoAdmin();
    await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });

    const respuesta = await app.request(`/api/admin/cuentas?estado=${ESTADOS_CUENTA.pendiente}`, {
      headers: { cookie: admin.cookies },
    });

    const cuerpo = await leerJson<{ cuentas: { estado: string }[] }>(respuesta);
    expect(cuerpo.cuentas.every((c) => c.estado === ESTADOS_CUENTA.pendiente)).toBe(true);
  });

  it("responde 400 con un límite fuera de rango", async () => {
    const admin = await entrarComoAdmin();

    const respuesta = await app.request("/api/admin/cuentas?limit=1000", {
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(400);
  });
});

describe("GET /api/admin/cuentas/:id", () => {
  it("devuelve el perfil completo de una cuenta", async () => {
    const admin = await entrarComoAdmin();
    const datos = await registrarAprobado(app, cliente, { usuario: "perfil.completo" });
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    const respuesta = await app.request(`/api/admin/cuentas/${cuenta?.id}`, {
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(200);
    const perfil = await leerJson<{
      usuario: string | null;
      email: string;
      zonaHoraria: string;
      monedaPorDefecto: string;
      debeCambiarPassword: boolean;
      bloqueada: boolean;
      ultimaConexion: string | null;
    }>(respuesta);
    expect(perfil.usuario).toBe("perfil.completo");
    expect(perfil.email).toBe(datos.email);
    expect(perfil.zonaHoraria).toBeTruthy();
    expect(perfil.monedaPorDefecto).toBeTruthy();
    expect(perfil.debeCambiarPassword).toBe(false);
    expect(perfil.bloqueada).toBe(false);
    // Todavía no inició sesión: se creó directo en la base, no con /entrar.
    expect(perfil.ultimaConexion).toBeNull();
  });

  it("incluye la última conexión después de iniciar sesión", async () => {
    const admin = await entrarComoAdmin();
    const usuario = await entrarComoUsuario();

    const respuesta = await app.request(`/api/admin/cuentas/${usuario.id}`, {
      headers: { cookie: admin.cookies },
    });

    const perfil = await leerJson<{ ultimaConexion: string | null }>(respuesta);
    expect(perfil.ultimaConexion).not.toBeNull();
  });

  it("responde 404 si la cuenta no existe", async () => {
    const admin = await entrarComoAdmin();

    const respuesta = await app.request("/api/admin/cuentas/no-existe", {
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(404);
  });
});

describe("GET /api/admin/cuentas/:id/auditoria", () => {
  it("devuelve solo las acciones sobre esa cuenta", async () => {
    const admin = await entrarComoAdmin();
    const aAprobar = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const aRechazar = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const cuentaAprobar = await buscarCuenta(cliente, aAprobar.usuario);
    const cuentaRechazar = await buscarCuenta(cliente, aRechazar.usuario);

    await app.request(`/api/admin/cuentas/${cuentaAprobar?.id}/aprobar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });
    await app.request(`/api/admin/cuentas/${cuentaRechazar?.id}/rechazar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    const respuesta = await app.request(`/api/admin/cuentas/${cuentaAprobar?.id}/auditoria`, {
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<{
      entradas: { accion: string; objetivo: { id: string } | null }[];
      total: number;
    }>(respuesta);
    expect(cuerpo.total).toBe(1);
    expect(cuerpo.entradas[0]?.accion).toBe(ACCIONES_AUDITORIA.cuentaAprobada);
    expect(cuerpo.entradas[0]?.objetivo?.id).toBe(cuentaAprobar?.id);
  });

  it("responde 404 si la cuenta no existe", async () => {
    const admin = await entrarComoAdmin();

    const respuesta = await app.request("/api/admin/cuentas/no-existe/auditoria", {
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(404);
  });
});

describe("POST /api/admin/cuentas/:id/resetear-password", () => {
  it("genera una contraseña que funciona, exige cambiarla y cierra sesiones", async () => {
    const admin = await entrarComoAdmin();
    const usuario = await entrarComoUsuario();

    const respuesta = await app.request(`/api/admin/cuentas/${usuario.id}/resetear-password`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<{ passwordTemporal: string }>(respuesta);
    expect(cuerpo.passwordTemporal.length).toBeGreaterThanOrEqual(8);

    // La sesión que ya tenía abierta se cortó.
    const sesionVieja = await app.request("/api/yo", { headers: { cookie: usuario.cookies } });
    expect(sesionVieja.status).toBe(401);

    // La contraseña nueva funciona, y la cuenta queda con cambio obligatorio.
    const cuenta = await buscarCuentaPorId(cliente, usuario.id);
    const entrada = await entrarConUsuario(app, cuenta?.usuario ?? "", cuerpo.passwordTemporal);
    expect(entrada.status).toBe(200);

    const fila = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.id, usuario.id),
    });
    expect(fila?.debeCambiarPassword).toBe(true);

    const auditoria = await app.request("/api/admin/auditoria", {
      headers: { cookie: admin.cookies },
    });
    const cuerpoAuditoria = await leerJson<{ entradas: { accion: string }[] }>(auditoria);
    expect(cuerpoAuditoria.entradas[0]?.accion).toBe("password_reseteada");
  });

  it("un admin no puede resetearse la contraseña a sí mismo desde acá", async () => {
    const admin = await entrarComoAdmin();

    const respuesta = await app.request(`/api/admin/cuentas/${admin.id}/resetear-password`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(400);
  });
});

describe("bloquear y desbloquear (rutas de Better Auth, auditadas por el hook)", () => {
  it("bloquear queda en la auditoría con el motivo", async () => {
    const admin = await entrarComoAdmin();
    const usuario = await entrarComoUsuario();

    const respuesta = await app.request(`${RUTA_BASE_AUTH}/admin/ban-user`, {
      method: "POST",
      headers: { cookie: admin.cookies, "content-type": "application/json" },
      body: JSON.stringify({ userId: usuario.id, banReason: "prueba de auditoría" }),
    });
    expect(respuesta.status).toBe(200);

    const auditoria = await app.request("/api/admin/auditoria", {
      headers: { cookie: admin.cookies },
    });
    const cuerpo = await leerJson<{ entradas: { accion: string; detalle: string | null }[] }>(
      auditoria,
    );
    expect(cuerpo.entradas[0]?.accion).toBe("cuenta_bloqueada");
    expect(cuerpo.entradas[0]?.detalle).toBe("prueba de auditoría");
  });

  it("desbloquear también queda en la auditoría", async () => {
    const admin = await entrarComoAdmin();
    const usuario = await entrarComoUsuario();

    await app.request(`${RUTA_BASE_AUTH}/admin/ban-user`, {
      method: "POST",
      headers: { cookie: admin.cookies, "content-type": "application/json" },
      body: JSON.stringify({ userId: usuario.id }),
    });
    const respuesta = await app.request(`${RUTA_BASE_AUTH}/admin/unban-user`, {
      method: "POST",
      headers: { cookie: admin.cookies, "content-type": "application/json" },
      body: JSON.stringify({ userId: usuario.id }),
    });
    expect(respuesta.status).toBe(200);

    const auditoria = await app.request("/api/admin/auditoria", {
      headers: { cookie: admin.cookies },
    });
    const cuerpo = await leerJson<{ entradas: { accion: string }[] }>(auditoria);
    expect(cuerpo.entradas[0]?.accion).toBe("cuenta_desbloqueada");
  });

  it("un intento de bloqueo fallido (auto-bloqueo) no queda en la auditoría", async () => {
    const admin = await entrarComoAdmin();

    const respuesta = await app.request(`${RUTA_BASE_AUTH}/admin/ban-user`, {
      method: "POST",
      headers: { cookie: admin.cookies, "content-type": "application/json" },
      body: JSON.stringify({ userId: admin.id }),
    });
    expect(respuesta.status).toBeGreaterThanOrEqual(400);

    const auditoria = await app.request("/api/admin/auditoria", {
      headers: { cookie: admin.cookies },
    });
    const cuerpo = await leerJson<{ total: number }>(auditoria);
    expect(cuerpo.total).toBe(0);
  });
});

describe("GET /api/admin/auditoria", () => {
  it("resuelve quién hizo la acción y a quién apuntó", async () => {
    const admin = await entrarComoAdmin();
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    await app.request(`/api/admin/cuentas/${cuenta?.id}/aprobar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    const respuesta = await app.request("/api/admin/auditoria", {
      headers: { cookie: admin.cookies },
    });
    const cuerpo = await leerJson<{
      entradas: { admin: { id: string } | null; objetivo: { usuario: string | null } | null }[];
    }>(respuesta);

    expect(cuerpo.entradas[0]?.admin?.id).toBe(admin.id);
    expect(cuerpo.entradas[0]?.objetivo?.usuario).toBe(datos.usuario);
  });

  it("una acción sin admin (aprobada por consola, con pnpm usuario:aprobar) queda con admin null", async () => {
    const admin = await entrarComoAdmin();
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    // El script no tiene sesión de admin: así queda su auditoría, sin
    // pasar por la ruta HTTP (que siempre exige sesión).
    await registrarAuditoria(cliente, {
      adminId: null,
      accion: ACCIONES_AUDITORIA.cuentaAprobada,
      objetivoId: cuenta?.id ?? null,
    });

    const respuesta = await app.request("/api/admin/auditoria", {
      headers: { cookie: admin.cookies },
    });
    const cuerpo = await leerJson<{
      entradas: { admin: { id: string } | null; objetivo: { usuario: string | null } | null }[];
    }>(respuesta);

    expect(cuerpo.entradas[0]?.admin).toBeNull();
    expect(cuerpo.entradas[0]?.objetivo?.usuario).toBe(datos.usuario);
  });

  it("no expone rol de admin a una cuenta común", async () => {
    const { cookies } = await entrarComoUsuario();

    const respuesta = await app.request("/api/admin/auditoria", { headers: { cookie: cookies } });
    expect(respuesta.status).toBe(403);
  });

  it("filtra por tipo de acción", async () => {
    const admin = await entrarComoAdmin();
    const aprobada = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const rechazada = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const cuentaAprobada = await buscarCuenta(cliente, aprobada.usuario);
    const cuentaRechazada = await buscarCuenta(cliente, rechazada.usuario);

    await app.request(`/api/admin/cuentas/${cuentaAprobada?.id}/aprobar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });
    await app.request(`/api/admin/cuentas/${cuentaRechazada?.id}/rechazar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    const respuesta = await app.request(
      `/api/admin/auditoria?accion=${ACCIONES_AUDITORIA.cuentaRechazada}`,
      { headers: { cookie: admin.cookies } },
    );
    const cuerpo = await leerJson<{
      entradas: { accion: string; objetivo: { usuario: string | null } | null }[];
      total: number;
    }>(respuesta);

    expect(cuerpo.total).toBe(1);
    expect(cuerpo.entradas[0]?.accion).toBe(ACCIONES_AUDITORIA.cuentaRechazada);
    expect(cuerpo.entradas[0]?.objetivo?.usuario).toBe(rechazada.usuario);
  });

  it("filtra por rango de fechas", async () => {
    const admin = await entrarComoAdmin();
    const datos = await registrarAprobado(app, cliente, { estado: ESTADOS_CUENTA.pendiente });
    const cuenta = await buscarCuenta(cliente, datos.usuario);

    await app.request(`/api/admin/cuentas/${cuenta?.id}/aprobar`, {
      method: "POST",
      headers: { cookie: admin.cookies },
    });

    const hoy = new Date().toISOString().slice(0, 10);
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const dentroDelRango = await app.request(`/api/admin/auditoria?desde=${hoy}&hasta=${hoy}`, {
      headers: { cookie: admin.cookies },
    });
    const cuerpoDentro = await leerJson<{ total: number }>(dentroDelRango);
    expect(cuerpoDentro.total).toBe(1);

    // Un "desde" en el futuro no puede traer nada de hoy.
    const fueraDelRango = await app.request(`/api/admin/auditoria?desde=${manana}`, {
      headers: { cookie: admin.cookies },
    });
    const cuerpoFuera = await leerJson<{ total: number }>(fueraDelRango);
    expect(cuerpoFuera.total).toBe(0);
  });

  it("responde 400 con una fecha en formato inválido", async () => {
    const admin = await entrarComoAdmin();

    const respuesta = await app.request("/api/admin/auditoria?desde=no-es-una-fecha", {
      headers: { cookie: admin.cookies },
    });

    expect(respuesta.status).toBe(400);
  });
});

describe("consistencia de roles", () => {
  it("ascenderAAdmin deja la cuenta con rol admin", async () => {
    const admin = await entrarComoAdmin();
    const cuenta = await cliente.db.query.usuarios.findFirst({
      where: (tabla, { eq }) => eq(tabla.id, admin.id),
    });
    expect(cuenta?.role).toBe(ROLES.admin);
  });
});

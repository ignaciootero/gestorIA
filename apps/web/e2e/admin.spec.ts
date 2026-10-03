// Tests end-to-end del panel de admin, en un navegador real.
//
// Prueban lo que la persona ve y hace; las reglas de negocio (a quién se le
// puede resetear la contraseña, qué queda en la auditoría, etc.) ya están
// cubiertas por los tests de integración de apps/api.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { type CuentaDePrueba, crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

test.beforeEach(async () => {
  await limpiarBaseDePruebas();
});

async function entrar(pagina: Page, cuenta: CuentaDePrueba): Promise<void> {
  await pagina.goto("/ingresar");
  await pagina.getByLabel("Usuario o correo").fill(cuenta.usuario);
  await pagina.getByLabel("Contraseña").fill(cuenta.password);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).toHaveURL(/\/inicio$/);
}

test.describe("acceso al panel", () => {
  test("una cuenta común no ve el enlace y no puede entrar a /admin", async ({ page }) => {
    const usuario = await crearCuentaAprobada();
    await entrar(page, usuario);

    await expect(page.getByRole("link", { name: "Administración" })).toBeHidden();

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/inicio$/);
  });

  test("un admin ve el enlace y puede entrar", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    await entrar(page, admin);

    await page.getByRole("link", { name: "Administración" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Menú de administración" })).toBeVisible();
  });

  test("sin sesión, /admin lleva a ingresar", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});

test.describe("solicitudes pendientes", () => {
  test("aprobar saca a la cuenta de la lista", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const pendiente = await crearCuentaAprobada({ estado: "pendiente" });
    await entrar(page, admin);
    await page.goto("/admin");

    await expect(page.getByText(pendiente.email)).toBeVisible();
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText(pendiente.email)).toBeHidden();

    // La cuenta aprobada ahora puede entrar.
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
    await entrar(page, pendiente);

    // El Navbar vive en el layout raíz y no se desmonta al navegar: es la
    // MISMA instancia que ya salió una vez (la del admin). Sin resetear su
    // estado de carga, el botón queda trabado en "Saliendo…" para cualquiera
    // que entre después, sin haberlo tocado siquiera.
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test("rechazar pide confirmación antes de aplicarse", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const pendiente = await crearCuentaAprobada({ estado: "pendiente" });
    await entrar(page, admin);
    await page.goto("/admin");

    await page.getByRole("button", { name: "Rechazar" }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo.getByText(pendiente.email)).toBeVisible();

    // Cancelar no cambia nada. Se espera a que el diálogo termine de cerrarse
    // (anima la salida y durante eso sigue mostrando el correo) antes de
    // volver a buscarlo por texto, si no "getByText(email)" apunta a los dos
    // a la vez.
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText(pendiente.email)).toBeVisible();

    await page.getByRole("button", { name: "Rechazar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Rechazar" }).click();
    // Primero se cierra el diálogo (que también menciona el correo en su
    // texto): recién ahí "getByText(email)" vuelve a apuntar a un solo lugar.
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText(pendiente.email)).toBeHidden();
  });

  test("sin solicitudes pendientes muestra el estado vacío", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    await entrar(page, admin);
    await page.goto("/admin");

    await expect(page.getByText("No hay solicitudes pendientes.")).toBeVisible();
  });

  test("busca por usuario entre las solicitudes", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const pendienteA = await crearCuentaAprobada({ estado: "pendiente" });
    const pendienteB = await crearCuentaAprobada({ estado: "pendiente" });
    await entrar(page, admin);
    await page.goto("/admin");

    await expect(page.getByText(pendienteB.email)).toBeVisible();

    await page.getByLabel("Buscar").fill(pendienteA.usuario);
    await expect(page.getByText(pendienteA.email)).toBeVisible();
    await expect(page.getByText(pendienteB.email)).toBeHidden();

    await page.getByLabel("Buscar").fill("no-existe-ninguna-cuenta-asi");
    await expect(page.getByText("Ninguna solicitud coincide con la búsqueda.")).toBeVisible();
  });
});

test.describe("listado de cuentas", () => {
  test("busca por usuario y filtra por estado", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const pendiente = await crearCuentaAprobada({ estado: "pendiente" });
    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByLabel("Buscar").fill(pendiente.usuario);
    await expect(page.getByText(pendiente.email)).toBeVisible();

    await page.getByLabel("Buscar").fill("");
    // El filtro de estado angosta la misma lista, no muestra paneles propios:
    // por eso es un radiogroup, no pestañas (docs/guias/estetica.md, Colores).
    await page.getByRole("radio", { name: "Pendientes" }).click();
    await expect(page.getByText(pendiente.email)).toBeVisible();

    await page.getByRole("radio", { name: "Rechazadas" }).click();
    await expect(page.getByText(pendiente.email)).toBeHidden();
  });

  test("la propia cuenta no tiene botones de acción", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByLabel("Buscar").fill(admin.usuario);
    await expect(page.getByText("Esta es tu cuenta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Bloquear" })).toBeHidden();
  });

  test("bloquear cierra la sesión de esa cuenta y la desbloquea después", async ({
    page,
    browser,
  }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const usuario = await crearCuentaAprobada();

    // Una segunda pestaña con la sesión de la cuenta que se va a bloquear.
    const paginaUsuario = await (await browser.newContext()).newPage();
    await entrar(paginaUsuario, usuario);

    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByLabel("Buscar").fill(usuario.usuario);

    await page.getByRole("button", { name: "Bloquear" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Motivo (opcional)").fill("prueba e2e");
    await dialogo.getByRole("button", { name: "Bloquear" }).click();
    // El diálogo (que también tiene su propio botón "Bloquear") se cierra
    // primero: recién ahí el rol vuelve a apuntar a un solo botón.
    await expect(page.getByRole("dialog")).toBeHidden();
    // "exact" hace falta: por defecto el nombre accesible matchea por
    // substring, y "Bloquear" está contenido en "Desbloquear".
    await expect(page.getByRole("button", { name: "Bloquear", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Desbloquear" })).toBeVisible();
    await expect(page.getByText("Bloqueada", { exact: true })).toBeVisible();
    await expect(page.getByText("Motivo: prueba e2e")).toBeVisible();

    // La sesión que ya tenía abierta deja de funcionar. El proxy solo mira si
    // hay cookie (por eso sigue viendo /inicio), pero la API rechaza la
    // sesión revocada y la pantalla lo muestra como error, no como redirección
    // automática (apps/web/src/componentes/inicio/panel-de-inicio.tsx).
    await paginaUsuario.goto("/inicio");
    await expect(paginaUsuario.getByText("No pudimos cargar tus datos")).toBeVisible();

    await page.getByRole("button", { name: "Desbloquear" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Desbloquear" }).click();
    await expect(page.getByRole("button", { name: "Bloquear", exact: true })).toBeVisible();
    await expect(page.getByText(/Bloqueada/)).toBeHidden();

    await paginaUsuario.context().close();
  });

  test("resetear contraseña muestra una temporal que funciona", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const usuario = await crearCuentaAprobada();
    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByLabel("Buscar").fill(usuario.usuario);

    await page.getByRole("button", { name: "Resetear contraseña" }).click();
    await page.getByRole("button", { name: "Generar contraseña" }).click();

    // Acotado al diálogo: el overlay de errores de Next en desarrollo también
    // puede meter un <code> propio en la página.
    const temporal = await page.getByRole("dialog").locator("code").innerText();
    expect(temporal.length).toBeGreaterThanOrEqual(8);
    await page.getByRole("button", { name: "Listo" }).click();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
    await page.getByLabel("Usuario o correo").fill(usuario.usuario);
    await page.getByLabel("Contraseña").fill(temporal);
    await page.getByRole("button", { name: "Entrar" }).click();

    // Con debeCambiarPassword prendido, cae en la pantalla de cambio, no en inicio.
    await expect(page).toHaveURL(/\/cambiar-password$/);
  });
});

test.describe("perfil de cuenta", () => {
  test("se llega tocando el nombre en el listado y muestra sus datos", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const usuario = await crearCuentaAprobada();
    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Cuentas" }).click();
    // Los dos nombres son "Ana Pérez" por defecto, así que el enlace se busca
    // acotado a la fila con ese correo (único), no por nombre.
    const fila = page
      .getByText(usuario.email)
      .locator("xpath=ancestor::*[contains(@class,'group')]");
    await fila.getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/cuentas\/.+/);
    await expect(page.getByRole("heading", { name: usuario.nombre })).toBeVisible();
    await expect(page.getByText(usuario.email)).toBeVisible();
    await expect(page.getByText(`@${usuario.usuario}`)).toBeVisible();
    await expect(page.getByText("Aprobada", { exact: true })).toBeVisible();
    // Nunca inició sesión: la última conexión no tiene valor.
    await expect(page.getByText("Última conexión")).toBeVisible();
  });

  test("muestra el historial de acciones sobre esa cuenta, sin repetir su nombre", async ({
    page,
  }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const usuario = await crearCuentaAprobada();
    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Cuentas" }).click();
    const fila = page
      .getByText(usuario.email)
      .locator("xpath=ancestor::*[contains(@class,'group')]");
    await fila.hover();
    await fila.getByRole("button", { name: "Bloquear" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByLabel("Motivo (opcional)").fill("prueba e2e");
    await dialogo.getByRole("button", { name: "Bloquear" }).click();
    await expect(dialogo).toBeHidden();

    await fila.getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/cuentas\/.+/);

    await expect(page.getByText("Bloqueada", { exact: true })).toBeVisible();
    // Aparece dos veces (debajo del nombre y en la fila del historial): alcanza
    // con que exista, no hace falta que sea la única coincidencia.
    await expect(page.getByText("Motivo: prueba e2e").first()).toBeVisible();
    await expect(page.getByText(new RegExp(`${admin.usuario} bloqueó esta cuenta`))).toBeVisible();
  });

  test("una cuenta común no puede entrar al perfil de otra", async ({ page }) => {
    const comun = await crearCuentaAprobada();
    await entrar(page, comun);

    await page.goto("/admin/cuentas/cualquier-id");
    await expect(page).toHaveURL(/\/inicio$/);
  });
});

test.describe("auditoría", () => {
  test("una acción del panel queda registrada", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const pendiente = await crearCuentaAprobada({ estado: "pendiente" });
    await entrar(page, admin);
    await page.goto("/admin");

    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText(pendiente.email)).toBeHidden();

    await page.getByRole("tab", { name: "Auditoría" }).click();
    await expect(
      page.getByText(new RegExp(`aprobó la cuenta de.*${pendiente.usuario}`)),
    ).toBeVisible();
  });

  test("sin acciones todavía muestra el estado vacío", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Auditoría" }).click();

    await expect(page.getByText("Todavía no hay acciones registradas.")).toBeVisible();
  });

  test("filtra por tipo de acción y por fecha", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const aAprobar = await crearCuentaAprobada({ estado: "pendiente" });
    const aRechazar = await crearCuentaAprobada({ estado: "pendiente" });
    await entrar(page, admin);
    await page.goto("/admin");

    // Se busca cada cuenta antes de actuar, para que quede una sola fila
    // visible y el botón no sea ambiguo entre las dos solicitudes. Se espera
    // a que la otra fila termine de salir (la lista anima la salida) antes de
    // clickear, si no quedan dos botones con el mismo nombre un instante.
    await page.getByLabel("Buscar").fill(aRechazar.usuario);
    await expect(page.getByText(aAprobar.email)).toBeHidden();
    await page.getByRole("button", { name: "Rechazar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Rechazar" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByLabel("Buscar").fill(aAprobar.usuario);
    await expect(page.getByText(aRechazar.email)).toBeHidden();
    await page.getByRole("button", { name: "Aprobar" }).click();
    await expect(page.getByText(aAprobar.email)).toBeHidden();

    await page.getByRole("tab", { name: "Auditoría" }).click();
    await expect(page.getByText(new RegExp(aAprobar.usuario))).toBeVisible();
    await expect(page.getByText(new RegExp(aRechazar.usuario))).toBeVisible();

    await page.getByLabel("Tipo de acción").selectOption("cuenta_rechazada");
    await expect(page.getByText(new RegExp(aRechazar.usuario))).toBeVisible();
    await expect(page.getByText(new RegExp(aAprobar.usuario))).toBeHidden();
    await page.getByLabel("Tipo de acción").selectOption("");

    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel("Desde").fill(manana);
    await expect(page.getByText("Ninguna acción coincide con el filtro.")).toBeVisible();
  });
});

test.describe("accesibilidad", () => {
  test("el panel no tiene violaciones, en los dos temas", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    await crearCuentaAprobada({ estado: "pendiente" });
    await entrar(page, admin);
    await page.goto("/admin");

    const claro = await new AxeBuilder({ page }).analyze();
    expect(claro.violations).toEqual([]);

    await page.getByRole("radio", { name: "Tema oscuro" }).click();
    // Los colores cambian con una transición corta; sin esperarla, axe puede
    // escanear a mitad de camino y medir un contraste que ya no es real.
    await page.waitForTimeout(300);
    const oscuro = await new AxeBuilder({ page }).analyze();
    expect(oscuro.violations).toEqual([]);
  });

  test("la pestaña de cuentas y el diálogo de bloqueo no tienen violaciones", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    await crearCuentaAprobada();
    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByRole("button", { name: "Bloquear" }).click();
    // El diálogo funde su entrada; sin esperarla, axe puede escanearlo a
    // mitad de camino y medir un contraste que todavía no es el real.
    await page.waitForTimeout(300);

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("el perfil de una cuenta no tiene violaciones", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    const usuario = await crearCuentaAprobada();
    await entrar(page, admin);
    await page.goto("/admin");
    await page.getByRole("tab", { name: "Cuentas" }).click();
    const fila = page
      .getByText(usuario.email)
      .locator("xpath=ancestor::*[contains(@class,'group')]");
    await fila.getByRole("link").click();
    await expect(page).toHaveURL(/\/admin\/cuentas\/.+/);

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });
});

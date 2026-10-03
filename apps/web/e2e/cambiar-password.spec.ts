// Tests end-to-end del cambio de contraseña obligatorio, en un navegador real.
//
// Es lo que le pasa a una cuenta recién reseteada por un admin (paso 5): entra
// con la contraseña temporal y no puede hacer nada más hasta cambiarla.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

test.beforeEach(async () => {
  await limpiarBaseDePruebas();
});

async function entrar(pagina: Page, identificador: string, password: string): Promise<void> {
  await pagina.getByLabel("Usuario o correo").fill(identificador);
  await pagina.getByLabel("Contraseña").fill(password);
  await pagina.getByRole("button", { name: "Entrar" }).click();
}

test.describe("cambio de contraseña obligatorio", () => {
  test("una cuenta marcada es llevada a cambiar la contraseña en vez de a inicio", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada({ debeCambiarPassword: true });

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);

    await expect(page).toHaveURL(/\/cambiar-password$/);
    await expect(page.getByRole("heading", { name: "Cambiá tu contraseña" })).toBeVisible();
  });

  test("con la contraseña actual equivocada, el error aparece junto al campo", async ({ page }) => {
    const cuenta = await crearCuentaAprobada({ debeCambiarPassword: true });

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);
    await expect(page).toHaveURL(/\/cambiar-password$/);

    await page.getByLabel("Contraseña actual").fill("no-es-la-actual");
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("otra-contraseña-nueva");
    await page.getByLabel("Repetí la contraseña nueva").fill("otra-contraseña-nueva");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();

    await expect(page.getByText("Tu contraseña actual no es correcta.")).toBeVisible();
    // No pierde lo escrito ni redirige: sigue en la misma pantalla.
    await expect(page).toHaveURL(/\/cambiar-password$/);
  });

  test("valida que las dos contraseñas nuevas coincidan", async ({ page }) => {
    const cuenta = await crearCuentaAprobada({ debeCambiarPassword: true });

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);
    await expect(page).toHaveURL(/\/cambiar-password$/);

    await page.getByLabel("Contraseña actual").fill(cuenta.password);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("otra-contraseña-nueva");
    await page.getByLabel("Repetí la contraseña nueva").fill("no-coincide");
    // Dispara la validación al salir del campo.
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();

    await expect(page.getByText("Las dos contraseñas no coinciden.")).toBeVisible();
  });

  test("al cambiarla con éxito, lleva a inicio y ya no vuelve a pedirla", async ({ page }) => {
    const cuenta = await crearCuentaAprobada({ debeCambiarPassword: true });

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);
    await expect(page).toHaveURL(/\/cambiar-password$/);

    await page.getByLabel("Contraseña actual").fill(cuenta.password);
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("otra-contraseña-nueva");
    await page.getByLabel("Repetí la contraseña nueva").fill("otra-contraseña-nueva");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();

    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole("heading", { name: `Hola, ${cuenta.nombre}` })).toBeVisible();

    // Recargar (o volver a /inicio) no debería mandar de nuevo a cambiarla.
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/inicio$/);
  });

  test("la pantalla de cambio de contraseña no tiene violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada({ debeCambiarPassword: true });

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);
    await expect(page).toHaveURL(/\/cambiar-password$/);

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });
});

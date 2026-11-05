// Color de acento elegido por la persona: uno por modo, guardado en la cuenta.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { type CuentaDePrueba, crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

/** El verde agua de la app (tokens.css). */
const ORIGINAL = { claro: "#0f766e", oscuro: "#0d9488" };

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

/** El valor de --color-acento que está usando la página. */
function acento(pagina: Page): Promise<string> {
  return pagina.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-acento").trim(),
  );
}

/** Espera a que se guarde en la cuenta (el selector guarda un rato después del último cambio). */
async function esperarGuardado(pagina: Page): Promise<void> {
  await pagina.waitForResponse(
    (respuesta) => respuesta.url().endsWith("/api/yo/colores") && respuesta.ok(),
  );
}

test.describe("color de acento", () => {
  test("sin sesión no hay selector de color", async ({ page }) => {
    await page.goto("/ingresar");
    await expect(page.getByRole("radio", { name: "Tema oscuro" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Color de la app" })).toHaveCount(0);
  });

  test("se elige un color por modo, se guarda en la cuenta y se vuelve al original", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    expect(await acento(page)).toBe(ORIGINAL.claro);

    await page.getByRole("button", { name: "Color de la app" }).click();
    const dialogo = page.getByRole("dialog", { name: "Color de la app" });
    await expect(dialogo).toBeVisible();
    // Solo el tono del modo que se está viendo, y todavía el original.
    await expect(dialogo).toContainText("Seleccioná el tono para el modo claro.");
    await expect(dialogo.getByLabel("Tono del modo oscuro")).toHaveCount(0);
    await expect(dialogo.getByText("Original", { exact: true })).toBeVisible();

    // Un violeta que ya se lee bien con texto blanco: se usa tal cual, al instante.
    const guardado = esperarGuardado(page);
    await dialogo.getByLabel("Tono del modo claro").fill("#7c3aed");
    await expect.poll(() => acento(page)).toBe("#7c3aed");
    await guardado;

    await expect(dialogo.getByText(/^#7c3aed$/i)).toBeVisible();

    const accesibilidad = await new AxeBuilder({ page }).include("dialog").analyze();
    expect(accesibilidad.violations).toEqual([]);
    await dialogo.getByRole("button", { name: "Listo" }).click();

    // Al recargar sigue, desde el primer pintado (la copia del navegador).
    await page.reload();
    expect(await acento(page)).toBe("#7c3aed");

    // Y en modo oscuro va el de ese modo, que sigue siendo el de la app: el selector muestra ese.
    await page.getByRole("radio", { name: "Tema oscuro" }).click();
    await expect.poll(() => acento(page)).toBe(ORIGINAL.oscuro);
    await page.getByRole("button", { name: "Color de la app" }).click();
    await expect(dialogo).toContainText("Seleccioná el tono para el modo oscuro.");
    await expect(dialogo.getByText("Original", { exact: true })).toBeVisible();
    await dialogo.getByRole("button", { name: "Listo" }).click();

    // Otro navegador (sin copia): lo trae de la cuenta.
    const otra = await page.context().browser()?.newPage();
    if (!otra) throw new Error("No se pudo abrir otra página.");
    await otra.emulateMedia({ colorScheme: "light" });
    await entrar(otra, cuenta);
    await expect.poll(() => acento(otra)).toBe("#7c3aed");
    await otra.close();

    // Restablecer vuelve al original.
    await page.getByRole("radio", { name: "Tema claro" }).click();
    await page.getByRole("button", { name: "Color de la app" }).click();
    const reinicio = esperarGuardado(page);
    await dialogo.getByRole("button", { name: "Restablecer" }).click();
    await reinicio;
    await expect(dialogo.getByText("Original", { exact: true })).toBeVisible();
    await expect.poll(() => acento(page)).toBe(ORIGINAL.claro);
    await page.reload();
    expect(await acento(page)).toBe(ORIGINAL.claro);
  });

  test("un color que no se lee con texto blanco se oscurece, sin cambiar el tono", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await entrar(page, await crearCuentaAprobada());
    await page.getByRole("button", { name: "Color de la app" }).click();
    const dialogo = page.getByRole("dialog", { name: "Color de la app" });

    await dialogo.getByLabel("Tono del modo claro").fill("#fde047");
    await expect.poll(() => acento(page)).not.toBe(ORIGINAL.claro);
    const usado = await acento(page);
    expect(usado).not.toBe("#fde047");
    // Un amarillo más oscuro: el rojo y el verde siguen mandando sobre el azul.
    const canal = (inicio: number) => Number.parseInt(usado.slice(inicio, inicio + 2), 16);
    expect(canal(1)).toBeGreaterThan(canal(5));
    expect(canal(3)).toBeGreaterThan(canal(5));
  });

  test("al salir, la pantalla de ingreso vuelve al color de la app", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await entrar(page, await crearCuentaAprobada());
    await page.getByRole("button", { name: "Color de la app" }).click();
    const guardado = esperarGuardado(page);
    await page.getByLabel("Tono del modo claro").fill("#7c3aed");
    await guardado;
    await page.getByRole("button", { name: "Listo" }).click();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
    await expect.poll(() => acento(page)).toBe(ORIGINAL.claro);
    await page.reload();
    expect(await acento(page)).toBe(ORIGINAL.claro);
  });
});

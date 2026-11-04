// Tests end-to-end de las columnas laterales que se esconden: el menú de navegación
// y los widgets, cada una con su pestaña pegada al borde de la ventana.
//
// La preferencia vive en `localStorage` y se refleja en un atributo de <html>; los
// tests miran lo que ve la persona (la columna desaparece y el resto no se mueve,
// la pestaña cambia de texto) y que se recuerde al recargar y al cambiar de pantalla.

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

/** Dónde está y cuánto mide el contenido principal: no tiene que cambiar al esconder una columna. */
async function cajaDelContenido(pagina: Page) {
  const caja = await pagina.getByRole("main").boundingBox();
  if (!caja) throw new Error("Sin contenido");
  return { x: Math.round(caja.x), y: Math.round(caja.y), ancho: Math.round(caja.width) };
}

/** Lo que tarda en terminar la animación de una columna al esconderse o mostrarse. */
const FIN_DE_LA_ANIMACION_MS = 400;

const menu = (pagina: Page) => pagina.getByRole("navigation", { name: "Navegación principal" });
const widgets = (pagina: Page) => pagina.getByRole("complementary", { name: "Widgets" });
const botonDelMenu = (pagina: Page, nombre: "Ocultar el menú" | "Mostrar el menú") =>
  pagina.getByRole("button", { name: nombre });
const botonDeWidgets = (pagina: Page, nombre: "Ocultar los widgets" | "Mostrar los widgets") =>
  pagina.getByRole("button", { name: nombre });

test.describe("menú de navegación", () => {
  test("se esconde con su pestaña y se puede volver a mostrar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await expect(menu(page)).toBeVisible();
    const pestana = botonDelMenu(page, "Ocultar el menú");
    await expect(pestana).toHaveAttribute("aria-expanded", "true");

    await pestana.click();

    await expect(menu(page)).toBeHidden();
    await expect(botonDelMenu(page, "Mostrar el menú")).toHaveAttribute("aria-expanded", "false");

    await botonDelMenu(page, "Mostrar el menú").click();

    await expect(menu(page)).toBeVisible();
    await expect(botonDelMenu(page, "Ocultar el menú")).toHaveAttribute("aria-expanded", "true");
  });

  test("esconderlo no mueve ni cambia de tamaño nada del resto de la pantalla", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await expect(widgets(page)).toBeVisible();
    const contenido = await cajaDelContenido(page);
    const columnaDeWidgets = await widgets(page).boundingBox();

    await botonDelMenu(page, "Ocultar el menú").click();
    await expect(menu(page)).toBeHidden();
    await page.waitForTimeout(FIN_DE_LA_ANIMACION_MS);

    expect(await cajaDelContenido(page)).toEqual(contenido);
    expect(await widgets(page).boundingBox()).toEqual(columnaDeWidgets);

    await botonDelMenu(page, "Mostrar el menú").click();
    await expect(menu(page)).toBeVisible();
    await page.waitForTimeout(FIN_DE_LA_ANIMACION_MS);
    expect(await cajaDelContenido(page)).toEqual(contenido);
  });

  test("escondido no recibe el foco del teclado ni lo lee un lector de pantalla", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await botonDelMenu(page, "Ocultar el menú").click();
    await expect(menu(page)).toBeHidden();

    await expect(page.getByRole("link", { name: "Finanzas", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toHaveCount(0);
  });

  test("se maneja con el teclado", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());

    await botonDelMenu(page, "Ocultar el menú").focus();
    await page.keyboard.press("Enter");
    await expect(menu(page)).toBeHidden();
    await expect(botonDelMenu(page, "Mostrar el menú")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(menu(page)).toBeVisible();
  });

  test("se recuerda al recargar y al cambiar de pantalla", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await botonDelMenu(page, "Ocultar el menú").click();
    await expect(menu(page)).toBeHidden();

    await page.reload();
    await expect(botonDelMenu(page, "Mostrar el menú")).toBeVisible();
    await expect(menu(page)).toBeHidden();

    await page.goto("/finanzas");
    await expect(page.getByRole("heading", { name: "Finanzas", level: 1 })).toBeVisible();
    await expect(menu(page)).toBeHidden();
    await expect(botonDelMenu(page, "Mostrar el menú")).toBeVisible();
  });

  test("al cargar con el menú escondido nunca se ve abierto, ni un instante", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await botonDelMenu(page, "Ocultar el menú").click();
    await expect(menu(page)).toBeHidden();

    // El atributo que lo esconde está puesto antes de que React haga nada.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { __alCargar: string | null }).__alCargar =
          document.documentElement.getAttribute("data-menu");
      });
    });
    await page.reload();

    expect(
      await page.evaluate(() => (window as unknown as { __alCargar: string }).__alCargar),
    ).toBe("cerrado");
  });
});

test.describe("widgets", () => {
  test("se esconden con su pestaña y se pueden volver a mostrar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await expect(widgets(page)).toBeVisible();
    await expect(botonDeWidgets(page, "Ocultar los widgets")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await botonDeWidgets(page, "Ocultar los widgets").click();

    await expect(widgets(page)).toBeHidden();
    await expect(botonDeWidgets(page, "Mostrar los widgets")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await botonDeWidgets(page, "Mostrar los widgets").click();

    await expect(widgets(page)).toBeVisible();
  });

  test("esconderlos no mueve ni cambia de tamaño nada del resto de la pantalla", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await expect(widgets(page)).toBeVisible();
    const contenido = await cajaDelContenido(page);
    const cajaDelMenu = await menu(page).boundingBox();

    await botonDeWidgets(page, "Ocultar los widgets").click();
    await expect(widgets(page)).toBeHidden();
    await page.waitForTimeout(FIN_DE_LA_ANIMACION_MS);

    expect(await cajaDelContenido(page)).toEqual(contenido);
    expect(await menu(page).boundingBox()).toEqual(cajaDelMenu);
  });

  test("escondidos, sus carruseles no están en la página para nadie", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await expect(page.getByRole("region", { name: /^Widgets de finanzas/ }).first()).toBeVisible();

    await botonDeWidgets(page, "Ocultar los widgets").click();

    await expect(page.getByRole("region", { name: /^Widgets de finanzas/ })).toHaveCount(0);
  });

  test("se recuerda al recargar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await botonDeWidgets(page, "Ocultar los widgets").click();
    await expect(widgets(page)).toBeHidden();

    await page.reload();

    await expect(botonDeWidgets(page, "Mostrar los widgets")).toBeVisible();
    await expect(widgets(page)).toBeHidden();
  });

  test("esconder los widgets no esconde el menú, y al revés", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");

    await botonDeWidgets(page, "Ocultar los widgets").click();
    await expect(widgets(page)).toBeHidden();
    await expect(menu(page)).toBeVisible();

    await botonDeWidgets(page, "Mostrar los widgets").click();
    await botonDelMenu(page, "Ocultar el menú").click();
    await expect(menu(page)).toBeHidden();
    await expect(widgets(page)).toBeVisible();
  });

  test("con las dos columnas escondidas el contenido sigue exactamente donde estaba", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await expect(widgets(page)).toBeVisible();
    const contenido = await cajaDelContenido(page);

    await botonDelMenu(page, "Ocultar el menú").click();
    await botonDeWidgets(page, "Ocultar los widgets").click();
    await expect(widgets(page)).toBeHidden();
    await page.waitForTimeout(FIN_DE_LA_ANIMACION_MS);

    expect(await cajaDelContenido(page)).toEqual(contenido);
  });
});

test.describe("la pestaña", () => {
  test("al pasar el mouse dice qué hace, y con el foco del teclado también", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    const pestana = botonDelMenu(page, "Ocultar el menú");
    const cartel = pestana.getByText("Ocultar el menú", { exact: true });
    await page.mouse.move(700, 450);
    await expect(cartel).toHaveCSS("opacity", "0");

    await pestana.hover();
    await expect(cartel).toHaveCSS("opacity", "1");

    await page.mouse.move(700, 450);
    await expect(cartel).toHaveCSS("opacity", "0");
    // Una tecla antes, para que el foco cuente como "de teclado" (:focus-visible) y no de mouse.
    await page.keyboard.press("Shift");
    await pestana.focus();
    await expect(cartel).toHaveCSS("opacity", "1");
  });

  test("cerrada se llena de acento y la flecha da la vuelta", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    const abierta = botonDelMenu(page, "Ocultar el menú");
    const colorAbierta = await abierta.evaluate((el) => getComputedStyle(el).backgroundColor);
    const flecha = abierta.locator("span").first();
    const giroAbierta = await flecha.evaluate((el) => getComputedStyle(el).transform);

    await abierta.click();
    await page.mouse.move(700, 450);
    await page.waitForTimeout(FIN_DE_LA_ANIMACION_MS);

    const cerrada = botonDelMenu(page, "Mostrar el menú");
    expect(await cerrada.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      colorAbierta,
    );
    expect(
      await cerrada
        .locator("span")
        .nth(0)
        .evaluate((el) => getComputedStyle(el).transform),
    ).not.toBe(giroAbierta);
  });

  test("la del menú y la de los widgets apuntan hacia lados opuestos al estar abiertas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await expect(widgets(page)).toBeVisible();

    const izquierda = await botonDelMenu(page, "Ocultar el menú")
      .locator("svg")
      .evaluate(
        (el) => new DOMMatrixReadOnly(getComputedStyle(el.parentElement as Element).transform).a,
      );
    const derecha = await botonDeWidgets(page, "Ocultar los widgets")
      .locator("svg")
      .evaluate(
        (el) => new DOMMatrixReadOnly(getComputedStyle(el.parentElement as Element).transform).a,
      );

    // Una está girada media vuelta respecto de la otra (el coseno del giro cambia de signo).
    expect(Math.sign(izquierda)).toBe(-Math.sign(derecha));
  });

  test("cerrar muestra un pulso una sola vez, y recargar con la columna cerrada no", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());

    await botonDelMenu(page, "Ocultar el menú").click();
    await expect(
      botonDelMenu(page, "Mostrar el menú").locator("span.bg-acento.pointer-events-none"),
    ).toHaveCount(1);
    await expect(
      botonDelMenu(page, "Mostrar el menú").locator("span.bg-acento.pointer-events-none"),
    ).toHaveCount(1);

    await page.reload();
    await expect(botonDelMenu(page, "Mostrar el menú")).toBeVisible();
    await expect(
      botonDelMenu(page, "Mostrar el menú").locator("span.bg-acento.pointer-events-none"),
    ).toHaveCount(0);
  });
});

test.describe("dónde hay pestañas", () => {
  test("la pantalla de inicio solo tiene la del menú: sus resúmenes son el contenido", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());

    await expect(botonDelMenu(page, "Ocultar el menú")).toBeVisible();
    await expect(page.getByRole("button", { name: /los widgets$/ })).toHaveCount(0);
  });

  test("administración tampoco tiene la de widgets", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada({ esAdmin: true }));
    await page.goto("/admin");

    await expect(botonDelMenu(page, "Ocultar el menú")).toBeVisible();
    await expect(page.getByRole("button", { name: /los widgets$/ })).toHaveCount(0);
  });

  test("en pantallas angostas no hay pestañas: ahí las columnas ya no existen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");

    await expect(page.getByRole("heading", { name: "Finanzas", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Ocultar|Mostrar) (el menú|los widgets)$/ }),
    ).toHaveCount(0);
  });

  test("entre 768 y 1024 px hay pestaña del menú pero todavía no de los widgets", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");

    await expect(botonDelMenu(page, "Ocultar el menú")).toBeVisible();
    await expect(page.getByRole("button", { name: /los widgets$/ })).toBeHidden();
  });
});

test.describe("accesibilidad de las pestañas", () => {
  test("sin violaciones con las dos columnas abiertas y con las dos escondidas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await expect(widgets(page)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await botonDelMenu(page, "Ocultar el menú").click();
    await botonDeWidgets(page, "Ocultar los widgets").click();
    await expect(widgets(page)).toBeHidden();
    await expect(menu(page)).toBeHidden();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("con reducir movimiento también se esconden y se muestran", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());

    await botonDelMenu(page, "Ocultar el menú").click();
    await expect(menu(page)).toBeHidden();
    await botonDelMenu(page, "Mostrar el menú").click();
    await expect(menu(page)).toBeVisible();
  });
});

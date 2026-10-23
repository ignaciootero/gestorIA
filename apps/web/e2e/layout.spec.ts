// Tests end-to-end de la disposición de las pantallas: el contenido principal queda centrado en la
// pantalla (no solo entre las columnas del menú y de los widgets, que miden distinto), salvo en
// inicio y calendario, donde se fusiona con el lugar de los widgets.
//
// Se mide la caja de <main> en pantallas anchas (desde `xl`, que es donde hay lugar para igualar los
// dos costados) con la ventana a distintos anchos.

import { expect, type Page, test } from "@playwright/test";
import { type CuentaDePrueba, crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

/** Margen lateral de la ventana en pantallas anchas (`sm:px-8`). */
const MARGEN_LATERAL = 32;
/** Cuánto puede diferir el centro del contenido del centro de la ventana (redondeos). */
const TOLERANCIA_PX = 1.5;

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

/** El ancho útil de la ventana: sin la barra de desplazamiento, que le saca unos píxeles. */
function anchoUtil(pagina: Page): Promise<number> {
  return pagina.evaluate(() => document.body.clientWidth);
}

/** La caja del contenido principal, una vez que la pantalla terminó de acomodarse. */
async function cajaDelContenido(pagina: Page, ruta: string) {
  await pagina.goto(ruta);
  const principal = pagina.getByRole("main");
  await expect(principal).toBeVisible();
  await pagina.waitForTimeout(300);
  const caja = await principal.boundingBox();
  if (!caja) throw new Error(`No se pudo medir el contenido de ${ruta}`);
  return caja;
}

const ANCHOS = [1280, 1440, 1920, 2560];
const PANTALLAS_CENTRADAS = ["/tareas", "/finanzas", "/contactos"];

test.describe("contenido principal centrado", () => {
  for (const ancho of ANCHOS) {
    test(`con widgets queda en el centro de una ventana de ${ancho} px`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await entrar(page, await crearCuentaAprobada());

      for (const ruta of PANTALLAS_CENTRADAS) {
        const caja = await cajaDelContenido(page, ruta);
        const centro = caja.x + caja.width / 2;
        expect(
          Math.abs(centro - (await anchoUtil(page)) / 2),
          `${ruta} a ${ancho} px`,
        ).toBeLessThanOrEqual(TOLERANCIA_PX);
      }
    });

    test(`en administración, sin widgets, también queda en el centro a ${ancho} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
      await entrar(page, await crearCuentaAprobada({ esAdmin: true }));

      const caja = await cajaDelContenido(page, "/admin");
      expect(Math.abs(caja.x + caja.width / 2 - (await anchoUtil(page)) / 2)).toBeLessThanOrEqual(
        TOLERANCIA_PX,
      );
    });
  }

  test("inicio y calendario ocupan también el lugar de los widgets", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await entrar(page, await crearCuentaAprobada());

    for (const ruta of ["/inicio", "/calendario"]) {
      const caja = await cajaDelContenido(page, ruta);
      // Llegan hasta el margen derecho de la ventana, no solo hasta donde empezarían los widgets.
      const util = await anchoUtil(page);
      expect(caja.x + caja.width, ruta).toBeCloseTo(util - MARGEN_LATERAL, 0);
      // Y por lo tanto no están centrados: el menú ocupa el costado izquierdo.
      expect(caja.x + caja.width / 2, ruta).toBeGreaterThan(util / 2 + 50);
    }
  });

  test("el contenido no se corre al esconder el menú ni los widgets", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await entrar(page, await crearCuentaAprobada());

    const antes = await cajaDelContenido(page, "/tareas");
    await page.getByRole("button", { name: /menú/i }).first().click();
    await page.waitForTimeout(600);
    const despues = await page.getByRole("main").boundingBox();
    expect(despues?.x).toBeCloseTo(antes.x, 0);
    expect(despues?.width).toBeCloseTo(antes.width, 0);
  });
});

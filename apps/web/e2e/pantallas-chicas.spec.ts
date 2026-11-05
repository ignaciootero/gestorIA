// Toda la app en pantallas de celular: nada se sale por los costados y se navega con la barra
// de abajo.
//
// El chequeo de desbordes no mira solo si la página entera se desplaza de costado: recorre cada
// elemento visible y lista los que asoman fuera de la ventana sin que un contenedor los corte o
// los desplace. Si falla, el mensaje dice cuáles son (etiqueta, clases y texto), para ir directo
// al componente.

import { expect, type Page, test } from "@playwright/test";
import { type CuentaDePrueba, crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

/** Anchos de celulares comunes: uno chico (Android) y uno estándar (iPhone). */
const ANCHOS = [360, 390];

const PANTALLAS = [
  { ruta: "/inicio", titulo: null },
  { ruta: "/finanzas", titulo: "Finanzas" },
  { ruta: "/contactos", titulo: "Contactos" },
  { ruta: "/tareas", titulo: "Tareas" },
  { ruta: "/calendario", titulo: "Calendario" },
  { ruta: "/admin", titulo: "Menú de administración" },
] as const;

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

/** Los elementos visibles que asoman por los costados de la ventana, descriptos para encontrarlos. */
async function desbordes(pagina: Page): Promise<{ desplazaDeCostado: boolean; fuera: string[] }> {
  return pagina.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const margen = 1;
    const asoma = (caja: DOMRect) => caja.right > ancho + margen || caja.left < -margen;

    /** Si un ancestro que corta o desplaza (y que sí entra) contiene al elemento. */
    function quedaContenido(elemento: Element): boolean {
      for (let padre = elemento.parentElement; padre && padre !== document.body; ) {
        const desborde = getComputedStyle(padre).overflowX;
        if (desborde !== "visible" && !asoma(padre.getBoundingClientRect())) return true;
        padre = padre.parentElement;
      }
      return false;
    }

    function describir(elemento: Element): string {
      const clases = (elemento.getAttribute("class") ?? "").split(/\s+/).slice(0, 6).join(".");
      const texto = (elemento.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      const caja = elemento.getBoundingClientRect();
      return `<${elemento.tagName.toLowerCase()}${clases ? `.${clases}` : ""}> "${texto}" (de ${Math.round(caja.left)} a ${Math.round(caja.right)} px, ventana ${ancho})`;
    }

    const reportados = new Set<Element>();
    for (const elemento of document.querySelectorAll("body *")) {
      const caja = elemento.getBoundingClientRect();
      if (caja.width === 0 || caja.height === 0 || !asoma(caja)) continue;
      const estilo = getComputedStyle(elemento);
      if (estilo.visibility === "hidden" || estilo.opacity === "0") continue;
      if (elemento.closest("[aria-hidden='true']")) continue;
      if (quedaContenido(elemento)) continue;
      // Solo el de más afuera: si el padre ya asoma, el hijo es el mismo problema.
      if (elemento.parentElement && reportados.has(elemento.parentElement)) {
        reportados.add(elemento);
        continue;
      }
      reportados.add(elemento);
    }

    return {
      desplazaDeCostado: document.documentElement.scrollWidth > ancho,
      fuera: [...reportados]
        .filter((elemento) => !elemento.parentElement || !reportados.has(elemento.parentElement))
        .slice(0, 15)
        .map(describir),
    };
  });
}

for (const ancho of ANCHOS) {
  test.describe(`a ${ancho} px de ancho`, () => {
    test.use({ viewport: { width: ancho, height: 780 } });

    test("ninguna pantalla se sale por los costados", async ({ page }) => {
      await entrar(page, await crearCuentaAprobada({ esAdmin: true }));

      for (const { ruta, titulo } of PANTALLAS) {
        await page.goto(ruta);
        if (titulo) {
          await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
        }
        // Que terminen de cargar los datos y las animaciones de entrada.
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(400);

        const { desplazaDeCostado, fuera } = await desbordes(page);
        expect(fuera, `En ${ruta} asoman por los costados:\n${fuera.join("\n")}`).toEqual([]);
        expect(desplazaDeCostado, `${ruta} se desplaza de costado`).toBe(false);
      }
    });

    test("se navega con la barra de abajo y no está el menú de la izquierda", async ({ page }) => {
      await entrar(page, await crearCuentaAprobada());

      await expect(page.getByRole("complementary", { name: "Navegación" })).toBeHidden();
      const barra = page.getByRole("navigation", { name: "Navegación principal" });
      await expect(barra).toBeVisible();
      await expect(barra.getByRole("link", { name: "Inicio" })).toHaveAttribute(
        "aria-current",
        "page",
      );

      for (const { ruta, titulo } of PANTALLAS.filter((pantalla) => pantalla.ruta !== "/admin")) {
        if (!titulo) continue;
        await barra.getByRole("link", { name: titulo }).click();
        await expect(page).toHaveURL(new RegExp(`${ruta}$`));
        await expect(page.getByRole("heading", { name: titulo, level: 1 })).toBeVisible();
        await expect(barra.getByRole("link", { name: titulo })).toHaveAttribute(
          "aria-current",
          "page",
        );
      }

      // La barra no tapa el final de la pantalla: el pie queda por encima de ella.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const pie = await page.getByRole("contentinfo").boundingBox();
      const caja = await barra.boundingBox();
      expect(pie && caja && pie.y + pie.height <= caja.y + 1).toBe(true);
    });

    test("la barra de arriba entra: salir queda como ícono", async ({ page }) => {
      await entrar(page, await crearCuentaAprobada({ esAdmin: true }));
      const arriba = page.getByRole("navigation", { name: "Barra principal" });
      await expect(arriba.getByRole("button", { name: "Salir" })).toBeVisible();
      await expect(arriba.getByText("Salir", { exact: true })).toBeHidden();
      await expect(arriba.getByRole("link", { name: "Panel de admin" })).toBeVisible();

      const caja = await arriba.boundingBox();
      expect(caja && caja.x + caja.width <= ancho + 1).toBe(true);
    });
  });
}

test("sin sesión no hay barra de abajo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/ingresar");
  await expect(page.getByRole("navigation", { name: "Navegación principal" })).toHaveCount(0);
});

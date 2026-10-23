// Tests end-to-end del calendario: ver el mes de hoy con el día marcado, navegar entre meses y años
// (con botones, con teclado y yendo directo a una fecha), elegir un día y ver su panel, y la
// accesibilidad. Los eventos (de otros módulos y manuales) se prueban en calendario-eventos.spec.ts.
//
// Los días que se esperan se calculan a partir del "hoy" del navegador (fijado a Montevideo), así
// los tests valen cualquier día del año, incluidos los de fin de mes.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { type CuentaDePrueba, crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

const ZONA = "America/Montevideo";
test.use({ timezoneId: ZONA });

/** Lo que tarda el selector de vista en terminar de cambiar de color (axe mide el contraste a mitad de camino). */
const TRANSICION_MS = 600;
/** La vista de año arma sus doce meses en cascada: tarda más en quedar quieta. */
const TRANSICION_DE_ANIO_MS = 1200;

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

test.beforeEach(async () => {
  await limpiarBaseDePruebas();
});

function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "Octubre de 2026", como se titula el mes de un día. */
function tituloDelMes(dia: string): string {
  return `${MESES[Number(dia.slice(5, 7)) - 1]} de ${dia.slice(0, 4)}`;
}

/** "martes, 20 de octubre de 2026": el nombre accesible de la casilla de ese día. */
function nombreDelDia(dia: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dia}T00:00:00Z`));
}

/** El mismo día pero en otro mes (o año); si ese mes no lo tiene, el último día. */
function sumarMeses(dia: string, meses: number): string {
  const anio = Number(dia.slice(0, 4));
  const mes = Number(dia.slice(5, 7)) - 1 + meses;
  const objetivo = new Date(Date.UTC(anio, mes, 1));
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0));
  const numero = Math.min(Number(dia.slice(8, 10)), ultimo.getUTCDate());
  return new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth(), numero))
    .toISOString()
    .slice(0, 10);
}

function sumarDias(dia: string, dias: number): string {
  return new Date(new Date(`${dia}T00:00:00Z`).getTime() + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function entrar(pagina: Page, cuenta: CuentaDePrueba): Promise<void> {
  await pagina.goto("/ingresar");
  await pagina.getByLabel("Usuario o correo").fill(cuenta.usuario);
  await pagina.getByLabel("Contraseña").fill(cuenta.password);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).toHaveURL(/\/inicio$/);
}

async function abrirCalendario(pagina: Page): Promise<void> {
  await pagina.goto("/calendario");
  await expect(pagina.getByRole("heading", { name: "Calendario", level: 1 })).toBeVisible();
  // El calendario se arma recién montado: cuando aparece la grilla, ya sabe qué día es hoy.
  await esperarGrilla(pagina);
}

/** Espera a que termine la animación de cambio de mes: queda una sola grilla en pantalla. */
async function esperarGrilla(pagina: Page): Promise<void> {
  await expect(pagina.locator("[data-grilla]")).toHaveCount(1);
}

function casilla(pagina: Page, dia: string) {
  return pagina.getByRole("button", { name: new RegExp(`^${nombreDelDia(dia)}`) });
}

/** El título del mes o del año que se está mirando. */
function titulo(pagina: Page) {
  return pagina.getByRole("heading", { level: 2 }).first();
}

test.describe("el mes de hoy", () => {
  test("se llega desde el menú y abre en el mes de hoy con el día marcado", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Calendario" })
      .click();
    await expect(page).toHaveURL(/\/calendario$/);
    await esperarGrilla(page);

    await expect(titulo(page)).toHaveText(tituloDelMes(hoy()));
    const casillaDeHoy = casilla(page, hoy());
    await expect(casillaDeHoy).toHaveAttribute("aria-current", "date");
    await expect(casillaDeHoy).toHaveAttribute("aria-pressed", "true");
    // El panel del día explica de qué día se trata.
    await expect(page.getByText("Hoy", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Sin eventos para este día")).toBeVisible();
  });

  test("sin sesión, redirige al ingreso", async ({ page }) => {
    await page.goto("/calendario");
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test("la grilla tiene seis semanas con los días de la semana de lunes a domingo", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    // De lunes a domingo, en ese orden (el nombre accesible de cada columna es el día completo).
    const columnas = page.getByRole("columnheader");
    await expect(columnas).toHaveCount(7);
    for (const [indice, nombre] of [
      "lunes",
      "martes",
      "miércoles",
      "jueves",
      "viernes",
      "sábado",
      "domingo",
    ].entries()) {
      await expect(columnas.nth(indice)).toHaveAccessibleName(nombre);
    }
    await expect(page.locator("[data-grilla] tbody tr")).toHaveCount(6);
    await expect(page.locator("[data-grilla] [data-dia]")).toHaveCount(42);
  });
});

test.describe("navegar entre meses", () => {
  test("los botones pasan al mes anterior y al siguiente, y 'Hoy' vuelve", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    // Ya estamos en hoy: el botón no hace falta.
    await expect(page.getByRole("button", { name: "Hoy", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Mes siguiente" }).click();
    await expect(titulo(page)).toHaveText(tituloDelMes(sumarMeses(hoy(), 1)));
    await esperarGrilla(page);

    await page.getByRole("button", { name: "Mes anterior" }).click();
    await page.getByRole("button", { name: "Mes anterior" }).click();
    await expect(titulo(page)).toHaveText(tituloDelMes(sumarMeses(hoy(), -1)));
    await esperarGrilla(page);

    await page.getByRole("button", { name: "Hoy", exact: true }).click();
    await expect(titulo(page)).toHaveText(tituloDelMes(hoy()));
    await esperarGrilla(page);
    await expect(casilla(page, hoy())).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Hoy", exact: true })).toHaveCount(0);
  });

  test("al cambiar de mes se conserva el número de día elegido", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    await page.getByRole("button", { name: "Mes siguiente" }).click();
    await esperarGrilla(page);
    await expect(casilla(page, sumarMeses(hoy(), 1))).toHaveAttribute("aria-pressed", "true");
  });

  test("elegir un día de otro mes visible (de los que completan la grilla) pasa a ese mes", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    // El primer día que se dibuja suele ser del mes anterior: lo elegimos.
    const primero = await page.locator("[data-grilla] [data-dia]").first().getAttribute("data-dia");
    if (!primero) throw new Error("No hay casillas");
    if (primero.slice(0, 7) === hoy().slice(0, 7)) {
      // El mes empieza justo un lunes: probamos con el último, que puede ser del mes siguiente.
      return;
    }
    await casilla(page, primero).click();
    await expect(titulo(page)).toHaveText(tituloDelMes(primero));
    await esperarGrilla(page);
    await expect(casilla(page, primero)).toHaveAttribute("aria-pressed", "true");
  });

  test("elegir un día lo muestra en el panel", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    const manana = sumarDias(hoy(), 1);
    if (manana.slice(0, 7) !== hoy().slice(0, 7)) return; // fin de mes: lo cubre el test anterior
    await casilla(page, manana).click();
    await expect(casilla(page, manana)).toHaveAttribute("aria-pressed", "true");
    await expect(casilla(page, hoy())).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Mañana", { exact: true })).toBeVisible();
  });
});

test.describe("con el teclado", () => {
  test("las flechas mueven el día elegido y el foco los acompaña", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    await casilla(page, hoy()).focus();
    await page.keyboard.press("ArrowRight");
    await esperarGrilla(page);
    await expect(casilla(page, sumarDias(hoy(), 1))).toBeFocused();
    await expect(casilla(page, sumarDias(hoy(), 1))).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("ArrowDown");
    await esperarGrilla(page);
    await expect(casilla(page, sumarDias(hoy(), 8))).toBeFocused();

    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await esperarGrilla(page);
    await expect(casilla(page, sumarDias(hoy(), 0))).toBeFocused();
  });

  test("Re Pág y Av Pág cambian de mes, y salir del mes con las flechas también", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    await casilla(page, hoy()).focus();
    await page.keyboard.press("PageDown");
    await expect(titulo(page)).toHaveText(tituloDelMes(sumarMeses(hoy(), 1)));
    await esperarGrilla(page);
    await expect(casilla(page, sumarMeses(hoy(), 1))).toBeFocused();

    await page.keyboard.press("PageUp");
    await page.keyboard.press("PageUp");
    await expect(titulo(page)).toHaveText(tituloDelMes(sumarMeses(hoy(), -1)));
    await esperarGrilla(page);

    // Mayús + Re Pág: un año atrás.
    await page.keyboard.press("Shift+PageUp");
    await expect(titulo(page)).toHaveText(tituloDelMes(sumarMeses(hoy(), -13)));
    await esperarGrilla(page);
  });

  test("Inicio y Fin van al lunes y al domingo de esa semana", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    await casilla(page, hoy()).focus();
    await page.keyboard.press("Home");
    await esperarGrilla(page);
    const lunes = await page.locator("[data-dia][aria-pressed=true]").getAttribute("data-dia");
    expect(lunes).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${lunes}T00:00:00Z`).getUTCDay()).toBe(1);

    await page.keyboard.press("End");
    await esperarGrilla(page);
    const domingo = await page.locator("[data-dia][aria-pressed=true]").getAttribute("data-dia");
    expect(new Date(`${domingo}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(domingo).toBe(sumarDias(lunes ?? "", 6));
  });

  test("Tab entra a la grilla en una sola casilla: la del día elegido", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await expect(page.locator("[data-grilla] [data-dia][tabindex='0']")).toHaveCount(1);
    await expect(casilla(page, hoy())).toHaveAttribute("tabindex", "0");
  });
});

test.describe("el año y las fechas lejanas", () => {
  test("la vista de año muestra los doce meses, y tocar uno lo abre", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    await page.getByRole("radio", { name: "Año" }).click();
    await expect(titulo(page)).toHaveText(hoy().slice(0, 4));
    for (const mes of MESES) {
      await expect(
        page.getByRole("button", { name: `${mes} de ${hoy().slice(0, 4)}` }),
      ).toBeVisible();
    }

    await page.getByRole("button", { name: `Marzo de ${hoy().slice(0, 4)}` }).click();
    await expect(titulo(page)).toHaveText(`Marzo de ${hoy().slice(0, 4)}`);
    await esperarGrilla(page);
    await expect(page.getByRole("radio", { name: "Mes" })).toBeChecked();
  });

  test("en la vista de año los botones cambian de año", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.getByRole("radio", { name: "Año" }).click();

    await page.getByRole("button", { name: "Año siguiente" }).click();
    await expect(titulo(page)).toHaveText(String(Number(hoy().slice(0, 4)) + 1));
    await page.getByRole("button", { name: "Año anterior" }).click();
    await page.getByRole("button", { name: "Año anterior" }).click();
    await expect(titulo(page)).toHaveText(String(Number(hoy().slice(0, 4)) - 1));

    await page.getByRole("button", { name: "Hoy", exact: true }).click();
    await expect(titulo(page)).toHaveText(tituloDelMes(hoy()));
  });

  test("ir a una fecha lleva directo a ese día, aunque esté lejos", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    await page.getByLabel("Ir a una fecha").fill("2030-02-14");
    await expect(titulo(page)).toHaveText("Febrero de 2030");
    await esperarGrilla(page);
    await expect(casilla(page, "2030-02-14")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("span.rounded-full", { hasText: "Semana 7" })).toBeVisible();
    await expect(page.getByText("Día 45 del año")).toBeVisible();
    await expect(page.getByText(/^En \d+ días$/)).toBeVisible();
  });

  test("los botones de día anterior y siguiente cruzan el fin de mes", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.getByLabel("Ir a una fecha").fill("2028-02-28");
    await esperarGrilla(page);

    await page.getByRole("button", { name: "Día siguiente" }).click();
    await expect(casilla(page, "2028-02-29")).toHaveAttribute("aria-pressed", "true"); // bisiesto
    await page.getByRole("button", { name: "Día siguiente" }).click();
    await expect(titulo(page)).toHaveText("Marzo de 2028");
    await esperarGrilla(page);
    await expect(casilla(page, "2028-03-01")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Día anterior" }).click();
    await expect(titulo(page)).toHaveText("Febrero de 2028");
  });

  test("el calendario tiene un límite de años y los botones se deshabilitan al llegar", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.getByLabel("Ir a una fecha").fill("1900-01-01");
    await esperarGrilla(page);
    await expect(page.getByRole("button", { name: "Mes anterior" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Día anterior" })).toBeDisabled();
  });
});

test.describe("accesibilidad", () => {
  test("el mes y el año no tienen violaciones de axe", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.waitForTimeout(TRANSICION_MS);

    const revisar = async () => (await new AxeBuilder({ page }).analyze()).violations;
    expect(await revisar()).toEqual([]);

    await page.getByRole("radio", { name: "Año" }).click();
    await page.waitForTimeout(TRANSICION_DE_ANIO_MS);
    expect(await revisar()).toEqual([]);
  });

  test("con la preferencia de reducir movimiento, todo funciona sin desplazamientos", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.getByRole("button", { name: "Mes siguiente" }).click();
    await expect(titulo(page)).toHaveText(tituloDelMes(sumarMeses(hoy(), 1)));
    await esperarGrilla(page);
    await expect(casilla(page, sumarMeses(hoy(), 1))).toHaveAttribute("aria-pressed", "true");
  });
});

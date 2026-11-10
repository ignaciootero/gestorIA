// Tests end-to-end de la pantalla de inicio: el carrusel con el resumen de cada módulo (Finanzas,
// Calendario, Tareas y Contactos).
//
// - Que entre entera en la ventana, sin desplazamiento vertical, en pantallas grandes y chicas.
// - Cómo se mueve: pasa solo, se detiene (botón, mouse, foco del teclado, reducir movimiento) y se
//   navega con las pestañas, las flechas, el teclado y deslizando.
// - Lo que dice cada resumen con datos y sin ellos, y que un error en un módulo no tape a los demás.
// - Accesibilidad con axe en los cuatro resúmenes, en modo claro y oscuro.
//
// Los datos se preparan hablando con la API desde la sesión del navegador: los formularios de cada
// módulo tienen sus propios tests. El avance automático se prueba con el reloj falso de Playwright.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  type CuentaDePrueba,
  crearCuentaAprobada,
  limpiarBaseDePruebas,
  sembrarTareasDePrueba,
} from "./utilidades";

const ZONA = "America/Montevideo";
test.use({ timezoneId: ZONA });

const URL_API = "http://localhost:3101";
/** El mismo valor que INTERVALO_DEL_CARRUSEL_DE_INICIO_MS (carrusel-de-inicio.tsx). */
const INTERVALO_MS = 15000;
const MODULOS = ["Finanzas", "Calendario", "Tareas", "Contactos"] as const;
type Modulo = (typeof MODULOS)[number];

test.beforeEach(async ({ page }) => {
  await limpiarBaseDePruebas();
  // El inicio elige al azar la pestaña y la variante de cada resumen (lib/eleccion-del-inicio.ts).
  // Estos tests prueban el carrusel y la variante general: con el azar en cero y sin recuerdo de la
  // visita anterior, siempre arranca en Finanzas con las generales. Las variantes se prueban en
  // inicio-variantes.spec.ts.
  await page.addInitScript(() => {
    window.localStorage.removeItem("gestion.inicio.ultimaEleccion");
    Math.random = () => 0;
  });
});

function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sumarDias(dia: string, dias: number): string {
  return new Date(new Date(`${dia}T00:00:00Z`).getTime() + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

async function entrar(pagina: Page, cuenta: CuentaDePrueba): Promise<void> {
  await pagina.goto("/ingresar");
  await pagina.getByLabel("Usuario o correo").fill(cuenta.usuario);
  await pagina.getByLabel("Contraseña").fill(cuenta.password);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).toHaveURL(/\/inicio$/);
}

async function pedirApi<T>(
  pagina: Page,
  metodo: "GET" | "POST" | "PUT" | "PATCH",
  ruta: string,
  datos?: unknown,
): Promise<T> {
  const respuesta = await pagina.request.fetch(`${URL_API}${ruta}`, {
    method: metodo,
    ...(datos === undefined ? {} : { data: datos }),
  });
  if (!respuesta.ok()) {
    throw new Error(`${metodo} ${ruta} falló (${respuesta.status()}): ${await respuesta.text()}`);
  }
  return (await respuesta.json()) as T;
}

function carrusel(pagina: Page): Locator {
  return pagina.getByRole("region", { name: "Resumen de tus módulos" });
}

function pestana(pagina: Page, modulo: Modulo): Locator {
  return pagina.getByRole("tab", { name: modulo });
}

/** El resumen que se está viendo. */
function resumen(pagina: Page): Locator {
  return pagina.getByRole("tabpanel");
}

async function verResumen(pagina: Page, modulo: Modulo): Promise<Locator> {
  await pestana(pagina, modulo).click();
  await expect(pestana(pagina, modulo)).toHaveAttribute("aria-selected", "true");
  const panel = pagina.locator(`[data-resumen='${modulo.toLowerCase()}']`);
  // Que haya terminado de cargar: la cifra destacada (o el error) ya está.
  await expect(panel.locator("[data-destacado], [data-aviso='peligro']").first()).toBeVisible();
  return panel;
}

/**
 * Saca el mouse del carrusel con un recorrido de verdad (entra y sale). Al entrar, el puntero queda
 * donde estaba el botón "Entrar", encima del carrusel, y el navegador puede marcarlo como "encima" con
 * un evento propio que llega tarde: un solo salto a un costado no alcanza para que se entere de que se fue.
 */
async function alejarElMouse(pagina: Page): Promise<void> {
  const caja = await carrusel(pagina).boundingBox();
  if (caja) await pagina.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await pagina.mouse.move(0, 0, { steps: 5 });
}

async function esperarModulo(pagina: Page, modulo: Modulo): Promise<void> {
  await expect(pestana(pagina, modulo)).toHaveAttribute("aria-selected", "true");
}

/** Un período abierto con un ingreso, dos gastos (uno deja la primera cuenta en rojo) y un límite superado. */
async function prepararFinanzas(pagina: Page): Promise<{ cuenta: string; categoria: string }> {
  const { categorias } = await pedirApi<{
    categorias: { id: number; nombre: string; sistema: string | null }[];
  }>(pagina, "GET", "/api/finanzas/categorias");
  const { cuentas } = await pedirApi<{ cuentas: { id: string; nombre: string }[] }>(
    pagina,
    "GET",
    "/api/finanzas/cuentas",
  );
  const [grande, chica] = categorias.filter((categoria) => categoria.sistema === null);
  const [primera, segunda] = cuentas;
  if (!grande || !chica || !primera || !segunda) throw new Error("Faltan categorías o cuentas");
  await pedirApi(pagina, "POST", "/api/finanzas/periodos", {
    nombre: "Prueba",
    aperturaEn: haceDias(10),
  });
  const cargar = (datos: Record<string, unknown>) =>
    pedirApi(pagina, "POST", "/api/finanzas/movimientos", datos);
  await cargar({
    tipo: "ingreso",
    importe: 10000,
    descripcion: "Sueldo",
    fecha: haceDias(9),
    categoriaId: grande.id,
    cuentaFinancieraId: segunda.id,
  });
  await cargar({
    tipo: "gasto",
    importe: 3000,
    descripcion: "Alquiler",
    fecha: haceDias(5),
    categoriaId: grande.id,
    cuentaFinancieraId: primera.id,
  });
  await cargar({
    tipo: "gasto",
    importe: 200,
    descripcion: "Café",
    fecha: haceDias(4),
    categoriaId: chica.id,
    cuentaFinancieraId: primera.id,
  });
  return { cuenta: primera.nombre, categoria: grande.nombre };
}

async function crearTarea(pagina: Page, titulo: string, fecha: string, hora = ""): Promise<string> {
  const creada = await pedirApi<{ id: string }>(pagina, "POST", "/api/tareas", {
    titulo,
    notas: "",
    fecha,
    hora,
  });
  return creada.id;
}

async function crearPersona(
  pagina: Page,
  nombre: string,
  apellido: string,
  fechaNacimiento = "",
): Promise<string> {
  const creado = await pedirApi<{ id: string }>(pagina, "POST", "/api/contactos", {
    tipo: "persona",
    nombre,
    apellido,
    fechaNacimiento,
    telefonos: [],
    correos: [],
    direccion: "",
    notas: "",
    favorito: false,
    etiquetaIds: [],
  });
  return creado.id;
}

/** Cuánto se pasa la página del alto de la ventana (0 si entra entera). */
function desbordeVertical(pagina: Page): Promise<number> {
  return pagina.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
}

test.describe("forma de la pantalla", () => {
  test("es un carrusel con un resumen por módulo, en orden, y sin columna de widgets", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());

    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await expect(carrusel(page)).toHaveAttribute("aria-roledescription", "carrusel");
    await expect(page.getByRole("tab")).toHaveText([...MODULOS]);
    await expect(pestana(page, "Finanzas")).toHaveAttribute("aria-selected", "true");
    // Se ve un resumen a la vez, con su módulo y el enlace para ir a él.
    await expect(resumen(page)).toHaveCount(1);
    await expect(resumen(page).getByRole("heading", { name: "Finanzas" })).toBeVisible();
    await expect(resumen(page).getByRole("link", { name: "Ir a Finanzas" })).toHaveAttribute(
      "href",
      "/finanzas",
    );
    await expect(page.getByRole("complementary", { name: "Widgets" })).toHaveCount(0);
  });

  for (const [ancho, alto] of [
    [1920, 1080],
    [1440, 900],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [360, 640],
  ] as const) {
    test(`entra entera en ${ancho}x${alto}, sin desplazamiento vertical, en los cuatro resúmenes`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      // Sin animaciones, para medir cada resumen ya quieto y no a mitad de la transición.
      await page.emulateMedia({ reducedMotion: "reduce" });
      const cuenta = await crearCuentaAprobada();
      await entrar(page, cuenta);
      await prepararFinanzas(page);
      await crearTarea(page, "Comprar pan", hoy());
      await crearTarea(page, "Llamar al plomero", hoy(), "10:00");
      await sembrarTareasDePrueba(
        cuenta.email,
        [{ titulo: "Atrasada", dia: sumarDias(hoy(), -1) }],
        hoy(),
      );
      await crearPersona(page, "Ana", "Pérez", `1990${sumarDias(hoy(), 10).slice(4)}`);
      await page.reload();

      for (const modulo of MODULOS) {
        const panel = await verResumen(page, modulo);
        expect(await desbordeVertical(page), modulo).toBeLessThanOrEqual(0);
        // Y el resumen no se corta: termina antes que el borde de su tarjeta.
        const sobrante = await panel.evaluate((elemento) => {
          const limite = elemento.getBoundingClientRect().bottom;
          const visibles = [...elemento.querySelectorAll("*")].filter(
            (hijo) => (hijo as HTMLElement).offsetParent !== null,
          );
          return Math.max(...visibles.map((hijo) => hijo.getBoundingClientRect().bottom)) - limite;
        });
        expect(sobrante, `${modulo} se corta`).toBeLessThanOrEqual(1);
      }
    });
  }

  test("en una ventana muy baja vuelve a desplazarse en vez de cortar el resumen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 480 });
    await entrar(page, await crearCuentaAprobada());
    await verResumen(page, "Finanzas");

    expect(await desbordeVertical(page)).toBeGreaterThan(0);
    const caja = await resumen(page).boundingBox();
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(400);
  });

  test("las otras pantallas siguen desplazándose como siempre", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    await expect(page.getByRole("heading", { name: "Finanzas", level: 1 })).toBeVisible();
    const alto = await page.evaluate(
      () => document.querySelector(".marco-de-la-app")?.getBoundingClientRect().height ?? 0,
    );
    // El marco no queda atado al alto de la ventana: crece con el contenido.
    expect(alto).toBeGreaterThanOrEqual(720);
    expect(await page.locator("[data-pantalla-fija]").count()).toBe(0);
  });
});

test.describe("movimiento del carrusel", () => {
  test("pasa solo al siguiente cada tanto y vuelve a empezar después del último", async ({
    page,
  }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await esperarModulo(page, "Finanzas");
    await alejarElMouse(page);
    // El puntero quedó donde estaba el botón "Entrar", encima del carrusel: hasta que se va, está
    // detenido. Se espera a que avance solo para contar el tiempo desde ahí.
    await expect(carrusel(page)).toHaveAttribute("data-avanza-solo", "true");

    // Poco antes de cumplirse el tiempo sigue en el mismo...
    await page.clock.fastForward(INTERVALO_MS - 500);
    await esperarModulo(page, "Finanzas");
    // ... y al cumplirse pasa al siguiente, y así hasta dar la vuelta.
    for (const modulo of ["Calendario", "Tareas", "Contactos", "Finanzas"] as const) {
      await page.clock.fastForward(INTERVALO_MS);
      await esperarModulo(page, modulo);
    }
  });

  test("la pestaña activa muestra el tiempo que falta mientras avanza solo", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await alejarElMouse(page);
    await expect(pestana(page, "Finanzas").locator("[data-tiempo]")).toHaveCount(1);
    await expect(pestana(page, "Calendario").locator("[data-tiempo]")).toHaveCount(0);

    await page.getByRole("button", { name: "Pausar el pase automático" }).click();
    await alejarElMouse(page);
    await expect(page.locator("[data-tiempo]")).toHaveCount(0);
  });

  test("el botón de pausa lo detiene hasta que se lo vuelva a tocar", async ({ page }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await esperarModulo(page, "Finanzas");

    await page.getByRole("button", { name: "Pausar el pase automático" }).click();
    await alejarElMouse(page);
    await page.clock.fastForward(INTERVALO_MS * 3);
    await esperarModulo(page, "Finanzas");
    // Mientras está detenido, los cambios se anuncian (navegar a mano).
    await expect(page.locator("[aria-live='polite']").filter({ has: resumen(page) })).toHaveCount(
      1,
    );

    await page.getByRole("button", { name: "Reanudar el pase automático" }).click();
    await alejarElMouse(page);
    await page.clock.fastForward(INTERVALO_MS + 100);
    await esperarModulo(page, "Calendario");
  });

  test("se queda quieto con el mouse encima y sigue al sacarlo", async ({ page }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await esperarModulo(page, "Finanzas");

    await resumen(page).hover();
    await page.clock.fastForward(INTERVALO_MS * 2);
    await esperarModulo(page, "Finanzas");

    await alejarElMouse(page);
    await page.clock.fastForward(INTERVALO_MS + 100);
    await esperarModulo(page, "Calendario");
  });

  test("se queda quieto con el foco del teclado adentro", async ({ page }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await esperarModulo(page, "Finanzas");
    await alejarElMouse(page);

    await pestana(page, "Finanzas").focus();
    await page.keyboard.press("ArrowRight");
    await esperarModulo(page, "Calendario");
    await expect(pestana(page, "Calendario")).toBeFocused();
    await page.clock.fastForward(INTERVALO_MS * 2);
    await esperarModulo(page, "Calendario");
  });

  test("con reducir movimiento no pasa solo ni ofrece pausarlo, pero se navega a mano", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await esperarModulo(page, "Finanzas");
    await alejarElMouse(page);

    await page.clock.fastForward(INTERVALO_MS * 2);
    await esperarModulo(page, "Finanzas");
    await expect(page.getByRole("button", { name: /pase automático/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Resumen siguiente" }).click();
    await esperarModulo(page, "Calendario");
  });

  test("las pestañas llevan a cada resumen y las flechas pasan al anterior y al siguiente, dando la vuelta", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());

    await pestana(page, "Tareas").click();
    await esperarModulo(page, "Tareas");
    await expect(resumen(page).getByRole("heading", { name: "Tareas" })).toBeVisible();

    await page.getByRole("button", { name: "Resumen siguiente" }).click();
    await esperarModulo(page, "Contactos");
    await page.getByRole("button", { name: "Resumen siguiente" }).click();
    await esperarModulo(page, "Finanzas");
    await page.getByRole("button", { name: "Resumen anterior" }).click();
    await esperarModulo(page, "Contactos");
  });

  test("con el teclado: flechas, Inicio y Fin entre las pestañas, y una sola parada de tabulación", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await pestana(page, "Finanzas").focus();

    await page.keyboard.press("ArrowLeft");
    await esperarModulo(page, "Contactos");
    await page.keyboard.press("Home");
    await esperarModulo(page, "Finanzas");
    await page.keyboard.press("End");
    await esperarModulo(page, "Contactos");
    await expect(pestana(page, "Contactos")).toBeFocused();
    // Solo la elegida entra en el orden de tabulación.
    await expect(page.locator("[role='tab'][tabindex='0']")).toHaveCount(1);
  });

  test("deslizar hacia un costado pasa de resumen", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await esperarModulo(page, "Finanzas");
    const caja = await resumen(page).boundingBox();
    if (!caja) throw new Error("Sin medidas");
    const y = caja.y + caja.height / 2;

    await page.mouse.move(caja.x + caja.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width * 0.3, y, { steps: 8 });
    await page.mouse.up();
    await esperarModulo(page, "Calendario");

    await page.mouse.move(caja.x + caja.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width * 0.7, y, { steps: 8 });
    await page.mouse.up();
    await esperarModulo(page, "Finanzas");
  });
});

test.describe("lo que dice cada resumen", () => {
  test("una cuenta nueva ve cada resumen vacío con algo útil, sin errores", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());

    const finanzas = await verResumen(page, "Finanzas");
    await expect(finanzas.locator("[data-destacado]")).toContainText("$ 0,00");
    await expect(finanzas.locator("[data-aviso]")).toContainText("Abrí tu primer período");
    await expect(finanzas.locator("[data-grafico]")).toHaveCount(0);

    const calendario = await verResumen(page, "Calendario");
    await expect(calendario.locator("[data-destacado]")).toContainText("Ninguno");
    await expect(calendario.getByText("No hay nada en los próximos días.")).toBeVisible();

    const tareas = await verResumen(page, "Tareas");
    await expect(tareas.locator("[data-destacado]")).toContainText("Nada para hoy");
    await expect(tareas.getByText("No tenés tareas pendientes.")).toBeVisible();

    const contactos = await verResumen(page, "Contactos");
    await expect(contactos.locator("[data-destacado]")).toContainText("Agregá tu primer contacto");

    await expect(page.locator("[data-aviso='peligro']")).toHaveCount(0);
  });

  test("Finanzas: el disponible, el aviso más grave, lo que entró y salió y en qué se gasta", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const { cuenta, categoria } = await prepararFinanzas(page);
    await page.reload();

    const panel = await verResumen(page, "Finanzas");
    await expect(panel.locator("[data-destacado]")).toContainText("$ 6.800,00");
    // La cuenta en rojo es lo más grave: es el único aviso.
    await expect(panel.locator("[data-aviso]")).toHaveCount(1);
    await expect(panel.locator("[data-aviso='peligro']")).toContainText(
      `${cuenta} está en negativo`,
    );
    // Lo que entró, lo que salió y lo que sobra.
    const filas = panel.getByRole("listitem");
    await expect(filas.nth(0)).toContainText("Entró");
    await expect(filas.nth(0)).toContainText("$ 10.000,00");
    await expect(filas.nth(1)).toContainText("Salió");
    await expect(filas.nth(1)).toContainText("$ 3.200,00");
    await expect(filas.nth(2)).toContainText("Te sobra");
    await expect(filas.nth(2)).toContainText("$ 6.800,00");
    // Y en la dona, en qué se fue: la categoría principal primero.
    const grafico = panel.locator("[data-grafico]");
    await expect(grafico).toContainText("En qué se fue la plata en Prueba");
    const leyenda = grafico.getByRole("listitem");
    await expect(leyenda.first()).toContainText(categoria);
    await expect(leyenda).toHaveCount(2);
    await expect(leyenda.first()).toContainText("94 %");
    await expect(leyenda.nth(1)).toContainText("6 %");
  });

  test("Calendario: lo de hoy, lo que viene y nada de lo ya hecho", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearTarea(page, "Regar las plantas", hoy(), "18:00");
    const hecha = await crearTarea(page, "Ya la hice", hoy());
    await pedirApi(page, "PATCH", `/api/tareas/${hecha}/completada`, { completada: true });
    await pedirApi(page, "POST", "/api/calendario/eventos", {
      titulo: "Cumpleaños de Sofi",
      fecha: sumarDias(hoy(), 1),
      hora: "",
      notas: "",
    });
    await page.reload();

    const panel = await verResumen(page, "Calendario");
    await expect(panel.locator("[data-destacado]")).toContainText("1");
    await expect(panel.locator("[data-destacado]")).toContainText(
      "Y 1 más en los próximos 6 días.",
    );
    const filas = panel.getByRole("listitem");
    await expect(filas).toHaveCount(2);
    await expect(filas.nth(0)).toContainText("Regar las plantas");
    await expect(filas.nth(0)).toContainText("Hoy · 18:00");
    await expect(filas.nth(1)).toContainText("Cumpleaños de Sofi");
    await expect(filas.nth(1)).toContainText("Mañana");
    await expect(panel.getByText("Ya la hice")).toHaveCount(0);
    // Cada fila dice de qué módulo viene, también para un lector de pantalla.
    await expect(filas.nth(0)).toContainText("Tareas:");
    await expect(panel.locator("[data-grafico]")).toContainText("Próximos 7 días");
  });

  test("Tareas: cuánto de hoy está hecho, lo que falta, las atrasadas y los últimos días", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    const hecha = await crearTarea(page, "Sacar la basura", hoy());
    await pedirApi(page, "PATCH", `/api/tareas/${hecha}/completada`, { completada: true });
    await crearTarea(page, "Pagar la luz", hoy(), "09:30");
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Arreglar la persiana", dia: sumarDias(hoy(), -2) }],
      hoy(),
    );
    await page.reload();

    const panel = await verResumen(page, "Tareas");
    await expect(panel.locator("[data-destacado]")).toContainText("1 de 2");
    await expect(panel.locator("[data-destacado]")).toContainText("Te falta 1.");
    await expect(panel.locator("[data-aviso='advertencia']")).toContainText(
      "Tenés una tarea atrasada",
    );
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await expect(panel.getByRole("listitem")).toContainText("Pagar la luz");
    await expect(panel.getByRole("listitem")).toContainText("09:30");
    const grafico = panel.locator("[data-grafico]");
    await expect(grafico).toContainText("Últimos 7 días");
    await expect(grafico.getByText("1/2", { exact: true })).toBeVisible();
  });

  test("Contactos: el próximo cumpleaños, el aviso de hoy y los recordatorios que vienen", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const ana = await crearPersona(page, "Ana", "Pérez", `1996${sumarDias(hoy(), 12).slice(4)}`);
    await pedirApi(page, "POST", `/api/contactos/${ana}/recordatorios`, {
      titulo: "Pagar la cuota",
      fecha: hoy(),
      repeticion: "unica",
      hora: "18:00",
    });
    await pedirApi(page, "POST", `/api/contactos/${ana}/recordatorios`, {
      titulo: "Devolver el libro",
      fecha: sumarDias(hoy(), 9),
      repeticion: "unica",
      hora: "",
    });
    await page.reload();

    const panel = await verResumen(page, "Contactos");
    const destacado = panel.locator("[data-destacado]");
    await expect(destacado).toContainText("Próximo cumpleaños");
    await expect(destacado).toContainText("Ana Pérez");
    await expect(destacado).toContainText("Cumple 30");
    await expect(destacado).toContainText("(en 12 días)");
    await expect(panel.locator("[data-aviso='advertencia']")).toContainText(
      "Pagar la cuota a las 18:00 (Ana Pérez)",
    );
    const filas = panel.getByRole("listitem");
    await expect(filas.nth(0)).toContainText("Pagar la cuota · Ana Pérez");
    await expect(filas.nth(0)).toContainText("Hoy · 18:00");
    await expect(filas.nth(1)).toContainText("Devolver el libro");
    await expect(filas.nth(1)).toContainText("En 9 días");
    await expect(panel.locator("[data-grafico]")).toContainText("en 30 días");
  });

  test("los resúmenes se ponen al día al volver de un módulo donde se cambió algo", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const panel = await verResumen(page, "Tareas");
    await expect(panel.locator("[data-destacado]")).toContainText("Nada para hoy");

    await page.goto("/tareas");
    await crearTarea(page, "Nueva de hoy", hoy());
    await page.goto("/inicio");
    const actualizado = await verResumen(page, "Tareas");
    await expect(actualizado.locator("[data-destacado]")).toContainText("0 de 1");
  });

  test("si un módulo no responde, su resumen lo dice y los demás siguen", async ({ page }) => {
    await page.route(`${URL_API}/api/tareas/widgets`, (ruta) =>
      ruta.fulfill({ status: 500, contentType: "application/json", body: "{}" }),
    );
    await entrar(page, await crearCuentaAprobada());

    const tareas = await verResumen(page, "Tareas");
    await expect(tareas.locator("[data-aviso='peligro']")).toContainText(
      "No pudimos cargar el resumen de Tareas",
    );
    const finanzas = await verResumen(page, "Finanzas");
    await expect(finanzas.locator("[data-destacado]")).toContainText("Disponible");
  });
});

test.describe("accesibilidad de la pantalla de inicio", () => {
  for (const esquema of ["light", "dark"] as const) {
    test(`los cuatro resúmenes no tienen violaciones en modo ${esquema === "light" ? "claro" : "oscuro"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: esquema, reducedMotion: "reduce" });
      const cuenta = await crearCuentaAprobada();
      await entrar(page, cuenta);
      await prepararFinanzas(page);
      await crearTarea(page, "Comprar pan", hoy());
      await sembrarTareasDePrueba(
        cuenta.email,
        [{ titulo: "Atrasada", dia: sumarDias(hoy(), -1) }],
        hoy(),
      );
      const ana = await crearPersona(page, "Ana", "Pérez", `1990${sumarDias(hoy(), 5).slice(4)}`);
      await pedirApi(page, "POST", `/api/contactos/${ana}/recordatorios`, {
        titulo: "Llamar",
        fecha: hoy(),
        repeticion: "unica",
        hora: "",
      });
      await page.reload();

      for (const modulo of MODULOS) {
        await verResumen(page, modulo);
        const resultados = await new AxeBuilder({ page }).analyze();
        expect(resultados.violations, modulo).toEqual([]);
      }
    });
  }
});

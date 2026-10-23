// Tests end-to-end de los widgets: la pantalla de inicio (donde los widgets son el
// contenido principal, sin columna aparte) y el carrusel de la columna lateral de
// Finanzas (avance automático, pausa por mouse y teclado, flechas y reducir movimiento),
// y la variedad de widgets: cifras sueltas y cada tipo de mini gráfico.
//
// Los datos se preparan hablando con la API desde la sesión del navegador, en vez
// de pasar por los formularios: acá se prueba lo que muestran los widgets, y los
// formularios ya tienen sus propios tests (finanzas.spec.ts). Las cifras salen de
// apps/api/src/servicios/finanzas/widgets.ts, que tiene sus tests de integración.
//
// El avance automático se prueba con el reloj falso de Playwright: así no hay que
// esperar doce segundos de verdad ni depender de la velocidad de la máquina.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { type CuentaDePrueba, crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

// Mismo puerto fijo que utilidades.ts: la API que levanta Playwright.
const URL_API = "http://localhost:3101";
const INTERVALO_DEL_CARRUSEL_MS = 12000;

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

function haceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

async function pedirApi<T>(
  pagina: Page,
  metodo: "GET" | "POST" | "PUT",
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

/**
 * Deja un período abierto hace 10 días con: un ingreso de 10.000 en la segunda cuenta, dos
 * gastos en la primera (3.000 hace 5 días y 200 hace 4) y un límite de 100 para la categoría
 * del gasto chico. La primera cuenta queda en rojo, un presupuesto superado y el último
 * movimiento, de hace 4 días.
 */
async function prepararDatos(
  pagina: Page,
  opciones: { conPeriodoAnterior?: boolean } = {},
): Promise<{ cuentaEnRojo: string; categoria: string }> {
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

  const cargar = (datos: Record<string, unknown>) =>
    pedirApi(pagina, "POST", "/api/finanzas/movimientos", datos);

  if (opciones.conPeriodoAnterior) {
    // Un período de 20 días que cerró cuando empezó el actual, con 1.000 gastados en su segundo día.
    const anterior = await pedirApi<{ id: number }>(pagina, "POST", "/api/finanzas/periodos", {
      nombre: "Anterior",
      aperturaEn: haceDias(30),
    });
    await cargar({
      tipo: "gasto",
      importe: 1000,
      descripcion: "Mercado",
      fecha: haceDias(28),
      categoriaId: grande.id,
      cuentaFinancieraId: primera.id,
    });
    await pedirApi(pagina, "POST", `/api/finanzas/periodos/${anterior.id}/cerrar`, {
      cierreEn: haceDias(10),
    });
  }

  await pedirApi(pagina, "POST", "/api/finanzas/periodos", {
    nombre: "Prueba",
    aperturaEn: haceDias(10),
  });

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
  await pedirApi(pagina, "PUT", `/api/finanzas/presupuestos/${chica.id}`, { monto: 100 });

  return { cuentaEnRojo: primera.nombre, categoria: grande.nombre };
}

/** La tarjeta de un widget (con su tipo en `data-visual`), ubicada por su título. */
function widget(pagina: Page, titulo: string): Locator {
  return pagina.locator(`xpath=//div[@data-visual][.//p[normalize-space()='${titulo}']]`);
}

/** Uno de los dos carruseles de la columna lateral: el de texto (arriba) o el de gráficos (abajo). */
function carrusel(pagina: Page, categoria: "texto" | "gráficos" = "texto"): Locator {
  return pagina.getByRole("region", { name: `Widgets de finanzas: ${categoria}` });
}

test.describe("pantalla de inicio", () => {
  test("los widgets son el contenido principal: no hay columna de widgets aparte", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());

    await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Widgets" })).toHaveCount(0);
    await expect(page.getByText("Todavía no hay módulos")).toHaveCount(0);
  });

  test("sin períodos avisa que hay que abrir el primero y muestra el disponible", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());

    const aviso = widget(page, "Todavía sin períodos");
    await expect(aviso).toBeVisible();
    await expect(aviso.getByText("Aviso", { exact: true })).toBeVisible();
    await expect(widget(page, "Disponible").getByText("$ 0,00")).toBeVisible();
    // Sin período no hay balance ni ritmo que mostrar.
    await expect(page.getByText(/^Balance de /)).toHaveCount(0);
  });

  test("con movimientos muestra las cifras, las curiosidades y los avisos", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const { cuentaEnRojo, categoria } = await prepararDatos(page);
    await page.reload();

    // Avisos
    const enRojo = widget(page, "Cuenta en rojo");
    await expect(enRojo.getByText("-$ 3.200,00")).toBeVisible();
    await expect(enRojo.getByText(`${cuentaEnRojo} tiene el saldo en negativo.`)).toBeVisible();
    const superado = widget(page, "Presupuesto superado");
    await expect(superado.getByText("$ 100,00")).toBeVisible();
    await expect(superado.getByText(/Te pasaste en /)).toBeVisible();
    await expect(widget(page, "Hace días que no cargás nada").getByText("4 días")).toBeVisible();

    // Cifras y curiosidades
    await expect(widget(page, "Disponible").getByText("$ 6.800,00")).toBeVisible();
    await expect(widget(page, "Balance de Prueba").getByText("$ 6.800,00")).toBeVisible();
    await expect(widget(page, "Donde más gastás").getByText(categoria)).toBeVisible();
    const mayor = widget(page, "Tu gasto más grande");
    await expect(mayor.getByText("$ 3.000,00")).toBeVisible();
    await expect(mayor.getByText(/Alquiler/)).toBeVisible();
    await expect(widget(page, "Movimientos cargados").getByText("3")).toBeVisible();
  });

  test("los avisos van antes que las cifras", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.reload();
    // `allTextContents` no espera: primero hay que dejar que carguen los widgets.
    await expect(widget(page, "Disponible")).toBeVisible();

    const titulos = await page
      .locator(
        "xpath=//section[@aria-labelledby='widgets-de-finanzas']//li//div[contains(@class,'rounded-tarjeta')]/div[1]/p",
      )
      .allTextContents();

    const ultimoAviso = titulos.lastIndexOf("Hace días que no cargás nada");
    const primeraCifra = titulos.indexOf("Disponible");
    expect(ultimoAviso).toBeGreaterThanOrEqual(0);
    expect(primeraCifra).toBeGreaterThan(ultimoAviso);
    // Los más graves (rojo) van primero.
    expect(titulos.slice(0, 2).sort()).toEqual(["Cuenta en rojo", "Presupuesto superado"]);
  });
});

test.describe("carruseles de la pantalla de Finanzas", () => {
  test("hay dos en la columna lateral: texto arriba y gráficos abajo, con los avisos primero", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");

    const columna = page.getByRole("complementary", { name: "Widgets" });
    await expect(columna).toBeVisible();
    await expect(columna.getByRole("region")).toHaveCount(2);
    // Arriba, los de texto: lo primero que se ve es el aviso más grave.
    await expect(carrusel(page).getByText("Cuenta en rojo")).toBeVisible();
    await expect(carrusel(page).locator("[data-categoria]")).toHaveAttribute(
      "data-categoria",
      "texto",
    );
    // Abajo, los gráficos: cada uno lleva su mini gráfico.
    await expect(carrusel(page, "gráficos").locator("[data-categoria]")).toHaveAttribute(
      "data-categoria",
      "grafico",
    );
    await expect(carrusel(page, "gráficos").locator("[data-visual]")).not.toHaveAttribute(
      "data-visual",
      "cifra",
    );
    // El de texto está encima del de gráficos.
    const arriba = await carrusel(page).boundingBox();
    const abajo = await carrusel(page, "gráficos").boundingBox();
    if (!arriba || !abajo) throw new Error("Sin medidas");
    expect(arriba.y + arriba.height).toBeLessThanOrEqual(abajo.y);
  });

  test("los dos carruseles son grandes, están juntos y centrados, con margen arriba y abajo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const columna = page.getByRole("complementary", { name: "Widgets" });
    await expect(columna.getByRole("region")).toHaveCount(2);

    const cajaDeLaColumna = await columna.boundingBox();
    const arriba = await carrusel(page).boundingBox();
    const abajo = await carrusel(page, "gráficos").boundingBox();
    if (!cajaDeLaColumna || !arriba || !abajo) throw new Error("Sin medidas");

    // En una ventana de 900 px de alto miden 320 px (con menos alto, 288 o 256) y hay 48 px entre ellos.
    expect(arriba.height).toBeGreaterThanOrEqual(320);
    expect(abajo.height).toBeGreaterThanOrEqual(320);
    const hueco = abajo.y - (arriba.y + arriba.height);
    expect(hueco).toBeGreaterThan(0);
    expect(hueco).toBeGreaterThanOrEqual(44);
    expect(hueco).toBeLessThanOrEqual(52);
    // Con margen de sobra arriba y abajo de la columna, y parejo: están en el medio.
    const margenSuperior = arriba.y - cajaDeLaColumna.y;
    const margenInferior = cajaDeLaColumna.y + cajaDeLaColumna.height - (abajo.y + abajo.height);
    expect(margenSuperior).toBeGreaterThan(16);
    expect(Math.abs(margenSuperior - margenInferior)).toBeLessThanOrEqual(4);
  });

  test("la columna de widgets y el menú acompañan el scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const widgets = page.getByRole("complementary", { name: "Widgets" });
    const menu = page.getByRole("complementary", { name: "Navegación" });
    await expect(widgets.getByRole("region")).toHaveCount(2);
    // Alargamos la pantalla para que haya de dónde scrollear.
    await page.evaluate(() => {
      const relleno = document.createElement("div");
      relleno.style.height = "3000px";
      document.querySelector("main")?.appendChild(relleno);
    });
    const antes = { widgets: await widgets.boundingBox(), menu: await menu.boundingBox() };

    await page.mouse.wheel(0, 1500);
    await expect.poll(async () => await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);

    const despues = { widgets: await widgets.boundingBox(), menu: await menu.boundingBox() };
    // Hasta un píxel de diferencia: el borde de la barra superior redondea distinto al desplazarse.
    expect(Math.abs((despues.widgets?.y ?? 999) - (antes.widgets?.y ?? -999))).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs((despues.menu?.y ?? 999) - (antes.menu?.y ?? -999))).toBeLessThanOrEqual(1);
    // Y siguen a la vista, no quedaron arriba de todo fuera de la pantalla.
    expect(despues.widgets?.y).toBeLessThan(100);
  });

  test("cada carrusel tiene solo dos flechas: sin contador, sin pausa ni barra de tiempo", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const columna = page.getByRole("complementary", { name: "Widgets" });
    await expect(columna.getByRole("region")).toHaveCount(2);

    await expect(columna.getByRole("button", { name: "Widget anterior" })).toHaveCount(2);
    await expect(columna.getByRole("button", { name: "Widget siguiente" })).toHaveCount(2);
    // Nada más: ni "1 de 3", ni botón de pausa, ni nada que cuente el tiempo.
    await expect(columna.getByRole("button")).toHaveCount(4);
    await expect(columna.getByText(/^\d+ de \d+$/)).toHaveCount(0);
    await expect(columna.getByRole("progressbar")).toHaveCount(0);
  });

  test("las flechas están por fuera de la tarjeta, una a cada lado, y solo se ven con el mouse encima", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    await expect(zona.getByText("Cuenta en rojo")).toBeVisible();
    await page.mouse.move(0, 0);

    const tarjeta = await zona.locator("[data-visual]").boundingBox();
    const anterior = zona.getByRole("button", { name: "Widget anterior" });
    const siguiente = zona.getByRole("button", { name: "Widget siguiente" });
    const cajaAnterior = await anterior.boundingBox();
    const cajaSiguiente = await siguiente.boundingBox();
    if (!tarjeta || !cajaAnterior || !cajaSiguiente) throw new Error("Sin medidas");

    // La anterior termina antes de que empiece la tarjeta, y la siguiente empieza después de que termina.
    expect(cajaAnterior.x + cajaAnterior.width).toBeLessThanOrEqual(tarjeta.x);
    expect(cajaSiguiente.x).toBeGreaterThanOrEqual(tarjeta.x + tarjeta.width);
    // Centradas en vertical respecto de la tarjeta.
    const centroDeLaTarjeta = tarjeta.y + tarjeta.height / 2;
    expect(Math.abs(cajaAnterior.y + cajaAnterior.height / 2 - centroDeLaTarjeta)).toBeLessThan(6);
    expect(Math.abs(cajaSiguiente.y + cajaSiguiente.height / 2 - centroDeLaTarjeta)).toBeLessThan(
      6,
    );
    // Sin el mouse encima no se ven (pero su lugar sigue ahí, así que no mueven nada)...
    await expect(anterior).toHaveCSS("opacity", "0");
    await expect(siguiente).toHaveCSS("opacity", "0");
    // ... con el mouse sobre el carrusel aparecen las dos...
    await zona.hover();
    await expect(anterior).toHaveCSS("opacity", "1");
    await expect(siguiente).toHaveCSS("opacity", "1");
    expect(await anterior.boundingBox()).toEqual(cajaAnterior);
    // ... y al sacarlo, se van.
    await page.mouse.move(0, 0);
    await expect(anterior).toHaveCSS("opacity", "0");
  });

  test("las flechas también aparecen con el foco del teclado", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    await expect(zona.getByText("Cuenta en rojo")).toBeVisible();
    await page.mouse.move(0, 0);
    const siguiente = zona.getByRole("button", { name: "Widget siguiente" });
    await expect(siguiente).toHaveCSS("opacity", "0");

    await siguiente.focus();

    await expect(siguiente).toHaveCSS("opacity", "1");
    await expect(zona.getByRole("button", { name: "Widget anterior" })).toHaveCSS("opacity", "1");
  });

  test("las flechas pasan al siguiente y al anterior, dando la vuelta", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    const primero = await zona.getByRole("group").getAttribute("aria-label");
    expect(primero).toMatch(/^1 de \d+$/);
    const total = Number(primero?.split(" de ")[1]);
    expect(total).toBeGreaterThanOrEqual(3);
    await expect(zona.getByText("Cuenta en rojo")).toBeVisible();

    await zona.getByRole("button", { name: "Widget siguiente" }).click();
    await expect(zona.getByRole("group", { name: `2 de ${total}` })).toBeVisible();
    await expect(zona.getByText("Cuenta en rojo")).toHaveCount(0);
    await zona.getByRole("button", { name: "Widget anterior" }).click();
    await expect(zona.getByText("Cuenta en rojo")).toBeVisible();
    // Hacia atrás desde el primero se da la vuelta hasta el último.
    await zona.getByRole("button", { name: "Widget anterior" }).click();
    await expect(zona.getByRole("group", { name: `${total} de ${total}` })).toBeVisible();
    await zona.getByRole("button", { name: "Widget siguiente" }).click();
    await expect(zona.getByText("Cuenta en rojo")).toBeVisible();
  });

  test("ningún widget se corta: todo su contenido y su texto entran en la tarjeta, en los dos carruseles", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page, { conPeriodoAnterior: true });
    await page.goto("/finanzas");

    for (const nombre of ["texto", "gráficos"] as const) {
      const zona = carrusel(page, nombre);
      const total = Number(
        (await zona.getByRole("group").getAttribute("aria-label"))?.split(" de ")[1],
      );
      expect(total).toBeGreaterThanOrEqual(2);
      for (let vuelta = 0; vuelta < total; vuelta++) {
        // Lo más bajo que llega cualquier elemento de la tarjeta, contra el borde de la tarjeta.
        const sobrante = await zona.locator("[data-visual]").evaluate((tarjeta) => {
          const limite = tarjeta.getBoundingClientRect().bottom;
          const masBajo = Math.max(
            ...[...tarjeta.querySelectorAll("*")].map((el) => el.getBoundingClientRect().bottom),
          );
          return masBajo - limite;
        });
        expect(sobrante, `${nombre}, widget ${vuelta + 1} de ${total}`).toBeLessThanOrEqual(1);
        // Y ningún texto queda cortado (con "…" o recortado por un máximo de renglones).
        const cortados = await zona
          .locator("[data-visual]")
          .evaluate((tarjeta) =>
            [...tarjeta.querySelectorAll("p, span, dt, dd")]
              .filter(
                (el) =>
                  el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 4,
              )
              .map((el) => el.textContent),
          );
        expect(cortados, `${nombre}, widget ${vuelta + 1} de ${total}`).toEqual([]);
        await zona.getByRole("button", { name: "Widget siguiente" }).click();
        await expect(
          zona.getByRole("group", { name: new RegExp(`^${((vuelta + 1) % total) + 1} de `) }),
        ).toBeVisible();
      }
    }
  });

  /** Deja el gasto más grande con una descripción larguísima: el widget de texto no entra en la tarjeta. */
  async function conUnTextoLargo(pagina: Page): Promise<Locator> {
    const { cuentas } = await pedirApi<{ cuentas: { id: string }[] }>(
      pagina,
      "GET",
      "/api/finanzas/cuentas",
    );
    const { categorias } = await pedirApi<{ categorias: { id: number; sistema: string | null }[] }>(
      pagina,
      "GET",
      "/api/finanzas/categorias",
    );
    const cuenta = cuentas[0];
    const categoria = categorias.find((otra) => otra.sistema === null);
    if (!cuenta || !categoria) throw new Error("Faltan cuentas o categorías");
    await pedirApi(pagina, "POST", "/api/finanzas/movimientos", {
      tipo: "gasto",
      importe: 9000,
      descripcion:
        "Materiales para renovar el baño y la cocina de la casa de la playa, con flete e instalación incluidos hasta fin de mes".slice(
          0,
          140,
        ),
      fecha: haceDias(3),
      categoriaId: categoria.id,
      cuentaFinancieraId: cuenta.id,
    });
    await pagina.goto("/finanzas");
    const zona = carrusel(pagina);
    // Hasta el widget del gasto más grande.
    for (let intento = 0; intento < 8; intento++) {
      if (await zona.getByText("Tu gasto más grande").isVisible()) break;
      await zona.getByRole("button", { name: "Widget siguiente" }).click();
    }
    await expect(zona.getByText("Tu gasto más grande")).toBeVisible();
    // La que no entra es la única enfocable (las otras pueden seguir en pantalla mientras terminan de salir).
    return zona.locator("[data-area-desplazable][tabindex]");
  }

  test("si un texto no entra en la tarjeta, la zona se desliza sola para leerlo entero", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    const area = await conUnTextoLargo(page);
    await page.mouse.move(0, 0);

    // El contenido es más alto que la zona, y se puede enfocar con el teclado para leerlo.
    const medidas = await area.evaluate((el) => ({
      total: el.scrollHeight,
      visible: el.clientHeight,
    }));
    expect(medidas.total).toBeGreaterThan(medidas.visible);
    await expect(area).toHaveAttribute("tabindex", "0");

    // Pasa un momento y empieza a bajar sola, hasta mostrar el final.
    await expect
      .poll(async () => await area.evaluate((el) => el.scrollTop), { timeout: 8000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          await area.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1),
        {
          timeout: 8000,
        },
      )
      .toBe(true);
  });

  test("con el mouse encima se queda quieta, y con reducir movimiento no se desliza sola pero se puede leer a mano", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    const area = await conUnTextoLargo(page);
    // Con el mouse encima, aunque pase el tiempo, no se mueve.
    await area.hover();
    await page.waitForTimeout(3500);
    expect(await area.evaluate((el) => el.scrollTop)).toBe(0);
    // Con la rueda se puede bajar a mano.
    await page.mouse.wheel(0, 300);
    await expect.poll(async () => await area.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    const zona = carrusel(page);
    for (let intento = 0; intento < 8; intento++) {
      if (await zona.getByText("Tu gasto más grande").isVisible()) break;
      await zona.getByRole("button", { name: "Widget siguiente" }).click();
    }
    const otra = zona.locator("[data-area-desplazable][tabindex]");
    await page.mouse.move(0, 0);
    await page.waitForTimeout(3500);
    expect(await otra.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await otra.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  });

  test("lo que entra no se mueve ni suma una parada al teclado", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const area = carrusel(page).locator("[data-area-desplazable]");
    await expect(area).not.toHaveAttribute("tabindex", /.*/);
    await page.waitForTimeout(3000);
    expect(await area.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("avanza solo cada pocos segundos", async ({ page }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    await expect(zona.getByRole("group", { name: /^1 de / })).toBeVisible();

    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS + 100);
    await expect(zona.getByRole("group", { name: /^2 de / })).toBeVisible();
    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS + 100);
    await expect(zona.getByRole("group", { name: /^3 de / })).toBeVisible();
  });

  test("sin intervenir, los dos carruseles cambian a la vez", async ({ page }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const nombres = ["texto", "gráficos"] as const;
    for (const nombre of nombres) {
      await expect(carrusel(page, nombre).getByRole("group", { name: /^1 de / })).toBeVisible();
    }

    // Poco antes de cumplirse el tiempo no cambió ninguno...
    await page.mouse.move(0, 0);
    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS - 500);
    for (const nombre of nombres) {
      await expect(carrusel(page, nombre).getByRole("group", { name: /^1 de / })).toBeVisible();
    }
    // ... y apenas se cumple, cambiaron los dos.
    await page.clock.fastForward(600);
    for (const nombre of nombres) {
      await expect(carrusel(page, nombre).getByRole("group", { name: /^2 de / })).toBeVisible();
    }
    // Y siguen a la par en el cambio siguiente.
    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS);
    for (const nombre of nombres) {
      await expect(carrusel(page, nombre).getByRole("group", { name: /^3 de / })).toBeVisible();
    }
  });

  for (const [tocado, otro] of [
    ["texto", "gráficos"],
    ["gráficos", "texto"],
  ] as const) {
    test(`tocar la flecha del carrusel de ${tocado} reinicia el tiempo de los dos`, async ({
      page,
    }) => {
      await page.clock.install();
      await entrar(page, await crearCuentaAprobada());
      await prepararDatos(page);
      await page.goto("/finanzas");
      for (const nombre of [tocado, otro]) {
        await expect(carrusel(page, nombre).getByRole("group", { name: /^1 de / })).toBeVisible();
      }

      // Faltan 3 segundos para que cambien solos, y se toca la flecha de uno.
      await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS - 3000);
      await carrusel(page, tocado).getByRole("button", { name: "Widget siguiente" }).click();
      await expect(carrusel(page, tocado).getByRole("group", { name: /^2 de / })).toBeVisible();
      await page.mouse.move(0, 0);

      // Sin el reinicio, a los 3 segundos habrían cambiado los dos. Con el reinicio, ni el que se
      // tocó ni el otro cambian: el tiempo empezó de nuevo.
      await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS - 3000);
      await expect(carrusel(page, tocado).getByRole("group", { name: /^2 de / })).toBeVisible();
      await expect(carrusel(page, otro).getByRole("group", { name: /^1 de / })).toBeVisible();

      // Cuando se cumple el tiempo completo desde el toque, cambian los dos a la vez.
      await page.clock.fastForward(3100);
      await expect(carrusel(page, tocado).getByRole("group", { name: /^3 de / })).toBeVisible();
      await expect(carrusel(page, otro).getByRole("group", { name: /^2 de / })).toBeVisible();
    });
  }

  test("las flechas siguen cambiando el widget aunque el reloj se reinicie en cada toque", async ({
    page,
  }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    await expect(zona.getByRole("group", { name: /^1 de / })).toBeVisible();

    await zona.getByRole("button", { name: "Widget siguiente" }).click();
    await expect(zona.getByRole("group", { name: /^2 de / })).toBeVisible();
    await zona.getByRole("button", { name: "Widget siguiente" }).click();
    await expect(zona.getByRole("group", { name: /^3 de / })).toBeVisible();
    await zona.getByRole("button", { name: "Widget anterior" }).click();
    await expect(zona.getByRole("group", { name: /^2 de / })).toBeVisible();
  });

  test("al detener uno con el mouse, ese se queda y el otro sigue", async ({ page }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    for (const nombre of ["texto", "gráficos"] as const) {
      await expect(carrusel(page, nombre).getByRole("group", { name: /^1 de / })).toBeVisible();
    }

    await carrusel(page, "gráficos").hover();
    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS + 100);

    await expect(carrusel(page).getByRole("group", { name: /^2 de / })).toBeVisible();
    await expect(carrusel(page, "gráficos").getByRole("group", { name: /^1 de / })).toBeVisible();
  });

  test("se detiene mientras el mouse está encima y sigue al sacarlo", async ({ page }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    await expect(zona.getByRole("group", { name: /^1 de / })).toBeVisible();

    await zona.hover();
    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS * 3);
    await expect(zona.getByRole("group", { name: /^1 de / })).toBeVisible();

    await page.mouse.move(0, 0);
    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS + 100);
    await expect(zona.getByRole("group", { name: /^2 de / })).toBeVisible();
  });

  test("se detiene con el foco del teclado", async ({ page }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    await expect(zona.getByRole("group", { name: /^1 de / })).toBeVisible();

    await zona.getByRole("button", { name: "Widget siguiente" }).focus();
    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS * 3);

    await expect(zona.getByRole("group", { name: /^1 de / })).toBeVisible();
  });

  test("tocar una flecha con el mouse no deja el carrusel quieto cuando el mouse se va", async ({
    page,
  }) => {
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    await expect(zona.getByRole("group", { name: /^1 de / })).toBeVisible();

    await zona.getByRole("button", { name: "Widget siguiente" }).click();
    await expect(zona.getByRole("group", { name: /^2 de / })).toBeVisible();
    // El foco quedó en la flecha, pero llegó con el mouse: no cuenta como foco de teclado.
    await page.mouse.move(0, 0);
    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS + 100);

    await expect(zona.getByRole("group", { name: /^3 de / })).toBeVisible();
  });

  test("con reducir movimiento no avanza solo, y las flechas siguen funcionando", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.install();
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    const zona = carrusel(page);
    await expect(zona.getByText("Cuenta en rojo")).toBeVisible();

    await page.clock.fastForward(INTERVALO_DEL_CARRUSEL_MS * 3);

    await expect(zona.getByText("Cuenta en rojo")).toBeVisible();
    await zona.getByRole("button", { name: "Widget siguiente" }).click();
    await expect(zona.getByText("Cuenta en rojo")).toHaveCount(0);
  });

  test("sin períodos solo hay widgets de texto: el aviso y el disponible, y no aparece el de gráficos", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/finanzas");
    const columna = page.getByRole("complementary", { name: "Widgets" });

    // Sin períodos hay dos widgets, los dos de texto: queda un solo carrusel.
    await expect(columna.getByRole("region")).toHaveCount(1);
    await expect(carrusel(page).getByText("Todavía sin períodos")).toBeVisible();
    await carrusel(page).getByRole("button", { name: "Widget siguiente" }).click();
    await expect(carrusel(page).getByText("Disponible", { exact: true })).toBeVisible();
    await expect(carrusel(page, "gráficos")).toHaveCount(0);
  });
});

test.describe("variedad de widgets", () => {
  test("hay widgets de cifra sola y con cada tipo de mini gráfico", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page, { conPeriodoAnterior: true });
    await page.reload();
    await expect(widget(page, "Disponible")).toBeVisible();

    const tipos = await page
      .locator("section[aria-labelledby='widgets-de-finanzas'] [data-visual]")
      .evaluateAll((tarjetas) => tarjetas.map((tarjeta) => tarjeta.getAttribute("data-visual")));

    // De cada forma hay al menos una: solo texto, línea, barras, comparación, anillo, avance y ranking.
    for (const esperado of [
      "cifra",
      "linea",
      "barras",
      "comparacion",
      "anillo",
      "progreso",
      "ranking",
    ]) {
      expect(tipos, `falta un widget de tipo ${esperado}`).toContain(esperado);
    }
    // Y no son todos iguales: hay más de una forma entre las tarjetas.
    expect(new Set(tipos).size).toBeGreaterThanOrEqual(6);
  });

  test("el balance compara lo que entró con lo que salió", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.reload();

    const balance = widget(page, "Balance de Prueba");
    await expect(balance).toHaveAttribute("data-visual", "comparacion");
    await expect(balance.getByText("Entró")).toBeVisible();
    await expect(balance.getByText("$ 10.000,00")).toBeVisible();
    await expect(balance.getByText("Salió")).toBeVisible();
    await expect(balance.getByText("$ 3.200,00")).toBeVisible();
  });

  test("el ritmo de gasto dibuja las dos líneas y dice cuánto más se gasta que en el período anterior", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page, { conPeriodoAnterior: true });
    await page.reload();

    const ritmo = widget(page, "Ritmo de gasto");
    await expect(ritmo).toHaveAttribute("data-visual", "linea");
    // Se llevan $ 3.200 gastados contra $ 1.000 del período anterior a esta altura: 220 % más.
    await expect(ritmo.getByText(/^\+220/)).toBeVisible();
    await expect(ritmo.getByText(/llevabas \$\s1\.000,00/)).toBeVisible();
    // La actual (sólida) y la del período anterior (punteada).
    await expect(ritmo.locator("svg.overflow-visible path")).toHaveCount(2);
    await expect(ritmo.locator("svg.overflow-visible path[stroke-dasharray]")).toHaveCount(1);
  });

  test("el gasto por período muestra una barra por período y resalta el actual", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page, { conPeriodoAnterior: true });
    await page.reload();

    const evolucion = widget(page, "Gasto por período");
    await expect(evolucion).toHaveAttribute("data-visual", "barras");
    await expect(evolucion.locator("div.flex-1.rounded-sm")).toHaveCount(2);
    await expect(evolucion.locator("div.flex-1.rounded-sm.bg-acento")).toHaveCount(1);
    await expect(evolucion.getByText("$ 3.200,00")).toBeVisible();
  });

  test("donde más gastás lleva un anillo con el porcentaje adentro", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const { categoria } = await prepararDatos(page);
    await page.reload();

    const donde = widget(page, "Donde más gastás");
    await expect(donde).toHaveAttribute("data-visual", "anillo");
    await expect(donde.getByText(categoria)).toBeVisible();
    // 3.000 de 3.200 gastados: 94 %.
    await expect(donde.getByText("94%")).toBeVisible();
  });

  test("los presupuestos muestran una barra de avance que avisa cuando se pasa del límite", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.reload();

    const presupuestos = widget(page, "Presupuestos del período");
    await expect(presupuestos).toHaveAttribute("data-visual", "progreso");
    // Gastó 200 sobre un límite de 100: se pasó, así que la barra va llena y en rojo.
    await expect(presupuestos.getByText(/^200/)).toBeVisible();
    await expect(presupuestos.locator("div.bg-peligro")).toHaveCount(1);
  });

  test("los mayores gastos son un ranking con la categoría, su monto y una barra", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const { categoria } = await prepararDatos(page);
    await page.reload();

    const ranking = widget(page, "Tus mayores gastos");
    await expect(ranking).toHaveAttribute("data-visual", "ranking");
    await expect(ranking.getByRole("listitem")).toHaveCount(2);
    await expect(ranking.getByRole("listitem").first()).toContainText(categoria);
    await expect(ranking.getByRole("listitem").first()).toContainText("$ 3.000,00");
  });

  test("el gasto por día dibuja las barras de los últimos días", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.reload();

    const porDia = widget(page, "Gasto por día");
    await expect(porDia).toHaveAttribute("data-visual", "barras");
    await expect(porDia.locator("div.flex-1.rounded-sm")).toHaveCount(7);
  });

  test("los avisos y las cifras sin gráfico siguen siendo solo texto", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.reload();

    await expect(widget(page, "Cuenta en rojo")).toHaveAttribute("data-visual", "cifra");
    await expect(widget(page, "Disponible")).toHaveAttribute("data-visual", "cifra");
    await expect(widget(page, "Tu gasto más grande")).toHaveAttribute("data-visual", "cifra");
    await expect(widget(page, "Movimientos cargados")).toHaveAttribute("data-visual", "cifra");
  });

  test("los gráficos son decorativos para un lector de pantalla", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page, { conPeriodoAnterior: true });
    await page.reload();
    await expect(widget(page, "Ritmo de gasto")).toBeVisible();

    // Ningún <svg> está expuesto: lo que dicen lo dice el texto de la tarjeta.
    const expuestos = await page
      .locator("section[aria-labelledby='widgets-de-finanzas'] svg")
      .evaluateAll((svgs) => svgs.filter((svg) => !svg.closest("[aria-hidden='true']")).length);
    expect(expuestos).toBe(0);
  });
});

test.describe("pantallas sin widgets", () => {
  test("administración no reserva una tercera columna", async ({ page }) => {
    const admin = await crearCuentaAprobada({ esAdmin: true });
    await entrar(page, admin);
    await page.goto("/admin");

    await expect(page.getByRole("heading", { name: "Menú de administración" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Widgets" })).toHaveCount(0);
  });
});

test.describe("accesibilidad de los widgets", () => {
  test("la pantalla de inicio con datos no tiene violaciones", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.reload();
    await expect(widget(page, "Cuenta en rojo")).toBeVisible();

    const resultados = await new AxeBuilder({ page }).analyze();

    expect(resultados.violations).toEqual([]);
  });

  test("la pantalla de Finanzas con el carrusel no tiene violaciones", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.goto("/finanzas");
    await expect(carrusel(page).getByText("Cuenta en rojo")).toBeVisible();

    const resultados = await new AxeBuilder({ page }).analyze();

    expect(resultados.violations).toEqual([]);
  });

  test("los avisos y las cifras se leen bien en modo oscuro", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await entrar(page, await crearCuentaAprobada());
    await prepararDatos(page);
    await page.reload();
    await expect(widget(page, "Cuenta en rojo")).toBeVisible();

    const resultados = await new AxeBuilder({ page }).analyze();

    expect(resultados.violations).toEqual([]);
  });
});

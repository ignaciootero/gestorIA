// Tests end-to-end del módulo de ingresos y gastos: los períodos (abrir,
// cerrar y continuar con el siguiente), el camino principal (agregar un gasto
// y un ingreso rápido, ver el resumen actualizado) y accesibilidad.
//
// Casi todo necesita un período abierto: `abrirPrimerPeriodo` lo abre por la
// interfaz, igual que lo haría la persona.
//
// Las reglas de negocio (cálculo de totales, privacidad entre usuarios,
// validaciones) ya están cubiertas por los tests de integración de apps/api;
// acá se prueba lo que la persona ve y hace en el navegador.

import AxeBuilder from "@axe-core/playwright";
import { CATEGORIAS_POR_DEFECTO } from "@gestoria/shared";
import { expect, type Locator, type Page, test } from "@playwright/test";
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

/** "AAAA-MM-DDT10:00" de hace `dias` días, en hora local: el formato de un <input type="datetime-local">. */
function haceDias(dias: number): string {
  const fecha = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}T10:00`;
}

/** Nombre que la aplicación sugiere para un período abierto hoy: mes y año ("Octubre 2026"). */
function nombreDelPeriodoActual(): string {
  const ahora = new Date();
  const mes = new Intl.DateTimeFormat("es-UY", { month: "long" }).format(ahora);
  const anio = new Intl.DateTimeFormat("es-UY", { year: "numeric" }).format(ahora);
  return `${mes.charAt(0).toLocaleUpperCase("es")}${mes.slice(1)} ${anio}`;
}

/** Desde el estado vacío del módulo: abre el primer período con los valores propuestos. */
async function abrirPrimerPeriodo(pagina: Page): Promise<void> {
  await pagina.getByRole("button", { name: "Abrir mi primer período" }).click();
  const dialogo = pagina.getByRole("dialog", { name: "Abrir período" });
  await dialogo.getByRole("button", { name: "Abrir período" }).click();
  await expect(pagina.getByRole("heading", { name: "Abrir período" })).toBeHidden();
  await expect(pagina.getByLabel("Período", { exact: true })).toBeVisible();
}

/**
 * Las opciones de cuenta del formulario de movimientos llevan el saldo ("Banco
 * ($ 0,00)"), así que se elige por el nombre al principio y no por la etiqueta
 * completa.
 */
async function elegirCuenta(selector: Locator, nombre: string): Promise<void> {
  const valor = await selector
    .locator("option", { hasText: new RegExp(`^${nombre} \\(`) })
    .getAttribute("value");
  if (valor === null) throw new Error(`No hay una opción de cuenta "${nombre}"`);
  await selector.selectOption({ value: valor });
}

/**
 * Toca el botón que guarda el movimiento y, si el formulario pide confirmar que la
 * cuenta quedaría con saldo negativo (las cuentas de prueba arrancan en cero),
 * acepta. `titulo` es el del diálogo, para saber cuándo se cerró.
 */
async function guardarAceptandoSaldoNegativo(
  pagina: Page,
  boton: Locator,
  titulo: string,
): Promise<void> {
  await boton.click();
  const confirmar = pagina.getByRole("button", { name: "Sí, guardar igual" });
  await Promise.race([
    confirmar.waitFor({ state: "visible" }).catch(() => {}),
    pagina
      .getByRole("heading", { name: titulo })
      .waitFor({ state: "hidden" })
      .catch(() => {}),
  ]);
  if (await confirmar.isVisible()) await confirmar.click();
}

async function agregarMovimiento(
  pagina: Page,
  datos: { tipo?: "Ingreso" | "Gasto"; importe: string; descripcion: string; categoria?: string },
): Promise<void> {
  await pagina.getByRole("button", { name: "Agregar movimiento" }).click();
  await pagina.getByRole("heading", { name: "Agregar movimiento" }).waitFor();
  if (datos.tipo === "Ingreso") {
    await pagina.getByRole("radio", { name: "Ingreso" }).click();
  }
  await pagina.getByLabel("Importe").fill(datos.importe);
  await pagina.getByLabel("Descripción").fill(datos.descripcion);
  if (datos.categoria) {
    await pagina.getByLabel("Categoría").selectOption({ label: datos.categoria });
  }
  await guardarAceptandoSaldoNegativo(
    pagina,
    pagina.getByRole("button", { name: /Guardar/ }),
    "Agregar movimiento",
  );
  await expect(pagina.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();
}

test.describe("acceso al módulo", () => {
  test("aparece en el menú y lleva al dashboard", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);

    await page.getByRole("link", { name: "Finanzas" }).click();
    await expect(page).toHaveURL(/\/finanzas$/);
    await expect(page.getByRole("heading", { name: "Finanzas" })).toBeVisible();
  });

  test("sin sesión, /finanzas lleva a ingresar", async ({ page }) => {
    await page.goto("/finanzas");
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});

test.describe("resumen y alta rápida de movimientos", () => {
  test("con un período recién abierto, el dashboard arranca en cero y muestra un estado vacío útil", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await expect(page.getByText("Balance del período")).toBeVisible();
    await expect(page.getByText(/Todavía no hay movimientos en /)).toBeVisible();
  });

  test("agregar un gasto lo refleja en el resumen", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { importe: "1500.50", descripcion: "Supermercado" });

    await expect(page.getByText("Supermercado")).toBeVisible();
    await expect(page.getByText("-$").first()).toBeVisible();
  });

  test("balance, ingresos y gastos se actualizan con un ingreso y un gasto", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { tipo: "Ingreso", importe: "5000", descripcion: "Sueldo" });
    await agregarMovimiento(page, { importe: "1500.50", descripcion: "Supermercado" });

    const tarjetaIngresos = page.getByText("Ingresos").locator("..");
    await expect(tarjetaIngresos.getByText("$ 5.000,00")).toBeVisible();

    const tarjetaGastos = page.getByText("Gastos").locator("..");
    await expect(tarjetaGastos.getByText("$ 1.500,50")).toBeVisible();

    // 5000 - 1500,50 = 3499,50.
    const tarjetaBalance = page.getByText("Balance del período").locator("..");
    await expect(tarjetaBalance.getByText("$ 3.499,50")).toBeVisible();
  });

  test("recuerda la última categoría y cuenta usadas", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await page.getByLabel("Categoría").selectOption({ label: "Transporte" });
    await elegirCuenta(page.getByLabel("Cuenta"), "Banco");
    await page.getByLabel("Importe").fill("100");
    await page.getByLabel("Descripción").fill("Taxi");
    await guardarAceptandoSaldoNegativo(
      page,
      page.getByRole("button", { name: /Guardar/ }),
      "Agregar movimiento",
    );
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await expect(page.getByLabel("Categoría")).toHaveValue(/.+/);
    await expect(page.getByLabel("Categoría").locator("option:checked")).toHaveText("Transporte");
    await expect(page.getByLabel("Cuenta").locator("option:checked")).toHaveText(/^Banco \(/);
  });
});

test.describe("listado de movimientos", () => {
  test("buscar filtra por descripción", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { importe: "100", descripcion: "Café" });
    await agregarMovimiento(page, { importe: "200", descripcion: "Taxi" });

    await page.getByRole("tab", { name: "Movimientos" }).click();
    await expect(page.getByText("Café")).toBeVisible();
    await expect(page.getByText("Taxi")).toBeVisible();

    await page.getByPlaceholder("Descripción").fill("Café");
    await expect(page.getByText("Taxi")).toBeHidden();
    await expect(page.getByText("Café")).toBeVisible();
  });

  test("editar cambia los datos y los refleja en la lista", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { importe: "100", descripcion: "Café" });
    await page.getByRole("tab", { name: "Movimientos" }).click();

    const fila = page.locator("div.group", { hasText: "Café" });
    await fila.hover();
    await fila.getByRole("button", { name: "Editar" }).click();
    await page.getByRole("heading", { name: "Editar movimiento" }).waitFor();
    await page.getByLabel("Descripción").fill("Café con leche");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Editar movimiento" })).toBeHidden();

    await expect(page.getByText("Café con leche")).toBeVisible();
  });

  test("duplicar crea una copia independiente", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { importe: "200", descripcion: "Taxi" });
    await page.getByRole("tab", { name: "Movimientos" }).click();

    const fila = page.locator("div.group", { hasText: "Taxi" });
    await fila.hover();
    await fila.getByRole("button", { name: "Duplicar" }).click();

    await expect(page.getByText("Taxi")).toHaveCount(2);
  });

  test("eliminar pide confirmación y saca el movimiento de la lista", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { importe: "100", descripcion: "Café" });
    await page.getByRole("tab", { name: "Movimientos" }).click();

    const fila = page.locator("div.group", { hasText: "Café" });
    await fila.hover();
    await fila.getByRole("button", { name: "Eliminar" }).click();
    await page.getByRole("heading", { name: "Eliminar movimiento" }).waitFor();

    // El diálogo también tiene un botón "Eliminar": el último es el de confirmar.
    await page.getByRole("button", { name: "Eliminar" }).last().click();
    await expect(page.getByRole("heading", { name: "Eliminar movimiento" })).toBeHidden();

    await expect(page.getByText(/Todavía no hay movimientos en /)).toBeVisible();
  });
});

test.describe("cuentas y categorías", () => {
  test("ya vienen con las cuentas y categorías por defecto", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await expect(page.getByText("Efectivo")).toBeVisible();
    await expect(page.getByText("Banco")).toBeVisible();
    await expect(page.getByText("Alimentación")).toBeVisible();
    await expect(page.getByText("Transporte")).toBeVisible();
    // Pensada para sueldos y otras entradas de dinero.
    await expect(page.getByText("Ingresos", { exact: true })).toBeVisible();
    // La categoría interna de transferencias no se lista (no es una categoría para administrar).
    await expect(page.getByText("Transferencia entre Cuentas")).toHaveCount(0);
    await expect(page.getByText("Especial", { exact: true })).toHaveCount(0);
  });

  test("crear una cuenta con saldo inicial la muestra con ese saldo", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByRole("button", { name: "Nueva" }).first().click();
    await page.getByRole("heading", { name: "Nueva cuenta" }).waitFor();
    await page.getByLabel("Nombre").fill("Ahorros");
    await page.getByLabel("Saldo inicial").fill("1000");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("heading", { name: "Nueva cuenta" })).toBeHidden();

    await expect(page.getByText("Ahorros")).toBeVisible();
    await expect(page.getByText("$ 1.000,00")).toBeVisible();
  });

  test('el saldo con el que se crea una cuenta figura en su historial como "Carga inicial"', async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByRole("button", { name: "Nueva" }).first().click();
    await page.getByLabel("Nombre").fill("Ahorros");
    await page.getByLabel("Saldo inicial").fill("1000");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("heading", { name: "Nueva cuenta" })).toBeHidden();

    await page.getByRole("button", { name: "Ver historial de Ahorros" }).click();
    const historial = page.getByRole("dialog", { name: "Historial de Ahorros" });
    await expect(historial.getByText("Carga inicial")).toBeVisible();
    await expect(historial.getByText("+$ 1.000,00")).toBeVisible();
    await expect(historial.getByText(/Al crear la cuenta/)).toBeVisible();

    // Una cuenta creada sin saldo no tiene carga inicial (la de Efectivo, por defecto, está en cero).
    await historial.getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("button", { name: "Ver historial de Efectivo" }).click();
    await expect(
      page.getByRole("dialog", { name: "Historial de Efectivo" }).getByText("Carga inicial"),
    ).toHaveCount(0);
  });

  test("crear, renombrar y eliminar una categoría", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByRole("button", { name: "Nueva" }).nth(1).click();
    await page.getByRole("heading", { name: "Nueva categoría" }).waitFor();
    await page.getByLabel("Nombre").fill("Mascotas");
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await expect(page.getByRole("heading", { name: "Nueva categoría" })).toBeHidden();
    await expect(page.getByText("Mascotas")).toBeVisible();

    const fila = page.locator("li", { hasText: "Mascotas" });
    await fila.getByRole("button", { name: "Editar Mascotas" }).click();
    await page.getByRole("heading", { name: "Editar categoría" }).waitFor();
    await page.getByLabel("Nombre").fill("Veterinaria");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Editar categoría" })).toBeHidden();
    await expect(page.getByText("Veterinaria")).toBeVisible();

    const filaRenombrada = page.locator("li", { hasText: "Veterinaria" });
    await filaRenombrada.getByRole("button", { name: "Eliminar Veterinaria" }).click();
    await page.getByRole("heading", { name: "Eliminar categoría" }).waitFor();
    await page.getByRole("button", { name: "Eliminar" }).last().click();
    await expect(page.getByRole("heading", { name: "Eliminar categoría" })).toBeHidden();
    await expect(page.getByText("Veterinaria")).toBeHidden();
  });

  test("crear una categoría con un color y verlo en el movimiento que la usa", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByRole("button", { name: "Nueva" }).nth(1).click();
    await page.getByRole("heading", { name: "Nueva categoría" }).waitFor();
    await page.getByLabel("Nombre").fill("Mascotas");
    await page.locator('input[type="color"]').fill("#123456");
    await page.getByRole("button", { name: "Crear categoría" }).click();
    await expect(page.getByRole("heading", { name: "Nueva categoría" })).toBeHidden();

    // El punto de color junto al nombre, en la propia lista de categorías.
    const filaCategoria = page.locator("li", { hasText: "Mascotas" });
    await expect(filaCategoria.locator("span[style*='rgb(18, 52, 86)']")).toBeVisible();

    // Y en la fila del movimiento que la usa, en Movimientos.
    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogoAgregar = page.getByRole("dialog", { name: "Agregar movimiento" });
    await dialogoAgregar.getByLabel("Importe").fill("100");
    await dialogoAgregar.getByLabel("Descripción").fill("Comida del gato");
    await dialogoAgregar
      .getByLabel("Categoría", { exact: true })
      .selectOption({ label: "Mascotas" });
    await guardarAceptandoSaldoNegativo(
      page,
      page.getByRole("button", { name: /Guardar/ }),
      "Agregar movimiento",
    );
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();

    await page.getByRole("tab", { name: "Movimientos" }).click();
    const filaMovimiento = page.locator("div.group", { hasText: "Comida del gato" });
    await expect(filaMovimiento.locator("span[style*='rgb(18, 52, 86)']")).toBeVisible();
  });

  test("una categoría eliminada ya no aparece para elegir en un movimiento nuevo", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();

    const fila = page.locator("li", { hasText: "Entretenimiento" });
    await fila.getByRole("button", { name: "Eliminar Entretenimiento" }).click();
    await page.getByRole("button", { name: "Eliminar" }).last().click();
    await expect(page.getByRole("heading", { name: "Eliminar categoría" })).toBeHidden();

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await expect(
      page.getByLabel("Categoría").locator("option", { hasText: "Entretenimiento" }),
    ).toHaveCount(0);
  });
});

test.describe("cuentas: saldo, historial, ocultar y eliminar", () => {
  async function irACuentas(pagina: Page): Promise<void> {
    const cuenta = await crearCuentaAprobada();
    await entrar(pagina, cuenta);
    await pagina.goto("/finanzas");
    await abrirPrimerPeriodo(pagina);
    await pagina.getByRole("tab", { name: "Cuentas" }).click();
    await pagina.getByText("Efectivo").waitFor();
  }

  async function actualizarSaldo(pagina: Page, cuenta: string, saldo: string): Promise<void> {
    await pagina.getByRole("button", { name: `Actualizar saldo de ${cuenta}` }).click();
    const dialogo = pagina.getByRole("dialog", { name: "Actualizar saldo" });
    await dialogo.getByLabel("Saldo actual").fill(saldo);
    await dialogo.getByRole("button", { name: "Guardar saldo" }).click();
    await expect(pagina.getByRole("heading", { name: "Actualizar saldo" })).toBeHidden();
  }

  test("actualizar el saldo de una cuenta no lo registra como movimiento", async ({ page }) => {
    await irACuentas(page);

    await actualizarSaldo(page, "Efectivo", "3000");

    const fila = page.locator("li", { hasText: "Efectivo" });
    await expect(fila.getByText("$ 3.000,00")).toBeVisible();

    // No es un movimiento: el resumen del período sigue en cero, pero el disponible refleja la plata.
    await page.getByRole("tab", { name: "Resumen" }).click();
    await expect(page.getByText(/Todavía no hay movimientos en /)).toBeVisible();
    await expect(page.getByText("Disponible").locator("..").getByText("$ 3.000,00")).toBeVisible();
    await expect(
      page.getByText("Balance del período").locator("..").getByText("$ 0,00"),
    ).toBeVisible();
  });

  test("el diálogo muestra cuánto suma o resta el ajuste antes de guardarlo", async ({ page }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Actualizar saldo de Efectivo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Actualizar saldo" });
    await dialogo.getByLabel("Saldo actual").fill("250.5");

    await expect(dialogo.getByText("suma $ 250,50")).toBeVisible();
  });

  test("ajustar a un saldo igual al actual se avisa junto al campo y no guarda nada", async ({
    page,
  }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Actualizar saldo de Efectivo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Actualizar saldo" });
    await dialogo.getByRole("button", { name: "Guardar saldo" }).click();

    await expect(dialogo.getByText(/Ese ya es el saldo de la cuenta/)).toBeVisible();
    await expect(dialogo).toBeVisible();
  });

  test("el historial muestra juntos los ajustes y los movimientos, bien diferenciados", async ({
    page,
  }) => {
    await irACuentas(page);

    // El formulario de movimientos propone la primera cuenta de la lista: Banco.
    await actualizarSaldo(page, "Banco", "1000");
    await page.getByRole("tab", { name: "Resumen" }).click();
    await agregarMovimiento(page, { importe: "150", descripcion: "Supermercado" });
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByRole("button", { name: "Ver historial de Banco" }).click();
    const historial = page.getByRole("dialog", { name: "Historial de Banco" });

    // Dos renglones, cada uno con su insignia, y el saldo final sale de los dos.
    await expect(historial.getByText("Ajuste manual")).toBeVisible();
    await expect(historial.getByText("Movimiento", { exact: true })).toBeVisible();
    await expect(historial.getByText("Saldo indicado: $ 1.000,00")).toBeVisible();
    await expect(historial.getByText("No es un ingreso ni un gasto")).toBeVisible();
    await expect(historial.getByText("Supermercado")).toBeVisible();
    // Cada movimiento dice de qué período es (el ajuste no es de ninguno).
    await expect(
      historial.getByText(new RegExp(`Período: ${nombreDelPeriodoActual()}`)),
    ).toBeVisible();
    await expect(historial.getByText("+$ 1.000,00")).toBeVisible();
    await expect(historial.getByText("-$ 150,00")).toBeVisible();
    await expect(historial.getByText("Saldo actual:").locator("..")).toContainText("$ 850,00");
  });

  test("una cuenta sin movimientos ni ajustes tiene un historial vacío con explicación", async ({
    page,
  }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Ver historial de Efectivo" }).click();

    await expect(
      page
        .getByRole("dialog", { name: "Historial de Efectivo" })
        .getByText("Esta cuenta todavía no tiene movimientos, ajustes de saldo ni carga inicial."),
    ).toBeVisible();
  });

  /** Carga un movimiento en Banco (la cuenta que propone el formulario) y vuelve a la pestaña de cuentas. */
  async function darleMovimientosABanco(pagina: Page): Promise<void> {
    await agregarMovimiento(pagina, { importe: "100", descripcion: "Café" });
    await pagina.getByRole("tab", { name: "Cuentas" }).click();
    await pagina.getByText("Efectivo").waitFor();
  }

  /** Intenta eliminar Banco (que tiene movimientos) y, desde el aviso, la oculta. */
  async function ocultarBanco(pagina: Page): Promise<void> {
    await pagina.getByRole("button", { name: "Eliminar Banco" }).click();
    const aviso = pagina.getByRole("dialog", { name: "No se puede eliminar" });
    await aviso.getByRole("button", { name: "Ocultar cuenta" }).click();
    await expect(pagina.getByRole("heading", { name: "No se puede eliminar" })).toBeHidden();
  }

  test("sin cuentas disponibles, agregar un movimiento ofrece crear una y sigue con el movimiento", async ({
    page,
  }) => {
    await irACuentas(page);
    for (const cuenta of ["Billetera digital", "Efectivo", "Tarjeta", "Banco"]) {
      await page.getByRole("button", { name: `Eliminar ${cuenta}` }).click();
      await page.getByRole("heading", { name: "Eliminar cuenta" }).waitFor();
      await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
      await expect(page.getByRole("heading", { name: "Eliminar cuenta" })).toBeHidden();
    }

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await expect(dialogo.getByText(/No tenés ninguna cuenta/)).toBeVisible();
    await expect(dialogo.getByLabel("Importe")).toHaveCount(0);

    await dialogo.getByRole("button", { name: "Crear una cuenta" }).click();
    await dialogo.getByLabel("Nombre").fill("Caja chica");
    await dialogo.getByLabel("Saldo inicial").fill("100");
    await dialogo.getByRole("button", { name: "Crear cuenta" }).click();

    // Con la cuenta creada aparece el formulario del movimiento, con esa cuenta elegida.
    await expect(dialogo.getByLabel("Importe")).toBeVisible();
    await expect(
      dialogo.getByLabel("Cuenta", { exact: true }).locator("option:checked"),
    ).toHaveText("Caja chica ($ 100,00)");
    await dialogo.getByLabel("Importe").fill("30");
    await dialogo.getByLabel("Descripción").fill("Café");
    await dialogo.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();
    await expect(page.locator("li", { hasText: "Caja chica" }).getByText("$ 70,00")).toBeVisible();
  });

  test("con todas las cuentas ocultas, agregar un movimiento ofrece crear una", async ({
    page,
  }) => {
    await irACuentas(page);
    // Se dejan solo las que tienen movimientos y se ocultan: las otras se eliminan.
    for (const cuenta of ["Billetera digital", "Tarjeta", "Banco"]) {
      await page.getByRole("button", { name: `Eliminar ${cuenta}` }).click();
      await page.getByRole("heading", { name: "Eliminar cuenta" }).waitFor();
      await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
      await expect(page.getByRole("heading", { name: "Eliminar cuenta" })).toBeHidden();
    }
    await agregarMovimiento(page, { importe: "10", descripcion: "Café" });
    await page.getByRole("button", { name: "Eliminar Efectivo" }).click();
    await page
      .getByRole("dialog", { name: "No se puede eliminar" })
      .getByRole("button", { name: "Ocultar cuenta" })
      .click();
    await expect(page.getByRole("heading", { name: "No se puede eliminar" })).toBeHidden();

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await expect(dialogo.getByText(/todas están ocultas/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Crear una cuenta" })).toBeVisible();

    // Cancelar el alta de la cuenta vuelve al aviso, sin cerrar nada.
    await dialogo.getByRole("button", { name: "Crear una cuenta" }).click();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo.getByRole("button", { name: "Crear una cuenta" })).toBeVisible();
  });

  test("eliminar una cuenta con movimientos avisa por qué no se puede y ofrece ocultarla", async ({
    page,
  }) => {
    await irACuentas(page);
    await darleMovimientosABanco(page);

    await page.getByRole("button", { name: "Eliminar Banco" }).click();

    const aviso = page.getByRole("dialog", { name: "No se puede eliminar" });
    await expect(aviso.getByText(/tiene movimientos, así que no se puede eliminar/)).toBeVisible();
    await expect(aviso.getByText(/podés ocultarla/)).toBeVisible();
    await expect(aviso.getByText(/no te va a aparecer como cuenta disponible/)).toBeVisible();

    // Cancelar no toca nada: la cuenta sigue activa y no hay cuentas ocultas.
    await aviso.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("heading", { name: "No se puede eliminar" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Eliminar Banco" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Cuentas ocultas/ })).toHaveCount(0);
  });

  test("ya no hay un botón de ocultar aparte: ocultar se ofrece al intentar eliminar", async ({
    page,
  }) => {
    await irACuentas(page);

    await expect(page.getByRole("button", { name: /^Ocultar / })).toHaveCount(0);
  });

  test("una cuenta sin movimientos se puede eliminar", async ({ page }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Eliminar Tarjeta" }).click();
    await page.getByRole("heading", { name: "Eliminar cuenta" }).waitFor();
    await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: "Eliminar cuenta" })).toBeHidden();

    await expect(page.getByRole("button", { name: "Eliminar Tarjeta" })).toHaveCount(0);
  });

  test("sin cuentas ocultas no hay sección; al ocultar una aparece cerrada y se abre a mano", async ({
    page,
  }) => {
    await irACuentas(page);
    await darleMovimientosABanco(page);
    await expect(page.getByRole("heading", { name: /Cuentas ocultas/ })).toHaveCount(0);

    await ocultarBanco(page);

    // Aparece cerrada: con el contador, pero sin mostrar la cuenta.
    const titulo = page.getByRole("button", { name: /Cuentas ocultas \(1\)/ });
    await expect(titulo).toBeVisible();
    await expect(titulo).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Mostrar Banco" })).toHaveCount(0);

    await titulo.click();
    await expect(titulo).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("button", { name: "Mostrar Banco" })).toBeVisible();

    await titulo.click();
    await expect(titulo).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "Mostrar Banco" })).toHaveCount(0);
  });

  test("una cuenta oculta no se ofrece al cargar un movimiento, y mostrarla la devuelve", async ({
    page,
  }) => {
    await irACuentas(page);
    await darleMovimientosABanco(page);
    await ocultarBanco(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await expect(
      dialogo.getByLabel("Cuenta", { exact: true }).locator("option", { hasText: "Banco" }),
    ).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();

    await page.getByRole("button", { name: /Cuentas ocultas/ }).click();
    await page.getByRole("button", { name: "Mostrar Banco" }).click();
    // Sin cuentas ocultas, la sección desaparece del todo (ni siquiera cerrada).
    await expect(page.getByRole("button", { name: /Cuentas ocultas/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Agregar movimiento" })
        .getByLabel("Cuenta", { exact: true })
        .locator("option", { hasText: "Banco" }),
    ).toHaveCount(1);
  });

  test("una cuenta oculta que ya está oculta explica que no se puede eliminar y no ofrece ocultarla", async ({
    page,
  }) => {
    await irACuentas(page);
    await darleMovimientosABanco(page);
    await ocultarBanco(page);
    await page.getByRole("button", { name: /Cuentas ocultas/ }).click();

    await page.getByRole("button", { name: "Eliminar Banco" }).click();

    const aviso = page.getByRole("dialog", { name: "No se puede eliminar" });
    await expect(aviso.getByText(/Ya está oculta/)).toBeVisible();
    await expect(aviso.getByRole("button", { name: "Ocultar cuenta" })).toHaveCount(0);
    await aviso.getByRole("button", { name: "Entendido" }).click();
  });

  test("una cuenta oculta conserva su saldo y su historial", async ({ page }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "500");
    await darleMovimientosABanco(page);
    await ocultarBanco(page);

    await page.getByRole("button", { name: /Cuentas ocultas/ }).click();
    const fila = page.locator("li", { hasText: "Banco" });
    // 500 de ajuste menos el café de 100.
    await expect(fila.getByText("$ 400,00")).toBeVisible();
    await page.getByRole("button", { name: "Ver historial de Banco" }).click();
    await expect(
      page.getByRole("dialog", { name: "Historial de Banco" }).getByText("Ajuste manual"),
    ).toBeVisible();
  });
});

test.describe("categorías: color, eliminar y reemplazar", () => {
  async function irACuentas(pagina: Page): Promise<void> {
    const cuenta = await crearCuentaAprobada();
    await entrar(pagina, cuenta);
    await pagina.goto("/finanzas");
    await abrirPrimerPeriodo(pagina);
    await pagina.getByRole("tab", { name: "Cuentas" }).click();
    await pagina.getByText("Alimentación").waitFor();
  }

  async function crearCategoria(pagina: Page, nombre: string): Promise<void> {
    await pagina.getByRole("button", { name: "Nueva" }).nth(1).click();
    await pagina.getByRole("heading", { name: "Nueva categoría" }).waitFor();
    await pagina.getByLabel("Nombre").fill(nombre);
    await pagina.getByRole("button", { name: "Crear categoría" }).click();
    await expect(pagina.getByRole("heading", { name: "Nueva categoría" })).toBeHidden();
  }

  /** Carga un gasto de 100 en la categoría indicada, desde el formulario. */
  async function cargarGastoEn(pagina: Page, categoria: string): Promise<void> {
    await agregarMovimiento(pagina, { importe: "100", descripcion: "Con categoría", categoria });
  }

  test("una categoría nueva propone un color distinto de los de las que ya hay", async ({
    page,
  }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Nueva" }).nth(1).click();
    const dialogo = page.getByRole("dialog", { name: "Nueva categoría" });
    const color = await dialogo.locator('input[type="color"]').inputValue();

    expect(color).toMatch(/^#[0-9a-f]{6}$/);
    // No coincide con ninguno de los colores por defecto.
    expect(CATEGORIAS_POR_DEFECTO.map((categoria) => categoria.color)).not.toContain(color);
    await expect(dialogo.getByText(/color más distinto/)).toBeVisible();
  });

  test("una categoría con movimientos no se elimina: avisa y ofrece reemplazarla por otra existente", async ({
    page,
  }) => {
    await irACuentas(page);
    await crearCategoria(page, "Mascotas");
    await cargarGastoEn(page, "Mascotas");
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByRole("button", { name: "Eliminar Mascotas" }).click();

    const aviso = page.getByRole("dialog", { name: "No se puede eliminar" });
    await expect(aviso.getByText(/tiene 1 movimiento, así que no se puede eliminar/)).toBeVisible();
    await aviso.getByLabel("Reemplazar por").selectOption({ label: "Otros" });
    await aviso.getByRole("button", { name: "Reemplazar y eliminar" }).click();
    await expect(page.getByRole("heading", { name: "No se puede eliminar" })).toBeHidden();

    // La categoría ya no está, y el movimiento histórico pasó a "Otros".
    await expect(page.getByRole("button", { name: "Eliminar Mascotas" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Movimientos" }).click();
    const fila = page.locator("div.group", { hasText: "Con categoría" });
    await expect(fila.getByText(/Otros/)).toBeVisible();
    await expect(fila.getByText(/Mascotas/)).toHaveCount(0);
  });

  test("se puede reemplazar por una categoría nueva, que se crea en el mismo paso", async ({
    page,
  }) => {
    await irACuentas(page);
    await crearCategoria(page, "Mascotas");
    await cargarGastoEn(page, "Mascotas");
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByRole("button", { name: "Eliminar Mascotas" }).click();
    const aviso = page.getByRole("dialog", { name: "No se puede eliminar" });
    await aviso.getByLabel("Reemplazar por").selectOption({ label: "Una categoría nueva…" });
    await aviso.getByLabel("Nombre de la categoría nueva").fill("Veterinaria");
    await aviso.getByRole("button", { name: "Reemplazar y eliminar" }).click();
    await expect(page.getByRole("heading", { name: "No se puede eliminar" })).toBeHidden();

    await expect(page.getByRole("button", { name: "Editar Veterinaria" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar Mascotas" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Movimientos" }).click();
    await expect(
      page.locator("div.group", { hasText: "Con categoría" }).getByText(/Veterinaria/),
    ).toBeVisible();
  });

  test("reemplazar por una categoría nueva sin nombre se avisa junto al campo", async ({
    page,
  }) => {
    await irACuentas(page);
    await crearCategoria(page, "Mascotas");
    await cargarGastoEn(page, "Mascotas");
    await page.getByRole("tab", { name: "Cuentas" }).click();

    await page.getByRole("button", { name: "Eliminar Mascotas" }).click();
    const aviso = page.getByRole("dialog", { name: "No se puede eliminar" });
    await aviso.getByLabel("Reemplazar por").selectOption({ label: "Una categoría nueva…" });
    await aviso.getByRole("button", { name: "Reemplazar y eliminar" }).click();

    await expect(aviso.getByText(/Escribí un nombre/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Editar Mascotas" })).toBeVisible();
  });

  test("una categoría sin movimientos se elimina directo, con confirmación", async ({ page }) => {
    await irACuentas(page);
    await crearCategoria(page, "Mascotas");

    await page.getByRole("button", { name: "Eliminar Mascotas" }).click();
    await page.getByRole("heading", { name: "Eliminar categoría" }).waitFor();
    await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();

    await expect(page.getByRole("button", { name: "Editar Mascotas" })).toHaveCount(0);
  });
});

test.describe("transferencias entre cuentas", () => {
  async function irACuentas(pagina: Page): Promise<void> {
    const cuenta = await crearCuentaAprobada();
    await entrar(pagina, cuenta);
    await pagina.goto("/finanzas");
    await abrirPrimerPeriodo(pagina);
    await pagina.getByRole("tab", { name: "Cuentas" }).click();
    await pagina.getByText("Efectivo").waitFor();
  }

  async function actualizarSaldo(pagina: Page, cuenta: string, saldo: string): Promise<void> {
    await pagina.getByRole("button", { name: `Actualizar saldo de ${cuenta}` }).click();
    const dialogo = pagina.getByRole("dialog", { name: "Actualizar saldo" });
    await dialogo.getByLabel("Saldo actual").fill(saldo);
    await dialogo.getByRole("button", { name: "Guardar saldo" }).click();
    await expect(pagina.getByRole("heading", { name: "Actualizar saldo" })).toBeHidden();
  }

  function fila(pagina: Page, cuenta: string) {
    return pagina.locator("li", {
      hasText: cuenta,
      has: pagina.getByRole("button", { name: `Editar ${cuenta}` }),
    });
  }

  test("desde el panel de cuentas: transferir mueve el saldo de una cuenta a la otra", async ({
    page,
  }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "500");

    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Transferir entre cuentas" });
    await elegirCuenta(dialogo.getByLabel("Cuenta de origen"), "Banco");
    await elegirCuenta(dialogo.getByLabel("Cuenta de destino"), "Efectivo");
    await dialogo.getByLabel("Importe").fill("120");
    await dialogo.getByRole("button", { name: "Transferir" }).click();
    await expect(page.getByRole("heading", { name: "Transferir entre cuentas" })).toBeHidden();

    await expect(fila(page, "Banco").getByText("$ 380,00")).toBeVisible();
    await expect(fila(page, "Efectivo").getByText("$ 120,00")).toBeVisible();
  });

  test("en el diálogo de transferir no se pide tipo ni categoría, y el destino nunca es el origen", async ({
    page,
  }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Transferir entre cuentas" });

    await expect(dialogo.getByLabel("Categoría")).toHaveCount(0);
    await expect(dialogo.getByRole("radio", { name: "Gasto" })).toHaveCount(0);
    const origen = await dialogo
      .getByLabel("Cuenta de origen")
      .locator("option:checked")
      .textContent();
    await expect(
      dialogo.getByLabel("Cuenta de destino").locator("option", { hasText: origen ?? "" }),
    ).toHaveCount(0);
  });

  const CASILLA = "Es una transferencia entre mis cuentas";

  test("desde el formulario de movimientos: al marcar la casilla de transferencia se piden origen y destino", async ({
    page,
  }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "500");

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    // Antes: tipo y una sola cuenta.
    await expect(dialogo.getByRole("radio", { name: "Gasto" })).toBeVisible();
    await expect(dialogo.getByLabel("Cuenta de destino")).toHaveCount(0);

    await expect(dialogo.getByRole("checkbox", { name: CASILLA })).not.toBeChecked();
    await dialogo.getByText(CASILLA).click();
    await expect(dialogo.getByRole("checkbox", { name: CASILLA })).toBeChecked();

    await expect(dialogo.getByText(/no es un ingreso ni un gasto/)).toBeVisible();
    await expect(dialogo.getByRole("radio", { name: "Gasto" })).toHaveCount(0);
    // La categoría se resuelve sola: no hay nada que elegir.
    await expect(dialogo.getByLabel("Categoría")).toHaveCount(0);
    await elegirCuenta(dialogo.getByLabel("Cuenta de origen"), "Banco");
    await elegirCuenta(dialogo.getByLabel("Cuenta de destino"), "Tarjeta");
    await dialogo.getByLabel("Importe").fill("200");
    await guardarAceptandoSaldoNegativo(
      page,
      dialogo.getByRole("button", { name: "Guardar movimiento" }),
      "Agregar movimiento",
    );
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();

    await expect(fila(page, "Banco").getByText("$ 300,00")).toBeVisible();
    await expect(fila(page, "Tarjeta").getByText("$ 200,00")).toBeVisible();
  });

  test("desmarcar la casilla vuelve a pedir tipo, categoría y una sola cuenta", async ({
    page,
  }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await dialogo.getByText(CASILLA).click();
    await expect(dialogo.getByLabel("Cuenta de destino")).toBeVisible();
    await dialogo.getByLabel("Descripción").fill("Transferencia entre cuentas");
    await dialogo.getByText(CASILLA).click();

    await expect(dialogo.getByLabel("Cuenta de destino")).toHaveCount(0);
    await expect(dialogo.getByRole("radio", { name: "Gasto" })).toBeVisible();
    await expect(dialogo.getByLabel("Categoría")).toBeVisible();
    // La descripción propuesta para la transferencia se limpia al desmarcar.
    await expect(dialogo.getByLabel("Descripción")).toHaveValue("");
  });

  test("la categoría de transferencias no aparece como opción de categoría ni en el filtro de movimientos", async ({
    page,
  }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await expect(
      dialogo.getByLabel("Categoría").locator("option", { hasText: "Transferencia entre Cuentas" }),
    ).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Cancelar" }).click();

    await page.getByRole("tab", { name: "Movimientos" }).click();
    await expect(
      page.getByLabel("Categoría").locator("option", { hasText: "Transferencia entre Cuentas" }),
    ).toHaveCount(0);
  });

  test("al convertir una transferencia existente en gasto desmarcando la casilla se elige una categoría común", async ({
    page,
  }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "500");
    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    const transferir = page.getByRole("dialog", { name: "Transferir entre cuentas" });
    await elegirCuenta(transferir.getByLabel("Cuenta de origen"), "Banco");
    await elegirCuenta(transferir.getByLabel("Cuenta de destino"), "Efectivo");
    await transferir.getByLabel("Importe").fill("40");
    await transferir.getByRole("button", { name: "Transferir" }).click();
    await expect(page.getByRole("heading", { name: "Transferir entre cuentas" })).toBeHidden();

    await page.getByRole("tab", { name: "Movimientos" }).click();
    const fila = page.locator("div.group", { hasText: "Banco → Efectivo" });
    await fila.hover();
    await fila.getByRole("button", { name: "Editar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar movimiento" });
    await expect(dialogo.getByRole("checkbox", { name: CASILLA })).toBeChecked();

    await dialogo.getByText(CASILLA).click();
    await expect(dialogo.getByLabel("Categoría")).toBeVisible();
    await dialogo.getByLabel("Descripción").fill("Compra");
    await guardarAceptandoSaldoNegativo(
      page,
      dialogo.getByRole("button", { name: "Guardar cambios" }),
      "Editar movimiento",
    );
    await expect(page.getByText("Banco → Efectivo")).toHaveCount(0);
    await expect(page.getByText("Compra")).toBeVisible();
  });

  test("la transferencia no es ingreso ni gasto: no cambia los totales del resumen", async ({
    page,
  }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "500");
    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Transferir entre cuentas" });
    await dialogo.getByLabel("Importe").fill("100");
    await dialogo.getByRole("button", { name: "Transferir" }).click();
    await expect(page.getByRole("heading", { name: "Transferir entre cuentas" })).toBeHidden();

    await page.getByRole("tab", { name: "Resumen" }).click();

    const tarjeta = (titulo: string) => page.getByText(titulo, { exact: true }).locator("..");
    await expect(tarjeta("Ingresos").getByText("$ 0,00")).toBeVisible();
    await expect(tarjeta("Gastos").getByText("$ 0,00")).toBeVisible();
    // La plata sigue siendo la misma: solo cambió de cuenta.
    await expect(tarjeta("Disponible").getByText("$ 500,00")).toBeVisible();
    // Pero la transferencia sí aparece entre los movimientos, marcada como tal.
    await expect(page.getByText(/→/).first()).toBeVisible();
  });

  test("el listado la muestra con origen y destino y se filtra con 'Transferencias'", async ({
    page,
  }) => {
    await irACuentas(page);
    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Transferir entre cuentas" });
    await elegirCuenta(dialogo.getByLabel("Cuenta de origen"), "Banco");
    await elegirCuenta(dialogo.getByLabel("Cuenta de destino"), "Efectivo");
    await dialogo.getByLabel("Importe").fill("50");
    await guardarAceptandoSaldoNegativo(
      page,
      dialogo.getByRole("button", { name: "Transferir" }),
      "Transferir entre cuentas",
    );
    await expect(page.getByRole("heading", { name: "Transferir entre cuentas" })).toBeHidden();
    await agregarMovimiento(page, { importe: "10", descripcion: "Café" });

    await page.getByRole("tab", { name: "Movimientos" }).click();
    await expect(page.getByText("Banco → Efectivo")).toBeVisible();
    await page.getByRole("radio", { name: "Transferencias" }).click();

    await expect(page.getByText("Banco → Efectivo")).toBeVisible();
    await expect(page.getByText("Café")).toHaveCount(0);
  });

  test("el historial de cada cuenta muestra la transferencia, en el origen y en el destino", async ({
    page,
  }) => {
    await irACuentas(page);
    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Transferir entre cuentas" });
    await elegirCuenta(dialogo.getByLabel("Cuenta de origen"), "Banco");
    await elegirCuenta(dialogo.getByLabel("Cuenta de destino"), "Efectivo");
    await dialogo.getByLabel("Importe").fill("75");
    await guardarAceptandoSaldoNegativo(
      page,
      dialogo.getByRole("button", { name: "Transferir" }),
      "Transferir entre cuentas",
    );
    await expect(page.getByRole("heading", { name: "Transferir entre cuentas" })).toBeHidden();

    await page.getByRole("button", { name: "Ver historial de Efectivo" }).click();
    const delDestino = page.getByRole("dialog", { name: "Historial de Efectivo" });
    await expect(delDestino.getByText("Transferencia", { exact: true })).toBeVisible();
    await expect(delDestino.getByText(/Banco → Efectivo/)).toBeVisible();
    await expect(delDestino.getByText("+$ 75,00")).toBeVisible();
    await delDestino.getByRole("button", { name: "Cerrar" }).click();

    await page.getByRole("button", { name: "Ver historial de Banco" }).click();
    await expect(
      page.getByRole("dialog", { name: "Historial de Banco" }).getByText("-$ 75,00"),
    ).toBeVisible();
  });

  test("las opciones de cuenta muestran el saldo actual", async ({ page }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "500");

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await expect(
      dialogo.getByLabel("Cuenta", { exact: true }).locator("option", { hasText: "Banco" }),
    ).toHaveText("Banco ($ 500,00)");
    await expect(
      dialogo.getByLabel("Cuenta", { exact: true }).locator("option", { hasText: "Efectivo" }),
    ).toHaveText("Efectivo ($ 0,00)");
  });

  test("un gasto que deja la cuenta en negativo pide confirmación, y se puede volver sin guardar", async ({
    page,
  }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "100");

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await elegirCuenta(dialogo.getByLabel("Cuenta", { exact: true }), "Banco");

    // Alcanza el saldo: se guarda sin preguntar.
    await dialogo.getByLabel("Importe").fill("60");
    await dialogo.getByLabel("Descripción").fill("Mercado");
    await dialogo.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();

    // Quedan $ 40: gastar 70 lo dejaría en -$ 30,00.
    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await elegirCuenta(dialogo.getByLabel("Cuenta", { exact: true }), "Banco");
    await dialogo.getByLabel("Importe").fill("70");
    await dialogo.getByLabel("Descripción").fill("Farmacia");
    await dialogo.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(dialogo.getByText("Esta cuenta quedaría con saldo negativo")).toBeVisible();
    await expect(dialogo.getByText(/Banco quedaría en -\$ 30,00/)).toBeVisible();

    await dialogo.getByRole("button", { name: "No, volver" }).click();
    await expect(dialogo.getByText("Esta cuenta quedaría con saldo negativo")).toHaveCount(0);
    await expect(dialogo.getByLabel("Importe")).toHaveValue("70");

    // Cambiar el importe descarta el aviso; con uno que alcanza se guarda directo.
    await dialogo.getByLabel("Importe").fill("30");
    await dialogo.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();
  });

  test("aceptar el aviso guarda el gasto y la cuenta queda en negativo", async ({ page }) => {
    await irACuentas(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await elegirCuenta(dialogo.getByLabel("Cuenta", { exact: true }), "Efectivo");
    await dialogo.getByLabel("Importe").fill("80");
    await dialogo.getByLabel("Descripción").fill("Taxi");
    await dialogo.getByRole("button", { name: "Guardar movimiento" }).click();
    await dialogo.getByRole("button", { name: "Sí, guardar igual" }).click();
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();

    await expect(fila(page, "Efectivo").getByText("-$ 80,00")).toBeVisible();
  });

  test("un ingreso no pide confirmación aunque la cuenta ya esté en negativo", async ({ page }) => {
    await irACuentas(page);
    await agregarMovimiento(page, { importe: "50", descripcion: "Gasto previo" });

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await dialogo.getByRole("radio", { name: "Ingreso" }).click();
    await dialogo.getByLabel("Importe").fill("10");
    await dialogo.getByLabel("Descripción").fill("Reintegro");
    await dialogo.getByRole("button", { name: "Guardar movimiento" }).click();
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();
  });

  test("una transferencia que deja el origen en negativo pide confirmación", async ({ page }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "100");

    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Transferir entre cuentas" });
    await elegirCuenta(dialogo.getByLabel("Cuenta de origen"), "Banco");
    await elegirCuenta(dialogo.getByLabel("Cuenta de destino"), "Efectivo");
    await expect(dialogo.getByLabel("Cuenta de origen").locator("option:checked")).toHaveText(
      "Banco ($ 100,00)",
    );

    await dialogo.getByLabel("Importe").fill("150");
    await dialogo.getByRole("button", { name: "Transferir" }).click();
    await expect(dialogo.getByText(/Banco quedaría en -\$ 50,00/)).toBeVisible();
    // La cuenta de destino recibe plata: no es motivo de aviso.
    await expect(dialogo.getByText(/Efectivo quedaría/)).toHaveCount(0);

    await dialogo.getByRole("button", { name: "Sí, guardar igual" }).click();
    await expect(page.getByRole("heading", { name: "Transferir entre cuentas" })).toBeHidden();
    await expect(fila(page, "Banco").getByText("-$ 50,00")).toBeVisible();
    await expect(fila(page, "Efectivo").getByText("$ 150,00")).toBeVisible();
  });

  test("transferir desde el panel de cuentas no necesita tener categorías propias", async ({
    page,
  }) => {
    await irACuentas(page);
    await actualizarSaldo(page, "Banco", "200");
    for (const categoria of CATEGORIAS_POR_DEFECTO) {
      await page.getByRole("button", { name: `Eliminar ${categoria.nombre}` }).click();
      await page.getByRole("heading", { name: "Eliminar categoría" }).waitFor();
      await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
      await expect(page.getByRole("heading", { name: "Eliminar categoría" })).toBeHidden();
    }

    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Transferir entre cuentas" });
    await expect(dialogo.getByText(/Hace falta al menos una categoría/)).toHaveCount(0);
    await elegirCuenta(dialogo.getByLabel("Cuenta de origen"), "Banco");
    await elegirCuenta(dialogo.getByLabel("Cuenta de destino"), "Efectivo");
    await dialogo.getByLabel("Importe").fill("50");
    await dialogo.getByRole("button", { name: "Transferir" }).click();
    await expect(page.getByRole("heading", { name: "Transferir entre cuentas" })).toBeHidden();

    await expect(fila(page, "Banco").getByText("$ 150,00")).toBeVisible();
    await expect(fila(page, "Efectivo").getByText("$ 50,00")).toBeVisible();
  });

  test("con menos de dos cuentas activas no se ofrece transferir ni la casilla de transferencia", async ({
    page,
  }) => {
    await irACuentas(page);
    // Deja una sola cuenta: elimina las otras tres (no tienen movimientos).
    for (const cuenta of ["Billetera digital", "Efectivo", "Tarjeta"]) {
      await page.getByRole("button", { name: `Eliminar ${cuenta}` }).click();
      await page.getByRole("heading", { name: "Eliminar cuenta" }).waitFor();
      await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
      await expect(page.getByRole("heading", { name: "Eliminar cuenta" })).toBeHidden();
    }

    await expect(page.getByRole("button", { name: "Transferir", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await expect(dialogo.getByRole("checkbox", { name: CASILLA })).toHaveCount(0);
  });

  test("una cuenta oculta no cuenta como activa para transferir", async ({ page }) => {
    await irACuentas(page);
    for (const cuenta of ["Billetera digital", "Efectivo"]) {
      await page.getByRole("button", { name: `Eliminar ${cuenta}` }).click();
      await page.getByRole("heading", { name: "Eliminar cuenta" }).waitFor();
      await page.getByRole("button", { name: "Eliminar", exact: true }).last().click();
      await expect(page.getByRole("heading", { name: "Eliminar cuenta" })).toBeHidden();
    }
    await expect(page.getByRole("button", { name: "Transferir", exact: true })).toBeVisible();

    // Una cuenta con movimientos se oculta (desde el aviso de "no se puede eliminar").
    await agregarMovimiento(page, { importe: "10", descripcion: "Café" });
    await page.getByRole("button", { name: "Eliminar Banco" }).click();
    await page
      .getByRole("dialog", { name: "No se puede eliminar" })
      .getByRole("button", { name: "Ocultar cuenta" })
      .click();
    await expect(page.getByRole("heading", { name: "No se puede eliminar" })).toBeHidden();

    // Queda una sola activa (Tarjeta): ya no se ofrece transferir.
    await expect(page.getByRole("button", { name: "Transferir", exact: true })).toHaveCount(0);
  });
});

test.describe("presupuestos", () => {
  test("fijar un presupuesto y superarlo lo avisa con texto, no solo color", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { importe: "150", descripcion: "Super", categoria: "Otros" });

    await page.getByRole("tab", { name: "Presupuestos" }).click();
    await page.getByRole("button", { name: "Nuevo" }).click();
    await page.getByRole("heading", { name: "Nuevo presupuesto" }).waitFor();
    await page.getByLabel("Categoría").selectOption({ label: "Otros" });
    await page.getByLabel("Límite por período").fill("100");
    await page.getByRole("button", { name: "Fijar presupuesto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo presupuesto" })).toBeHidden();

    await expect(page.getByText("Superado por $ 50,00")).toBeVisible();
  });

  test("editar el monto actualiza cuánto resta", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { importe: "150", descripcion: "Super", categoria: "Otros" });
    await page.getByRole("tab", { name: "Presupuestos" }).click();
    await page.getByRole("button", { name: "Nuevo" }).click();
    await page.getByLabel("Categoría").selectOption({ label: "Otros" });
    await page.getByLabel("Límite por período").fill("100");
    await page.getByRole("button", { name: "Fijar presupuesto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo presupuesto" })).toBeHidden();

    await page.getByRole("button", { name: "Editar presupuesto de Otros" }).click();
    await page.getByRole("heading", { name: "Editar presupuesto" }).waitFor();
    await page.getByLabel("Límite por período").fill("200");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Editar presupuesto" })).toBeHidden();

    await expect(page.getByText("75% usado")).toBeVisible();
  });

  test("eliminar un presupuesto lo saca de la lista sin tocar el movimiento", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, { importe: "150", descripcion: "Super", categoria: "Otros" });
    await page.getByRole("tab", { name: "Presupuestos" }).click();
    await page.getByRole("button", { name: "Nuevo" }).click();
    await page.getByLabel("Categoría").selectOption({ label: "Otros" });
    await page.getByLabel("Límite por período").fill("100");
    await page.getByRole("button", { name: "Fijar presupuesto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo presupuesto" })).toBeHidden();

    await page.getByRole("button", { name: "Eliminar presupuesto de Otros" }).click();
    await page.getByRole("heading", { name: "Eliminar presupuesto" }).waitFor();
    await page.getByRole("button", { name: "Eliminar" }).last().click();
    await expect(page.getByRole("heading", { name: "Eliminar presupuesto" })).toBeHidden();
    await expect(page.getByText("Todavía no fijaste ningún presupuesto.")).toBeVisible();

    await page.getByRole("tab", { name: "Movimientos" }).click();
    await expect(page.getByText("Super")).toBeVisible();
  });
});

test.describe("estadísticas", () => {
  test("muestra el gráfico de evolución y el de gastos por categoría", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await agregarMovimiento(page, {
      importe: "500",
      descripcion: "Super",
      categoria: "Alimentación",
    });
    await agregarMovimiento(page, {
      tipo: "Ingreso",
      importe: "3000",
      descripcion: "Sueldo",
      categoria: "Otros",
    });

    await page.getByRole("tab", { name: "Estadísticas" }).click();
    await expect(page.getByText("Ingresos y gastos de los últimos períodos")).toBeVisible();
    await expect(page.getByText(/Gastos por categoría en /)).toBeVisible();

    // Recharts dibuja las barras como SVG: su presencia confirma que el
    // gráfico renderizó datos, no solo el marco.
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    // Recharts también arma un <span> oculto para medir texto con el mismo
    // contenido; por eso se apunta al <tspan> visible del eje, no al texto suelto.
    await expect(page.locator("tspan", { hasText: "Alimentación" })).toBeVisible();

    // La leyenda distingue ingresos de gastos (no son dos barras iguales).
    // (Hay otra leyenda, la del gráfico de una categoría: la de evolución es la primera.)
    const leyenda = page.locator(".recharts-legend-wrapper").first();
    await expect(leyenda.getByText("Ingresos")).toBeVisible();
    await expect(leyenda.getByText("Gastos")).toBeVisible();
  });

  test("la evolución de una categoría propone la más gastada y se puede cambiar", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, { importe: "100", descripcion: "Bus", categoria: "Transporte" });
    await agregarMovimiento(page, {
      importe: "900",
      descripcion: "Super",
      categoria: "Alimentación",
    });

    await page.getByRole("tab", { name: "Estadísticas" }).click();
    const tarjeta = page.locator("div", {
      has: page.getByRole("heading", { name: "Evolución de categorías" }),
    });
    const selector = tarjeta.getByLabel("Categoría").last();

    // Por defecto, la categoría en la que más se gastó en el período.
    await expect(selector.locator("option:checked")).toHaveText("Alimentación");
    // Dos gráficas en una: las barras (valor bruto) y la línea (% de los ingresos).
    const leyendaDeCategoria = page.locator(".recharts-legend-wrapper", {
      hasText: "Gastado en Alimentación",
    });
    await expect(leyendaDeCategoria.getByText("% de los ingresos del período")).toBeVisible();
    await expect(
      page.locator(".recharts-legend-wrapper", { hasText: "Gastado en Alimentación" }),
    ).toBeVisible();

    await selector.selectOption({ label: "Transporte" });
    await expect(
      page.locator(".recharts-legend-wrapper", { hasText: "Gastado en Transporte" }),
    ).toBeVisible();

    // Una categoría sin gastos en ningún período: estado vacío, no un gráfico plano.
    await selector.selectOption({ label: "Mascotas" });
    await expect(
      page.getByText("No hay gastos en Mascotas en los últimos períodos."),
    ).toBeVisible();
  });

  test("la evolución de una categoría se puede ver de gastos o de ingresos", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    // Una misma categoría con gastos y con ingresos.
    await agregarMovimiento(page, { importe: "300", descripcion: "Gasto", categoria: "Otros" });
    await agregarMovimiento(page, {
      tipo: "Ingreso",
      importe: "1000",
      descripcion: "Ingreso",
      categoria: "Otros",
    });

    await page.getByRole("tab", { name: "Estadísticas" }).click();
    const tarjeta = page.locator("div", {
      has: page.getByRole("heading", { name: "Evolución de categorías" }),
    });

    // Por defecto, gastos.
    await expect(tarjeta.getByRole("radio", { name: "Gastos" })).toBeChecked();
    await expect(
      page.locator(".recharts-legend-wrapper", { hasText: "Gastado en Otros" }),
    ).toBeVisible();

    // Con "Ingresos" cambian las barras y el porcentaje: ahora es la parte del total de ingresos.
    await tarjeta.getByRole("radio", { name: "Ingresos" }).click({ force: true });
    const leyenda = page.locator(".recharts-legend-wrapper", { hasText: "Ingresado en Otros" });
    await expect(leyenda).toBeVisible();
    await expect(leyenda.getByText("% del total de ingresos del período")).toBeVisible();

    // Una categoría sin ingresos: estado vacío, aunque tenga gastos en otro momento.
    await tarjeta.getByLabel("Categoría").last().selectOption({ label: "Alimentación" });
    await expect(
      page.getByText("No hay ingresos en Alimentación en los últimos períodos."),
    ).toBeVisible();
  });

  test("la evolución de una categoría muestra un punto por período", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, {
      importe: "400",
      descripcion: "Super",
      categoria: "Alimentación",
    });
    await agregarMovimiento(page, {
      tipo: "Ingreso",
      importe: "2000",
      descripcion: "Sueldo",
      categoria: "Ingresos",
    });

    // Cierra el período y abre el siguiente, con otro gasto en la misma categoría.
    await page.getByRole("button", { name: "Cerrar período" }).click();
    await page
      .getByRole("dialog", { name: "Cerrar período" })
      .getByRole("button", { name: "Cerrar período" })
      .click();
    await page
      .getByRole("dialog", { name: "Abrir el siguiente período" })
      .getByRole("button", { name: "Abrir período" })
      .click();
    await expect(page.getByRole("heading", { name: "Abrir el siguiente período" })).toBeHidden();
    await agregarMovimiento(page, {
      importe: "700",
      descripcion: "Super 2",
      categoria: "Alimentación",
    });
    await agregarMovimiento(page, {
      tipo: "Ingreso",
      importe: "2800",
      descripcion: "Sueldo 2",
      categoria: "Ingresos",
    });

    await page.getByRole("tab", { name: "Estadísticas" }).click();

    // Un punto del porcentaje por período (20 % y 25 % de los ingresos de cada uno).
    await expect(page.locator(".recharts-line .recharts-dot")).toHaveCount(2);
  });

  test("si la categoría tiene presupuesto, el gráfico muestra su límite", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, {
      importe: "500",
      descripcion: "Super",
      categoria: "Alimentación",
    });
    await page.getByRole("tab", { name: "Presupuestos" }).click();
    await page.getByRole("button", { name: "Nuevo" }).click();
    await page.getByRole("heading", { name: "Nuevo presupuesto" }).waitFor();
    await page.getByLabel("Categoría").selectOption({ label: "Alimentación" });
    await page.getByLabel("Límite por período").fill("800");
    await page.getByRole("button", { name: "Fijar presupuesto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo presupuesto" })).toBeHidden();

    await page.getByRole("tab", { name: "Estadísticas" }).click();

    await expect(page.locator(".recharts-reference-line")).toBeVisible();
    await expect(page.locator(".recharts-reference-line").getByText("Presupuesto")).toBeVisible();
  });

  test("sin gastos en el período, muestra un estado vacío en vez de un gráfico sin datos", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await page.getByRole("tab", { name: "Estadísticas" }).click();
    await expect(page.getByText("Todavía no registraste gastos en este período.")).toBeVisible();
  });
});

test.describe("períodos", () => {
  async function entrarAFinanzas(pagina: Page): Promise<void> {
    const cuenta = await crearCuentaAprobada();
    await entrar(pagina, cuenta);
    await pagina.goto("/finanzas");
  }

  test("sin períodos, el módulo invita a abrir el primero", async ({ page }) => {
    await entrarAFinanzas(page);

    await expect(page.getByRole("heading", { name: "Empezá abriendo un período" })).toBeVisible();
    await expect(page.getByLabel("Período", { exact: true })).toBeHidden();
  });

  test("el primer período se sugiere con el nombre del mes actual", async ({ page }) => {
    await entrarAFinanzas(page);

    await page.getByRole("button", { name: "Abrir mi primer período" }).click();
    const dialogo = page.getByRole("dialog", { name: "Abrir período" });

    await expect(dialogo.getByLabel("Nombre")).toHaveValue(nombreDelPeriodoActual());
  });

  test("abrir un período con un nombre propio lo deja elegido y abierto", async ({ page }) => {
    await entrarAFinanzas(page);

    await page.getByRole("button", { name: "Abrir mi primer período" }).click();
    const dialogo = page.getByRole("dialog", { name: "Abrir período" });
    await dialogo.getByLabel("Nombre").fill("Vacaciones");
    await dialogo.getByRole("button", { name: "Abrir período" }).click();
    await expect(page.getByRole("heading", { name: "Abrir período" })).toBeHidden();

    await expect(page.getByLabel("Período", { exact: true }).locator("option:checked")).toHaveText(
      "Vacaciones (abierto)",
    );
    await expect(page.getByText("Abierto", { exact: true })).toBeVisible();
  });

  test("sin un período abierto, agregar un movimiento avisa y ofrece abrir uno", async ({
    page,
  }) => {
    await entrarAFinanzas(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();

    const aviso = page.getByRole("dialog", { name: "No tenés un período abierto" });
    await expect(aviso).toBeVisible();
    await aviso.getByRole("button", { name: "Abrir período" }).click();

    // Se pasa directo a abrir uno: no hace falta buscar el botón en otro lado.
    const abrir = page.getByRole("dialog", { name: "Abrir período" });
    await expect(abrir.getByLabel("Nombre")).toHaveValue(nombreDelPeriodoActual());
    await abrir.getByRole("button", { name: "Abrir período" }).click();
    await expect(page.getByRole("heading", { name: "Abrir período" })).toBeHidden();

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeVisible();
  });

  test("al cerrar un período se ofrece abrir el siguiente, que continúa donde terminó", async ({
    page,
  }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);

    await page.getByRole("button", { name: "Cerrar período" }).click();
    const cerrar = page.getByRole("dialog", { name: "Cerrar período" });
    // Por defecto cierra ahora: no hay que elegir nada.
    await cerrar.getByRole("button", { name: "Cerrar período" }).click();

    // Ofrece el siguiente, con el nombre sugerido (este mes ya tiene uno: lleva número).
    const siguiente = page.getByRole("dialog", { name: "Abrir el siguiente período" });
    await expect(siguiente).toBeVisible();
    await expect(siguiente.getByLabel("Nombre")).toHaveValue(`${nombreDelPeriodoActual()} 2`);
    await siguiente.getByRole("button", { name: "Abrir período" }).click();
    await expect(page.getByRole("heading", { name: "Abrir el siguiente período" })).toBeHidden();

    // Quedan los dos, el nuevo abierto y elegido.
    const selector = page.getByLabel("Período", { exact: true });
    await expect(selector.locator("option")).toHaveCount(2);
    await expect(selector.locator("option:checked")).toHaveText(
      `${nombreDelPeriodoActual()} 2 (abierto)`,
    );
  });

  test("decir 'Ahora no' al cerrar deja el módulo sin período abierto", async ({ page }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);

    await page.getByRole("button", { name: "Cerrar período" }).click();
    await page
      .getByRole("dialog", { name: "Cerrar período" })
      .getByRole("button", { name: "Cerrar período" })
      .click();
    await page.getByRole("button", { name: "Ahora no" }).click();
    await expect(page.getByRole("heading", { name: "Abrir el siguiente período" })).toBeHidden();

    // Cerrado, y la barra ofrece abrir otro.
    await expect(page.getByText("Cerrado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abrir período" })).toBeVisible();

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await expect(page.getByRole("heading", { name: "No tenés un período abierto" })).toBeVisible();
  });

  /** Cierra el período abierto con los valores por defecto y rechaza abrir el siguiente. */
  async function cerrarYDejarSinAbierto(pagina: Page): Promise<void> {
    await pagina.getByRole("button", { name: "Cerrar período" }).click();
    await pagina
      .getByRole("dialog", { name: "Cerrar período" })
      .getByRole("button", { name: "Cerrar período" })
      .click();
    await pagina.getByRole("button", { name: "Ahora no" }).click();
    await expect(pagina.getByRole("heading", { name: "Abrir el siguiente período" })).toBeHidden();
  }

  test("un período cerrado se puede reabrir si no hay otro abierto", async ({ page }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);
    await cerrarYDejarSinAbierto(page);
    await expect(page.getByText("Cerrado", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Reabrir", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Reabrir período" });
    await dialogo.getByRole("button", { name: "Reabrir período" }).click();
    await expect(page.getByRole("heading", { name: "Reabrir período" })).toBeHidden();

    await expect(page.getByText("Abierto", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar período" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reabrir", exact: true })).toHaveCount(0);
  });

  test("no se ofrece reabrir si hay otro período abierto", async ({ page }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);

    // Cierra y abre el siguiente: queda uno cerrado y uno abierto.
    await page.getByRole("button", { name: "Cerrar período" }).click();
    await page
      .getByRole("dialog", { name: "Cerrar período" })
      .getByRole("button", { name: "Cerrar período" })
      .click();
    await page
      .getByRole("dialog", { name: "Abrir el siguiente período" })
      .getByRole("button", { name: "Abrir período" })
      .click();
    await expect(page.getByRole("heading", { name: "Abrir el siguiente período" })).toBeHidden();

    await page
      .getByLabel("Período", { exact: true })
      .selectOption({ label: nombreDelPeriodoActual() });
    await expect(page.getByText("Cerrado", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reabrir", exact: true })).toHaveCount(0);
  });

  test("un período sin movimientos se puede eliminar", async ({ page }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);

    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Eliminar período" });
    await dialogo.getByRole("button", { name: "Eliminar período" }).click();
    await expect(page.getByRole("heading", { name: "Eliminar período" })).toBeHidden();

    // Sin períodos, vuelve el estado vacío.
    await expect(page.getByRole("heading", { name: "Empezá abriendo un período" })).toBeVisible();
  });

  test("un período con movimientos avisa que se eliminan con él, y devuelve el saldo de las cuentas", async ({
    page,
  }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, { importe: "10", descripcion: "Café" });
    await agregarMovimiento(page, { importe: "5", descripcion: "Pan" });

    // Con los gastos cargados, la cuenta (que partía de cero) quedó en negativo.
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await expect(page.getByText("-$ 15,00").first()).toBeVisible();
    await page.getByRole("tab", { name: "Resumen" }).click();

    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Eliminar período" });
    await expect(dialogo.getByText("Se van a eliminar 2 movimientos")).toBeVisible();
    await expect(dialogo.getByText(/no se pueden recuperar/)).toBeVisible();

    // Cancelar no toca nada.
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByLabel("Período", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await dialogo.getByRole("button", { name: "Eliminar período y movimientos" }).click();
    await expect(page.getByRole("heading", { name: "Eliminar período" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "Empezá abriendo un período" })).toBeVisible();

    // El saldo vuelve a lo que era sin esos movimientos.
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await expect(page.getByText("-$ 15,00")).toHaveCount(0);
  });

  test("se puede elegir la fecha y hora de cierre, y el siguiente arranca ahí", async ({
    page,
  }) => {
    await entrarAFinanzas(page);

    // Un período que abrió hace 10 días, para poder cerrarlo en una fecha pasada.
    await page.getByRole("button", { name: "Abrir mi primer período" }).click();
    const abrir = page.getByRole("dialog", { name: "Abrir período" });
    await abrir.getByLabel("Empieza el").fill(haceDias(10));
    await abrir.getByRole("button", { name: "Abrir período" }).click();
    await expect(page.getByRole("heading", { name: "Abrir período" })).toBeHidden();

    await page.getByRole("button", { name: "Cerrar período" }).click();
    const cerrar = page.getByRole("dialog", { name: "Cerrar período" });
    await cerrar.getByRole("radio", { name: "Elegir fecha y hora" }).click();
    await cerrar.getByLabel("Cierra el").fill(haceDias(5));
    await cerrar.getByRole("button", { name: "Cerrar período" }).click();

    // El siguiente propone abrir justo en el cierre elegido.
    const siguiente = page.getByRole("dialog", { name: "Abrir el siguiente período" });
    await expect(siguiente.getByLabel("Empieza el")).toHaveValue(haceDias(5));
  });

  test("no deja cerrar antes de la apertura, con el error junto al campo", async ({ page }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);

    await page.getByRole("button", { name: "Cerrar período" }).click();
    const cerrar = page.getByRole("dialog", { name: "Cerrar período" });
    await cerrar.getByRole("radio", { name: "Elegir fecha y hora" }).click();
    await cerrar.getByLabel("Cierra el").fill(haceDias(3));
    await cerrar.getByRole("button", { name: "Cerrar período" }).click();

    await expect(cerrar.getByText(/Tiene que ser posterior a la apertura/)).toBeVisible();
    // Sigue abierto el diálogo de cierre: no se cerró nada.
    await expect(cerrar).toBeVisible();
  });

  test("no deja cerrar un período dejando movimientos por fuera, y dice por qué", async ({
    page,
  }) => {
    await entrarAFinanzas(page);

    await page.getByRole("button", { name: "Abrir mi primer período" }).click();
    const abrir = page.getByRole("dialog", { name: "Abrir período" });
    await abrir.getByLabel("Empieza el").fill(haceDias(10));
    await abrir.getByRole("button", { name: "Abrir período" }).click();
    await expect(page.getByRole("heading", { name: "Abrir período" })).toBeHidden();

    // Un movimiento de ahora: cerrar hace 5 días lo dejaría por fuera.
    await agregarMovimiento(page, { importe: "100", descripcion: "Café" });

    await page.getByRole("button", { name: "Cerrar período" }).click();
    const cerrar = page.getByRole("dialog", { name: "Cerrar período" });
    await cerrar.getByRole("radio", { name: "Elegir fecha y hora" }).click();
    await cerrar.getByLabel("Cierra el").fill(haceDias(5));
    await cerrar.getByRole("button", { name: "Cerrar período" }).click();

    await expect(
      cerrar.getByText(/No se puede cerrar en esa fecha: hay 1 movimiento/),
    ).toBeVisible();
  });

  test("renombrar un período no afecta a sus movimientos", async ({ page }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, { importe: "100", descripcion: "Café" });

    await page.getByRole("button", { name: "Renombrar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Renombrar período" });
    await dialogo.getByLabel("Nombre").fill("Mi período");
    await dialogo.getByRole("button", { name: "Guardar nombre" }).click();
    await expect(page.getByRole("heading", { name: "Renombrar período" })).toBeHidden();

    await expect(page.getByLabel("Período", { exact: true }).locator("option:checked")).toHaveText(
      "Mi período (abierto)",
    );
    await page.getByRole("tab", { name: "Movimientos" }).click();
    await expect(page.getByText("Café")).toBeVisible();
  });

  test("al agregar un movimiento se ve en qué período se guarda", async ({ page }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();

    await expect(
      page.getByText(`Se guarda en el período "${nombreDelPeriodoActual()}".`),
    ).toBeVisible();
  });

  test("una fecha fuera de todos los períodos se avisa junto al campo y no se guarda", async ({
    page,
  }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar movimiento" });
    await dialogo.getByLabel("Importe").fill("100");
    await dialogo.getByLabel("Descripción").fill("Del pasado");
    // Antes de que abriera el único período.
    await dialogo.getByLabel("Fecha y hora").fill(haceDias(60));

    await expect(
      dialogo.getByText("Esa fecha no cae dentro de ninguno de tus períodos."),
    ).toBeVisible();
    await dialogo.getByRole("button", { name: /Guardar/ }).click();
    await expect(dialogo).toBeVisible();
  });

  test("los datos de cada período se ven al elegirlo", async ({ page }) => {
    await entrarAFinanzas(page);
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, { importe: "100", descripcion: "Del primero" });

    // Cierra y abre el siguiente: el nuevo arranca vacío.
    await page.getByRole("button", { name: "Cerrar período" }).click();
    await page
      .getByRole("dialog", { name: "Cerrar período" })
      .getByRole("button", { name: "Cerrar período" })
      .click();
    await page
      .getByRole("dialog", { name: "Abrir el siguiente período" })
      .getByRole("button", { name: "Abrir período" })
      .click();
    await expect(page.getByRole("heading", { name: "Abrir el siguiente período" })).toBeHidden();

    await page.getByRole("tab", { name: "Movimientos" }).click();
    await expect(page.getByText(/Todavía no hay movimientos en /)).toBeVisible();

    // Al volver al primero, sus movimientos siguen ahí.
    await page
      .getByLabel("Período", { exact: true })
      .selectOption({ label: nombreDelPeriodoActual() });
    await expect(page.getByText("Del primero")).toBeVisible();
  });
});

test.describe("diálogos", () => {
  async function abrirDialogoDeMovimiento(pagina: Page) {
    const cuenta = await crearCuentaAprobada();
    await entrar(pagina, cuenta);
    await pagina.goto("/finanzas");
    await abrirPrimerPeriodo(pagina);
    await pagina.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = pagina.getByRole("dialog", { name: "Agregar movimiento" });
    await expect(dialogo).toBeVisible();
    return dialogo;
  }

  test("seleccionar texto de un campo arrastrando hasta afuera del diálogo no lo cierra", async ({
    page,
  }) => {
    const dialogo = await abrirDialogoDeMovimiento(page);
    const importe = dialogo.getByLabel("Importe");
    await importe.fill("123456");
    const caja = await importe.boundingBox();
    if (!caja) throw new Error("El campo no tiene caja");

    // Aprieta adentro del campo, arrastra hasta el fondo (afuera de la tarjeta) y suelta.
    await page.mouse.move(caja.x + caja.width - 10, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(2, 2, { steps: 5 });
    await page.mouse.up();

    await expect(dialogo).toBeVisible();
  });

  test("un clic en el fondo, de principio a fin, sí lo cierra", async ({ page }) => {
    await abrirDialogoDeMovimiento(page);

    await page.mouse.click(2, 2);

    await expect(page.getByRole("heading", { name: "Agregar movimiento" })).toBeHidden();
  });
});

test.describe("campos de importe: separador de miles", () => {
  async function abrirImporte(pagina: Page) {
    const cuenta = await crearCuentaAprobada();
    await entrar(pagina, cuenta);
    await pagina.goto("/finanzas");
    await abrirPrimerPeriodo(pagina);
    await pagina.getByRole("button", { name: "Agregar movimiento" }).click();
    const dialogo = pagina.getByRole("dialog", { name: "Agregar movimiento" });
    const importe = dialogo.getByLabel("Importe");
    await importe.click();
    return { dialogo, importe };
  }

  test("separa los miles mientras se escribe", async ({ page }) => {
    const { importe } = await abrirImporte(page);

    await importe.pressSequentially("1234567");

    await expect(importe).toHaveValue("1.234.567");
  });

  test("la coma es el decimal, y el punto del teclado numérico también", async ({ page }) => {
    const { importe } = await abrirImporte(page);

    await importe.pressSequentially("12,5");
    await expect(importe).toHaveValue("12,5");

    await importe.clear();
    await importe.pressSequentially("1234.5");
    await expect(importe).toHaveValue("1.234,5");
  });

  test("admite como mucho dos decimales y no deja escribir letras", async ({ page }) => {
    const { importe } = await abrirImporte(page);

    await importe.pressSequentially("1a2b3,4567");

    await expect(importe).toHaveValue("123,45");
  });

  test("borrar un dígito vuelve a ordenar los puntos", async ({ page }) => {
    const { importe } = await abrirImporte(page);
    await importe.pressSequentially("1234");
    await expect(importe).toHaveValue("1.234");

    await importe.press("Backspace");

    await expect(importe).toHaveValue("123");
  });

  test("el cursor se queda donde estaba aunque cambien los puntos", async ({ page }) => {
    const { importe } = await abrirImporte(page);
    await importe.pressSequentially("1234");

    // Escribe dos dígitos al principio: el segundo va detrás del primero.
    await importe.press("Home");
    await importe.pressSequentially("98");

    await expect(importe).toHaveValue("981.234");
  });

  test("un importe no admite signo menos", async ({ page }) => {
    const { importe } = await abrirImporte(page);

    await importe.pressSequentially("-50");

    await expect(importe).toHaveValue("50");
  });

  test("el movimiento se guarda con el importe tal como se ve", async ({ page }) => {
    const { dialogo, importe } = await abrirImporte(page);
    await importe.pressSequentially("1234567,5");
    await dialogo.getByLabel("Descripción").fill("Auto");

    await guardarAceptandoSaldoNegativo(
      page,
      dialogo.getByRole("button", { name: "Guardar movimiento" }),
      "Agregar movimiento",
    );

    await expect(page.getByText("Gastos").locator("..").getByText("$ 1.234.567,50")).toBeVisible();
  });

  test("al editar el campo ya viene con el importe formateado", async ({ page }) => {
    const { dialogo, importe } = await abrirImporte(page);
    await importe.pressSequentially("45000");
    await dialogo.getByLabel("Descripción").fill("Cuota");
    await guardarAceptandoSaldoNegativo(
      page,
      dialogo.getByRole("button", { name: "Guardar movimiento" }),
      "Agregar movimiento",
    );

    await page.getByRole("tab", { name: "Movimientos" }).click();
    const fila = page.locator("div.group", { hasText: "Cuota" });
    await fila.hover();
    await fila.getByRole("button", { name: "Editar" }).click();

    await expect(
      page.getByRole("dialog", { name: "Editar movimiento" }).getByLabel("Importe"),
    ).toHaveValue("45.000");
  });

  test("el saldo admite el signo menos y se muestra con miles", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByRole("button", { name: "Actualizar saldo de Efectivo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Actualizar saldo" });
    const saldo = dialogo.getByLabel("Saldo actual");

    await saldo.clear();
    await saldo.pressSequentially("-15000");

    await expect(saldo).toHaveValue("-15.000");
    await expect(dialogo.getByText("resta $ 15.000,00")).toBeVisible();
  });

  test("el saldo inicial de una cuenta nueva también separa los miles", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByRole("button", { name: "Nueva" }).first().click();
    const dialogo = page.getByRole("dialog", { name: "Nueva cuenta" });
    await dialogo.getByLabel("Nombre").fill("Ahorros");
    const saldo = dialogo.getByLabel("Saldo inicial");

    await saldo.clear();
    await saldo.pressSequentially("2500000");
    await expect(saldo).toHaveValue("2.500.000");
    await dialogo.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByText("$ 2.500.000,00").first()).toBeVisible();
  });

  test("el límite de un presupuesto separa los miles", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Presupuestos" }).click();
    await page.getByRole("button", { name: "Nuevo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Nuevo presupuesto" });
    const limite = dialogo.getByLabel("Límite por período");

    await limite.pressSequentially("80000");

    await expect(limite).toHaveValue("80.000");
  });

  test("un importe por encima del tope se avisa junto al campo", async ({ page }) => {
    const { dialogo, importe } = await abrirImporte(page);
    await importe.pressSequentially("10000000000");
    await dialogo.getByLabel("Descripción").fill("Demasiado");

    await dialogo.getByRole("button", { name: "Guardar movimiento" }).click();

    await expect(dialogo.getByText("Ese importe es demasiado grande.")).toBeVisible();
  });
});

test.describe("accesibilidad", () => {
  test("el dashboard no tiene violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByText("Balance del período").waitFor();

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("el diálogo de agregar movimiento no tiene violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    await page.getByRole("heading", { name: "Agregar movimiento" }).waitFor();
    // El diálogo funde su entrada: sin esperarla, axe puede medir un
    // contraste que todavía no es el real (mismo criterio que admin.spec.ts).
    await page.waitForTimeout(300);

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("el estado sin períodos no tiene violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await page.getByRole("heading", { name: "Empezá abriendo un período" }).waitFor();

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("los diálogos de abrir y cerrar un período no tienen violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await page.getByRole("button", { name: "Abrir mi primer período" }).click();
    await page.getByRole("dialog", { name: "Abrir período" }).waitFor();
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page
      .getByRole("dialog", { name: "Abrir período" })
      .getByRole("button", { name: "Abrir período" })
      .click();
    await expect(page.getByRole("heading", { name: "Abrir período" })).toBeHidden();

    await page.getByRole("button", { name: "Cerrar período" }).click();
    const cerrar = page.getByRole("dialog", { name: "Cerrar período" });
    await cerrar.getByRole("radio", { name: "Elegir fecha y hora" }).click();
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("la pestaña de movimientos no tiene violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, { importe: "100", descripcion: "Café" });

    await page.getByRole("tab", { name: "Movimientos" }).click();
    await page.getByText("Café").waitFor();
    // La pastilla del selector de pestañas tarda un instante en deslizarse
    // hasta la nueva pestaña; sin esperarla, axe puede medir el texto activo
    // todavía sobre el fondo neutro de las inactivas (mismo criterio que
    // admin.spec.ts con el diálogo).
    await page.waitForTimeout(300);

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("la pestaña de cuentas no tiene violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);

    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByText("Efectivo").waitFor();
    await page.waitForTimeout(300);

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("los diálogos de actualizar saldo e historial no tienen violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByText("Efectivo").waitFor();

    await page.getByRole("button", { name: "Actualizar saldo de Efectivo" }).click();
    await page.getByRole("dialog", { name: "Actualizar saldo" }).waitFor();
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const dialogo = page.getByRole("dialog", { name: "Actualizar saldo" });
    await dialogo.getByLabel("Saldo actual").fill("1000");
    await dialogo.getByRole("button", { name: "Guardar saldo" }).click();
    await expect(page.getByRole("heading", { name: "Actualizar saldo" })).toBeHidden();

    await page.getByRole("button", { name: "Ver historial de Efectivo" }).click();
    await page
      .getByRole("dialog", { name: "Historial de Efectivo" })
      .getByText("Ajuste manual")
      .waitFor();
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("los diálogos de transferir y de reemplazar una categoría no tienen violaciones", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await page.getByRole("tab", { name: "Cuentas" }).click();
    await page.getByText("Efectivo").waitFor();

    await page.getByRole("button", { name: "Transferir", exact: true }).click();
    await page.getByRole("dialog", { name: "Transferir entre cuentas" }).waitFor();
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole("dialog", { name: "Transferir entre cuentas" })
      .getByRole("button", { name: "Cancelar" })
      .click();
    await expect(page.getByRole("heading", { name: "Transferir entre cuentas" })).toBeHidden();

    // Una categoría con un movimiento, para abrir el diálogo de reemplazo.
    await agregarMovimiento(page, { importe: "10", descripcion: "Café", categoria: "Salud" });
    await page.getByRole("button", { name: "Eliminar Salud" }).click();
    await page.getByRole("dialog", { name: "No se puede eliminar" }).waitFor();
    await page.waitForTimeout(300);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test("la pestaña de presupuestos no tiene violaciones, incluido un presupuesto superado", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, { importe: "150", descripcion: "Super", categoria: "Otros" });

    await page.getByRole("tab", { name: "Presupuestos" }).click();
    await page.getByRole("button", { name: "Nuevo" }).click();
    await page.getByLabel("Categoría").selectOption({ label: "Otros" });
    await page.getByLabel("Límite por período").fill("100");
    await page.getByRole("button", { name: "Fijar presupuesto" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo presupuesto" })).toBeHidden();
    await page.getByText("Superado por $ 50,00").waitFor();
    await page.waitForTimeout(300);

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("la pestaña de estadísticas no tiene violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await page.goto("/finanzas");
    await abrirPrimerPeriodo(page);
    await agregarMovimiento(page, {
      importe: "500",
      descripcion: "Super",
      categoria: "Alimentación",
    });

    await page.getByRole("tab", { name: "Estadísticas" }).click();
    await page.locator(".recharts-bar-rectangle").first().waitFor();
    await page.waitForTimeout(300);

    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });
});

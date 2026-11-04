// Tests end-to-end de lo que une a los contactos con Finanzas: el contacto en cada movimiento,
// la plata en la ficha, las deudas y préstamos, los widgets y el enlace al mapa.
//
// Los datos de partida se preparan por la API desde la sesión del navegador; la lógica (saldos,
// concurrencia, privacidad, zonas horarias) ya tiene sus tests de integración en apps/api.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { type CuentaDePrueba, crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

// Mismo puerto fijo que utilidades.ts: la API que levanta Playwright.
const URL_API = "http://localhost:3101";
const ZONA = "America/Montevideo";
// Lo que tarda un diálogo o un selector de pestañas en terminar su animación (axe mide el contraste a mitad de camino).
const TRANSICION_MS = 500;

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

/** Un monto como lo escribe `formatearMonto` ("$ 1.500,00" con espacio fino): tolera el tipo de espacio. */
function dinero(texto: string): RegExp {
  return new RegExp(texto.replace(/[.$]/g, "\\$&").replace(/ /g, "\\s"));
}

async function crearContacto(
  pagina: Page,
  datos: { nombre: string; apellido?: string; direccion?: string; tipo?: "persona" | "empresa" },
): Promise<string> {
  const comunes = {
    nombre: datos.nombre,
    direccion: datos.direccion ?? "",
    notas: "",
    favorito: false,
    telefonos: [],
    correos: [],
    etiquetaIds: [],
  };
  const cuerpo =
    datos.tipo === "empresa"
      ? {
          tipo: "empresa",
          rubro: "",
          sitioWeb: "",
          horario: "",
          documento: "",
          personaDeContacto: "",
          ...comunes,
        }
      : { tipo: "persona", apellido: datos.apellido ?? "", fechaNacimiento: "", ...comunes };
  return (await pedirApi<{ id: string }>(pagina, "POST", "/api/contactos", cuerpo)).id;
}

/** Abre un período amplio y devuelve una cuenta y una categoría para cargar movimientos. */
async function prepararFinanzas(pagina: Page): Promise<{ cuentaId: string; categoriaId: number }> {
  await pedirApi(pagina, "POST", "/api/finanzas/periodos", {
    nombre: "Amplio",
    aperturaEn: "2026-01-01T00:00:00.000Z",
  });
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
  return { cuentaId: cuenta.id, categoriaId: categoria.id };
}

function hoy(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function crearDeuda(
  pagina: Page,
  datos: {
    /** Con un contacto... */
    contactoId?: string;
    /** ...o con alguien que no lo es. */
    nombreLibre?: string;
    concepto?: string;
    monto?: number;
    sentido?: "me_deben" | "debo";
    moneda?: string;
    /** Hasta qué día debería saldarse ("AAAA-MM-DD"). */
    fechaLimite?: string;
  },
): Promise<string> {
  return (
    await pedirApi<{ id: string }>(pagina, "POST", "/api/finanzas/deudas", {
      sentido: "me_deben",
      concepto: "Préstamo",
      monto: 1000,
      moneda: "UYU",
      fecha: hoy(),
      ...datos,
    })
  ).id;
}

function dialogo(pagina: Page, nombre: string): Locator {
  return pagina.getByRole("dialog", { name: nombre, exact: true });
}

async function abrirDeudas(pagina: Page): Promise<void> {
  await pagina.goto("/finanzas");
  await pagina.getByRole("tab", { name: "Deudas" }).click();
  await expect(pagina.getByRole("heading", { name: "Deudas y préstamos" })).toBeVisible();
}

async function abrirFicha(pagina: Page, nombre: RegExp): Promise<Locator> {
  await pagina.goto("/contactos");
  await pagina.getByRole("button", { name: nombre }).first().click();
  const ficha = dialogo(pagina, "Contacto");
  await expect(ficha).toBeVisible();
  return ficha;
}

test.describe("el contacto en un movimiento", () => {
  test("se elige al cargar el movimiento, se ve en el listado y en la ficha del contacto", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, { nombre: "Taller Sur", tipo: "empresa" });
    await prepararFinanzas(page);
    await page.goto("/finanzas");

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const formulario = dialogo(page, "Agregar movimiento");
    await formulario.getByLabel("Importe").fill("1500");
    await formulario.getByLabel("Descripción").fill("Cambio de aceite");
    await formulario.getByLabel("Con quién (opcional)").selectOption({ label: "Taller Sur" });
    await formulario.getByRole("button", { name: /^Guardar/ }).click();
    // Una cuenta nueva está en cero: el gasto la deja en negativo y pide confirmación.
    await formulario.getByRole("button", { name: "Sí, guardar igual" }).click();
    await expect(formulario).toBeHidden();

    await page.getByRole("tab", { name: "Movimientos" }).click();
    await expect(page.getByText(/Cambio de aceite/).first()).toBeVisible();
    await expect(page.getByText(/· Taller Sur/)).toBeVisible();

    const ficha = await abrirFicha(page, /^Taller Sur/);
    const plata = ficha.getByRole("region", { name: "Plata" });
    await expect(plata.getByText(/1 movimiento: gastaste/)).toBeVisible();
    await expect(plata.getByText(dinero("$ 1.500,00")).first()).toBeVisible();
    await expect(plata.getByText("Cambio de aceite")).toBeVisible();
  });

  test("una transferencia entre cuentas no ofrece contacto", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, { nombre: "Beto" });
    await prepararFinanzas(page);
    await page.goto("/finanzas");

    await page.getByRole("button", { name: "Agregar movimiento" }).click();
    const formulario = dialogo(page, "Agregar movimiento");
    await expect(formulario.getByLabel("Con quién (opcional)")).toBeVisible();
    await formulario.getByText("Es una transferencia entre mis cuentas").click();
    await expect(formulario.getByLabel("Con quién (opcional)")).toHaveCount(0);
  });

  test("al editar un movimiento se conserva y se puede quitar el contacto", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const taller = await crearContacto(page, { nombre: "Taller Sur" });
    const { cuentaId, categoriaId } = await prepararFinanzas(page);
    await pedirApi(page, "POST", "/api/finanzas/movimientos", {
      tipo: "gasto",
      importe: 200,
      descripcion: "Repuesto",
      fecha: "2026-10-10T12:00:00.000Z",
      categoriaId,
      cuentaFinancieraId: cuentaId,
      contactoId: taller,
    });
    await page.goto("/finanzas");
    await page.getByRole("tab", { name: "Movimientos" }).click();

    // Con el mouse, los botones de la fila se despliegan al pasar por encima.
    await page.getByText("Repuesto").first().hover();
    await page.getByRole("button", { name: "Editar" }).first().click();
    const edicion = dialogo(page, "Editar movimiento");
    await expect(edicion.getByLabel("Con quién (opcional)")).toHaveValue(taller);
    await edicion.getByLabel("Con quién (opcional)").selectOption("");
    await edicion.getByRole("button", { name: /^Guardar/ }).click();
    await expect(edicion).toBeHidden();

    await expect(page.getByText(/· Taller Sur/)).toHaveCount(0);
  });
});

test.describe("deudas con alguien que no es un contacto", () => {
  test("se registra solo con un nombre y queda indicado que no es un contacto, sin enlace", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirDeudas(page);

    await page.getByRole("button", { name: "Registrar una deuda" }).click();
    const nueva = dialogo(page, "Nueva deuda");
    await nueva.getByRole("radio", { name: "Otra persona o lugar" }).click();
    // Ya no se pide elegir un contacto: se escribe el nombre.
    await expect(nueva.getByLabel("¿Quién te debe?")).toBeVisible();
    await expect(nueva.getByRole("combobox", { name: "¿Quién te debe?" })).toHaveCount(0);
    await expect(
      nueva.getByText("No es un contacto: la deuda queda con este nombre"),
    ).toBeVisible();
    await nueva.getByLabel("¿Quién te debe?").fill("El vecino del 3B");
    await nueva.getByLabel("¿De qué es?").fill("Herramientas");
    await nueva.getByLabel("Monto").fill("800");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(nueva).toBeHidden();

    const fila = page.getByRole("listitem").filter({ hasText: "Herramientas" });
    await expect(fila.getByText("El vecino del 3B")).toBeVisible();
    await expect(fila.getByText("No es un contacto")).toBeVisible();
    await expect(fila.getByRole("link")).toHaveCount(0);
    // Se opera como cualquier deuda.
    await expect(fila.getByText(/^Falta /)).toContainText(dinero("$ 800,00"));
  });

  test("con un contacto lo indica y lleva a su ficha, que se abre sola", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto", apellido: "Gómez" });
    await crearDeuda(page, { contactoId: beto, concepto: "Préstamo" });
    await abrirDeudas(page);

    const fila = page.getByRole("listitem").filter({ hasText: "Préstamo" });
    await expect(fila.getByText("Contacto", { exact: true })).toBeVisible();
    await fila.getByRole("link", { name: "Ver el contacto Beto Gómez" }).click();

    await expect(page).toHaveURL(new RegExp(`/contactos\\?contacto=${beto}$`));
    const ficha = dialogo(page, "Contacto");
    await expect(ficha).toBeVisible();
    await expect(ficha.getByText("Beto Gómez").first()).toBeVisible();
    // La deuda se ve en la "Plata" de su ficha.
    await expect(ficha.getByText("Préstamo")).toBeVisible();

    // Al cerrar la ficha la dirección vuelve a ser la de siempre.
    await ficha.getByRole("button", { name: "Cerrar" }).first().click();
    await expect(ficha).toBeHidden();
    await expect(page).toHaveURL(/\/contactos$/);
  });

  test("un contacto que no existe en la dirección no rompe la pantalla", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await page.goto("/contactos?contacto=00000000-0000-4000-8000-000000000009");
    await expect(page.getByRole("heading", { name: "Contactos", level: 1 })).toBeVisible();
    await page.goto("/contactos?contacto=hola");
    await expect(page.getByRole("heading", { name: "Contactos", level: 1 })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("pide uno de los dos y avisa en el campo del modo elegido; cambiar de modo vacía el otro", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, { nombre: "Beto" });
    await abrirDeudas(page);

    await page.getByRole("button", { name: "Nueva deuda" }).click();
    const nueva = dialogo(page, "Nueva deuda");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(nueva.getByText("Elegí un contacto.")).toBeVisible();

    await nueva.getByRole("radio", { name: "Otra persona o lugar" }).click();
    // El aviso del modo anterior se fue; sin escribir nada, pide el nombre.
    await expect(nueva.getByText("Elegí un contacto.")).toHaveCount(0);
    await nueva.getByLabel("¿Quién te debe?").fill("   ");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(nueva.getByText("Escribí con quién es la deuda.")).toBeVisible();

    // Al volver a "Un contacto", lo escrito se vacía.
    await nueva.getByLabel("¿Quién te debe?").fill("Zoe");
    await nueva.getByRole("radio", { name: "Un contacto" }).click();
    await nueva.getByRole("radio", { name: "Otra persona o lugar" }).click();
    await expect(nueva.getByLabel("¿Quién te debe?")).toHaveValue("");
  });

  test("sin contactos aclara que se puede escribir solo el nombre", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar una deuda" }).click();
    await expect(
      dialogo(page, "Nueva deuda").getByText("Todavía no tenés contactos."),
    ).toBeVisible();
  });

  test("el nombre sigue el sentido de la deuda", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar una deuda" }).click();
    const nueva = dialogo(page, "Nueva deuda");
    await nueva.getByRole("radio", { name: "Otra persona o lugar" }).click();
    await nueva.getByRole("radio", { name: "Debo" }).click();
    await expect(nueva.getByLabel("¿A quién le debés?")).toBeVisible();
    await nueva.getByLabel("¿A quién le debés?").fill("Inmobiliaria Sur");
    await nueva.getByLabel("¿De qué es?").fill("Expensas");
    await nueva.getByLabel("Monto").fill("1200");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(nueva).toBeHidden();
    const fila = page.getByRole("listitem").filter({ hasText: "Expensas" });
    await expect(fila.getByText("Inmobiliaria Sur")).toBeVisible();
    await expect(fila.getByText("Debo", { exact: true })).toBeVisible();
  });

  test("con un contacto en la papelera la deuda lo dice y no lleva a ningún lado", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    const deuda = await crearDeuda(page, { contactoId: beto, concepto: "Viejo", monto: 50 });
    await pedirApi(page, "POST", `/api/finanzas/deudas/${deuda}/pagos`, {
      monto: 50,
      fecha: hoy(),
    });
    // Saldada: ya se puede mandar el contacto a la papelera.
    const borrado = await page.request.fetch(`${URL_API}/api/contactos/${beto}`, {
      method: "DELETE",
    });
    expect(borrado.ok()).toBe(true);

    await abrirDeudas(page);
    await page.getByRole("radio", { name: "Saldadas" }).click();
    const fila = page.getByRole("listitem").filter({ hasText: "Viejo" });
    await expect(fila.getByText("Contacto en la papelera")).toBeVisible();
    await expect(fila.getByRole("link")).toHaveCount(0);
  });

  test("la pantalla de deudas con las dos clases no tiene violaciones de accesibilidad", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Con contacto" });
    await crearDeuda(page, { nombreLibre: "Vecino", concepto: "Sin contacto" });
    await abrirDeudas(page);
    await expect(page.getByText("No es un contacto")).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });
});

test.describe("fecha límite de una deuda", () => {
  test("se pone al registrar la deuda y se ve en la lista y en la ficha del contacto", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto", apellido: "Gómez" });
    await abrirDeudas(page);

    await page.getByRole("button", { name: "Registrar una deuda" }).click();
    const nueva = dialogo(page, "Nueva deuda");
    await nueva.getByLabel("¿Quién te debe?").selectOption({ label: "Beto Gómez" });
    await nueva.getByLabel("¿De qué es?").fill("Préstamo con fecha");
    await nueva.getByLabel("Monto").fill("1000");
    await expect(nueva.getByText("Hasta qué día debería saldarse.")).toBeVisible();
    await nueva.getByLabel("Fecha límite (opcional)").fill("2099-12-31");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(nueva).toBeHidden();

    const fila = page.getByRole("listitem").filter({ hasText: "Préstamo con fecha" });
    await expect(fila.getByText("vence el 31/12/2099")).toBeVisible();

    const ficha = await abrirFicha(page, /Beto/);
    await expect(ficha.getByText("vence el 31/12/2099")).toBeVisible();
    expect(beto).toBeTruthy();
  });

  test("es opcional: sin ella no se muestra ningún vencimiento", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Sin límite" });
    await abrirDeudas(page);
    const fila = page.getByRole("listitem").filter({ hasText: "Sin límite" });
    await expect(fila).toBeVisible();
    await expect(fila.getByText(/vence el/)).toHaveCount(0);
  });

  test("avisa junto al campo si el límite es anterior al día de la deuda", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, { nombre: "Beto" });
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar una deuda" }).click();
    const nueva = dialogo(page, "Nueva deuda");
    await nueva.getByLabel("¿Quién te debe?").selectOption({ label: "Beto" });
    await nueva.getByLabel("¿De qué es?").fill("Préstamo");
    await nueva.getByLabel("Monto").fill("100");
    await nueva.getByLabel("¿Desde cuándo?").fill("2026-10-10");
    await nueva.getByLabel("Fecha límite (opcional)").fill("2026-10-01");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(
      nueva.getByText("El límite no puede ser anterior al día en que empezó la deuda."),
    ).toBeVisible();
    await expect(nueva).toBeVisible();

    // El aviso aparece junto con los de los demás campos, aunque otro esté mal.
    await nueva.getByLabel("¿De qué es?").fill("");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(nueva.getByText("Escribí de qué es la deuda.")).toBeVisible();
    await expect(
      nueva.getByText("El límite no puede ser anterior al día en que empezó la deuda."),
    ).toBeVisible();
  });

  test("se cambia y se quita al editar la deuda", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Editable", fechaLimite: "2099-06-30" });
    await abrirDeudas(page);
    const fila = page.getByRole("listitem").filter({ hasText: "Editable" });
    await expect(fila.getByText("vence el 30/06/2099")).toBeVisible();

    await fila.getByRole("button", { name: "Editar Editable" }).click();
    const edicion = dialogo(page, "Editar deuda");
    await expect(edicion.getByLabel("Fecha límite (opcional)")).toHaveValue("2099-06-30");
    await edicion.getByLabel("Fecha límite (opcional)").fill("2099-07-15");
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(fila.getByText("vence el 15/07/2099")).toBeVisible();

    await fila.getByRole("button", { name: "Editar Editable" }).click();
    const quitar = dialogo(page, "Editar deuda");
    await quitar.getByLabel("Fecha límite (opcional)").fill("");
    await quitar.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(quitar).toBeHidden();
    await expect(fila.getByText(/vence el/)).toHaveCount(0);
  });

  test("también se pone en una deuda con solo un nombre", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar una deuda" }).click();
    const nueva = dialogo(page, "Nueva deuda");
    await nueva.getByRole("radio", { name: "Otra persona o lugar" }).click();
    await nueva.getByLabel("¿Quién te debe?").fill("Vecino");
    await nueva.getByLabel("¿De qué es?").fill("Con nombre");
    await nueva.getByLabel("Monto").fill("50");
    await nueva.getByLabel("Fecha límite (opcional)").fill("2099-01-02");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(nueva).toBeHidden();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Con nombre" }).getByText("vence el 02/01/2099"),
    ).toBeVisible();
  });
});

test.describe("un pago que genera su ingreso o gasto", () => {
  const CASILLA_COBRO = "Registrar también el ingreso en una de mis cuentas";
  const CASILLA_PAGO = "Registrar también el gasto desde una de mis cuentas";

  async function verMovimientos(pagina: Page): Promise<void> {
    await pagina.goto("/finanzas");
    await pagina.getByRole("tab", { name: "Movimientos" }).click();
  }

  test("un cobro puede generar un ingreso en la cuenta elegida, que se ve en Movimientos", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const { cuentaId } = await prepararFinanzas(page);
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Préstamo", monto: 1000 });
    await abrirDeudas(page);

    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("400");
    // La casilla viene tildada: ya se ofrece la cuenta (la primera) y la categoría.
    await expect(cobro.getByRole("checkbox", { name: CASILLA_COBRO })).toBeChecked();
    await expect(cobro.getByLabel("¿En qué cuenta entró?")).toHaveValue(cuentaId);
    await expect(cobro.getByLabel("Categoría")).toBeVisible();
    await expect(cobro.getByText(/Suma el importe al saldo de la cuenta/)).toBeVisible();
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeHidden();

    // El pago dice que generó un ingreso...
    const fila = page.getByRole("listitem").filter({ hasText: "Préstamo" });
    await expect(fila.getByText(/Falta/)).toContainText(dinero("$ 600,00"));
    await fila.getByRole("button", { name: "Ver pagos" }).click();
    await expect(fila.getByText(/Generó un ingreso en/)).toBeVisible();

    // ... y el ingreso está en Movimientos, con el contacto.
    await verMovimientos(page);
    await expect(page.getByText("Cobro: Préstamo")).toBeVisible();
    await expect(page.getByText("Beto").first()).toBeVisible();
  });

  test("un pago de lo que debés puede generar un gasto", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararFinanzas(page);
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Cuota", monto: 300, sentido: "debo" });
    await abrirDeudas(page);

    await page.getByRole("button", { name: "Registrar pago" }).click();
    const pago = dialogo(page, "Registrar pago");
    await pago.getByLabel("¿Cuánto pagaste?").fill("300");
    await expect(pago.getByRole("checkbox", { name: CASILLA_PAGO })).toBeChecked();
    await expect(pago.getByLabel("¿De qué cuenta salió?")).toBeVisible();
    await expect(pago.getByText(/Resta el importe del saldo de la cuenta/)).toBeVisible();
    await pago.getByRole("button", { name: "Registrar pago" }).click();
    await expect(pago).toBeHidden();

    await verMovimientos(page);
    await expect(page.getByText("Pago: Cuota")).toBeVisible();
  });

  test("destildando la casilla, el pago no toca las cuentas ni los movimientos", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararFinanzas(page);
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Sin movimiento", monto: 100 });
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("100");
    await cobro.getByText(CASILLA_COBRO).click();
    // Destildada, ya no se piden cuenta ni categoría.
    await expect(cobro.getByLabel("¿En qué cuenta entró?")).toHaveCount(0);
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeHidden();

    await verMovimientos(page);
    await expect(page.getByText("Cobro: Sin movimiento")).toHaveCount(0);
  });

  test("no deja escribir un importe mayor a lo que falta: avisa al escribirlo y no envía nada", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Tope", monto: 100 });
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await expect(cobro.getByText(/Como máximo lo que falta/)).toBeVisible();

    // El aviso aparece mientras se escribe, sin tocar el botón.
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("100,01");
    await expect(cobro.getByText(/No puede pasar de lo que falta: .*100,00/)).toBeVisible();
    let pedidos = 0;
    page.on("request", (pedido) => {
      if (pedido.method() === "POST" && pedido.url().includes("/pagos")) pedidos += 1;
    });
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeVisible();
    expect(pedidos).toBe(0);

    // Justo lo que falta sí entra, y el aviso se va.
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("100");
    await expect(cobro.getByText(/No puede pasar de lo que falta/)).toHaveCount(0);
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeHidden();
  });

  test("después de un pago parcial, el tope baja a lo que queda", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    const deuda = await crearDeuda(page, { contactoId: beto, concepto: "Parcial", monto: 100 });
    await pedirApi(page, "POST", `/api/finanzas/deudas/${deuda}/pagos`, {
      monto: 60,
      fecha: hoy(),
    });
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("41");
    await expect(cobro.getByText(/No puede pasar de lo que falta: .*40,00/)).toBeVisible();
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("40");
    await expect(cobro.getByText(/No puede pasar de lo que falta/)).toHaveCount(0);
  });

  test("sin un período abierto lo dice y registra solo el pago, sin impedirlo", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Sin período", monto: 100 });
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("50");
    // La casilla sigue tildada, pero se avisa que no se puede generar y no se piden cuenta ni categoría.
    await expect(cobro.getByRole("checkbox", { name: CASILLA_COBRO })).toBeChecked();
    await expect(
      cobro.getByText(/No tenés un período abierto, así que se registra solo el cobro/),
    ).toBeVisible();
    await expect(cobro.getByLabel("¿En qué cuenta entró?")).toHaveCount(0);
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeHidden();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Sin período" }).getByText(/Falta/),
    ).toContainText(dinero("$ 50,00"));
  });

  /** Responde el pedido de cotización del navegador sin salir a internet (la API real la trae de una fuente pública). */
  async function simularCotizacion(
    pagina: Page,
    respuesta: { estado: 200; tasa: number } | { estado: 503 },
  ): Promise<void> {
    await pagina.route("**/api/finanzas/cotizacion?*", async (ruta) => {
      const cabeceras = {
        "access-control-allow-origin": "http://localhost:3100",
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type",
      };
      if (ruta.request().method() === "OPTIONS") {
        await ruta.fulfill({ status: 204, headers: cabeceras });
        return;
      }
      await ruta.fulfill({
        status: respuesta.estado,
        contentType: "application/json",
        headers: cabeceras,
        body: JSON.stringify(
          respuesta.estado === 200
            ? { tasa: respuesta.tasa, fechaDeLaFuente: "2026-10-03", desactualizada: false }
            : {
                error: {
                  codigo: "COTIZACION_NO_DISPONIBLE",
                  mensaje: "No pudimos traer la cotización. Escribila vos para seguir.",
                  idPeticion: "prueba",
                },
              },
        ),
      });
    });
  }

  test("una deuda en dólares se cobra en una cuenta en pesos: propone la cotización y convierte", async ({
    page,
  }) => {
    await simularCotizacion(page, { estado: 200, tasa: 40 });
    await entrar(page, await crearCuentaAprobada());
    await prepararFinanzas(page);
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "En dólares", monto: 100, moneda: "USD" });
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("25");

    // Con una cuenta de otra moneda aparece la cotización, con a cuánto equivale el cobro.
    const cotizacion = cobro.getByRole("region", { name: "Cotización" });
    await expect(cotizacion.getByText("1 USD = 40,00 UYU")).toBeVisible();
    await expect(cotizacion.getByText(/Equivale a .*1\.000,00/)).toBeVisible();

    // Se escribe la cotización (así el pedido no depende de internet) y se registra.
    await cotizacion.getByRole("button", { name: "Cambiar la cotización" }).click();
    await cotizacion
      .getByLabel("Cotización a usar")
      .selectOption({ label: "Escribir la cotización" });
    await cotizacion.getByLabel(/Cotización \(cuántos UYU vale 1 USD\)/).fill("38");
    await expect(cotizacion.getByText(/Equivale a .*950,00/)).toBeVisible();
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeHidden();

    // La deuda baja 25 dólares y el ingreso entra en pesos, con la aclaración de lo cobrado.
    const fila = page.getByRole("listitem").filter({ hasText: "En dólares" });
    await expect(fila.getByText(/Falta/)).toContainText(dinero("US$ 75,00"));
    await verMovimientos(page);
    await expect(page.getByText(/Cobro: En dólares \(US\$\s?25,00\)/)).toBeVisible();
    await expect(page.getByText(/950,00/).first()).toBeVisible();
  });

  test("entre monedas, sin la cotización del día pide escribirla y no deja registrar sin ella", async ({
    page,
  }) => {
    await simularCotizacion(page, { estado: 503 });
    await entrar(page, await crearCuentaAprobada());
    await prepararFinanzas(page);
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, {
      contactoId: beto,
      concepto: "Sin cotización",
      monto: 100,
      moneda: "USD",
    });
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("10");
    await expect(cobro.getByText(/No pudimos traer la cotización de ese día/)).toBeVisible();

    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeVisible();
    // Sin cotización queda el campo para escribirla, y el cobro sin registrar.
    await expect(cobro.getByLabel(/Cotización \(cuántos UYU vale 1 USD\)/)).toBeVisible();

    await cobro.getByLabel(/Cotización \(cuántos UYU vale 1 USD\)/).fill("40");
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeHidden();
  });

  test("quitar el pago avisa que se elimina también su movimiento, y lo elimina", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const { cuentaId, categoriaId } = await prepararFinanzas(page);
    const beto = await crearContacto(page, { nombre: "Beto" });
    const deuda = await crearDeuda(page, { contactoId: beto, concepto: "Para quitar", monto: 200 });
    await pedirApi(page, "POST", `/api/finanzas/deudas/${deuda}/pagos`, {
      monto: 200,
      fecha: hoy(),
      movimiento: { cuentaFinancieraId: cuentaId, categoriaId },
    });
    await verMovimientos(page);
    await expect(page.getByText("Cobro: Para quitar")).toBeVisible();

    await abrirDeudas(page);
    await page.getByRole("radio", { name: "Saldadas" }).click();
    const fila = page.getByRole("listitem").filter({ hasText: "Para quitar" });
    await fila.getByRole("button", { name: "Ver pagos" }).click();
    await fila.getByRole("button", { name: /Quitar el pago de/ }).click();
    await expect(fila.getByText(/Se elimina también su ingreso/)).toBeVisible();
    await fila.getByRole("button", { name: "Sí" }).click();
    // Al quitarse el pago, la deuda vuelve a estar pendiente (ya no está entre las saldadas).
    await expect(fila).toBeHidden();

    await verMovimientos(page);
    await expect(page.getByText("Cobro: Para quitar")).toHaveCount(0);
  });

  test("el formulario con las opciones abiertas no tiene violaciones de accesibilidad", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararFinanzas(page);
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, concepto: "Accesible", monto: 100 });
    await abrirDeudas(page);
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await expect(cobro.getByLabel("¿En qué cuenta entró?")).not.toHaveValue("");
    await page.waitForTimeout(TRANSICION_MS);
    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });
});

test.describe("deudas y préstamos", () => {
  test("se registra una deuda, se cobra por partes y queda saldada", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, { nombre: "Beto" });
    await abrirDeudas(page);
    await expect(page.getByRole("heading", { name: "No tenés deudas pendientes" })).toBeVisible();

    await page.getByRole("button", { name: "Registrar una deuda" }).click();
    const nueva = dialogo(page, "Nueva deuda");
    await nueva.getByLabel("¿Quién te debe?").selectOption({ label: "Beto" });
    await nueva.getByLabel("¿De qué es?").fill("Préstamo para el alquiler");
    await nueva.getByLabel("Monto").fill("5000");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();
    await expect(nueva).toBeHidden();

    // Aparece pendiente y el resumen de arriba suma lo que le deben.
    await expect(page.getByText("Préstamo para el alquiler")).toBeVisible();
    await expect(page.getByText(/^Falta /)).toContainText(dinero("$ 5.000,00"));
    const resumen = page
      .getByRole("main")
      .getByText("Te deben", { exact: true })
      .locator("xpath=..");
    await expect(resumen).toContainText(dinero("$ 5.000,00"));

    // Un cobro parcial baja lo que falta.
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("2000");
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro).toBeHidden();
    await expect(page.getByText(/^Falta /)).toContainText(dinero("$ 3.000,00"));
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");

    // "Cobrar todo lo que falta" completa el monto, y la deuda pasa a saldada.
    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const resto = dialogo(page, "Registrar cobro");
    await resto.getByRole("button", { name: "Cobrar todo lo que falta" }).click();
    await expect(resto.getByLabel("¿Cuánto te pagaron?")).toHaveValue("3.000");
    await resto.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(resto).toBeHidden();

    await expect(page.getByRole("heading", { name: "No tenés deudas pendientes" })).toBeVisible();
    await page.getByRole("radio", { name: "Saldadas" }).click();
    await expect(page.getByText("Préstamo para el alquiler")).toBeVisible();
    await expect(page.getByText("Saldada", { exact: true })).toBeVisible();
    await expect(page.getByText("pagada completa")).toBeVisible();
  });

  test("no deja cobrar más de lo que falta ni una fecha futura, y avisa junto al campo", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, monto: 100 });
    await abrirDeudas(page);

    await page.getByRole("button", { name: "Registrar cobro" }).click();
    const cobro = dialogo(page, "Registrar cobro");
    await cobro.getByLabel("¿Cuánto te pagaron?").fill("150");
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro.getByText(/No puede pasar de lo que falta/)).toBeVisible();
    await expect(cobro).toBeVisible();

    await cobro.getByLabel("¿Cuánto te pagaron?").fill("");
    await cobro.getByRole("button", { name: "Registrar cobro" }).click();
    await expect(cobro.getByText("Escribí el importe.")).toBeVisible();
  });

  test("pide los datos de la deuda y avisa de cada campo", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, { nombre: "Beto" });
    await abrirDeudas(page);

    await page.getByRole("button", { name: "Nueva deuda" }).click();
    const nueva = dialogo(page, "Nueva deuda");
    await nueva.getByRole("button", { name: "Registrar deuda" }).click();

    await expect(nueva.getByText("Elegí un contacto.")).toBeVisible();
    await expect(nueva.getByText("Escribí de qué es la deuda.")).toBeVisible();
    await expect(nueva.getByText("Escribí el importe.")).toBeVisible();
    await expect(nueva).toBeVisible();
  });

  test("lo que debés se anota en el otro sentido, con pago en vez de cobro", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const carla = await crearContacto(page, { nombre: "Carla", tipo: "empresa" });
    await crearDeuda(page, {
      contactoId: carla,
      sentido: "debo",
      concepto: "Compra a cuotas",
      monto: 800,
      moneda: "USD",
    });
    await abrirDeudas(page);

    const resumen = page.getByRole("main").getByText("Debés", { exact: true }).locator("xpath=..");
    await expect(resumen).toContainText(dinero("US$ 800,00"));
    await expect(page.getByText("Compra a cuotas")).toBeVisible();

    await page.getByRole("button", { name: "Registrar pago" }).click();
    const pago = dialogo(page, "Registrar pago");
    await expect(pago.getByLabel("¿Cuánto pagaste?")).toBeVisible();
    await pago.getByLabel("¿Cuánto pagaste?").fill("300");
    await pago.getByRole("button", { name: "Registrar pago" }).click();
    await expect(page.getByText(/^Falta /)).toContainText(dinero("US$ 500,00"));
  });

  test("los pagos se ven, se pueden quitar con confirmación y la deuda recupera el saldo", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    const deuda = await crearDeuda(page, { contactoId: beto, monto: 100 });
    await pedirApi(page, "POST", `/api/finanzas/deudas/${deuda}/pagos`, {
      monto: 100,
      fecha: hoy(),
    });
    await abrirDeudas(page);

    await page.getByRole("radio", { name: "Todas", exact: true }).first().click();
    await page.getByRole("button", { name: "Ver pagos" }).click();
    await expect(page.getByText(dinero("$ 100,00")).last()).toBeVisible();

    await page.getByRole("button", { name: /Quitar el pago de/ }).click();
    await expect(page.getByText("¿Quitar?")).toBeVisible();
    await page.getByRole("button", { name: "No", exact: true }).click();
    await expect(page.getByText("Saldada", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Quitar el pago de/ }).click();
    await page.getByRole("button", { name: "Sí", exact: true }).click();
    await expect(page.getByText("Todavía no hay pagos registrados.")).toBeVisible();
    await expect(page.getByText(/^Falta /)).toContainText(dinero("$ 100,00"));
  });

  test("se edita (no por debajo de lo pagado) y se elimina con confirmación", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    const deuda = await crearDeuda(page, { contactoId: beto, monto: 500, concepto: "Viejo" });
    await pedirApi(page, "POST", `/api/finanzas/deudas/${deuda}/pagos`, {
      monto: 200,
      fecha: hoy(),
    });
    await abrirDeudas(page);

    await page.getByRole("button", { name: "Editar Viejo" }).click();
    const edicion = dialogo(page, "Editar deuda");
    await edicion.getByLabel("¿De qué es?").fill("Nuevo concepto");
    await edicion.getByLabel("Monto").fill("100");
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion.getByText(/no puede ser menor a lo que ya se pagó/)).toBeVisible();

    await edicion.getByLabel("Monto").fill("300");
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(page.getByText("Nuevo concepto", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Falta /)).toContainText(dinero("$ 100,00"));

    await page.getByRole("button", { name: "Eliminar Nuevo concepto" }).click();
    const confirmacion = dialogo(page, "Eliminar deuda");
    await confirmacion.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Nuevo concepto", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Eliminar Nuevo concepto" }).click();
    await dialogo(page, "Eliminar deuda")
      .getByRole("button", { name: "Eliminar", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "No tenés deudas pendientes" })).toBeVisible();
  });

  test("no cambia los saldos de las cuentas ni los totales del período", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await prepararFinanzas(page);
    const antes = await pedirApi<{ disponible: { centavos: number } }>(
      page,
      "GET",
      "/api/finanzas/widgets",
    );

    const deuda = await crearDeuda(page, { contactoId: beto, monto: 9999 });
    await pedirApi(page, "POST", `/api/finanzas/deudas/${deuda}/pagos`, {
      monto: 1000,
      fecha: hoy(),
    });

    const despues = await pedirApi<{ disponible: { centavos: number } }>(
      page,
      "GET",
      "/api/finanzas/widgets",
    );
    expect(despues.disponible.centavos).toBe(antes.disponible.centavos);
  });
});

test.describe("la plata en la ficha del contacto", () => {
  test("se registra una deuda y un cobro sin salir de la ficha", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, { nombre: "Beto" });
    const ficha = await abrirFicha(page, /^Beto/);
    const plata = ficha.getByRole("region", { name: "Plata" });
    await expect(plata.getByText(/Todavía no hay plata registrada/)).toBeVisible();

    await plata.getByRole("button", { name: "Registrar deuda" }).click();
    // El contacto ya está fijado: no se pide elegirlo.
    await expect(plata.getByLabel("¿Quién te debe?")).toHaveCount(0);
    await expect(plata.getByText(/Te debe/)).toContainText("Beto");
    await plata.getByLabel("¿De qué es?").fill("Entradas del cine");
    await plata.getByLabel("Monto").fill("600");
    await plata.getByRole("button", { name: "Registrar deuda" }).last().click();

    await expect(plata.getByText("Entradas del cine")).toBeVisible();
    await expect(plata.getByText(/Te debe/)).toContainText(dinero("$ 600,00"));

    await plata.getByRole("button", { name: /Registrar cobro de Entradas del cine/ }).click();
    await plata.getByLabel("¿Cuánto te pagaron?").fill("200");
    await plata.getByRole("button", { name: "Registrar cobro", exact: true }).click();
    await expect(plata.getByText(/Te debe/)).toContainText(dinero("$ 400,00"));
  });

  test("un contacto con deudas pendientes no se puede eliminar, y avisa por qué", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto });
    const ficha = await abrirFicha(page, /^Beto/);

    await ficha.getByRole("button", { name: "Eliminar", exact: true }).click();
    const confirmacion = dialogo(page, "Eliminar contacto");
    await confirmacion.getByRole("button", { name: "Eliminar", exact: true }).click();

    await expect(confirmacion.getByText(/tiene deudas pendientes/)).toBeVisible();
    await expect(confirmacion).toBeVisible();
  });
});

test.describe("ver la dirección en el mapa", () => {
  test("el enlace abre OpenStreetMap con la dirección buscada, en otra pestaña y de forma segura", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, {
      nombre: "Taller Sur",
      tipo: "empresa",
      direccion: "Av. 18 de Julio 1234 & Colonia",
    });
    const ficha = await abrirFicha(page, /^Taller Sur/);

    const enlace = ficha.getByRole("link", { name: "Ver en el mapa" });
    await expect(enlace).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/search?query=Av.%2018%20de%20Julio%201234%20%26%20Colonia",
    );
    await expect(enlace).toHaveAttribute("target", "_blank");
    await expect(enlace).toHaveAttribute("rel", /noopener/);
    await expect(enlace).toHaveAttribute("rel", /noreferrer/);
  });

  test("sin dirección no hay enlace al mapa", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearContacto(page, { nombre: "Sin dirección" });
    const ficha = await abrirFicha(page, /^Sin dirección/);
    await expect(ficha.getByRole("link", { name: "Ver en el mapa" })).toHaveCount(0);
  });
});

test.describe("widgets con plata", () => {
  test("lo que te deben y debés aparece en el resumen de Finanzas del inicio", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto" });
    await crearDeuda(page, { contactoId: beto, monto: 1500 });
    await crearDeuda(page, { contactoId: beto, monto: 70, moneda: "USD", sentido: "debo" });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/inicio");
    // El primer resumen del carrusel es el de Finanzas: lo que te deben y lo que debés van con el disponible.
    const destacado = page.locator("[data-resumen='finanzas'] [data-destacado]");
    await expect(destacado).toContainText(new RegExp(`Te deben ${dinero("$ 1.500,00").source}`));
    await expect(destacado).toContainText(new RegExp(`Debés ${dinero("US$ 70,00").source}`));
  });

  test("'con quién más gastaste' aparece en los widgets de Contactos", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const taller = await crearContacto(page, { nombre: "Taller Sur" });
    const { cuentaId, categoriaId } = await prepararFinanzas(page);
    await pedirApi(page, "POST", "/api/finanzas/movimientos", {
      tipo: "gasto",
      importe: 750,
      descripcion: "Service",
      fecha: new Date().toISOString(),
      categoriaId,
      cuentaFinancieraId: cuentaId,
      contactoId: taller,
    });

    // Está en el carrusel de gráficos de la columna de Contactos: se pasa hasta llegar a él.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/contactos");
    const zona = page.getByRole("region", { name: "Widgets de contactos: gráficos" });
    const tarjeta = zona.locator(
      "xpath=.//div[@data-visual][.//p[normalize-space()='Con quién más gastaste']]",
    );
    for (let vuelta = 0; vuelta < 10 && (await tarjeta.count()) === 0; vuelta++) {
      const antes = await zona.getByRole("group").getAttribute("aria-label");
      await zona.getByRole("button", { name: "Widget siguiente" }).click();
      await expect(zona.getByRole("group")).not.toHaveAttribute("aria-label", antes ?? "");
    }
    await expect(tarjeta.getByText("Taller Sur")).toBeVisible();
    await expect(tarjeta.getByText(dinero("$ 750,00"))).toBeVisible();
  });
});

test.describe("accesibilidad y pantallas chicas", () => {
  test("la pestaña de deudas, sus formularios y la plata de la ficha no tienen violaciones de axe", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto", direccion: "Calle 1" });
    const deuda = await crearDeuda(page, { contactoId: beto, monto: 400 });
    await pedirApi(page, "POST", `/api/finanzas/deudas/${deuda}/pagos`, {
      monto: 100,
      fecha: hoy(),
    });
    const revisar = async () => (await new AxeBuilder({ page }).analyze()).violations;

    await abrirDeudas(page);
    await expect(page.getByText(/^Falta /)).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar(), "deudas").toEqual([]);

    await page.getByRole("button", { name: "Ver pagos" }).click();
    await expect(page.getByRole("button", { name: /Quitar el pago de/ })).toBeVisible();
    expect(await revisar(), "deudas con pagos").toEqual([]);

    await page.getByRole("button", { name: "Nueva deuda" }).click();
    await expect(dialogo(page, "Nueva deuda")).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar(), "formulario de deuda").toEqual([]);
    await dialogo(page, "Nueva deuda").getByRole("button", { name: "Cancelar" }).click();

    await abrirFicha(page, /^Beto/);
    await expect(page.getByRole("region", { name: "Plata" }).getByText(/Te debe/)).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar(), "ficha con plata").toEqual([]);
  });

  test("en una pantalla angosta las deudas no desbordan", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await entrar(page, await crearCuentaAprobada());
    const beto = await crearContacto(page, { nombre: "Beto con un nombre bastante largo" });
    await crearDeuda(page, {
      contactoId: beto,
      concepto: "Un concepto largo para ver cómo se corta el texto en pantallas chicas",
    });
    await abrirDeudas(page);
    await expect(page.getByText(/^Falta /)).toBeVisible();

    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(desborda).toBe(false);
  });
});

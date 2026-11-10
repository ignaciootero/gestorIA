// Tests end-to-end de lo que se elige al azar en la pantalla de inicio: con qué pestaña arranca el
// carrusel y qué variante muestra cada resumen (lib/eleccion-del-inicio.ts).
//
// - Que no se repita la pestaña de la visita anterior.
// - Que la dirección (`?resumen=…&variante=…`) fuerce una variante, y que cada variante muestre lo
//   suyo cuando hay datos.
// - Que una variante sin datos ceda su lugar a la general.
//
// El resto del carrusel (cómo se mueve, la variante general de cada módulo, accesibilidad) está en
// inicio.spec.ts.

import { expect, type Page, test } from "@playwright/test";
import {
  type CuentaDePrueba,
  crearCuentaAprobada,
  limpiarBaseDePruebas,
  sembrarRecordatorioDiarioAntiguoDePrueba,
  sembrarTareasDePrueba,
} from "./utilidades";

const ZONA = "America/Montevideo";
test.use({ timezoneId: ZONA });

const URL_API = "http://localhost:3101";

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

/** La pestaña elegida del carrusel. */
async function pestanaElegida(pagina: Page): Promise<string> {
  const elegida = pagina.getByRole("tab", { selected: true });
  await expect(elegida).toHaveCount(1);
  // El id de cada pestaña termina en su módulo ("…-pestana-finanzas").
  return (await elegida.getAttribute("id")) ?? "";
}

/** Abre el inicio con una variante forzada y devuelve el resumen que se ve. */
async function verVariante(pagina: Page, modulo: string, variante: string) {
  await pagina.goto(`/inicio?resumen=${modulo}&variante=${variante}`);
  const panel = pagina.locator(`[data-resumen='${modulo}']`);
  await expect(panel.locator("[data-destacado]").first()).toBeVisible();
  return panel;
}

async function crearTarea(pagina: Page, titulo: string, fecha: string): Promise<void> {
  await pedirApi(pagina, "POST", "/api/tareas", { titulo, notas: "", fecha, hora: "" });
}

async function crearPersona(pagina: Page, nombre: string, fechaNacimiento = ""): Promise<string> {
  const creado = await pedirApi<{ id: string }>(pagina, "POST", "/api/contactos", {
    tipo: "persona",
    nombre,
    apellido: "Pérez",
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

/** Un período abierto hace 10 días con un ingreso y dos gastos, y un presupuesto en una categoría. */
async function prepararFinanzas(pagina: Page): Promise<void> {
  const { categorias } = await pedirApi<{
    categorias: { id: number; nombre: string; sistema: string | null }[];
  }>(pagina, "GET", "/api/finanzas/categorias");
  const { cuentas } = await pedirApi<{ cuentas: { id: string }[] }>(
    pagina,
    "GET",
    "/api/finanzas/cuentas",
  );
  const [categoria] = categorias.filter((una) => una.sistema === null);
  const [cuenta] = cuentas;
  if (!categoria || !cuenta) throw new Error("Faltan categorías o cuentas");
  await pedirApi(pagina, "POST", "/api/finanzas/periodos", {
    nombre: "Prueba",
    aperturaEn: haceDias(10),
  });
  for (const [tipo, importe, dias] of [
    ["ingreso", 10000, 9],
    ["gasto", 3000, 5],
    ["gasto", 200, 1],
  ] as const) {
    await pedirApi(pagina, "POST", "/api/finanzas/movimientos", {
      tipo,
      importe,
      descripcion: tipo === "ingreso" ? "Sueldo" : "Compra",
      fecha: haceDias(dias),
      categoriaId: categoria.id,
      cuentaFinancieraId: cuenta.id,
    });
  }
  await pedirApi(pagina, "PUT", `/api/finanzas/presupuestos/${categoria.id}`, { monto: 5000 });
}

test.describe("elección al azar", () => {
  test("cada visita arranca en una pestaña distinta de la anterior", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    let anterior = await pestanaElegida(page);

    for (let visita = 0; visita < 4; visita++) {
      await page.reload();
      const actual = await pestanaElegida(page);
      expect(actual, `visita ${visita + 2}`).not.toBe(anterior);
      anterior = actual;
    }
  });

  test("la dirección fuerza la pestaña y la variante", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await crearTarea(page, "Comprar pan", hoy());

    const panel = await verVariante(page, "tareas", "racha");
    await expect(page.getByRole("tab", { name: "Tareas" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(panel.locator("[data-variante='racha']")).toBeVisible();
  });

  test("una variante sin datos para mostrar cede su lugar a la general", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());

    // Una cuenta nueva no tiene presupuestos, ni tareas, ni cumpleaños, ni eventos.
    for (const [modulo, variante] of [
      ["finanzas", "presupuestos"],
      ["tareas", "viene"],
      ["contactos", "cumpleanos"],
      ["calendario", "dia"],
    ] as const) {
      const panel = await verVariante(page, modulo, variante);
      await expect(panel.locator("[data-variante='general']"), modulo).toBeVisible();
    }
  });
});

test.describe("cada variante con datos", () => {
  test("Finanzas: ritmo y presupuestos", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await prepararFinanzas(page);

    let panel = await verVariante(page, "finanzas", "ritmo");
    await expect(panel.locator("[data-variante='ritmo']")).toBeVisible();
    await expect(panel.getByText("Gastás por día")).toBeVisible();
    await expect(panel.getByText("Gasto de los últimos días")).toBeVisible();

    panel = await verVariante(page, "finanzas", "presupuestos");
    await expect(panel.locator("[data-variante='presupuestos']")).toBeVisible();
    await expect(panel.getByText("1 de 1 en orden")).toBeVisible();
    await expect(panel.getByText("Cuánto usaste de cada uno")).toBeVisible();
  });

  test("Tareas: racha, lo que viene y para atender", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await crearTarea(page, "Comprar pan", hoy());
    await crearTarea(page, "Turno médico", sumarDias(hoy(), 3));
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Atrasada", dia: sumarDias(hoy(), -2) }],
      hoy(),
    );

    let panel = await verVariante(page, "tareas", "racha");
    await expect(panel.getByText("Días seguidos al día")).toBeVisible();

    panel = await verVariante(page, "tareas", "viene");
    await expect(panel.locator("[data-variante='viene']")).toBeVisible();
    await expect(panel.getByText("1 tarea", { exact: true })).toBeVisible();
    await expect(panel.getByText(/Turno médico/).first()).toBeVisible();

    panel = await verVariante(page, "tareas", "atender");
    await expect(panel.locator("[data-variante='atender']")).toBeVisible();
    await expect(panel.getByText("Atrasadas", { exact: true })).toBeVisible();
  });

  test("Contactos: cumpleaños y la semana pasada", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    const ana = await crearPersona(page, "Ana", `1990${sumarDias(hoy(), 10).slice(4)}`);
    await crearPersona(page, "Beto", `1985${sumarDias(hoy(), 40).slice(4)}`);
    await sembrarRecordatorioDiarioAntiguoDePrueba(cuenta.email, ana, "Llamar", 3, hoy());

    let panel = await verVariante(page, "contactos", "cumpleanos");
    await expect(panel.locator("[data-variante='cumpleanos']")).toBeVisible();
    await expect(panel.getByText("Ana Pérez")).toBeVisible();
    await expect(panel.getByText("2 cumpleaños en el año")).toBeVisible();

    panel = await verVariante(page, "contactos", "semana");
    await expect(panel.locator("[data-variante='semana']")).toBeVisible();
    await expect(panel.getByText("La semana pasada")).toBeVisible();
  });

  test("Calendario: día más cargado y por módulo", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    // Dos tareas pasado mañana y una mañana: el más cargado es pasado mañana.
    await crearTarea(page, "Una", sumarDias(hoy(), 1));
    await crearTarea(page, "Dos", sumarDias(hoy(), 2));
    await crearTarea(page, "Tres", sumarDias(hoy(), 2));

    let panel = await verVariante(page, "calendario", "dia");
    await expect(panel.locator("[data-variante='dia']")).toBeVisible();
    await expect(panel.getByText("Tu día más cargado")).toBeVisible();
    await expect(panel.getByText(/tenés 2 cosas, de 3 en la semana/)).toBeVisible();

    panel = await verVariante(page, "calendario", "modulos");
    await expect(panel.locator("[data-variante='modulos']")).toBeVisible();
    await expect(panel.getByText("3 cosas", { exact: true })).toBeVisible();
    await expect(panel.getByText("Todo viene de Tareas.")).toBeVisible();
  });
});

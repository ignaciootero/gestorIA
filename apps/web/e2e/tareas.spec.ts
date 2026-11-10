// Tests end-to-end del módulo de tareas: agregar rápido y con el formulario, tildar (con el tachado
// y la salida de la lista), deshacer, editar, eliminar, tareas repetitivas, atrasadas, historial y
// accesibilidad.
//
// La lógica de días (repetir, arrastrar atrasadas, historial) ya tiene sus tests de integración en
// apps/api con un reloj fijo; acá se prueba lo que ve y hace la persona. El día de "hoy" depende
// de la zona horaria: se fija la del navegador a la de las cuentas nuevas (Montevideo).

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  type CuentaDePrueba,
  crearCuentaAprobada,
  limpiarBaseDePruebas,
  sembrarCategoriasDeTareaDePrueba,
  sembrarRepetitivasDePrueba,
  sembrarTareasDePrueba,
} from "./utilidades";

const ZONA = "America/Montevideo";
test.use({ timezoneId: ZONA });

/** Lo que tarda el selector de pestañas en terminar de cambiar de color (axe mide el contraste a mitad de camino). */
const TRANSICION_MS = 500;

/** Dónde este navegador recuerda que ya se vio el aviso de "dar por fallida" (lib/preferencias-tareas.ts). */
const CLAVE_DE_AVISO_DE_FALLIDA = "gestoria:tareas:aviso-de-fallida-oculto";

test.beforeEach(async ({ page }, testInfo) => {
  await limpiarBaseDePruebas();
  // Salvo los tests del aviso mismo, el resto ya "entendió la lógica": no le sale el aviso al dar una tarea por fallida.
  if (testInfo.titlePath.includes("aviso al dar por fallida")) return;
  await page.addInitScript((clave) => {
    try {
      localStorage.setItem(clave, "true");
    } catch {
      // Sin almacenamiento todavía (por ejemplo about:blank): se ignora.
    }
  }, CLAVE_DE_AVISO_DE_FALLIDA);
});

/** El día de hoy ("AAAA-MM-DD") para una cuenta nueva, que usa la zona de Montevideo. */
function hoy(desplazamientoEnDias = 0): string {
  const base = new Date(Date.now() + desplazamientoEnDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

/** El día de la semana de hoy en formato ISO: 1 es lunes y 7 domingo. */
function diaIsoDeHoy(desplazamientoEnDias = 0): number {
  const nombre = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, weekday: "short" }).format(
    new Date(Date.now() + desplazamientoEnDias * 86_400_000),
  );
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(nombre) + 1;
}

async function entrar(pagina: Page, cuenta: CuentaDePrueba): Promise<void> {
  await pagina.goto("/ingresar");
  await pagina.getByLabel("Usuario o correo").fill(cuenta.usuario);
  await pagina.getByLabel("Contraseña").fill(cuenta.password);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await expect(pagina).toHaveURL(/\/inicio$/);
}

async function abrirTareas(pagina: Page): Promise<void> {
  await pagina.goto("/tareas");
  await expect(pagina.getByRole("heading", { name: "Tareas", level: 1 })).toBeVisible();
}

async function irASeccion(
  pagina: Page,
  nombre: "Hoy" | "Repetitivas" | "Historial" | "Categorías",
) {
  await pagina
    .getByRole("tablist", { name: "Sección del módulo de tareas" })
    .getByRole("tab", { name: nombre })
    .click();
}

const NOMBRES_DE_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Marca o desmarca un día de la semana (1 es lunes) en el formulario de una tarea semanal. */
async function marcarDia(dialogo: Locator, diaIso: number, marcado: boolean): Promise<void> {
  // La casilla real está oculta: se toca el botón dibujado, como lo haría una persona.
  const casilla = dialogo.getByRole("checkbox", { name: NOMBRES_DE_DIA[diaIso - 1] ?? "" });
  if ((await casilla.isChecked()) !== marcado) {
    await casilla.locator("xpath=..").click();
  }
  if (marcado) await expect(casilla).toBeChecked();
  else await expect(casilla).not.toBeChecked();
}

/** El campo para agregar una tarea en un paso. */
function campoRapido(pagina: Page) {
  return pagina.getByRole("textbox", { name: "Agregar una tarea para hoy" });
}

/** Agrega una tarea para hoy con el campo rápido. */
async function agregarRapido(pagina: Page, titulo: string): Promise<void> {
  const campo = campoRapido(pagina);
  await campo.fill(titulo);
  await campo.press("Enter");
  await expect(pagina.getByRole("tabpanel").getByText(titulo, { exact: true })).toBeVisible();
}

/** Tilda o destilda una tarea tocando su texto, como lo haría una persona (el campo real está oculto). */
async function alternar(pagina: Page, titulo: string): Promise<void> {
  await pagina.locator("label").getByText(titulo, { exact: true }).click();
}

/**
 * Toca la cruz de "fallida" de una tarea. En Hoy la cruz aparece al apuntar a la fila (no ocupa lugar hasta entonces),
 * así que primero se apunta a la fila, como lo haría una persona.
 */
async function marcarComoFallida(pagina: Page, titulo: string): Promise<void> {
  await pagina
    .locator("label")
    .filter({ has: pagina.getByText(titulo, { exact: true }) })
    .hover();
  await pagina.getByRole("button", { name: `Marcar como fallida: ${titulo}` }).click();
}

/** Abre la sección "Atrasadas", que arranca cerrada. Hay que llamarla cuando se sabe que hay atrasadas. */
async function abrirAtrasadas(pagina: Page): Promise<void> {
  const boton = pagina
    .getByRole("region", { name: "Atrasadas" })
    .getByRole("button", { name: /^Atrasadas/ });
  if ((await boton.getAttribute("aria-expanded")) !== "true") await boton.click();
  await expect(boton).toHaveAttribute("aria-expanded", "true");
}

/** La casilla de una tarea. */
function fila(pagina: Page, titulo: string) {
  return pagina.getByRole("checkbox", { name: titulo, exact: true });
}

test.describe("la pantalla de tareas", () => {
  test("se llega desde el menú, y sin tareas explica qué hacer", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("link", { name: "Tareas" })
      .click();
    await expect(page).toHaveURL(/\/tareas$/);
    await expect(page.getByRole("heading", { name: "Tareas", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No tenés tareas para hoy" })).toBeVisible();
    await expect(
      page.getByRole("tabpanel").getByText("Todavía no tenés tareas para hoy."),
    ).toBeVisible();
  });

  test("sin sesión, redirige al ingreso", async ({ page }) => {
    await page.goto("/tareas");
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});

test.describe("agregar y completar", () => {
  test("escribir y apretar Enter agrega la tarea a 'Para hoy'", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);

    await agregarRapido(page, "Comprar pan");
    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText("Comprar pan");
    await expect(page.getByRole("tabpanel").getByText("0 de 1 hechas")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("0%", { exact: true })).toBeVisible();
    // El campo queda vacío y con el foco, para escribir la siguiente enseguida.
    const campo = campoRapido(page);
    await expect(campo).toHaveValue("");
    await expect(campo).toBeFocused();

    await agregarRapido(page, "Llamar al plomero");
    await expect(page.getByRole("tabpanel").getByText("0 de 2 hechas")).toBeVisible();
  });

  test("el botón Agregar solo se habilita si hay algo escrito", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    const boton = page.getByRole("button", { name: "Agregar", exact: true });
    await expect(boton).toBeDisabled();
    await campoRapido(page).fill("   ");
    await expect(boton).toBeDisabled();
    await campoRapido(page).fill("Algo");
    await expect(boton).toBeEnabled();
  });

  test("tildar una tarea la tacha, la saca de la lista y la pasa a 'Hechas hoy'", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarRapido(page, "Lavar los platos");
    await agregarRapido(page, "Sacar la basura");

    await alternar(page, "Lavar los platos");
    // Se ve tachada un instante y después sale de la lista.
    await expect(page.getByRole("region", { name: "Para hoy" })).not.toContainText(
      "Lavar los platos",
    );
    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText("Sacar la basura");
    await expect(page.getByRole("tabpanel").getByText("1 de 2 hechas")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("50%", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Hechas hoy \(1\)/ }).click();
    const hechas = page.getByRole("region", { name: "Hechas hoy" });
    await expect(hechas).toContainText("Lavar los platos");
    await expect(fila(page, "Lavar los platos")).toBeChecked();
  });

  test("hacer todo lo de hoy muestra el mensaje de que no queda nada", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarRapido(page, "Única tarea");
    await alternar(page, "Única tarea");
    await expect(page.getByRole("tabpanel").getByText("¡No queda nada para hoy!")).toBeVisible();
    await expect(
      page.getByRole("tabpanel").getByText("Hiciste la única tarea de hoy."),
    ).toBeVisible();
  });

  test("se puede deshacer un tilde desde 'Hechas hoy' y la tarea vuelve a la lista", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarRapido(page, "Regar las plantas");
    await agregarRapido(page, "Otra cosa");
    await alternar(page, "Regar las plantas");
    await expect(page.getByRole("tabpanel").getByText("1 de 2 hechas")).toBeVisible();

    await page.getByRole("button", { name: /Hechas hoy \(1\)/ }).click();
    await alternar(page, "Regar las plantas");
    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText("Regar las plantas");
    await expect(page.getByRole("tabpanel").getByText("0 de 2 hechas")).toBeVisible();
  });

  test("lo tildado queda tildado al recargar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarRapido(page, "Pagar la luz");
    await agregarRapido(page, "Dejar para después");
    await alternar(page, "Pagar la luz");
    await expect(page.getByRole("tabpanel").getByText("1 de 2 hechas")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("tabpanel").getByText("1 de 2 hechas")).toBeVisible();
    await expect(page.getByRole("region", { name: "Para hoy" })).not.toContainText("Pagar la luz");
  });
});

test.describe("el formulario completo", () => {
  test("agrega una tarea para un día futuro, que va a 'Más adelante'", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);

    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Sacar turno con el médico");
    await dialogo.getByLabel("Para el día").fill(hoy(5));
    await dialogo.getByLabel("Hora (opcional)").fill("09:30");
    await dialogo.getByLabel("Notas (opcional)").fill("Llevar los estudios");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    const masAdelante = page.getByRole("region", { name: "Más adelante" });
    await expect(masAdelante).toContainText("Sacar turno con el médico");
    await expect(masAdelante).toContainText("09:30");
    await expect(masAdelante).toContainText("Llevar los estudios");
    await expect(page.getByRole("region", { name: "Para hoy" })).toHaveCount(0);
  });

  test("avisa si falta el título y si el día ya pasó", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });

    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo.getByText("Escribí qué hay que hacer.")).toBeVisible();

    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Algo");
    await dialogo.getByLabel("Para el día").fill(hoy(-3));
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo.getByText(/Ese día ya pasó/)).toBeVisible();
    await expect(dialogo).toBeVisible();
  });

  test("cancelar cierra el formulario sin agregar nada", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("No la quiero");
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("tabpanel").getByText("No la quiero")).toHaveCount(0);
  });

  test("se edita una tarea: título, notas y hora", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarRapido(page, "Titulo viejo");

    await page.getByRole("button", { name: "Editar: Titulo viejo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar tarea" });
    await expect(dialogo.getByLabel("¿Qué hay que hacer?")).toHaveValue("Titulo viejo");
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Título nuevo");
    await dialogo.getByLabel("Hora (opcional)").fill("18:00");
    await dialogo.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(dialogo).toBeHidden();

    const parahoy = page.getByRole("region", { name: "Para hoy" });
    await expect(parahoy).toContainText("Título nuevo");
    await expect(parahoy).toContainText("18:00");
    await expect(parahoy).not.toContainText("Titulo viejo");
  });

  test("eliminar pide confirmación y se puede cancelar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarRapido(page, "Tarea a eliminar");

    await page.getByRole("button", { name: "Eliminar: Tarea a eliminar" }).click();
    const dialogo = page.getByRole("dialog", { name: "Eliminar tarea" });
    await expect(dialogo).toContainText("Tarea a eliminar");
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(
      page.getByRole("tabpanel").getByText("Tarea a eliminar", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Eliminar: Tarea a eliminar" }).click();
    await page
      .getByRole("dialog", { name: "Eliminar tarea" })
      .getByRole("button", { name: "Eliminar" })
      .click();
    await expect(
      page.getByRole("tabpanel").getByText("Tarea a eliminar", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No tenés tareas para hoy" })).toBeVisible();
  });
});

test.describe("tareas repetitivas", () => {
  test("una diaria aparece hoy, con la marca de que se repite, y se administra en 'Repetitivas'", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);

    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Tomar la vitamina");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Todos los días" });
    // Con una repetición ya no se pide un día.
    await expect(dialogo.getByLabel("Para el día")).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    const parahoy = page.getByRole("region", { name: "Para hoy" });
    await expect(parahoy).toContainText("Tomar la vitamina");
    await expect(parahoy).toContainText("Se repite");

    await irASeccion(page, "Repetitivas");
    const lista = page.getByRole("listitem").filter({ hasText: "Tomar la vitamina" });
    await expect(lista).toContainText("Todos los días");
    await expect(lista).toContainText("hoy");
  });

  test("una semanal de otro día de la semana no aparece hoy y dice cuándo le toca", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);

    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Reunión de equipo");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Todas las semanas" });
    // Mañana: el día de la semana siguiente al de hoy (viene marcado hoy, así que se cambia).
    await marcarDia(dialogo, diaIsoDeHoy(), false);
    await marcarDia(dialogo, diaIsoDeHoy(1), true);
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await expect(page.getByRole("tabpanel").getByText("Reunión de equipo")).toHaveCount(0);
    await irASeccion(page, "Repetitivas");
    const item = page.getByRole("listitem").filter({ hasText: "Reunión de equipo" });
    await expect(item).toContainText("Todos los");
    await expect(item).toContainText("mañana");
  });

  test("mensual y anual piden el día y el mes que corresponden, y avisan un día que no existe", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Pagar el alquiler");

    await dialogo.getByLabel("Se repite").selectOption({ label: "Todos los meses" });
    await expect(dialogo.getByLabel("Día del mes")).toBeVisible();
    await expect(dialogo.getByText(/aparece el último día del mes/)).toBeVisible();

    await dialogo.getByLabel("Se repite").selectOption({ label: "Todos los años" });
    await dialogo.getByLabel("Día", { exact: true }).selectOption("31");
    await dialogo.getByLabel("Mes", { exact: true }).selectOption({ label: "Abril" });
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo.getByText("Ese mes no tiene ese día.")).toBeVisible();

    await dialogo.getByLabel("Día", { exact: true }).selectOption("30");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();
    await irASeccion(page, "Repetitivas");
    await expect(page.getByRole("tabpanel").getByText("Pagar el alquiler")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText(/Cada 30 de abril/)).toBeVisible();
  });

  test("se edita la regla y se elimina con confirmación; deja de aparecer en la lista de hoy", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const nueva = page.getByRole("dialog", { name: "Agregar tarea" });
    await nueva.getByLabel("¿Qué hay que hacer?").fill("Regar");
    await nueva.getByLabel("Se repite").selectOption({ label: "Todos los días" });
    await nueva.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(nueva).toBeHidden();

    await irASeccion(page, "Repetitivas");
    await page.getByRole("button", { name: "Editar: Regar" }).click();
    const edicion = page.getByRole("dialog", { name: "Editar tarea" });
    // Una repetitiva no se convierte en una tarea de una sola vez.
    await expect(edicion.getByLabel("Se repite").locator("option")).toHaveText([
      "Todos los días",
      "Cada varios días",
      "Todas las semanas",
      "Todos los meses",
      "Todos los años",
    ]);
    await edicion.getByLabel("¿Qué hay que hacer?").fill("Regar los helechos");
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(
      page.getByRole("region", { name: "Diarias" }).getByText("Regar los helechos"),
    ).toBeVisible();

    await irASeccion(page, "Hoy");
    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText(
      "Regar los helechos",
    );

    await irASeccion(page, "Repetitivas");
    await page.getByRole("button", { name: "Eliminar: Regar los helechos" }).click();
    const confirmar = page.getByRole("dialog", { name: "Eliminar tarea repetitiva" });
    await expect(confirmar).toContainText("queda en el historial");
    await confirmar.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByRole("tabpanel").getByText("No tenés tareas repetitivas")).toBeVisible();

    await irASeccion(page, "Hoy");
    await expect(page.getByRole("tabpanel").getByText("Regar los helechos")).toHaveCount(0);
  });

  test("cada varios días: pide la cantidad de días y el inicio (hoy por defecto) y aparece hoy", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Regar los helechos");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Cada varios días" });

    // Por defecto, día por medio y empezando hoy.
    await expect(dialogo.getByLabel("Cada cuántos días")).toHaveValue("2");
    await expect(dialogo.getByLabel("Empieza el día")).toHaveValue(hoy());
    await expect(dialogo.getByLabel("Hora (opcional)")).toHaveValue("");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText(
      "Regar los helechos",
    );
    await irASeccion(page, "Repetitivas");
    const grupo = page.getByRole("region", { name: "Cada varios días" });
    await expect(grupo).toContainText("Regar los helechos");
    await expect(grupo).toContainText("Día por medio");
    await expect(grupo).toContainText("hoy");
  });

  test("cada varios días con otra cantidad, hora e inicio futuro: no aparece hoy y dice cuándo le toca", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Cambiar el filtro");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Cada varios días" });
    await dialogo.getByLabel("Cada cuántos días").fill("5");
    await dialogo.getByLabel("Empieza el día").fill(hoy(3));
    await dialogo.getByLabel("Hora (opcional)").fill("09:30");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await expect(
      page.getByRole("tabpanel").getByText("Cambiar el filtro", { exact: true }),
    ).toHaveCount(0);
    await irASeccion(page, "Repetitivas");
    const fila = page.getByRole("listitem").filter({ hasText: "Cambiar el filtro" });
    await expect(fila).toContainText("Cada 5 días a las 09:30");
    await expect(fila).toContainText("en 3 días");
  });

  test("cada varios días avisa si la cantidad no sirve o el inicio ya pasó", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Algo");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Cada varios días" });

    await dialogo.getByLabel("Cada cuántos días").fill("1");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toContainText("Todos los días");
    await dialogo.getByLabel("Cada cuántos días").fill("");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toContainText("Indicá cada cuántos días");

    await dialogo.getByLabel("Cada cuántos días").fill("2");
    await dialogo.getByLabel("Empieza el día").fill(hoy(-3));
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toContainText("Ese día ya pasó");
    await expect(dialogo).toBeVisible();
  });

  test("cada varios días se edita con sus valores y se puede cambiar la cantidad", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const nueva = page.getByRole("dialog", { name: "Agregar tarea" });
    await nueva.getByLabel("¿Qué hay que hacer?").fill("Regar");
    await nueva.getByLabel("Se repite").selectOption({ label: "Cada varios días" });
    await nueva.getByLabel("Cada cuántos días").fill("4");
    await nueva.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(nueva).toBeHidden();

    await irASeccion(page, "Repetitivas");
    await page.getByRole("button", { name: "Editar: Regar" }).click();
    const edicion = page.getByRole("dialog", { name: "Editar tarea" });
    await expect(edicion.getByLabel("Cada cuántos días")).toHaveValue("4");
    await expect(edicion.getByLabel("Empieza el día")).toHaveValue(hoy());
    await edicion.getByLabel("Cada cuántos días").fill("3");
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(page.getByRole("listitem").filter({ hasText: "Regar" })).toContainText(
      "Cada 3 días",
    );
  });

  test("el filtro por periodicidad incluye 'Cada varios días'", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Alterna");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Cada varios días" });
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();
    await irASeccion(page, "Repetitivas");
    await page
      .getByRole("radiogroup", { name: "Filtrar por periodicidad" })
      .getByRole("radio", { name: "Cada varios días" })
      .click();
    await expect(page.getByRole("region", { name: "Cada varios días" })).toContainText("Alterna");
  });

  test("se puede pedir que se dé por fallida sola si pasa el día: viene desmarcado y se recuerda", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const nueva = page.getByRole("dialog", { name: "Agregar tarea" });
    const casilla = nueva.getByRole("checkbox", { name: /Darla por fallida automáticamente/ });

    // Una tarea de una sola vez no tiene esta opción.
    await expect(casilla).toHaveCount(0);
    await nueva.getByLabel("¿Qué hay que hacer?").fill("Tomar la pastilla");
    await nueva.getByLabel("Se repite").selectOption({ label: "Todos los días" });
    await expect(casilla).toBeVisible();
    await expect(casilla).not.toBeChecked();
    await nueva
      .locator("label")
      .getByText("Darla por fallida automáticamente si pasa el día")
      .click();
    await expect(casilla).toBeChecked();
    await nueva.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(nueva).toBeHidden();

    await irASeccion(page, "Repetitivas");
    const fila = page.getByRole("listitem").filter({ hasText: "Tomar la pastilla" });
    await expect(fila).toContainText("Se da por fallida si pasa el día");

    // Al editar viene marcada, y se puede apagar.
    await page.getByRole("button", { name: "Editar: Tomar la pastilla" }).click();
    const edicion = page.getByRole("dialog", { name: "Editar tarea" });
    const casillaDeEdicion = edicion.getByRole("checkbox", {
      name: /Darla por fallida automáticamente/,
    });
    await expect(casillaDeEdicion).toBeChecked();
    await edicion
      .locator("label")
      .getByText("Darla por fallida automáticamente si pasa el día")
      .click();
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Tomar la pastilla" }),
    ).not.toContainText("Se da por fallida");
  });

  test("la opción de fallar sola no aparece al editar la tarea de un día", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const nueva = page.getByRole("dialog", { name: "Agregar tarea" });
    await nueva.getByLabel("¿Qué hay que hacer?").fill("Regar");
    await nueva.getByLabel("Se repite").selectOption({ label: "Todos los días" });
    await nueva.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(nueva).toBeHidden();

    await page.getByRole("button", { name: "Editar: Regar" }).first().click();
    const edicion = page.getByRole("dialog", { name: "Editar tarea" });
    await expect(edicion.getByLabel("¿Qué hay que hacer?")).toBeVisible();
    await expect(edicion.getByRole("checkbox", { name: /Darla por fallida/ })).toHaveCount(0);
  });

  test("sin repetitivas, explica para qué sirven y ofrece crear una", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await irASeccion(page, "Repetitivas");
    await expect(page.getByRole("tabpanel").getByText("No tenés tareas repetitivas")).toBeVisible();
    await page.getByRole("button", { name: "Agregar una tarea repetitiva" }).click();
    await expect(page.getByRole("dialog", { name: "Agregar tarea" })).toBeVisible();
  });
});

test.describe("widgets de tareas por categoría", () => {
  /**
   * Pasa los widgets del carrusel hasta que se ve el que tiene ese título y lo devuelve (mientras
   * uno sale y otro entra se ven los dos, por eso se mira dentro del widget y no del carrusel).
   */
  async function mostrarWidget(carrusel: Locator, titulo: string): Promise<Locator> {
    const widget = carrusel.getByRole("group").filter({ hasText: titulo });
    for (let intento = 0; intento < 12; intento++) {
      if (await widget.isVisible()) return widget;
      await carrusel.getByRole("button", { name: "Widget siguiente" }).click();
    }
    await expect(widget).toBeVisible();
    return widget;
  }

  async function abrirConDatos(page: Page) {
    await page.setViewportSize({ width: 1440, height: 900 });
    const cuenta = await crearCuentaAprobada();
    await sembrarCategoriasDeTareaDePrueba(cuenta.email, ["Casa", "Trabajo"]);
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Atrasada A", dia: hoy(-2), categoria: "Casa" },
        { titulo: "Atrasada B", dia: hoy(-3), categoria: "Casa" },
        { titulo: "Hecha 1", dia: hoy(-1), categoria: "Casa", hecha: true },
        { titulo: "Hecha 2", dia: hoy(-2), categoria: "Casa", hecha: true },
        { titulo: "Hecha 3", dia: hoy(-3), categoria: "Casa", hecha: true },
        { titulo: "Hoy trabajo", dia: hoy(), categoria: "Trabajo" },
        { titulo: "Hoy suelta 1", dia: hoy() },
        { titulo: "Hoy suelta 2", dia: hoy() },
        { titulo: "Hoy suelta 3", dia: hoy() },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    return page.getByRole("complementary", { name: "Widgets" });
  }

  test("los gráficos muestran lo pendiente, lo hecho y el cumplimiento por categoría", async ({
    page,
  }) => {
    const columna = await abrirConDatos(page);
    const graficos = columna.getByRole("region", { name: /Widgets de tareas: gráficos/ });

    const pendientes = await mostrarWidget(graficos, "Pendientes por categoría");
    // Casa tiene 2 atrasadas, Trabajo 1 de hoy y 3 de hoy no tienen categoría.
    await expect(pendientes.getByText("Casa", { exact: true })).toBeVisible();
    await expect(pendientes.getByText("Trabajo", { exact: true })).toBeVisible();
    await expect(pendientes.getByText("Sin categoría", { exact: true })).toBeVisible();
    await expect(pendientes).toContainText("6 en total");

    const hechas = await mostrarWidget(graficos, "Dónde hiciste más");
    await expect(hechas.getByText("Casa", { exact: true })).toBeVisible();
    await expect(hechas.getByText("3", { exact: true })).toBeVisible();

    const cumplimiento = await mostrarWidget(graficos, "Cumplimiento por categoría");
    await expect(cumplimiento.getByText("Casa", { exact: true })).toBeVisible();
    // 3 hechas de 5 que tocaban (más las 2 atrasadas, que no se hicieron).
    await expect(cumplimiento.getByText("3 de 5", { exact: true })).toBeVisible();

    await page.waitForTimeout(TRANSICION_MS);
    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("el texto avisa qué categoría se atrasa más y sugiere categorizar lo que no la tiene", async ({
    page,
  }) => {
    const columna = await abrirConDatos(page);
    const texto = columna.getByRole("region", { name: /Widgets de tareas: texto/ });

    const atrasada = await mostrarWidget(texto, "Lo que más se atrasa");
    await expect(atrasada.getByText("Casa", { exact: true }).first()).toBeVisible();
    await expect(atrasada).toContainText("2 tareas atrasadas en esta categoría");

    const sinCategoria = await mostrarWidget(texto, "Tareas sin categoría");
    await expect(sinCategoria).toContainText("3");
  });

  test("sin tareas con categoría no hay widgets por categoría", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada({ conCategoriasDeTareaIniciales: true }));
    await abrirTareas(page);
    await agregarRapido(page, "Algo sin categoría");
    const columna = page.getByRole("complementary", { name: "Widgets" });
    await expect(columna.getByText("Pendientes por categoría")).toHaveCount(0);
    await expect(columna.getByText("Lo que más se atrasa")).toHaveCount(0);
    await expect(columna.getByText("Dónde hiciste más")).toHaveCount(0);
    await expect(columna.getByText("Cumplimiento por categoría")).toHaveCount(0);
  });
});

test.describe("tareas semanales de varios días", () => {
  /** Abre el formulario con "Todas las semanas" elegido y el título puesto. */
  async function abrirSemanal(page: Page, titulo: string) {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill(titulo);
    await dialogo.getByLabel("Se repite").selectOption({ label: "Todas las semanas" });
    return dialogo;
  }

  test("viene marcado el día de hoy y se marcan varios más", async ({ page }) => {
    const dialogo = await abrirSemanal(page, "Ir al gimnasio");
    await expect(
      dialogo.getByRole("checkbox", { name: NOMBRES_DE_DIA[diaIsoDeHoy() - 1] ?? "" }),
    ).toBeChecked();
    await expect(dialogo.getByRole("checkbox", { checked: true })).toHaveCount(1);

    // Lunes, miércoles y viernes (se saca hoy si no es uno de ellos).
    for (const dia of [1, 2, 3, 4, 5, 6, 7]) await marcarDia(dialogo, dia, [1, 3, 5].includes(dia));
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await irASeccion(page, "Repetitivas");
    await expect(page.getByRole("listitem").filter({ hasText: "Ir al gimnasio" })).toContainText(
      "Todos los lunes, miércoles y viernes",
    );
  });

  test("sábado y domingo se dicen juntos, y los siete días son 'todos los días'", async ({
    page,
  }) => {
    const dialogo = await abrirSemanal(page, "Salir a caminar");
    for (const dia of [1, 2, 3, 4, 5, 6, 7]) await marcarDia(dialogo, dia, dia >= 6);
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const todos = page.getByRole("dialog", { name: "Agregar tarea" });
    await todos.getByLabel("¿Qué hay que hacer?").fill("Tomar agua");
    await todos.getByLabel("Se repite").selectOption({ label: "Todas las semanas" });
    for (const dia of [1, 2, 3, 4, 5, 6, 7]) await marcarDia(todos, dia, true);
    await todos.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(todos).toBeHidden();

    await irASeccion(page, "Repetitivas");
    await expect(page.getByRole("listitem").filter({ hasText: "Salir a caminar" })).toContainText(
      "Todos los sábados y domingos",
    );
    await expect(page.getByRole("listitem").filter({ hasText: "Tomar agua" })).toContainText(
      "Todos los días",
    );
  });

  test("sin ningún día marcado avisa que hay que elegir al menos uno", async ({ page }) => {
    const dialogo = await abrirSemanal(page, "Ir al gimnasio");
    await marcarDia(dialogo, diaIsoDeHoy(), false);
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo.getByText("Elegí al menos un día de la semana.")).toBeVisible();
    await expect(dialogo).toBeVisible();

    // Al marcar uno, se puede guardar.
    await marcarDia(dialogo, 2, true);
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();
  });

  test("si hoy es uno de los días, la tarea aparece hoy", async ({ page }) => {
    const dialogo = await abrirSemanal(page, "Ir al gimnasio");
    // Hoy (ya viene marcado) y mañana.
    await marcarDia(dialogo, diaIsoDeHoy(1), true);
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText("Ir al gimnasio");
  });

  test("al editar se abre con los días que tenía y se pueden cambiar", async ({ page }) => {
    const dialogo = await abrirSemanal(page, "Ir al gimnasio");
    for (const dia of [1, 2, 3, 4, 5, 6, 7]) await marcarDia(dialogo, dia, dia === 2 || dia === 4);
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await irASeccion(page, "Repetitivas");
    await page.getByRole("button", { name: "Editar: Ir al gimnasio" }).click();
    const edicion = page.getByRole("dialog", { name: "Editar tarea" });
    await expect(edicion.getByRole("checkbox", { checked: true })).toHaveCount(2);
    await expect(edicion.getByRole("checkbox", { name: "martes" })).toBeChecked();
    await expect(edicion.getByRole("checkbox", { name: "jueves" })).toBeChecked();

    await marcarDia(edicion, 4, false);
    await marcarDia(edicion, 6, true);
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(page.getByRole("listitem").filter({ hasText: "Ir al gimnasio" })).toContainText(
      "Todos los martes y sábados",
    );
  });

  test("el selector de días es accesible y se maneja con el teclado", async ({ page }) => {
    const dialogo = await abrirSemanal(page, "Ir al gimnasio");
    const casilla = dialogo.getByRole("checkbox", { name: "lunes" });
    await casilla.focus();
    const estaba = await casilla.isChecked();
    await page.keyboard.press("Space");
    expect(await casilla.isChecked()).toBe(!estaba);

    await expect(dialogo.getByRole("group", { name: "Días de la semana" })).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });
});

test.describe("repetitivas agrupadas y filtros", () => {
  const REPETITIVAS = [
    { titulo: "Tomar la vitamina", repeticion: "diaria" },
    { titulo: "Estirar", repeticion: "diaria", notas: "Diez minutos" },
    { titulo: "Reunión de equipo", repeticion: "semanal" },
    { titulo: "Pagar el alquiler", repeticion: "mensual" },
    { titulo: "Renovar el seguro", repeticion: "anual" },
  ] as const;

  async function abrirRepetitivas(page: Page) {
    const cuenta = await crearCuentaAprobada();
    await sembrarRepetitivasDePrueba(cuenta.email, [...REPETITIVAS], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Repetitivas");
  }

  const filtro = (page: Page, nombre: string) =>
    page
      .getByRole("radiogroup", { name: "Filtrar por periodicidad" })
      .getByRole("radio", { name: nombre });

  test("se agrupan por periodicidad, con la cantidad de cada grupo", async ({ page }) => {
    await abrirRepetitivas(page);

    for (const [grupo, cantidad] of [
      ["Diarias", 2],
      ["Semanales", 1],
      ["Mensuales", 1],
      ["Anuales", 1],
    ] as const) {
      const seccion = page.getByRole("region", { name: grupo });
      await expect(seccion).toBeVisible();
      await expect(seccion.getByRole("listitem")).toHaveCount(cantidad);
    }
    await expect(
      page.getByRole("region", { name: "Diarias" }).getByText("Tomar la vitamina"),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Anuales" }).getByText("Renovar el seguro"),
    ).toBeVisible();
    // Primero lo que se repite más seguido.
    const titulos = await page.getByRole("heading", { level: 3 }).allTextContents();
    expect(titulos.map((titulo) => titulo.split(" (")[0])).toEqual([
      "Diarias",
      "Semanales",
      "Mensuales",
      "Anuales",
    ]);
  });

  test("el filtro deja un solo grupo y 'Todas' los vuelve a mostrar", async ({ page }) => {
    await abrirRepetitivas(page);
    await expect(filtro(page, "Todas")).toBeChecked();

    await filtro(page, "Mensuales").click();
    await expect(filtro(page, "Mensuales")).toBeChecked();
    await expect(page.getByRole("region", { name: "Mensuales" })).toContainText(
      "Pagar el alquiler",
    );
    await expect(page.getByRole("region", { name: "Diarias" })).toHaveCount(0);
    await expect(page.getByRole("tabpanel").getByText("Tomar la vitamina")).toHaveCount(0);

    await filtro(page, "Todas").click();
    await expect(page.getByRole("tabpanel").getByRole("region")).toHaveCount(4);
  });

  test("la búsqueda ignora tildes y mayúsculas, mira las notas y se combina con el filtro", async ({
    page,
  }) => {
    await abrirRepetitivas(page);
    const buscar = page.getByRole("textbox", { name: "Buscar" });

    await buscar.fill("REUNION");
    await expect(page.getByRole("tabpanel").getByText("Reunión de equipo")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("Estirar")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Semanales" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Diarias" })).toHaveCount(0);

    await buscar.fill("diez minutos");
    await expect(page.getByRole("tabpanel").getByText("Estirar")).toBeVisible();

    // Con un filtro que no incluye lo buscado, no queda nada.
    await filtro(page, "Anuales").click();
    await expect(
      page.getByRole("tabpanel").getByText("Ninguna tarea repetitiva coincide con lo que buscás."),
    ).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("No tenés tareas repetitivas")).toHaveCount(
      0,
    );

    await buscar.fill("");
    await expect(page.getByRole("tabpanel").getByText("Renovar el seguro")).toBeVisible();
  });

  test("se puede editar y eliminar desde un grupo filtrado, y es accesible", async ({ page }) => {
    await abrirRepetitivas(page);
    await filtro(page, "Diarias").click();
    await page.waitForTimeout(TRANSICION_MS);
    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);

    await page.getByRole("button", { name: "Eliminar: Estirar" }).click();
    await page
      .getByRole("dialog", { name: "Eliminar tarea repetitiva" })
      .getByRole("button", { name: "Eliminar" })
      .click();
    await expect(page.getByRole("tabpanel").getByText("Estirar")).toHaveCount(0);
    // El filtro se mantiene y el grupo sigue con la otra.
    await expect(filtro(page, "Diarias")).toBeChecked();
    await expect(page.getByRole("region", { name: "Diarias" })).toContainText("Tomar la vitamina");
  });
});

test.describe("categorías de tareas", () => {
  async function abrirConCategorias(page: Page, nombres: string[]) {
    const cuenta = await crearCuentaAprobada();
    await sembrarCategoriasDeTareaDePrueba(cuenta.email, nombres);
    await entrar(page, cuenta);
    await abrirTareas(page);
    return cuenta;
  }

  async function agregarConCategoria(page: Page, titulo: string, categoria: string) {
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill(titulo);
    await dialogo.getByLabel("Categoría (opcional)").selectOption({ label: categoria });
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();
  }

  test("una cuenta nueva ya trae categorías por defecto, que se pueden usar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada({ conCategoriasDeTareaIniciales: true }));
    await abrirTareas(page);
    await irASeccion(page, "Categorías");

    for (const nombre of [
      "Personal",
      "Casa",
      "Trabajo",
      "Estudio",
      "Salud",
      "Compras",
      "Trámites",
    ]) {
      await expect(page.getByRole("listitem").filter({ hasText: nombre })).toContainText(
        "Sin tareas",
      );
    }
  });

  test("crear, renombrar y rechazar un nombre repetido o vacío", async ({ page }) => {
    await abrirConCategorias(page, ["Casa"]);
    await irASeccion(page, "Categorías");

    await page.getByRole("button", { name: "Nueva" }).click();
    const nueva = page.getByRole("dialog", { name: "Nueva categoría" });
    await nueva.getByRole("button", { name: "Crear categoría" }).click();
    await expect(nueva.getByText("Escribí un nombre para la categoría.")).toBeVisible();

    await nueva.getByLabel("Nombre").fill("casa");
    await nueva.getByRole("button", { name: "Crear categoría" }).click();
    await expect(nueva.getByText("Ya tenés una categoría con ese nombre.")).toBeVisible();

    await nueva.getByLabel("Nombre").fill("Hobbies");
    await nueva.getByRole("button", { name: "Crear categoría" }).click();
    await expect(nueva).toBeHidden();
    await expect(page.getByRole("listitem").filter({ hasText: "Hobbies" })).toBeVisible();

    await page.getByRole("button", { name: "Editar Hobbies" }).click();
    const edicion = page.getByRole("dialog", { name: "Editar categoría" });
    await edicion.getByLabel("Nombre").fill("Pasatiempos");
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(page.getByRole("listitem").filter({ hasText: "Pasatiempos" })).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("Hobbies")).toHaveCount(0);
  });

  test("se elige al agregar una tarea y se ve en la lista; sin elegir, queda sin categoría", async ({
    page,
  }) => {
    await abrirConCategorias(page, ["Casa", "Trabajo"]);
    await agregarConCategoria(page, "Arreglar la canilla", "Casa");
    await campoRapido(page).fill("Tarea sin categoría");
    await campoRapido(page).press("Enter");

    const paraHoy = page.getByRole("region", { name: "Para hoy" });
    await expect(paraHoy).toContainText("Arreglar la canilla");
    await expect(paraHoy).toContainText("Tarea sin categoría");
    await expect(paraHoy.getByText("Casa", { exact: true })).toHaveCount(1);
    await expect(paraHoy.getByText("Trabajo", { exact: true })).toHaveCount(0);
  });

  test("se cambia y se quita al editar la tarea", async ({ page }) => {
    await abrirConCategorias(page, ["Casa", "Trabajo"]);
    await agregarConCategoria(page, "Pasar el informe", "Trabajo");
    const paraHoy = page.getByRole("region", { name: "Para hoy" });
    await expect(paraHoy.getByText("Trabajo", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Editar: Pasar el informe" }).click();
    const edicion = page.getByRole("dialog", { name: "Editar tarea" });
    // Al abrir, ya está elegida la que tenía.
    await expect(edicion.getByLabel("Categoría (opcional)")).not.toHaveValue("");
    await edicion.getByLabel("Categoría (opcional)").selectOption({ label: "Casa" });
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(paraHoy.getByText("Casa", { exact: true })).toBeVisible();
    await expect(paraHoy.getByText("Trabajo", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Editar: Pasar el informe" }).click();
    const otraVez = page.getByRole("dialog", { name: "Editar tarea" });
    await otraVez.getByLabel("Categoría (opcional)").selectOption({ label: "Sin categoría" });
    await otraVez.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(otraVez).toBeHidden();
    await expect(paraHoy.getByText("Casa", { exact: true })).toHaveCount(0);
  });

  test("una repetitiva tiene categoría, la muestra y se la pasa a la tarea de hoy", async ({
    page,
  }) => {
    await abrirConCategorias(page, ["Salud"]);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Tomar la vitamina");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Todos los días" });
    await dialogo.getByLabel("Categoría (opcional)").selectOption({ label: "Salud" });
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await expect(
      page.getByRole("region", { name: "Para hoy" }).getByText("Salud", { exact: true }),
    ).toBeVisible();
    await irASeccion(page, "Repetitivas");
    await expect(page.getByRole("listitem").filter({ hasText: "Tomar la vitamina" })).toContainText(
      "Salud",
    );
  });

  test("sin categorías, el formulario no muestra el campo", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await expect(dialogo.getByLabel("¿Qué hay que hacer?")).toBeVisible();
    await expect(dialogo.getByLabel("Categoría (opcional)")).toHaveCount(0);
  });

  test("una con tareas pendientes no se elimina; al hacerlas, sí", async ({ page }) => {
    await abrirConCategorias(page, ["Casa"]);
    await agregarConCategoria(page, "Barrer", "Casa");
    await irASeccion(page, "Categorías");
    await expect(page.getByRole("listitem").filter({ hasText: "Casa" })).toContainText(
      "1 tarea pendiente",
    );

    await page.getByRole("button", { name: "Eliminar Casa" }).click();
    const bloqueado = page.getByRole("dialog", { name: "Eliminar categoría" });
    await expect(bloqueado).toContainText("No se puede eliminar");
    await expect(bloqueado).toContainText("1 tarea pendiente");
    await expect(bloqueado.getByRole("button", { name: "Eliminar", exact: true })).toHaveCount(0);
    await bloqueado.getByRole("button", { name: "Entendido" }).click();
    await expect(bloqueado).toBeHidden();

    await irASeccion(page, "Hoy");
    await alternar(page, "Barrer");
    await expect(page.getByRole("region", { name: "Para hoy" })).toHaveCount(0);

    await irASeccion(page, "Categorías");
    await page.getByRole("button", { name: "Eliminar Casa" }).click();
    const confirmar = page.getByRole("dialog", { name: "Eliminar categoría" });
    await expect(confirmar).toContainText("Ninguna tarea pendiente la usa");
    await confirmar.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Casa" })).toHaveCount(0);
    await expect(
      page.getByRole("tabpanel").getByText("Todavía no tenés categorías."),
    ).toBeVisible();
  });

  test("una usada por una repetitiva tampoco se elimina", async ({ page }) => {
    await abrirConCategorias(page, ["Salud"]);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Estirar");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Todos los días" });
    await dialogo.getByLabel("Categoría (opcional)").selectOption({ label: "Salud" });
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await irASeccion(page, "Categorías");
    await expect(page.getByRole("listitem").filter({ hasText: "Salud" })).toContainText(
      "1 repetitiva",
    );
    await page.getByRole("button", { name: "Eliminar Salud" }).click();
    await expect(page.getByRole("dialog", { name: "Eliminar categoría" })).toContainText(
      "1 repetitiva",
    );
  });

  test("la pestaña Categorías es accesible", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada({ conCategoriasDeTareaIniciales: true }));
    await abrirTareas(page);
    await irASeccion(page, "Categorías");
    await expect(page.getByRole("listitem").filter({ hasText: "Casa" })).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });
});

test.describe("atrasadas e historial", () => {
  test("una tarea de un día anterior sin hacer figura como atrasada hasta que se haga", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Renovar la cédula", dia: hoy(-3) }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);

    // Arranca cerrada, con la cantidad a la vista.
    const atrasadas = page.getByRole("region", { name: "Atrasadas" });
    await expect(atrasadas.getByRole("button", { name: /^Atrasadas/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(atrasadas).toContainText("Atrasadas (1)");
    await expect(atrasadas.getByText("Renovar la cédula", { exact: true })).toHaveCount(0);
    await abrirAtrasadas(page);
    await expect(atrasadas).toContainText("Renovar la cédula");
    await expect(atrasadas).toContainText("Era para");

    await alternar(page, "Renovar la cédula");
    await expect(page.getByRole("region", { name: "Atrasadas" })).toHaveCount(0);
    // Una atrasada no es una tarea de hoy: sin otras, el día sigue sin tareas.
    await expect(page.getByRole("heading", { name: "No tenés tareas para hoy" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Hechas hoy" })).toContainText("Hechas hoy (1)");
  });

  test("el historial muestra los días anteriores con lo hecho y lo no hecho, y se puede tildar uno olvidado", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Hecha ayer", dia: hoy(-1), hecha: true },
        { titulo: "Rutina de ayer", dia: hoy(-1), deRepetitiva: true },
        { titulo: "Hecha anteayer", dia: hoy(-2), hecha: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");

    const ayer = page.getByRole("region", { name: "Ayer" });
    await expect(ayer).toContainText("1 de 2 hechas");
    await expect(ayer).toContainText("Hecha ayer");
    await expect(ayer).toContainText("Rutina de ayer");
    await expect(ayer).toContainText("Atrasada");
    await expect(fila(page, "Hecha ayer")).toBeChecked();
    await expect(fila(page, "Rutina de ayer")).not.toBeChecked();
    await expect(page.getByRole("tabpanel").getByText("1 de 1 hechas")).toBeVisible();

    // Una que se hizo pero no se tildó en su momento.
    await alternar(page, "Rutina de ayer");
    await expect(page.getByRole("tabpanel").getByText("2 de 2 hechas")).toBeVisible();
  });

  test("una tarea de repetitiva que quedó sin hacer también es una atrasada", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Regar las plantas", dia: hoy(-2), deRepetitiva: true }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    const atrasadas = page.getByRole("region", { name: "Atrasadas" });
    await expect(atrasadas).toContainText("Regar las plantas");
    await expect(atrasadas).toContainText("Era para");
    await expect(atrasadas).toContainText("Se repite");
  });

  test("sin historial, explica qué se va a ver", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await irASeccion(page, "Historial");
    await expect(page.getByRole("tabpanel").getByText("Todavía no hay historial")).toBeVisible();
  });
});

test.describe("tareas fallidas", () => {
  const atrasadas = (pagina: Page) => pagina.getByRole("region", { name: "Atrasadas" });
  const fallidasHoy = (pagina: Page) => pagina.getByRole("region", { name: "Fallidas hoy" });

  test("una atrasada se puede marcar como fallida: sale de atrasadas y queda en 'Fallidas hoy'", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Llamar al plomero", dia: hoy(-2) }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    await expect(atrasadas(page)).toContainText("Llamar al plomero");
    await marcarComoFallida(page, "Llamar al plomero");

    await expect(atrasadas(page)).toHaveCount(0);
    await expect(fallidasHoy(page)).toContainText("Fallidas hoy (1)");
    // Plegada por defecto, como 'Hechas hoy'.
    await expect(
      page.getByRole("tabpanel").getByText("Llamar al plomero", { exact: true }),
    ).toHaveCount(0);
    await fallidasHoy(page)
      .getByRole("button", { name: /Fallidas hoy/ })
      .click();
    await expect(fallidasHoy(page)).toContainText("Llamar al plomero");
    await expect(fallidasHoy(page)).toContainText("Fallida");
  });

  test("también una atrasada de repetitiva", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Regar las plantas", dia: hoy(-1), deRepetitiva: true }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);
    await marcarComoFallida(page, "Regar las plantas");
    await expect(atrasadas(page)).toHaveCount(0);
    await expect(fallidasHoy(page)).toContainText("Fallidas hoy (1)");
  });

  test("se deshace desde 'Fallidas hoy' y vuelve a las atrasadas", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Pagar la patente", dia: hoy(-3) }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);
    await marcarComoFallida(page, "Pagar la patente");
    await fallidasHoy(page)
      .getByRole("button", { name: /Fallidas hoy/ })
      .click();
    await page.getByRole("button", { name: "Volver a dejar pendiente: Pagar la patente" }).click();

    await expect(fallidasHoy(page)).toHaveCount(0);
    await abrirAtrasadas(page);
    await expect(atrasadas(page)).toContainText("Pagar la patente");
  });

  test("una fallida se puede completar después: se vuelve a dejar pendiente y pasa a 'Hechas hoy'", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Sacar turno", dia: hoy(-1) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);
    await marcarComoFallida(page, "Sacar turno");
    await fallidasHoy(page)
      .getByRole("button", { name: /Fallidas hoy/ })
      .click();
    // En 'Fallidas hoy' no hay casilla: la cruz activada la vuelve a dejar pendiente...
    await expect(fallidasHoy(page).getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Volver a dejar pendiente: Sacar turno" }).click();
    await expect(fallidasHoy(page)).toHaveCount(0);
    // ...y ahí sí se puede completar.
    await abrirAtrasadas(page);
    await alternar(page, "Sacar turno");

    await expect(page.getByRole("region", { name: "Hechas hoy" })).toContainText("Hechas hoy (1)");
  });

  test("el avance del día es solo de las tareas de hoy: las atrasadas no cuentan", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Atrasada", dia: hoy(-1) },
        { titulo: "Hecha hoy", dia: hoy(), hecha: true },
        { titulo: "Pendiente hoy", dia: hoy() },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    const panel = page.getByRole("tabpanel");
    // 1 de las 2 de hoy: la atrasada no entra en la cuenta.
    await expect(panel).toContainText("1 de 2 hechas");
    await expect(panel).toContainText("50%");

    // Fallarla o completarla tampoco mueve el avance.
    await abrirAtrasadas(page);
    await marcarComoFallida(page, "Atrasada");
    await expect(panel).toContainText("1 de 2 hechas");
    await expect(panel).toContainText("50%");

    await alternar(page, "Pendiente hoy");
    await expect(panel).toContainText("Hiciste las 2 tareas de hoy.");
    await expect(panel).toContainText("100%");
  });

  test("completar una atrasada no infla el avance de hoy", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Atrasada", dia: hoy(-2) },
        { titulo: "Pendiente hoy", dia: hoy() },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    const panel = page.getByRole("tabpanel");
    await expect(panel).toContainText("0 de 1 hechas");
    await expect(panel).toContainText("0%");
    await abrirAtrasadas(page);
    await alternar(page, "Atrasada");
    await expect(page.getByRole("region", { name: "Atrasadas" })).toHaveCount(0);
    await expect(panel).toContainText("0 de 1 hechas");
    await expect(panel).toContainText("0%");
  });

  test("las atrasadas y las de hoy ofrecen marcar como fallida; las de un día futuro no", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Vieja", dia: hoy(-1) },
        { titulo: "De hoy", dia: hoy() },
        { titulo: "Futura", dia: hoy(3) },
        { titulo: "Hecha de hoy", dia: hoy(), hecha: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);
    await expect(page.getByRole("button", { name: /Marcar como fallida/ })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Marcar como fallida: Vieja" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar como fallida: De hoy" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Marcar como fallida: Futura/ })).toHaveCount(0);
  });

  test("una tarea de hoy se da por fallida: queda en 'Fallidas hoy', cuenta como no hecha y se deshace", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Hecha", dia: hoy(), hecha: true },
        { titulo: "No llego", dia: hoy() },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    const avance = page.getByRole("progressbar", { name: "Avance de hoy" });
    await expect(page.getByText("1 de 2 hechas")).toBeVisible();

    await marcarComoFallida(page, "No llego");
    // Sale de 'Para hoy' y queda en 'Fallidas hoy'.
    await expect(page.getByRole("region", { name: "Para hoy" })).toHaveCount(0);
    await expect(fallidasHoy(page)).toContainText("Fallidas hoy (1)");
    // No se hizo, pero tampoco falta: sigue en el total del día.
    await expect(page.getByText("1 hechas y 1 fallida")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("50%", { exact: true })).toBeVisible();
    await expect(avance).toBeVisible();

    // Deshacerla la devuelve a 'Para hoy'.
    await fallidasHoy(page)
      .getByRole("button", { name: /Fallidas hoy/ })
      .click();
    await fallidasHoy(page)
      .getByRole("button", { name: "Volver a dejar pendiente: No llego" })
      .click();
    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText("No llego");
    await expect(page.getByText("1 de 2 hechas")).toBeVisible();
  });

  test("lo fallido recarga como fallido y se ve en el historial", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "No la hice", dia: hoy(-1), fallida: true },
        { titulo: "Sí la hice", dia: hoy(-1), hecha: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    // Las fallidas de otro día no figuran en 'Fallidas hoy' ni en atrasadas.
    await expect(atrasadas(page)).toHaveCount(0);
    await expect(fallidasHoy(page)).toHaveCount(0);

    await irASeccion(page, "Historial");
    const ayer = page.getByRole("region", { name: "Ayer" });
    await expect(ayer).toContainText("1 de 2 hechas, 1 fallida");
    await expect(ayer).toContainText("No la hice");
    await expect(ayer).toContainText("Fallida");
    await expect(fila(page, "Sí la hice")).toBeChecked();

    // Desde el historial se puede volver a dejar pendiente: reaparece como atrasada.
    await page.getByRole("button", { name: "Volver a dejar pendiente: No la hice" }).click();
    await expect(ayer).toContainText("Atrasada");
    await irASeccion(page, "Hoy");
    await abrirAtrasadas(page);
    await expect(atrasadas(page)).toContainText("No la hice");
  });

  test("desde el historial se marca como fallida una pendiente", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Pendiente vieja", dia: hoy(-2) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");
    await marcarComoFallida(page, "Pendiente vieja");
    await expect(page.getByRole("tabpanel")).toContainText("0 de 1 hechas, 1 fallida");
  });

  for (const esquema of ["light", "dark"] as const) {
    test(`atrasadas, fallidas y completadas se leen bien en modo ${esquema === "light" ? "claro" : "oscuro"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: esquema });
      const cuenta = await crearCuentaAprobada();
      await sembrarTareasDePrueba(
        cuenta.email,
        [
          { titulo: "Atrasada uno", dia: hoy(-2) },
          { titulo: "Atrasada dos", dia: hoy(-1), deRepetitiva: true },
          { titulo: "Para fallar", dia: hoy(-3) },
        ],
        hoy(),
      );
      await entrar(page, cuenta);
      await abrirTareas(page);
      await abrirAtrasadas(page);
      await marcarComoFallida(page, "Para fallar");
      await fallidasHoy(page)
        .getByRole("button", { name: /Fallidas hoy/ })
        .click();
      await expect(fallidasHoy(page)).toContainText("Para fallar");
      await page.waitForTimeout(TRANSICION_MS);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

      await irASeccion(page, "Historial");
      await expect(page.getByRole("tabpanel")).toContainText("Fallida");
      await page.waitForTimeout(TRANSICION_MS);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
});

test.describe("historial con filtros", () => {
  async function abrirHistorial(
    page: Page,
    cuenta: Awaited<ReturnType<typeof crearCuentaAprobada>>,
  ) {
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");
    await expect(page.getByRole("form", { name: "Filtros del historial" })).toBeVisible();
  }
  const filtros = (pagina: Page) => pagina.getByRole("form", { name: "Filtros del historial" });
  const panel = (pagina: Page) => pagina.getByRole("tabpanel");

  test("por defecto muestra solo los 7 días anteriores, y avisa el rango", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Reciente", dia: hoy(-3), hecha: true },
        { titulo: "En el límite", dia: hoy(-7), hecha: true },
        { titulo: "Más vieja", dia: hoy(-8), hecha: true },
      ],
      hoy(),
    );
    await abrirHistorial(page, cuenta);
    await expect(panel(page)).toContainText("Reciente");
    await expect(panel(page)).toContainText("En el límite");
    await expect(panel(page)).not.toContainText("Más vieja");
    await expect(filtros(page)).toContainText("por defecto, los últimos 7 días");
  });

  test("las fechas desde y hasta amplían o acotan el rango", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Reciente", dia: hoy(-3), hecha: true },
        { titulo: "Más vieja", dia: hoy(-12), hecha: true },
      ],
      hoy(),
    );
    await abrirHistorial(page, cuenta);
    await filtros(page).getByLabel("Desde").fill(hoy(-15));
    await expect(panel(page)).toContainText("Más vieja");
    await expect(panel(page)).toContainText("Reciente");
    await expect(filtros(page)).not.toContainText("por defecto");

    await filtros(page).getByLabel("Hasta").fill(hoy(-10));
    await expect(panel(page)).toContainText("Más vieja");
    await expect(panel(page)).not.toContainText("Reciente");
  });

  test("un rango al revés lo avisa junto al campo y no muestra nada", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Algo", dia: hoy(-2), hecha: true }],
      hoy(),
    );
    await abrirHistorial(page, cuenta);
    await filtros(page).getByLabel("Desde").fill(hoy(-1));
    await filtros(page).getByLabel("Hasta").fill(hoy(-5));
    await expect(filtros(page)).toContainText("La fecha final no puede ser anterior a la inicial.");
    await expect(panel(page)).not.toContainText("Algo");
  });

  test("por estado: pendientes, completadas y fallidas", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Quedó pendiente", dia: hoy(-2) },
        { titulo: "La hice", dia: hoy(-2), hecha: true },
        { titulo: "No la hice", dia: hoy(-2), fallida: true },
      ],
      hoy(),
    );
    await abrirHistorial(page, cuenta);
    const estado = (nombre: string) => filtros(page).getByRole("radio", { name: nombre });

    await estado("Fallidas").click();
    await expect(panel(page)).toContainText("No la hice");
    await expect(panel(page)).not.toContainText("La hice");
    await expect(panel(page)).not.toContainText("Quedó pendiente");

    await estado("Completadas").click();
    await expect(panel(page).getByText("La hice", { exact: true })).toBeVisible();
    await expect(panel(page)).not.toContainText("No la hice");

    await estado("Pendientes").click();
    await expect(panel(page)).toContainText("Quedó pendiente");
    await expect(panel(page)).not.toContainText("La hice");
  });

  test("por categoría, incluida 'sin categoría'", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarCategoriasDeTareaDePrueba(cuenta.email, ["Casa", "Trabajo"]);
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Tarea de casa", dia: hoy(-2), hecha: true, categoria: "Casa" },
        { titulo: "Tarea de trabajo", dia: hoy(-2), hecha: true, categoria: "Trabajo" },
        { titulo: "Tarea suelta", dia: hoy(-2), hecha: true },
      ],
      hoy(),
    );
    await abrirHistorial(page, cuenta);
    const categoria = filtros(page).getByLabel("Categoría");

    await categoria.selectOption({ label: "Casa" });
    await expect(panel(page)).toContainText("Tarea de casa");
    await expect(panel(page)).not.toContainText("Tarea de trabajo");
    await expect(panel(page)).not.toContainText("Tarea suelta");

    await categoria.selectOption({ label: "Sin categoría" });
    await expect(panel(page)).toContainText("Tarea suelta");
    await expect(panel(page)).not.toContainText("Tarea de casa");
  });

  test("por periodicidad: de una sola vez o de una repetitiva", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Suelta vieja", dia: hoy(-2), hecha: true },
        { titulo: "De rutina", dia: hoy(-2), hecha: true, deRepetitiva: true },
      ],
      hoy(),
    );
    await abrirHistorial(page, cuenta);
    const periodicidad = filtros(page).getByLabel("Periodicidad");
    await expect(periodicidad.locator("option")).toHaveText([
      "Todas",
      "Una sola vez",
      "Diarias",
      "Cada varios días",
      "Semanales",
      "Mensuales",
      "Anuales",
    ]);

    await periodicidad.selectOption({ label: "Una sola vez" });
    await expect(panel(page)).toContainText("Suelta vieja");
    await expect(panel(page)).not.toContainText("De rutina");

    await periodicidad.selectOption({ label: "Diarias" });
    await expect(panel(page)).toContainText("De rutina");
    await expect(panel(page)).not.toContainText("Suelta vieja");
  });

  test("los filtros se combinan, 'Limpiar filtros' los saca y sin resultados lo explica", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "La hice", dia: hoy(-2), hecha: true }],
      hoy(),
    );
    await abrirHistorial(page, cuenta);
    await expect(filtros(page).getByRole("button", { name: "Limpiar filtros" })).toHaveCount(0);

    await filtros(page).getByRole("radio", { name: "Fallidas" }).click();
    await expect(panel(page)).toContainText("No hay tareas con esos filtros");
    await filtros(page).getByRole("button", { name: "Limpiar filtros" }).click();
    await expect(panel(page)).toContainText("La hice");
    await expect(filtros(page).getByRole("radio", { name: "Todos" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("una fallida muestra la cruz roja en lugar de la casilla, y se puede deshacer", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "No la hice", dia: hoy(-2), fallida: true },
        { titulo: "Pendiente", dia: hoy(-2) },
      ],
      hoy(),
    );
    await abrirHistorial(page, cuenta);
    // La fallida no tiene casilla; la pendiente sí, con su cruz al lado.
    await expect(fila(page, "No la hice")).toHaveCount(0);
    await expect(fila(page, "Pendiente")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Marcar como fallida: Pendiente" }),
    ).toBeVisible();
    const fallida = page.getByRole("listitem").filter({ hasText: "No la hice" });
    await expect(fallida.locator("svg.text-peligro")).toHaveCount(1);

    await page.getByRole("button", { name: "Volver a dejar pendiente: No la hice" }).click();
    await expect(fila(page, "No la hice")).toBeVisible();
  });
});

test.describe("historial: barra del día, atajos y atrasadas viejas", () => {
  test("cada día tiene una barra de progreso con completadas, pendientes y fallidas", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Hecha uno", dia: hoy(-2), hecha: true },
        { titulo: "Hecha dos", dia: hoy(-2), hecha: true },
        { titulo: "Pendiente", dia: hoy(-2) },
        { titulo: "Fallida", dia: hoy(-2), fallida: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");

    const barra = page.getByRole("img", {
      name: "Progreso del día: 2 completadas, 1 pendientes, 1 fallidas",
    });
    await expect(barra).toBeVisible();
    const tramos = barra.locator("[data-tramo]");
    await expect(tramos).toHaveCount(3);
    // Un tramo por estado, en el orden completadas, pendientes, fallidas y con ancho proporcional.
    await expect(tramos.nth(0)).toHaveAttribute("data-tramo", "completadas");
    await expect(tramos.nth(1)).toHaveAttribute("data-tramo", "pendientes");
    await expect(tramos.nth(2)).toHaveAttribute("data-tramo", "fallidas");
    const [a, b] = await Promise.all([tramos.nth(0).boundingBox(), tramos.nth(1).boundingBox()]);
    expect(a && b).toBeTruthy();
    if (a && b) expect(a.width / b.width).toBeGreaterThan(1.7);
  });

  test("al filtrar por estado no se muestra la barra de progreso", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Hecha", dia: hoy(-2), hecha: true },
        { titulo: "Fallida", dia: hoy(-2), fallida: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");
    await expect(page.getByRole("img", { name: /Progreso del día/ })).toHaveCount(1);

    await page.getByRole("radio", { name: "Fallidas" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Fallida");
    await expect(page.getByRole("img", { name: /Progreso del día/ })).toHaveCount(0);

    await page.getByRole("radio", { name: "Todos" }).click();
    await expect(page.getByRole("img", { name: /Progreso del día/ })).toHaveCount(1);
  });

  test("al poner un filtro, el título 'Filtros' no cambia de tamaño y 'Limpiar filtros' aparece a su lado", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Hecha", dia: hoy(-2), hecha: true }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");
    const formulario = page.getByRole("form", { name: "Filtros del historial" });
    const titulo = formulario.getByRole("heading", { name: /^Filtros/ });
    const limpiar = formulario.getByRole("button", { name: "Limpiar filtros" });

    await expect(limpiar).toHaveCount(0);
    const antes = await titulo.boundingBox();
    const alturaDeLaTarjeta = (await formulario.boundingBox())?.height ?? 0;

    await page.getByRole("radio", { name: "Completadas" }).click();
    await expect(limpiar).toBeVisible();
    const despues = await titulo.boundingBox();
    expect(antes && despues).toBeTruthy();
    if (!antes || !despues) return;
    // El título queda donde estaba, con el mismo alto, y la tarjeta no crece.
    expect(Math.abs(despues.y - antes.y)).toBeLessThan(1);
    expect(Math.abs(despues.height - antes.height)).toBeLessThan(1);
    expect(
      Math.abs(((await formulario.boundingBox())?.height ?? 0) - alturaDeLaTarjeta),
    ).toBeLessThan(2);
    // "Limpiar filtros" está al costado (a la derecha) del título, en la misma línea.
    const boton = await limpiar.boundingBox();
    expect(boton).toBeTruthy();
    if (boton) {
      expect(boton.x).toBeGreaterThan(despues.x + despues.width);
      expect(Math.abs(boton.y + boton.height / 2 - (despues.y + despues.height / 2))).toBeLessThan(
        4,
      );
    }
  });

  test("un día sin fallidas ni pendientes tiene la barra llena de completadas", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Hecha", dia: hoy(-1), hecha: true }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");
    const barra = page.getByRole("img", {
      name: "Progreso del día: 1 completadas, 0 pendientes, 0 fallidas",
    });
    await expect(barra.locator("[data-tramo]")).toHaveCount(1);
  });

  test("los atajos de período ajustan las fechas y se marcan como activos", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Reciente", dia: hoy(-3), hecha: true },
        { titulo: "De hace tres semanas", dia: hoy(-21), hecha: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");
    const atajo = (nombre: string) =>
      page.getByRole("group", { name: "Atajos de período" }).getByRole("button", { name: nombre });

    await expect(atajo("7 días")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("tabpanel")).not.toContainText("De hace tres semanas");

    await atajo("30 días").click();
    await expect(atajo("30 días")).toHaveAttribute("aria-pressed", "true");
    await expect(atajo("7 días")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByLabel("Desde")).toHaveValue(hoy(-30));
    await expect(page.getByRole("tabpanel")).toContainText("De hace tres semanas");

    await atajo("7 días").click();
    await expect(page.getByLabel("Desde")).toHaveValue("");
    await expect(page.getByRole("tabpanel")).not.toContainText("De hace tres semanas");
  });

  test("una atrasada de más de una semana se marca como fallida sola", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Muy vieja", dia: hoy(-10) },
        { titulo: "Reciente", dia: hoy(-3) },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    // Solo la reciente sigue atrasada.
    const atrasadas = page.getByRole("region", { name: "Atrasadas" });
    await expect(atrasadas).toContainText("Atrasadas (1)");
    await abrirAtrasadas(page);
    await expect(atrasadas).toContainText("Reciente");
    await expect(atrasadas).not.toContainText("Muy vieja");

    // La vieja quedó como fallida en el historial.
    await irASeccion(page, "Historial");
    await page.getByRole("radio", { name: "Fallidas" }).click();
    await page.getByRole("button", { name: "30 días" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Muy vieja");
    await expect(page.getByRole("tabpanel")).toContainText("Fallida");
  });

  test("el aviso de Atrasadas cuenta que pasada una semana se marcan solas", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-2) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await expect(page.getByRole("region", { name: "Atrasadas" })).toContainText(
      "pasada una semana se marcan solas",
    );
  });

  test("la cruz de fallida tiene su círculo siempre y se pinta de rojo al apuntarla", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-2) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);
    const cruz = page.getByRole("button", { name: "Marcar como fallida: Vieja" });
    await expect(cruz).toHaveCSS("border-top-width", "1px");
    await expect(cruz).toHaveCSS("border-top-left-radius", /^(9999|3.35544e\+07)/);
    const colorDelBorde = async () =>
      cruz.evaluate((nodo) => getComputedStyle(nodo).borderTopColor);
    const antes = await colorDelBorde();
    // En Hoy la cruz aparece al apuntar a la fila: primero se apunta a la fila y después a la cruz.
    await page.locator("label").filter({ hasText: "Vieja" }).hover();
    await cruz.hover();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await colorDelBorde()).not.toBe(antes);
  });

  test("'Hechas hoy' separa las que estaban atrasadas de las que eran de hoy", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Era de hoy", dia: hoy(), hecha: true },
        { titulo: "Era de hoy también", dia: hoy(), hecha: true },
        { titulo: "Estaba atrasada", dia: hoy(-2), hecha: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    const seccion = page.getByRole("region", { name: "Hechas hoy" });
    await expect(seccion).toContainText("Hechas hoy (3)");
    await seccion.getByRole("button", { name: /Hechas hoy/ }).click();
    const subtitulo = (nombre: RegExp) => seccion.getByRole("heading", { level: 4, name: nombre });
    await expect(subtitulo(/^Eran de hoy 2$/)).toBeVisible();
    await expect(subtitulo(/^Estaban atrasadas 1$/)).toBeVisible();
    await expect(seccion.getByRole("heading", { level: 4, name: /Adelantadas/ })).toHaveCount(0);

    // Cada grupo es un bloque propio, con su tarjeta, y cada tarea está en el suyo.
    const bloque = (nombre: RegExp) =>
      seccion
        .locator("div.flex.flex-col.gap-2", {
          has: page.getByRole("heading", { level: 4, name: nombre }),
        })
        .last();
    await expect(bloque(/^Eran de hoy/)).toContainText("Era de hoy");
    await expect(bloque(/^Eran de hoy/)).not.toContainText("Estaba atrasada");
    await expect(bloque(/^Estaban atrasadas/)).toContainText("Estaba atrasada");
    await expect(bloque(/^Estaban atrasadas/)).not.toContainText("Era de hoy");
    // La que estaba atrasada dice de qué día era (el de hace dos días, concreto); las de hoy no.
    await expect(bloque(/^Estaban atrasadas/)).toContainText("Era para el ");
    await expect(bloque(/^Estaban atrasadas/)).toContainText(
      new Intl.DateTimeFormat("es", { timeZone: ZONA, day: "numeric", month: "long" }).format(
        new Date(Date.now() - 2 * 86_400_000),
      ),
    );
    await expect(bloque(/^Eran de hoy/)).not.toContainText("Era para el ");

    // El tachado cubre solo el título, no todo el ancho de la fila.
    const tachado = bloque(/^Estaban atrasadas/)
      .locator(".casilla-tachado")
      .first();
    const [anchoDelTitulo, anchoDeLaFila] = await Promise.all([
      tachado.boundingBox(),
      bloque(/^Estaban atrasadas/).boundingBox(),
    ]);
    expect(anchoDelTitulo && anchoDeLaFila).toBeTruthy();
    if (anchoDelTitulo && anchoDeLaFila) {
      expect(anchoDelTitulo.width).toBeLessThan(anchoDeLaFila.width * 0.6);
    }
    // Los dos bloques se ven separados, uno debajo del otro, sin solaparse.
    const [arriba, abajo] = await Promise.all([
      bloque(/^Eran de hoy/).boundingBox(),
      bloque(/^Estaban atrasadas/).boundingBox(),
    ]);
    expect(arriba && abajo).toBeTruthy();
    if (arriba && abajo) expect(abajo.y).toBeGreaterThan(arriba.y + arriba.height);
  });
});

test.describe("filas de tareas", () => {
  test("la casilla queda centrada verticalmente en la fila, aunque tenga detalles debajo", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Con detalles");
    await dialogo.getByLabel("Hora (opcional)").fill("09:30");
    await dialogo.getByLabel("Notas (opcional)").fill("Una nota larga para que haya segunda línea");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    const etiqueta = page.locator("label").filter({ hasText: "Con detalles" });
    const caja = etiqueta.locator(".casilla-caja");
    const cajaMedida = await caja.boundingBox();
    const etiquetaMedida = await etiqueta.boundingBox();
    expect(cajaMedida && etiquetaMedida).toBeTruthy();
    if (!cajaMedida || !etiquetaMedida) return;
    const centroDeLaCaja = cajaMedida.y + cajaMedida.height / 2;
    const centroDeLaFila = etiquetaMedida.y + etiquetaMedida.height / 2;
    // Hay un título y una segunda línea, y la caja no está alineada con el título sino con el conjunto.
    expect(etiquetaMedida.height).toBeGreaterThan(cajaMedida.height + 10);
    expect(Math.abs(centroDeLaCaja - centroDeLaFila)).toBeLessThan(2);
  });

  test("en una atrasada, la cruz de fallida está a la derecha de la casilla y a su misma altura", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-2) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    const etiqueta = page.locator("label").filter({ hasText: "Vieja" });
    const caja = await etiqueta.locator(".casilla-caja").boundingBox();
    const cruz = await page
      .getByRole("button", { name: "Marcar como fallida: Vieja" })
      .boundingBox();
    expect(caja && cruz).toBeTruthy();
    if (!caja || !cruz) return;
    expect(cruz.x).toBeGreaterThanOrEqual(caja.x + caja.width);
    expect(cruz.x - (caja.x + caja.width)).toBeLessThan(24);
    expect(Math.abs(cruz.y + cruz.height / 2 - (caja.y + caja.height / 2))).toBeLessThan(2);
  });

  test("las secciones plegables se abren y se cierran sin que se solapen los elementos", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Hecha uno", dia: hoy(), hecha: true },
        { titulo: "Hecha dos", dia: hoy(), hecha: true },
        { titulo: "Para hoy", dia: hoy() },
        { titulo: "Para después", dia: hoy(3) },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);

    const seccion = page.getByRole("region", { name: "Hechas hoy" });
    // La sección que viene justo debajo: nada del contenido que se abre debe pisarla.
    const siguiente = page.getByRole("region", { name: "Más adelante" });
    await expect(seccion).toContainText("Hechas hoy (2)");
    await expect(page.getByText("Hecha uno", { exact: true })).toHaveCount(0);

    await seccion.getByRole("button", { name: /Hechas hoy/ }).click();
    await expect(seccion.getByRole("button", { name: /Hechas hoy/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Mientras se abre, el contenido nunca pisa a lo que viene debajo.
    for (let i = 0; i < 6; i++) {
      const abajo = await siguiente.boundingBox();
      const contenido = await seccion.boundingBox();
      if (abajo && contenido)
        expect(contenido.y + contenido.height).toBeLessThanOrEqual(abajo.y + 1);
      await page.waitForTimeout(40);
    }
    await expect(page.getByText("Hecha uno", { exact: true })).toBeVisible();

    await seccion.getByRole("button", { name: /Hechas hoy/ }).click();
    await expect(page.getByText("Hecha uno", { exact: true })).toHaveCount(0);
  });
});

test.describe("privacidad", () => {
  test("cada cuenta ve solo sus tareas", async ({ browser }) => {
    const ana = await crearCuentaAprobada();
    const beto = await crearCuentaAprobada();

    const paginaDeAna = await (await browser.newContext({ timezoneId: ZONA })).newPage();
    await entrar(paginaDeAna, ana);
    await abrirTareas(paginaDeAna);
    await agregarRapido(paginaDeAna, "Secreto de Ana");

    const paginaDeBeto = await (await browser.newContext({ timezoneId: ZONA })).newPage();
    await entrar(paginaDeBeto, beto);
    await abrirTareas(paginaDeBeto);
    await expect(
      paginaDeBeto.getByRole("heading", { name: "No tenés tareas para hoy" }),
    ).toBeVisible();
    await expect(paginaDeBeto.getByText("Secreto de Ana")).toHaveCount(0);
  });
});

test.describe("accesibilidad", () => {
  test("las tres pestañas, con datos, no tienen violaciones de axe", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Atrasada de prueba", dia: hoy(-2) },
        { titulo: "Hecha ayer", dia: hoy(-1), hecha: true },
        { titulo: "Rutina de ayer", dia: hoy(-1), deRepetitiva: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await agregarRapido(page, "Una de hoy");
    await agregarRapido(page, "Otra de hoy");
    await alternar(page, "Otra de hoy");
    await page.getByRole("button", { name: /Hechas hoy/ }).click();

    const revisar = async () => (await new AxeBuilder({ page }).analyze()).violations;

    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar()).toEqual([]);

    await irASeccion(page, "Repetitivas");
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    await page.getByRole("dialog", { name: "Agregar tarea" }).getByLabel("Se repite").selectOption({
      label: "Todos los días",
    });
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar()).toEqual([]);
    await page.keyboard.press("Escape");

    await irASeccion(page, "Historial");
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar()).toEqual([]);
  });
});

test.describe("widgets de lo nuevo en tareas", () => {
  async function mostrarWidget(carrusel: Locator, titulo: string): Promise<Locator> {
    const widget = carrusel.getByRole("group").filter({ hasText: titulo });
    for (let intento = 0; intento < 14; intento++) {
      if (await widget.isVisible()) return widget;
      await carrusel.getByRole("button", { name: "Widget siguiente" }).click();
    }
    await expect(widget).toBeVisible();
    return widget;
  }

  async function abrirConDatos(page: Page) {
    await page.setViewportSize({ width: 1440, height: 900 });
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Fallida A", dia: hoy(-2), fallida: true },
        { titulo: "Fallida B", dia: hoy(-4), fallida: true },
        // Casi una semana atrasada: avisa que se va a dar por fallida sola.
        { titulo: "Por fallar", dia: hoy(-6) },
        // Hechas hoy: una de hoy, una que estaba atrasada y una adelantada.
        { titulo: "Hecha de hoy", dia: hoy(), hecha: true },
        { titulo: "Hecha atrasada", dia: hoy(-3), hecha: true },
        { titulo: "Hecha adelantada", dia: hoy(3), hecha: true },
      ],
      hoy(),
    );
    await sembrarRepetitivasDePrueba(
      cuenta.email,
      [
        { titulo: "Lavar la ropa", repeticion: "intervalo" },
        { titulo: "Tomar el antibiótico", repeticion: "diaria", fallaSola: true },
        { titulo: "Pagar la luz", repeticion: "mensual" },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    return page.getByRole("complementary", { name: "Widgets" });
  }

  test("el texto avisa las que están por darse por fallidas, cuenta las fallidas y muestra las de cada varios días", async ({
    page,
  }) => {
    const columna = await abrirConDatos(page);
    const texto = columna.getByRole("region", { name: /Widgets de tareas: texto/ });

    const porFallar = await mostrarWidget(texto, "Una tarea por darse por fallida");
    await expect(porFallar).toContainText("Por fallar se da por fallida en 2 días");

    const fallidas = await mostrarWidget(texto, "Tareas fallidas");
    await expect(fallidas.getByText("2", { exact: true })).toBeVisible();
    await expect(fallidas.getByText("Fallida A")).toBeVisible();
    await expect(fallidas.getByText("Fallida B")).toBeVisible();

    const variosDias = await mostrarWidget(texto, "Cada varios días");
    await expect(variosDias).toContainText("Lavar la ropa, cada 3 días");
    await expect(variosDias.getByText("hoy", { exact: true }).first()).toBeVisible();
  });

  test("los gráficos separan lo hecho hoy por origen y cuentan las repetitivas por periodicidad", async ({
    page,
  }) => {
    const columna = await abrirConDatos(page);
    const graficos = columna.getByRole("region", { name: /Widgets de tareas: gráficos/ });

    const hechoHoy = await mostrarWidget(graficos, "Lo que hiciste hoy");
    await expect(hechoHoy).toContainText("3 tareas hechas hoy");
    for (const origen of ["Eran de hoy", "Estaban atrasadas", "Adelantadas"]) {
      await expect(hechoHoy.getByText(origen, { exact: true })).toBeVisible();
    }

    const repetitivas = await mostrarWidget(graficos, "Tus repetitivas");
    await expect(repetitivas).toContainText("3 tareas repetitivas");
    await expect(repetitivas).toContainText("1 se da por fallida sola si pasa el día");
    await expect(repetitivas.getByText("Cada varios días", { exact: true })).toBeVisible();
    await expect(repetitivas.getByText("Todos los días", { exact: true })).toBeVisible();

    await page.waitForTimeout(TRANSICION_MS);
    const resultados = await new AxeBuilder({ page }).analyze();
    expect(resultados.violations).toEqual([]);
  });

  test("sin nada de esto no aparecen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarRapido(page, "Algo cualquiera");
    const columna = page.getByRole("complementary", { name: "Widgets" });
    for (const titulo of [
      "Tareas fallidas",
      "Lo que hiciste hoy",
      "Tus repetitivas",
      "Cada varios días",
      "por darse por fallida",
    ]) {
      await expect(columna.getByText(titulo)).toHaveCount(0);
    }
  });
});

test.describe("tareas importantes", () => {
  /** El texto de una región, para comprobar en qué orden aparecen las tareas. */
  async function orden(region: Locator): Promise<string[]> {
    const texto = await region.innerText();
    // El distintivo dice "Importante" a secas: no es el título de ninguna tarea.
    return [...texto.matchAll(/(Común|Importante)[ \w]*/g)]
      .map((coincidencia) => coincidencia[0].trim())
      .filter((titulo) => titulo !== "Importante");
  }

  test("se marca al crear: lleva el distintivo y la franja, sin cambiar el orden", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Común A", dia: hoy() }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);

    await page.getByRole("button", { name: "Agregar tarea" }).first().click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Importante B");
    const casilla = dialogo.getByRole("checkbox", { name: "Marcar como importante" });
    await expect(casilla).not.toBeChecked();
    await dialogo.getByText("Marcar como importante").click();
    await expect(casilla).toBeChecked();
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    const paraHoy = page.getByRole("region", { name: "Para hoy" });
    await expect(paraHoy).toContainText("Importante B");
    // Solo la importante lleva el distintivo; el orden sigue siendo el de siempre (la agregada después, al final).
    await expect(paraHoy.locator("[data-distintivo='importante']")).toHaveCount(1);
    await expect(paraHoy.locator("[data-importante]")).toHaveCount(1);
    expect(await orden(paraHoy)).toEqual(["Común A", "Importante B"]);
  });

  test("lo importante no cambia el orden: atrasadas, para hoy y más adelante siguen por día y hora", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Común vieja", dia: hoy(-3) },
        { titulo: "Importante reciente", dia: hoy(-1), importante: true },
        { titulo: "Común hoy", dia: hoy() },
        { titulo: "Importante hoy", dia: hoy(), importante: true },
        { titulo: "Común cerca", dia: hoy(2) },
        { titulo: "Importante lejos", dia: hoy(9), importante: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    expect(await orden(page.getByRole("region", { name: "Atrasadas" }))).toEqual([
      "Común vieja",
      "Importante reciente",
    ]);
    expect(await orden(page.getByRole("region", { name: "Para hoy" }))).toEqual([
      "Común hoy",
      "Importante hoy",
    ]);
    expect(await orden(page.getByRole("region", { name: "Más adelante" }))).toEqual([
      "Común cerca",
      "Importante lejos",
    ]);
  });

  test("al editar se quita y se vuelve a poner; el formulario la trae marcada", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Importante X", dia: hoy(), importante: true }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    const paraHoy = page.getByRole("region", { name: "Para hoy" });
    await expect(paraHoy.locator("[data-distintivo='importante']")).toHaveCount(1);

    await page.getByRole("button", { name: "Editar: Importante X" }).click();
    const edicion = page.getByRole("dialog");
    const casilla = edicion.getByRole("checkbox", { name: "Marcar como importante" });
    await expect(casilla).toBeChecked();
    await edicion.getByText("Marcar como importante").click();
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(paraHoy.locator("[data-distintivo='importante']")).toHaveCount(0);

    await page.getByRole("button", { name: "Editar: Importante X" }).click();
    await expect(
      page.getByRole("dialog").getByRole("checkbox", { name: "Marcar como importante" }),
    ).not.toBeChecked();
  });

  test("las repetitivas importantes arman tareas importantes y se ven en la pestaña Repetitivas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).first().click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Rutina importante");
    await dialogo.getByLabel("Se repite").selectOption({ label: "Todos los días" });
    await dialogo.getByText("Marcar como importante").click();
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await expect(
      page.getByRole("region", { name: "Para hoy" }).locator("[data-distintivo='importante']"),
    ).toHaveCount(1);
    await irASeccion(page, "Repetitivas");
    const fila = page.getByRole("listitem").filter({ hasText: "Rutina importante" });
    await expect(fila.locator("[data-distintivo='importante']")).toBeVisible();
  });

  for (const tema of ["claro", "oscuro"] as const) {
    test(`el distintivo se lee bien en modo ${tema}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: tema === "oscuro" ? "dark" : "light" });
      const cuenta = await crearCuentaAprobada();
      await sembrarTareasDePrueba(
        cuenta.email,
        [
          { titulo: "Importante hoy", dia: hoy(), importante: true },
          { titulo: "Común hoy", dia: hoy() },
        ],
        hoy(),
      );
      await entrar(page, cuenta);
      await abrirTareas(page);
      await expect(page.locator("[data-distintivo='importante']").first()).toBeVisible();
      await page.waitForTimeout(TRANSICION_MS);
      const resultados = await new AxeBuilder({ page }).analyze();
      expect(resultados.violations).toEqual([]);
    });
  }
});

test.describe("controles de las tareas: al apuntar en Hoy, siempre en el historial", () => {
  const fallidasDeHoy = (pagina: Page) => pagina.getByRole("region", { name: "Fallidas hoy" });
  /** La opacidad con la que se ve un elemento. */
  const opacidad = (elemento: Locator) =>
    elemento.evaluate((nodo) => Number(getComputedStyle(nodo).opacity));

  test("en Hoy, la casilla y la cruz de lo pendiente no ocupan lugar y se despliegan a la izquierda al apuntar", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "De hoy", dia: hoy() }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);

    const fila = page.locator("label").filter({ hasText: "De hoy" });
    const envoltura = fila.locator("[data-acciones-reveladas]");
    const titulo = fila.getByText("De hoy", { exact: true });
    const ancho = () => envoltura.evaluate((nodo) => nodo.getBoundingClientRect().width);

    // Sin apuntar no se ven ni ocupan lugar: el título arranca pegado al borde de la fila.
    expect(await ancho()).toBe(0);
    expect(await opacidad(envoltura)).toBe(0);
    const cajaAntes = await fila.boundingBox();
    const tituloAntes = await titulo.boundingBox();
    expect(tituloAntes?.x).toBeCloseTo(cajaAntes?.x ?? 0, 0);

    // Al apuntar a la fila se despliegan a la izquierda y empujan el título.
    await fila.hover();
    await expect.poll(ancho).toBeGreaterThan(40);
    await expect.poll(() => opacidad(envoltura)).toBe(1);
    await expect
      .poll(async () => (await titulo.boundingBox())?.x ?? 0)
      .toBeGreaterThan((tituloAntes?.x ?? 0) + 40);
    // Y la cruz queda a la derecha de la casilla, a la vista.
    const cruz = page.getByRole("button", { name: "Marcar como fallida: De hoy" });
    const caja = await fila.locator(".casilla-caja").boundingBox();
    const medidaDeLaCruz = await cruz.boundingBox();
    expect(medidaDeLaCruz?.x).toBeGreaterThanOrEqual((caja?.x ?? 0) + (caja?.width ?? 0));
  });

  test("con el teclado también se despliegan, y la casilla se puede marcar", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "De hoy", dia: hoy() }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);

    const envoltura = page
      .locator("label")
      .filter({ hasText: "De hoy" })
      .locator("[data-acciones-reveladas]");
    await page.getByRole("checkbox", { name: "De hoy" }).focus();
    await expect.poll(() => opacidad(envoltura)).toBe(1);
    await page.keyboard.press("Space");
    await expect(page.getByRole("region", { name: "Hechas hoy" })).toContainText("Hechas hoy (1)");
  });

  test("lo ya completado o fallido muestra siempre su estado final, sin apuntar", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Hecha", dia: hoy(), hecha: true },
        { titulo: "Vieja", dia: hoy(-1) },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    // Una completada: la casilla marcada, siempre a la vista.
    await page
      .getByRole("region", { name: "Hechas hoy" })
      .getByRole("button", { name: /Hechas hoy/ })
      .click();
    const hecha = page.locator("label").filter({ hasText: "Hecha" }).locator(".casilla-caja");
    await expect(hecha).toBeVisible();
    expect(await opacidad(hecha)).toBe(1);

    // Una fallida: la cruz activada, siempre a la vista, y sin casilla.
    await marcarComoFallida(page, "Vieja");
    await fallidasDeHoy(page)
      .getByRole("button", { name: /Fallidas hoy/ })
      .click();
    const activada = page.getByRole("button", { name: "Volver a dejar pendiente: Vieja" });
    await expect(activada).toBeVisible();
    expect(await opacidad(activada)).toBe(1);
    await expect(fallidasDeHoy(page).getByRole("checkbox")).toHaveCount(0);
    // Llena de rojo, como la casilla completada queda llena de verde.
    const fondo = await activada.evaluate((nodo) => getComputedStyle(nodo).backgroundColor);
    expect(fondo).not.toBe("rgba(0, 0, 0, 0)");
    const medidaDeLaCruz = await activada.boundingBox();
    const medidaDeLaCasilla = await hecha.boundingBox();
    expect(medidaDeLaCruz?.width).toBeCloseTo(medidaDeLaCasilla?.width ?? 0, 0);
  });

  test("tocar la cruz activada de 'Fallidas hoy' la vuelve a dejar pendiente", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-1) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);
    await marcarComoFallida(page, "Vieja");
    await fallidasDeHoy(page)
      .getByRole("button", { name: /Fallidas hoy/ })
      .click();
    await page.getByRole("button", { name: "Volver a dejar pendiente: Vieja" }).click();
    await expect(fallidasDeHoy(page)).toHaveCount(0);
    await abrirAtrasadas(page);
    await expect(page.getByRole("region", { name: "Atrasadas" })).toContainText("Vieja");
  });

  test("en el historial los controles se ven siempre y la fallida se ve como una completada", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Completada", dia: hoy(-1), hecha: true },
        { titulo: "Fallada", dia: hoy(-1), fallida: true },
        { titulo: "Pendiente", dia: hoy(-1) },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await irASeccion(page, "Historial");

    const completada = page
      .locator("label")
      .filter({ hasText: "Completada" })
      .locator(".casilla-caja");
    const fallada = page.getByRole("button", { name: "Volver a dejar pendiente: Fallada" });
    const pendiente = page
      .locator("label")
      .filter({ hasText: "Pendiente" })
      .locator(".casilla-caja");
    const cruzPendiente = page.getByRole("button", { name: "Marcar como fallida: Pendiente" });
    // Sin apuntar, todo a la vista.
    for (const control of [completada, fallada, pendiente, cruzPendiente]) {
      await expect(control).toBeVisible();
      expect(await opacidad(control)).toBe(1);
    }
    // La fallida tiene el mismo tamaño y forma que la completada, y no hay un botón "Deshacer" aparte.
    const medidaCompletada = await completada.boundingBox();
    const medidaFallada = await fallada.boundingBox();
    expect(medidaFallada?.width).toBeCloseTo(medidaCompletada?.width ?? 0, 0);
    expect(medidaFallada?.height).toBeCloseTo(medidaCompletada?.height ?? 0, 0);
    await expect(page.getByRole("button", { name: "Deshacer" })).toHaveCount(0);
    expect(await fallada.evaluate((nodo) => getComputedStyle(nodo).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );

    // Y tocarla la vuelve a dejar pendiente.
    await fallada.click();
    await expect(page.getByRole("tabpanel")).toContainText("1 de 3 hechas");
    await expect(page.getByRole("tabpanel")).not.toContainText("1 fallida");
  });
});

test.describe("casilla circular de completar", () => {
  test("es un círculo del mismo tamaño que la cruz de fallida y se pinta de verde al apuntarla", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-1) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    const caja = page.locator("label").filter({ hasText: "Vieja" }).locator(".casilla-caja");
    const cruz = page.getByRole("button", { name: "Marcar como fallida: Vieja" });
    const medidaDeLaCaja = await caja.boundingBox();
    const medidaDeLaCruz = await cruz.boundingBox();
    expect(medidaDeLaCaja && medidaDeLaCruz).toBeTruthy();
    if (!medidaDeLaCaja || !medidaDeLaCruz) return;
    // Mismo tamaño que el botón de fallida, y redonda.
    expect(medidaDeLaCaja.width).toBeCloseTo(medidaDeLaCruz.width, 0);
    expect(medidaDeLaCaja.height).toBeCloseTo(medidaDeLaCruz.height, 0);
    const radio = await caja.evaluate((elemento) => getComputedStyle(elemento).borderTopLeftRadius);
    expect(Number.parseFloat(radio)).toBeGreaterThanOrEqual(medidaDeLaCaja.width / 2);
    // Lleva su tilde a la vista, como la cruz lleva su equis.
    await expect(caja.locator("svg")).toBeVisible();

    // Al apuntarla cambia de color (el verde de éxito).
    const colorDelBorde = () =>
      caja.evaluate((elemento) => getComputedStyle(elemento).borderTopColor);
    const antes = await colorDelBorde();
    // La casilla se despliega al apuntar a la fila: primero la fila y después la casilla.
    await page.locator("label").filter({ hasText: "Vieja" }).hover();
    await caja.hover();
    await expect.poll(colorDelBorde).not.toBe(antes);
  });

  test("marcada queda llena de verde", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Hecha", dia: hoy(), hecha: true }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    // Una hecha hoy está en 'Hechas hoy' (plegada): se abre.
    await page
      .getByRole("region", { name: "Hechas hoy" })
      .getByRole("button", { name: /Hechas hoy/ })
      .click();
    const caja = page.locator("label").filter({ hasText: "Hecha" }).locator(".casilla-caja");
    await expect(caja).toBeVisible();
    const fondo = await caja.evaluate((elemento) => getComputedStyle(elemento).backgroundColor);
    // No es transparente: está llena.
    expect(fondo).not.toBe("rgba(0, 0, 0, 0)");
    const borde = await caja.evaluate((elemento) => getComputedStyle(elemento).borderTopColor);
    expect(fondo).toBe(borde);
  });
});

test.describe("aviso al dar por fallida", () => {
  const aviso = (pagina: Page) =>
    pagina.getByRole("dialog", { name: "¿Dar la tarea por fallida?", exact: true });

  test("la primera vez explica qué significa; cancelar no la marca y confirmar sí", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-1) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    await marcarComoFallida(page, "Vieja");
    await expect(aviso(page)).toBeVisible();
    // Explica, en pocas palabras, qué significa y qué pasa con la tarea.
    await expect(aviso(page)).toContainText("Vieja");
    await expect(aviso(page)).toContainText("ya no la vas a hacer");
    await expect(aviso(page)).toContainText("cuenta como no hecha");
    await expect(aviso(page)).toContainText("Podés deshacerlo");
    await expect(
      aviso(page).getByRole("checkbox", { name: "No volver a mostrar" }),
    ).not.toBeChecked();

    // Cancelar: sigue atrasada.
    await aviso(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(aviso(page)).toBeHidden();
    await expect(page.getByRole("region", { name: "Atrasadas" })).toContainText("Vieja");

    // Confirmar: pasa a 'Fallidas hoy'.
    await marcarComoFallida(page, "Vieja");
    await aviso(page).getByRole("button", { name: "Dar por fallida" }).click();
    await expect(aviso(page)).toBeHidden();
    await expect(page.getByRole("region", { name: "Fallidas hoy" })).toContainText(
      "Fallidas hoy (1)",
    );
  });

  test("con 'No volver a mostrar' no vuelve a aparecer, tampoco después de recargar", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Primera", dia: hoy(-1) },
        { titulo: "Segunda", dia: hoy(-2) },
        { titulo: "Tercera", dia: hoy(-3) },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    await marcarComoFallida(page, "Primera");
    await aviso(page).getByText("No volver a mostrar").click();
    await expect(aviso(page).getByRole("checkbox", { name: "No volver a mostrar" })).toBeChecked();
    await aviso(page).getByRole("button", { name: "Dar por fallida" }).click();
    await expect(aviso(page)).toBeHidden();

    // La siguiente se marca directo, sin aviso.
    await marcarComoFallida(page, "Segunda");
    await expect(aviso(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Fallidas hoy" })).toContainText(
      "Fallidas hoy (2)",
    );

    // Y se recuerda al recargar.
    await page.reload();
    await abrirAtrasadas(page);
    await marcarComoFallida(page, "Tercera");
    await expect(aviso(page)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Fallidas hoy" })).toContainText(
      "Fallidas hoy (3)",
    );
  });

  test("tildar 'No volver a mostrar' pero cancelar no lo recuerda", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-1) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);

    await marcarComoFallida(page, "Vieja");
    await aviso(page).getByText("No volver a mostrar").click();
    await aviso(page).getByRole("button", { name: "Cancelar" }).click();
    await expect(aviso(page)).toBeHidden();

    // Vuelve a salir, con la casilla desmarcada.
    await marcarComoFallida(page, "Vieja");
    await expect(aviso(page)).toBeVisible();
    await expect(
      aviso(page).getByRole("checkbox", { name: "No volver a mostrar" }),
    ).not.toBeChecked();
  });

  test("deshacer una fallida no pide aviso", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-1) }], hoy());
    await entrar(page, cuenta);
    await abrirTareas(page);
    await abrirAtrasadas(page);
    await marcarComoFallida(page, "Vieja");
    await aviso(page).getByRole("button", { name: "Dar por fallida" }).click();

    const fallidas = page.getByRole("region", { name: "Fallidas hoy" });
    await fallidas.getByRole("button", { name: /Fallidas hoy/ }).click();
    await fallidas.getByRole("button", { name: "Volver a dejar pendiente: Vieja" }).click();
    await expect(aviso(page)).toHaveCount(0);
    await expect(fallidas).toHaveCount(0);
  });

  test("también sale con una tarea de hoy y desde el historial", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "De hoy", dia: hoy() },
        { titulo: "Pendiente vieja", dia: hoy(-2) },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirTareas(page);

    await marcarComoFallida(page, "De hoy");
    await expect(aviso(page)).toBeVisible();
    await aviso(page).getByRole("button", { name: "Cancelar" }).click();

    await irASeccion(page, "Historial");
    await marcarComoFallida(page, "Pendiente vieja");
    await expect(aviso(page)).toBeVisible();
    await aviso(page).getByRole("button", { name: "Dar por fallida" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("0 de 1 hechas, 1 fallida");
  });

  for (const esquema of ["light", "dark"] as const) {
    test(`el aviso se lee bien en modo ${esquema === "light" ? "claro" : "oscuro"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: esquema });
      const cuenta = await crearCuentaAprobada();
      await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Vieja", dia: hoy(-1) }], hoy());
      await entrar(page, cuenta);
      await abrirTareas(page);
      await abrirAtrasadas(page);
      await marcarComoFallida(page, "Vieja");
      await expect(aviso(page)).toBeVisible();
      await page.waitForTimeout(TRANSICION_MS);
      const resultados = await new AxeBuilder({ page }).analyze();
      expect(resultados.violations).toEqual([]);
    });
  }
});

test.describe("tareas progresivas", () => {
  /** Agrega una tarea progresiva para hoy con el formulario completo. */
  async function agregarProgresiva(
    pagina: Page,
    titulo: string,
    meta: string,
    unidad: string,
  ): Promise<void> {
    await pagina.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = pagina.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill(titulo);
    const progresiva = dialogo.getByRole("checkbox", { name: /progresiva/ });
    await progresiva.locator("xpath=..").click();
    await expect(progresiva).toBeChecked();
    await dialogo.getByLabel("Meta", { exact: true }).fill(meta);
    await dialogo.getByLabel("Unidad (opcional)").fill(unidad);
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();
  }

  test("se va sumando y al llegar a la meta pasa a 'Hechas hoy'", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarProgresiva(page, "Tomar agua", "2", "litros");

    const paraHoy = page.getByRole("region", { name: "Para hoy" });
    // El aro y el porcentaje se ven siempre; no tiene casilla.
    await expect(paraHoy).toContainText("0 de 2 litros · 0 %");
    await expect(paraHoy.getByRole("button", { name: "Progreso de Tomar agua: 0 %" })).toBeVisible();
    await expect(fila(page, "Tomar agua")).toHaveCount(0);

    // El botón para sumar o restar aparece al apuntar a la fila.
    await paraHoy.getByText("Tomar agua", { exact: true }).hover();
    await paraHoy.getByRole("button", { name: "Sumar o restar: Tomar agua" }).click();
    await paraHoy.getByRole("button", { name: "Sumar 0,5 litros: Tomar agua" }).click();
    await expect(paraHoy).toContainText("0,5 de 2 litros · 25 %");

    await paraHoy.getByRole("button", { name: "Sumar o restar: Tomar agua" }).click();
    await paraHoy.getByRole("button", { name: "Sumar 1 litros: Tomar agua" }).click();
    await expect(paraHoy).toContainText("1,5 de 2 litros · 75 %");

    // Restar lo anotado de más.
    await paraHoy.getByRole("button", { name: "Sumar o restar: Tomar agua" }).click();
    await paraHoy.getByLabel("Cantidad litros").fill("0,5");
    await paraHoy.getByRole("button", { name: "Restar", exact: true }).click();
    await expect(paraHoy).toContainText("1 de 2 litros · 50 %");

    // Otra cantidad, con coma.
    await paraHoy.getByRole("button", { name: "Sumar o restar: Tomar agua" }).click();
    await paraHoy.getByLabel("Cantidad litros").fill("1");
    await paraHoy.getByRole("button", { name: "Sumar", exact: true }).click();

    await expect(page.getByRole("region", { name: "Para hoy" })).toHaveCount(0);
    const hechas = page.getByRole("region", { name: "Hechas hoy" });
    await expect(hechas).toContainText("(1)");

    // Se recuerda al recargar.
    await page.reload();
    await hechas.getByRole("button", { name: /^Hechas hoy/ }).click();
    await expect(hechas).toContainText("2 de 2 litros");
  });

  test("corregir el total por debajo de la meta la vuelve a dejar pendiente", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarProgresiva(page, "Leer", "20", "páginas");

    const paraHoy = page.getByRole("region", { name: "Para hoy" });
    await paraHoy.getByRole("button", { name: "Sumar o restar: Leer" }).click();
    await paraHoy.getByLabel("Cantidad páginas").fill("25");
    await paraHoy.getByRole("button", { name: "Es el total" }).click();
    await expect(page.getByRole("region", { name: "Para hoy" })).toHaveCount(0);

    const hechas = page.getByRole("region", { name: "Hechas hoy" });
    await hechas.getByRole("button", { name: /^Hechas hoy/ }).click();
    await expect(hechas).toContainText("25 de 20 páginas · 100 %");
    await hechas.getByRole("button", { name: "Sumar o restar: Leer" }).click();
    await hechas.getByLabel("Cantidad páginas").fill("12");
    await hechas.getByRole("button", { name: "Es el total" }).click();

    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText("12 de 20 páginas");
  });

  test("avisa si la cantidad no sirve, sin anotar nada", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await agregarProgresiva(page, "Caminar", "10000", "pasos");

    const paraHoy = page.getByRole("region", { name: "Para hoy" });
    await paraHoy.getByRole("button", { name: "Sumar o restar: Caminar" }).click();
    await paraHoy.getByLabel("Cantidad pasos").fill("cero");
    await paraHoy.getByRole("button", { name: "Sumar", exact: true }).click();
    await expect(paraHoy.getByRole("alert")).toHaveText("Escribí una cantidad.");
    await expect(paraHoy).toContainText("0 de 10.000 pasos");
  });

  test("el formulario pide la meta y se puede volver a una tarea común", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Tomar agua");
    await dialogo.getByRole("checkbox", { name: /progresiva/ }).locator("xpath=..").click();
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo.getByText("Escribí una cantidad.")).toBeVisible();
    await dialogo.getByLabel("Meta", { exact: true }).fill("1,234");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo.getByText("Usá como mucho dos decimales.")).toBeVisible();
    await dialogo.getByLabel("Meta", { exact: true }).fill("2");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    // Al editarla y desmarcar "progresiva", vuelve a tener casilla.
    await page.getByRole("button", { name: "Editar: Tomar agua" }).click();
    const edicion = page.getByRole("dialog");
    await expect(edicion.getByLabel("Meta", { exact: true })).toHaveValue("2");
    await edicion.getByRole("checkbox", { name: /progresiva/ }).locator("xpath=..").click();
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();
    await expect(fila(page, "Tomar agua")).toHaveCount(1);
  });

  test("una repetitiva progresiva arma tareas con su meta", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirTareas(page);
    await page.getByRole("button", { name: "Agregar tarea" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar tarea" });
    await dialogo.getByLabel("¿Qué hay que hacer?").fill("Tomar agua");
    await dialogo.getByLabel("Se repite").selectOption("diaria");
    await dialogo.getByRole("checkbox", { name: /progresiva/ }).locator("xpath=..").click();
    await dialogo.getByLabel("Meta", { exact: true }).fill("2");
    await dialogo.getByLabel("Unidad (opcional)").fill("litros");
    await dialogo.getByRole("button", { name: "Agregar tarea" }).click();
    await expect(dialogo).toBeHidden();

    await expect(page.getByRole("region", { name: "Para hoy" })).toContainText("0 de 2 litros");
    await irASeccion(page, "Repetitivas");
    await expect(page.getByRole("tabpanel")).toContainText("Meta: 2 litros");
  });
});

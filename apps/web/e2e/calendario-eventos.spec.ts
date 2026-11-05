// Tests end-to-end de los eventos del calendario: lo que aportan Finanzas (vencimiento de deudas),
// Contactos (recordatorios) y Tareas (pendientes), cómo se ordena y de dónde se dice que viene
// cada uno (texto, ícono y color), el filtro por origen y los eventos que se agregan, editan y
// eliminan a mano.
//
// Los datos de partida se preparan hablando con la API desde la sesión del navegador (los
// formularios de cada módulo se prueban en sus propios tests); el formulario del calendario sí se
// usa de verdad. La lógica de qué cae en cada día tiene sus tests de integración en apps/api.
//
// Los días se calculan a partir del "hoy" de las cuentas nuevas (Montevideo), así los tests valen
// cualquier día del año.

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

// Mismo puerto fijo que utilidades.ts: la API que levanta Playwright.
const URL_API = "http://localhost:3101";
/** Lo que tarda un diálogo o el selector de vista en quedar quietos (axe mide el contraste a mitad de camino). */
const TRANSICION_MS = 600;

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

/** El mismo día pero en otro mes; si ese mes no lo tiene, el último día. */
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

/** "martes, 20 de octubre de 2026": el comienzo del nombre accesible de la casilla de ese día. */
function nombreDelDia(dia: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dia}T00:00:00Z`));
}

async function pedirApi<T>(
  pagina: Page,
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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
  await expect(pagina.locator("[data-grilla]")).toHaveCount(1);
}

function casilla(pagina: Page, dia: string): Locator {
  return pagina.getByRole("button", { name: new RegExp(`^${nombreDelDia(dia)}`) });
}

/** La lista de eventos del día elegido, en el panel. */
function eventosDelDia(pagina: Page): Locator {
  return pagina.getByRole("region", { name: "Eventos del día" });
}

function filas(pagina: Page): Locator {
  return eventosDelDia(pagina).getByRole("listitem");
}

async function crearPersona(pagina: Page, nombre: string): Promise<string> {
  const creado = await pedirApi<{ id: string }>(pagina, "POST", "/api/contactos", {
    tipo: "persona",
    nombre,
    apellido: "",
    fechaNacimiento: "",
    telefonos: [],
    correos: [],
    direccion: "",
    notas: "",
    favorito: false,
    etiquetaIds: [],
  });
  return creado.id;
}

async function crearEventoManual(
  pagina: Page,
  datos: { titulo: string; fecha: string; hora?: string; notas?: string },
): Promise<string> {
  const creado = await pedirApi<{ id: string }>(pagina, "POST", "/api/calendario/eventos", {
    titulo: datos.titulo,
    fecha: datos.fecha,
    hora: datos.hora ?? "",
    notas: datos.notas ?? "",
  });
  return creado.id;
}

/** Una de cada módulo y dos manuales, todas para el mismo día. */
async function sembrarUnDia(pagina: Page, dia: string): Promise<void> {
  await crearEventoManual(pagina, { titulo: "Cena con amigos", fecha: dia, hora: "21:00" });
  await crearEventoManual(pagina, { titulo: "Día de la mudanza", fecha: dia });
  await pedirApi(pagina, "POST", "/api/tareas", {
    titulo: "Llevar el auto al taller",
    notas: "",
    fecha: dia,
    hora: "08:15",
  });
  await pedirApi(pagina, "POST", "/api/finanzas/deudas", {
    nombreLibre: "Marcos",
    sentido: "me_deben",
    concepto: "Entradas del recital",
    monto: 1500,
    moneda: "UYU",
    fecha: sumarDias(hoy(), -3),
    fechaLimite: dia,
  });
  const contacto = await crearPersona(pagina, "Lucía");
  await pedirApi(pagina, "POST", `/api/contactos/${contacto}/recordatorios`, {
    titulo: "Llamarla por su cumpleaños",
    repeticion: "unica",
    fecha: dia,
    hora: "18:30",
  });
}

test.describe("lo que aportan los otros módulos", () => {
  test("cada evento aparece en su día, ordenado por hora y diciendo de dónde viene", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);

    await expect(filas(page)).toHaveCount(5);
    // Primero lo de todo el día y después de la hora más temprana a la más tardía.
    const esperado = [
      { texto: "Vence: Entradas del recital", origen: "Finanzas", hora: "Todo el día" },
      { texto: "Día de la mudanza", origen: "Calendario", hora: "Todo el día" },
      { texto: "Llevar el auto al taller", origen: "Tareas", hora: "08:15" },
      { texto: "Llamarla por su cumpleaños", origen: "Contactos", hora: "18:30" },
      { texto: "Cena con amigos", origen: "Calendario", hora: "21:00" },
    ];
    for (const [indice, fila] of esperado.entries()) {
      await expect(filas(page).nth(indice), fila.texto).toContainText(fila.texto);
      await expect(filas(page).nth(indice), fila.texto).toContainText(fila.origen);
      await expect(filas(page).nth(indice), fila.texto).toContainText(fila.hora);
    }
    // Con el contexto de cada uno: con quién y de cuánto.
    await expect(filas(page).nth(0)).toContainText("Marcos te debe");
    await expect(filas(page).nth(0)).toContainText("1.500,00");
    await expect(filas(page).nth(3)).toContainText("Lucía");
    await expect(
      eventosDelDia(page).getByRole("heading", { name: /Eventos del día/ }),
    ).toContainText("(5)");
  });

  test("lo de otros módulos no se edita acá: lleva al módulo de origen", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);

    const fila = filas(page).filter({ hasText: "Llevar el auto al taller" });
    await expect(fila.getByRole("button", { name: /Editar|Eliminar/ })).toHaveCount(0);
    await fila.getByRole("link", { name: /Ver en Tareas/ }).click();
    await expect(page).toHaveURL(/\/tareas$/);
  });

  test("una tarea hecha y una deuda saldada dejan de aparecer", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());

    const lista = await pedirApi<{ deudas: { id: string }[] }>(page, "GET", "/api/finanzas/deudas");
    await pedirApi(page, "POST", `/api/finanzas/deudas/${lista.deudas[0]?.id}/pagos`, {
      monto: 1500,
      fecha: hoy(),
    });
    const tareas = await pedirApi<{ deHoy: { id: string }[] }>(page, "GET", "/api/tareas");
    await pedirApi(page, "PATCH", `/api/tareas/${tareas.deHoy[0]?.id}/completada`, {
      completada: true,
    });

    await abrirCalendario(page);
    await expect(filas(page)).toHaveCount(3);
    await expect(eventosDelDia(page)).not.toContainText("Entradas del recital");
    await expect(eventosDelDia(page)).not.toContainText("Llevar el auto al taller");
  });

  test("las tareas repetitivas aparecen también en los días que vienen", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await pedirApi(page, "POST", "/api/tareas/repetitivas", {
      titulo: "Regar las plantas",
      notas: "",
      repeticion: "diaria",
      hora: "",
    });
    await abrirCalendario(page);
    await casilla(page, sumarDias(hoy(), 2)).click();
    await expect(filas(page)).toHaveCount(1);
    await expect(filas(page).first()).toContainText("Regar las plantas");
    await expect(filas(page).first()).toContainText("Se repite");
  });
});

test.describe("el mes", () => {
  test("marca los días con eventos y dice cuántos tienen", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const conDos = sumarDias(hoy(), 1);
    const conUno = sumarDias(hoy(), 2);
    await crearEventoManual(page, { titulo: "Uno", fecha: conDos });
    await crearEventoManual(page, { titulo: "Dos", fecha: conDos, hora: "10:00" });
    await crearEventoManual(page, { titulo: "Tres", fecha: conUno });
    await abrirCalendario(page);

    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${nombreDelDia(conDos)}.*, 2 eventos: Calendario$`),
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${nombreDelDia(conUno)}.*, 1 evento: Calendario$`),
      }),
    ).toBeVisible();
    // Un día sin nada no dice nada de eventos.
    const sinNada = casilla(page, sumarDias(hoy(), 3));
    await expect(sinNada).not.toHaveAccessibleName(/evento/);
    await expect(casilla(page, conDos).locator("[data-eventos='2']")).toBeVisible();
  });

  test("al cambiar de mes se ven los eventos de ese mes", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const delMesQueViene = sumarMeses(hoy(), 1);
    await crearEventoManual(page, { titulo: "El mes que viene", fecha: delMesQueViene });
    await abrirCalendario(page);

    await page.getByRole("button", { name: "Mes siguiente" }).click();
    await expect(page.locator("[data-grilla]")).toHaveCount(1);
    await expect(casilla(page, delMesQueViene)).toHaveAccessibleName(/1 evento/);
    await expect(filas(page)).toHaveCount(1);
    await expect(filas(page).first()).toContainText("El mes que viene");
  });

  test("elegir otro día muestra los eventos de ese día", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearEventoManual(page, { titulo: "De hoy", fecha: hoy() });
    await crearEventoManual(page, { titulo: "De pasado mañana", fecha: sumarDias(hoy(), 2) });
    await abrirCalendario(page);

    await expect(filas(page)).toHaveCount(1);
    await expect(filas(page).first()).toContainText("De hoy");
    await casilla(page, sumarDias(hoy(), 2)).click();
    await expect(filas(page).first()).toContainText("De pasado mañana");
    await casilla(page, sumarDias(hoy(), 1)).click();
    await expect(page.getByText("Sin eventos para este día")).toBeVisible();
  });
});

/** El color real (computado) de un elemento, para comparar sin depender de las clases. */
async function colorDe(
  elemento: Locator,
  propiedad: "borderLeftColor" | "backgroundColor",
): Promise<string> {
  return await elemento.evaluate(
    (nodo, prop) => getComputedStyle(nodo)[prop as "borderLeftColor"],
    propiedad,
  );
}

const ORIGENES_EN_ORDEN = ["manual", "finanzas", "contactos", "tareas"] as const;

test.describe("cómo se marca cada origen", () => {
  test("el día muestra un punto por origen, del color de su origen, y cuántos eventos tiene", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);

    const celda = casilla(page, hoy());
    await expect(celda).toHaveAccessibleName(
      /, 5 eventos: Calendario, Finanzas, Contactos, Tareas$/,
    );
    // Un punto por origen (hay cinco eventos pero dos son manuales), en el orden de siempre, y el total.
    const puntos = celda.locator("[data-eventos] [data-origen]");
    await expect(puntos).toHaveCount(4);
    for (const [indice, origen] of ORIGENES_EN_ORDEN.entries()) {
      await expect(puntos.nth(indice)).toHaveAttribute("data-origen", origen);
    }
    await expect(celda).toContainText("5");
    // Los cuatro puntos son de cuatro colores distintos.
    const colores = await Promise.all(
      ORIGENES_EN_ORDEN.map((_, indice) => colorDe(puntos.nth(indice), "backgroundColor")),
    );
    expect(new Set(colores).size).toBe(4);
  });

  test("un día con un solo evento no muestra contador y un día sin eventos, nada", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const manana = sumarDias(hoy(), 1);
    await crearEventoManual(page, { titulo: "Solo uno", fecha: manana });
    await abrirCalendario(page);

    await expect(casilla(page, manana).locator("[data-eventos='1'] [data-origen]")).toHaveCount(1);
    await expect(casilla(page, manana)).not.toContainText("1");
    await expect(casilla(page, sumarDias(hoy(), 2)).locator("[data-eventos]")).toHaveCount(0);
  });

  test("cada fila de la lista lleva el color de su origen, además del nombre y el ícono", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);

    const colores = new Map<string, string>();
    for (const origen of ORIGENES_EN_ORDEN) {
      const fila = eventosDelDia(page).locator(`li[data-origen='${origen}']`).first();
      await expect(fila).toBeVisible();
      colores.set(origen, await colorDe(fila.locator("div").first(), "borderLeftColor"));
    }
    expect(new Set(colores.values()).size).toBe(4);
    // Los dos manuales comparten color.
    const manuales = eventosDelDia(page).locator("li[data-origen='manual']");
    await expect(manuales).toHaveCount(2);
    expect(await colorDe(manuales.nth(0).locator("div").first(), "borderLeftColor")).toBe(
      colores.get("manual"),
    );
    expect(await colorDe(manuales.nth(1).locator("div").first(), "borderLeftColor")).toBe(
      colores.get("manual"),
    );
  });
});

test.describe("muchos eventos en un día", () => {
  /** Crea `cantidad` eventos manuales en un día. */
  async function cargarDia(pagina: Page, dia: string, cantidad: number): Promise<void> {
    for (let i = 1; i <= cantidad; i++) {
      await crearEventoManual(pagina, { titulo: `Evento ${i} de ${dia}`, fecha: dia });
    }
  }

  function puntos(pagina: Page, dia: string): Locator {
    return casilla(pagina, dia).locator("[data-eventos] [data-origen]");
  }

  test("tenga uno o veinte eventos de un origen, el día lleva un solo punto de ese origen", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const dias = [1, 2, 3].map((n) => sumarDias(hoy(), n));
    await cargarDia(page, dias[0] as string, 1);
    await cargarDia(page, dias[1] as string, 10);
    await cargarDia(page, dias[2] as string, 20);
    await abrirCalendario(page);

    for (const dia of dias) {
      await expect(puntos(page, dia)).toHaveCount(1);
      await expect(puntos(page, dia).first()).toHaveAttribute("data-origen", "manual");
    }
    // La cantidad sí se dice: en el contador y en el nombre del día.
    await expect(casilla(page, dias[1] as string)).toContainText("10");
    await expect(casilla(page, dias[2] as string)).toHaveAccessibleName(
      /, 20 eventos: Calendario$/,
    );
  });

  test("un día cargado de una cosa muestra también las demás: un punto por origen", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const dia = sumarDias(hoy(), 1);
    for (let i = 1; i <= 10; i++) {
      await pedirApi(page, "POST", "/api/tareas", {
        titulo: `T${i}`,
        notas: "",
        fecha: dia,
        hora: "",
      });
    }
    const contacto = await crearPersona(page, "Lucía");
    await pedirApi(page, "POST", `/api/contactos/${contacto}/recordatorios`, {
      titulo: "Llamarla",
      repeticion: "unica",
      fecha: dia,
      hora: "",
    });
    await abrirCalendario(page);

    await expect(puntos(page, dia)).toHaveCount(2);
    await expect(casilla(page, dia).locator("[data-origen='contactos']")).toHaveCount(1);
    await expect(casilla(page, dia).locator("[data-origen='tareas']")).toHaveCount(1);
  });

  test("un día con eventos de los cuatro orígenes tiene cuatro puntos y nunca más", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await cargarDia(page, hoy(), 8);
    await abrirCalendario(page);
    await expect(puntos(page, hoy())).toHaveCount(4);
  });

  for (const esquema of ["light", "dark"] as const) {
    test(`con días muy cargados todo se lee bien en modo ${esquema === "light" ? "claro" : "oscuro"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await entrar(page, await crearCuentaAprobada());
      // Un día muy cargado en cada fila de la grilla, incluidos los de fin de semana y los de otro mes.
      for (const n of [1, 2, 8, 9, 15, 16, 22, 28]) {
        await cargarDia(page, sumarDias(hoy(), n), 6);
      }
      await abrirCalendario(page);
      await page.waitForTimeout(TRANSICION_MS);
      const violaciones = (await new AxeBuilder({ page }).analyze()).violations;
      expect(violaciones).toEqual([]);
    });
  }
});

test.describe("el filtro por origen", () => {
  function chip(pagina: Page, nombre: string): Locator {
    return pagina
      .getByRole("group", { name: "Mostrar en el calendario" })
      .getByRole("button", { name: nombre });
  }

  test("arranca con todo prendido y cada botón dice su origen", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    for (const nombre of ["Calendario", "Finanzas", "Contactos", "Tareas"]) {
      await expect(chip(page, nombre)).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("apagar un origen lo saca de la lista y de los puntos, y avisa cuántos ocultó", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);
    await expect(filas(page)).toHaveCount(5);

    await chip(page, "Tareas").click();
    await expect(chip(page, "Tareas")).toHaveAttribute("aria-pressed", "false");
    await expect(filas(page)).toHaveCount(4);
    await expect(eventosDelDia(page)).not.toContainText("Llevar el auto al taller");
    await expect(eventosDelDia(page)).toContainText("1 evento oculto por el filtro");
    await expect(eventosDelDia(page).getByRole("heading")).toContainText("(4)");
    // En el mes: un evento menos y un punto menos (el de Tareas).
    const celda = casilla(page, hoy());
    await expect(celda).toHaveAccessibleName(/, 4 eventos: Calendario, Finanzas, Contactos$/);
    await expect(celda.locator("[data-eventos] [data-origen]")).toHaveCount(3);
    await expect(celda.locator("[data-origen='tareas']")).toHaveCount(0);

    // Volver a prenderlo lo trae de vuelta.
    await chip(page, "Tareas").click();
    await expect(filas(page)).toHaveCount(5);
    await expect(eventosDelDia(page)).not.toContainText("oculto por el filtro");
  });

  test("se pueden apagar varios a la vez", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);

    await chip(page, "Tareas").click();
    await chip(page, "Finanzas").click();
    await expect(filas(page)).toHaveCount(3);
    await expect(eventosDelDia(page)).toContainText("2 eventos ocultos por el filtro");
    await expect(eventosDelDia(page)).not.toContainText("Entradas del recital");
  });

  test("con todo apagado explica que hay eventos ocultos y no que no haya nada", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);

    for (const nombre of ["Calendario", "Finanzas", "Contactos", "Tareas"]) {
      await chip(page, nombre).click();
    }
    await expect(filas(page)).toHaveCount(0);
    await expect(eventosDelDia(page)).toContainText("Hay 5 eventos ocultos por el filtro");
    await expect(page.getByText("Sin eventos para este día")).toHaveCount(0);
    await expect(casilla(page, hoy()).locator("[data-eventos]")).toHaveCount(0);
    await expect(casilla(page, hoy())).not.toHaveAccessibleName(/evento/);
  });

  test("un día sin nada sigue diciendo que no hay eventos, aunque haya un filtro puesto", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await chip(page, "Tareas").click();
    await expect(page.getByText("Sin eventos para este día")).toBeVisible();
  });

  test("lo que se apaga se recuerda al recargar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);
    await chip(page, "Finanzas").click();
    await chip(page, "Contactos").click();

    await page.reload();
    await expect(page.locator("[data-grilla]")).toHaveCount(1);
    await expect(chip(page, "Finanzas")).toHaveAttribute("aria-pressed", "false");
    await expect(chip(page, "Contactos")).toHaveAttribute("aria-pressed", "false");
    await expect(chip(page, "Tareas")).toHaveAttribute("aria-pressed", "true");
    await expect(filas(page)).toHaveCount(3);
  });

  test("un valor guardado que no sirve se ignora y se ve todo", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await page.evaluate(() =>
      localStorage.setItem("gestoria:calendario:origenes-ocultos", "esto no es JSON{"),
    );
    await abrirCalendario(page);
    await expect(filas(page)).toHaveCount(5);
    for (const nombre of ["Calendario", "Finanzas", "Contactos", "Tareas"]) {
      await expect(chip(page, nombre)).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("el filtro vale para todos los días del mes", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearEventoManual(page, { titulo: "De hoy", fecha: hoy() });
    await pedirApi(page, "POST", "/api/tareas", {
      titulo: "Tarea de pasado mañana",
      notas: "",
      fecha: sumarDias(hoy(), 2),
      hora: "",
    });
    await abrirCalendario(page);
    await chip(page, "Tareas").click();

    await expect(casilla(page, sumarDias(hoy(), 2))).not.toHaveAccessibleName(/evento/);
    await casilla(page, sumarDias(hoy(), 2)).click();
    await expect(page.getByText("Hay 1 evento oculto por el filtro")).toBeVisible();
  });

  test("si se agrega un evento propio con 'Calendario' apagado, se vuelve a mostrar", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await chip(page, "Calendario").click();
    await expect(chip(page, "Calendario")).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Agregar evento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar evento" });
    await dialogo.getByLabel("¿Qué evento es?").fill("No quiero perderlo");
    await dialogo.getByRole("button", { name: "Agregar evento" }).click();
    await expect(dialogo).toBeHidden();

    await expect(chip(page, "Calendario")).toHaveAttribute("aria-pressed", "true");
    await expect(filas(page).first()).toContainText("No quiero perderlo");
  });

  test("se maneja con teclado: Espacio y Enter alternan el botón enfocado", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);

    await chip(page, "Tareas").focus();
    await page.keyboard.press("Space");
    await expect(chip(page, "Tareas")).toHaveAttribute("aria-pressed", "false");
    await expect(filas(page)).toHaveCount(4);
    await page.keyboard.press("Enter");
    await expect(chip(page, "Tareas")).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("filtros avanzados: por repetición", () => {
  const DIAS_DE_LA_SEMANA_ISO = (dia: string) =>
    ((new Date(`${dia}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

  /** El botón "Más filtros", que abre el panel de filtros avanzados. */
  function masFiltros(pagina: Page): Locator {
    return pagina.getByRole("button", { name: /Más filtros/ });
  }

  /** El botón de una repetición dentro del grupo de un origen ("Tareas" o "Contactos"). */
  function repeticion(pagina: Page, origen: "tareas" | "contactos", nombre: string): Locator {
    return pagina
      .locator(`fieldset[data-origen='${origen}']`)
      .getByRole("button", { name: nombre });
  }

  async function abrirFiltros(pagina: Page): Promise<void> {
    await masFiltros(pagina).click();
    await expect(masFiltros(pagina)).toHaveAttribute("aria-expanded", "true");
  }

  /**
   * Un día con una tarea de cada tipo (suelta, diaria, semanal, mensual y anual) y tres recordatorios
   * (de una sola vez, diario y anual). Devuelve ese día.
   */
  async function sembrarRepeticiones(pagina: Page): Promise<string> {
    const dia = sumarDias(hoy(), 2);
    const numeroDelDia = Number(dia.slice(8, 10));
    const mes = Number(dia.slice(5, 7));
    const base = { notas: "", hora: "" };
    await pedirApi(pagina, "POST", "/api/tareas", { ...base, titulo: "Tarea suelta", fecha: dia });
    await pedirApi(pagina, "POST", "/api/tareas/repetitivas", {
      ...base,
      titulo: "Tarea diaria",
      repeticion: "diaria",
    });
    await pedirApi(pagina, "POST", "/api/tareas/repetitivas", {
      ...base,
      titulo: "Tarea semanal",
      repeticion: "semanal",
      diasSemana: [DIAS_DE_LA_SEMANA_ISO(dia)],
    });
    await pedirApi(pagina, "POST", "/api/tareas/repetitivas", {
      ...base,
      titulo: "Tarea mensual",
      repeticion: "mensual",
      diaDelMes: numeroDelDia,
    });
    await pedirApi(pagina, "POST", "/api/tareas/repetitivas", {
      ...base,
      titulo: "Tarea anual",
      repeticion: "anual",
      diaDelMes: numeroDelDia,
      mes,
    });
    const contacto = await crearPersona(pagina, "Lucía");
    const recordatorio = (datos: Record<string, unknown>) =>
      pedirApi(pagina, "POST", `/api/contactos/${contacto}/recordatorios`, datos);
    await recordatorio({ titulo: "Aviso único", repeticion: "unica", fecha: dia, hora: "" });
    await recordatorio({ titulo: "Aviso diario", repeticion: "diaria", hora: "09:00" });
    await recordatorio({
      titulo: "Aviso anual",
      repeticion: "anual",
      diaDelMes: numeroDelDia,
      mes,
      hora: "",
    });
    return dia;
  }

  /** Los títulos de la lista del día, en orden. */
  async function titulos(pagina: Page): Promise<string[]> {
    return await filas(pagina).locator("p.text-sm.font-medium").allInnerTexts();
  }

  test("el panel arranca cerrado y, al abrirlo, ofrece las repeticiones de Tareas y de Contactos", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    await expect(masFiltros(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("fieldset[data-origen='tareas']")).toHaveCount(0);

    await abrirFiltros(page);
    for (const origen of ["tareas", "contactos"] as const) {
      for (const nombre of ["Una sola vez", "Diarias", "Semanales", "Mensuales", "Anuales"]) {
        await expect(repeticion(page, origen, nombre)).toHaveAttribute("aria-pressed", "true");
      }
    }
    // "Cada varios días" es de las tareas: los recordatorios no lo tienen.
    await expect(repeticion(page, "tareas", "Cada varios días")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(repeticion(page, "contactos", "Cada varios días")).toHaveCount(0);
    // Finanzas y Calendario no tienen repetición: no aparecen.
    await expect(page.locator("fieldset[data-origen='finanzas']")).toHaveCount(0);
    await expect(page.locator("fieldset[data-origen='manual']")).toHaveCount(0);

    await masFiltros(page).click();
    await expect(page.locator("fieldset[data-origen='tareas']")).toHaveCount(0);
  });

  test("se pueden ocultar las tareas diarias y ver las semanales, mensuales y anuales", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const dia = await sembrarRepeticiones(page);
    await abrirCalendario(page);
    await casilla(page, dia).click();
    await expect(filas(page)).toHaveCount(8);
    await expect(eventosDelDia(page)).toContainText("Tarea diaria");

    await abrirFiltros(page);
    await repeticion(page, "tareas", "Diarias").click();
    await expect(repeticion(page, "tareas", "Diarias")).toHaveAttribute("aria-pressed", "false");

    const visibles = await titulos(page);
    expect(visibles).not.toContain("Tarea diaria");
    for (const titulo of ["Tarea suelta", "Tarea semanal", "Tarea mensual", "Tarea anual"]) {
      expect(visibles).toContain(titulo);
    }
    // Los recordatorios no se tocan: el aviso diario sigue.
    expect(visibles).toContain("Aviso diario");
    await expect(filas(page)).toHaveCount(7);
    await expect(eventosDelDia(page)).toContainText("1 evento oculto por el filtro");
  });

  test("se pueden ocultar varios tipos a la vez y solo quedan los elegidos", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const dia = await sembrarRepeticiones(page);
    await abrirCalendario(page);
    await casilla(page, dia).click();

    await abrirFiltros(page);
    for (const nombre of ["Una sola vez", "Diarias", "Semanales"]) {
      await repeticion(page, "tareas", nombre).click();
    }
    const visibles = await titulos(page);
    expect(visibles.filter((t) => t.startsWith("Tarea"))).toEqual(
      expect.arrayContaining(["Tarea mensual", "Tarea anual"]),
    );
    expect(visibles.filter((t) => t.startsWith("Tarea"))).toHaveLength(2);
    await expect(eventosDelDia(page)).toContainText("3 eventos ocultos por el filtro");
  });

  test("los recordatorios de Contactos se filtran por separado de las tareas", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const dia = await sembrarRepeticiones(page);
    await abrirCalendario(page);
    await casilla(page, dia).click();

    await abrirFiltros(page);
    await repeticion(page, "contactos", "Diarias").click();
    const visibles = await titulos(page);
    expect(visibles).not.toContain("Aviso diario");
    expect(visibles).toContain("Aviso único");
    expect(visibles).toContain("Aviso anual");
    // Las tareas diarias siguen.
    expect(visibles).toContain("Tarea diaria");
  });

  test("el botón avisa cuántos tipos hay ocultos y 'Mostrar todo' los vuelve a mostrar", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const dia = await sembrarRepeticiones(page);
    await abrirCalendario(page);
    await casilla(page, dia).click();
    await expect(masFiltros(page).locator("[data-restricciones]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mostrar todo" })).toHaveCount(0);

    await abrirFiltros(page);
    await repeticion(page, "tareas", "Diarias").click();
    await repeticion(page, "contactos", "Anuales").click();
    await expect(masFiltros(page)).toContainText("2");
    await expect(masFiltros(page)).toHaveAccessibleName(/Más filtros 2 tipos ocultos/);

    // Aun con el panel cerrado, el aviso queda a la vista.
    await masFiltros(page).click();
    await expect(masFiltros(page).locator("[data-restricciones='2']")).toBeVisible();

    await page.getByRole("button", { name: "Mostrar todo" }).click();
    await expect(masFiltros(page).locator("[data-restricciones]")).toHaveCount(0);
    await expect(filas(page)).toHaveCount(8);
    await abrirFiltros(page);
    await expect(repeticion(page, "tareas", "Diarias")).toHaveAttribute("aria-pressed", "true");
    await expect(repeticion(page, "contactos", "Anuales")).toHaveAttribute("aria-pressed", "true");
  });

  test("'Mostrar todo' también vuelve a prender los orígenes apagados", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const dia = await sembrarRepeticiones(page);
    await abrirCalendario(page);
    await casilla(page, dia).click();
    const origen = (nombre: string) =>
      page.getByRole("group", { name: "Mostrar en el calendario" }).getByRole("button", {
        name: nombre,
      });
    await origen("Tareas").click();
    await expect(origen("Tareas")).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Mostrar todo" }).click();
    await expect(origen("Tareas")).toHaveAttribute("aria-pressed", "true");
    await expect(filas(page)).toHaveCount(8);
  });

  test("si un origen está apagado, sus repeticiones se deshabilitan y lo explican", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page
      .getByRole("group", { name: "Mostrar en el calendario" })
      .getByRole("button", { name: "Tareas" })
      .click();
    await abrirFiltros(page);

    await expect(repeticion(page, "tareas", "Diarias")).toBeDisabled();
    await expect(page.locator("fieldset[data-origen='tareas']")).toContainText("Está oculto");
    // Las de Contactos siguen disponibles.
    await expect(repeticion(page, "contactos", "Diarias")).toBeEnabled();
  });

  test("el mes se despeja: con una tarea diaria todos los días tienen un punto y sin las diarias, ninguno", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await pedirApi(page, "POST", "/api/tareas/repetitivas", {
      titulo: "Regar las plantas",
      notas: "",
      repeticion: "diaria",
      hora: "",
    });
    await abrirCalendario(page);
    const dias = [1, 3, 6].map((n) => sumarDias(hoy(), n));
    for (const dia of dias) {
      await expect(casilla(page, dia).locator("[data-origen='tareas']")).toHaveCount(1);
    }

    await abrirFiltros(page);
    await repeticion(page, "tareas", "Diarias").click();
    // El panel flota sobre la grilla: se cierra para ver los días.
    await masFiltros(page).click();
    for (const dia of dias) {
      await expect(casilla(page, dia).locator("[data-eventos]")).toHaveCount(0);
      await expect(casilla(page, dia)).not.toHaveAccessibleName(/evento/);
    }
    // En el panel se explica por qué no hay nada, en vez de decir que no hay eventos.
    await casilla(page, dias[0] as string).click();
    await expect(page.getByText("Hay 1 evento oculto por el filtro")).toBeVisible();
  });

  test("lo elegido se recuerda al recargar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const dia = await sembrarRepeticiones(page);
    await abrirCalendario(page);
    await abrirFiltros(page);
    await repeticion(page, "tareas", "Diarias").click();
    await repeticion(page, "contactos", "Una sola vez").click();

    await page.reload();
    await expect(page.locator("[data-grilla]")).toHaveCount(1);
    await expect(masFiltros(page).locator("[data-restricciones='2']")).toBeVisible();
    await abrirFiltros(page);
    await expect(repeticion(page, "tareas", "Diarias")).toHaveAttribute("aria-pressed", "false");
    await expect(repeticion(page, "contactos", "Una sola vez")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(repeticion(page, "tareas", "Semanales")).toHaveAttribute("aria-pressed", "true");
    await masFiltros(page).click();
    await casilla(page, dia).click();
    expect(await titulos(page)).not.toContain("Tarea diaria");
  });

  test("un valor guardado que no sirve se ignora y se ve todo", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await page.evaluate(() => {
      localStorage.setItem("gestoria:calendario:repeticiones-ocultas", "{{no es JSON");
      localStorage.setItem("gestoria:calendario:origenes-ocultos", '{"raro":true}');
    });
    await abrirCalendario(page);
    await expect(masFiltros(page).locator("[data-restricciones]")).toHaveCount(0);
    await abrirFiltros(page);
    await expect(repeticion(page, "tareas", "Diarias")).toHaveAttribute("aria-pressed", "true");
  });

  test("lo guardado con valores desconocidos se ignora solo en esa parte", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await page.evaluate(() =>
      localStorage.setItem(
        "gestoria:calendario:repeticiones-ocultas",
        JSON.stringify({
          tareas: ["diaria", "quincenal"],
          contactos: "no es una lista",
          otro: ["anual"],
        }),
      ),
    );
    await abrirCalendario(page);
    await abrirFiltros(page);
    await expect(repeticion(page, "tareas", "Diarias")).toHaveAttribute("aria-pressed", "false");
    await expect(repeticion(page, "contactos", "Diarias")).toHaveAttribute("aria-pressed", "true");
    await expect(masFiltros(page).locator("[data-restricciones='1']")).toBeVisible();
  });

  test("se maneja con teclado: el botón abre el panel y Espacio alterna cada tipo", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const dia = await sembrarRepeticiones(page);
    await abrirCalendario(page);
    await casilla(page, dia).click();

    await masFiltros(page).focus();
    await page.keyboard.press("Enter");
    await expect(masFiltros(page)).toHaveAttribute("aria-expanded", "true");
    await repeticion(page, "tareas", "Diarias").focus();
    await page.keyboard.press("Space");
    await expect(repeticion(page, "tareas", "Diarias")).toHaveAttribute("aria-pressed", "false");
    expect(await titulos(page)).not.toContain("Tarea diaria");
  });

  test("Escape cierra el panel y devuelve el foco al botón", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await abrirFiltros(page);
    await repeticion(page, "tareas", "Semanales").focus();
    await page.keyboard.press("Escape");
    await expect(masFiltros(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("fieldset[data-origen='tareas']")).toHaveCount(0);
    await expect(masFiltros(page)).toBeFocused();
  });

  test("tocar afuera cierra el panel; tocar adentro no", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await abrirFiltros(page);

    // Adentro: elegir una repetición o tocar el fondo del panel lo deja abierto.
    await repeticion(page, "tareas", "Semanales").click();
    await page.locator("fieldset[data-origen='tareas'] [data-filtro='estado']").click();
    await expect(masFiltros(page)).toHaveAttribute("aria-expanded", "true");

    // Afuera: el título de la página.
    await page.getByRole("heading", { name: "Calendario", level: 1 }).click();
    await expect(masFiltros(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("fieldset[data-origen='tareas']")).toHaveCount(0);
    // Lo elegido adentro quedó.
    await abrirFiltros(page);
    await expect(repeticion(page, "tareas", "Semanales")).toHaveAttribute("aria-pressed", "false");

    // Y el botón sigue alternándolo, sin que el toque cuente como "afuera" y lo vuelva a abrir.
    await masFiltros(page).click();
    await expect(masFiltros(page)).toHaveAttribute("aria-expanded", "false");
  });

  test("en pantalla ancha el panel flota: abrirlo no cambia el tamaño del calendario", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    const tarjeta = page
      .locator("[data-grilla]")
      .locator("xpath=ancestor::*[contains(@class,'rounded-tarjeta')][1]");
    const antes = await tarjeta.boundingBox();
    await abrirFiltros(page);
    await expect(page.locator("fieldset[data-origen='tareas']")).toBeVisible();
    const despues = await tarjeta.boundingBox();
    expect(despues?.height).toBe(antes?.height);
    // Y la página no gana barra de desplazamiento por abrirlo.
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1),
    ).toBe(true);
  });

  for (const esquema of ["light", "dark"] as const) {
    test(`el panel de filtros avanzados se lee bien en modo ${esquema === "light" ? "claro" : "oscuro"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await entrar(page, await crearCuentaAprobada());
      const dia = await sembrarRepeticiones(page);
      await abrirCalendario(page);
      await casilla(page, dia).click();
      await abrirFiltros(page);
      await repeticion(page, "tareas", "Diarias").click();
      await repeticion(page, "contactos", "Anuales").click();
      await page.waitForTimeout(TRANSICION_MS);

      const revisar = async () => (await new AxeBuilder({ page }).analyze()).violations;
      expect(await revisar()).toEqual([]);

      // También con un origen apagado (sus botones quedan deshabilitados).
      await page
        .getByRole("group", { name: "Mostrar en el calendario" })
        .getByRole("button", { name: "Tareas" })
        .click();
      await page.waitForTimeout(TRANSICION_MS);
      expect(await revisar()).toEqual([]);
    });
  }
});

test.describe("agregar, editar y eliminar a mano", () => {
  test("se agrega un evento en el día elegido y queda marcado en el mes", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    const manana = sumarDias(hoy(), 1);
    await casilla(page, manana).click();

    await page.getByRole("button", { name: "Agregar evento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar evento" });
    // El día que está elegido ya viene puesto.
    await expect(dialogo.getByLabel("Día")).toHaveValue(manana);
    await dialogo.getByLabel("¿Qué evento es?").fill("Turno con el dentista");
    await dialogo.getByLabel("Hora (opcional)").fill("09:30");
    await dialogo.getByLabel("Notas (opcional)").fill("Llevar la ficha");
    await dialogo.getByRole("button", { name: "Agregar evento" }).click();

    await expect(dialogo).toBeHidden();
    await expect(filas(page)).toHaveCount(1);
    await expect(filas(page).first()).toContainText("Turno con el dentista");
    await expect(filas(page).first()).toContainText("09:30");
    await expect(filas(page).first()).toContainText("Llevar la ficha");
    await expect(filas(page).first()).toContainText("Calendario");
    await expect(casilla(page, manana)).toHaveAccessibleName(/1 evento/);
  });

  test("un evento sin hora es de todo el día", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.getByRole("button", { name: "Agregar evento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar evento" });
    await dialogo.getByLabel("¿Qué evento es?").fill("Feriado");
    await dialogo.getByRole("button", { name: "Agregar evento" }).click();
    await expect(filas(page).first()).toContainText("Todo el día");
  });

  test("se puede cambiar el día en el formulario y el evento va a ese día", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.getByRole("button", { name: "Agregar evento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar evento" });
    await dialogo.getByLabel("¿Qué evento es?").fill("Viaje");
    await dialogo.getByLabel("Día").fill(sumarDias(hoy(), 2));
    await dialogo.getByRole("button", { name: "Agregar evento" }).click();
    await expect(dialogo).toBeHidden();

    // En el día elegido (hoy) no aparece; en el otro sí.
    await expect(page.getByText("Sin eventos para este día")).toBeVisible();
    await casilla(page, sumarDias(hoy(), 2)).click();
    await expect(filas(page).first()).toContainText("Viaje");
  });

  test("avisa junto a cada campo lo que falta o está mal", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.getByRole("button", { name: "Agregar evento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar evento" });

    await dialogo.getByLabel("Día").fill("");
    await dialogo.getByRole("button", { name: "Agregar evento" }).click();
    await expect(dialogo.getByText("Escribí cómo se llama el evento.")).toBeVisible();
    await expect(dialogo.getByText("Esa fecha no es válida.")).toBeVisible();
    await expect(dialogo).toBeVisible();

    // Cancelar cierra sin guardar nada.
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText("Sin eventos para este día")).toBeVisible();
  });

  test("se edita un evento: título, hora, notas y día", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearEventoManual(page, {
      titulo: "Reunión",
      fecha: hoy(),
      hora: "10:00",
      notas: "Sala 2",
    });
    await abrirCalendario(page);

    await page.getByRole("button", { name: "Editar: Reunión" }).click();
    const dialogo = page.getByRole("dialog", { name: "Editar evento" });
    // Viene con lo que ya tenía.
    await expect(dialogo.getByLabel("¿Qué evento es?")).toHaveValue("Reunión");
    await expect(dialogo.getByLabel("Hora (opcional)")).toHaveValue("10:00");
    await expect(dialogo.getByLabel("Notas (opcional)")).toHaveValue("Sala 2");

    await dialogo.getByLabel("¿Qué evento es?").fill("Reunión de equipo");
    await dialogo.getByLabel("Hora (opcional)").fill("");
    await dialogo.getByLabel("Día").fill(sumarDias(hoy(), 1));
    await dialogo.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(dialogo).toBeHidden();

    // Se fue de hoy y está en mañana, ahora sin hora.
    await expect(page.getByText("Sin eventos para este día")).toBeVisible();
    await casilla(page, sumarDias(hoy(), 1)).click();
    await expect(filas(page).first()).toContainText("Reunión de equipo");
    await expect(filas(page).first()).toContainText("Todo el día");
  });

  test("se elimina un evento después de confirmar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearEventoManual(page, { titulo: "Cancelado", fecha: hoy() });
    await abrirCalendario(page);

    await page.getByRole("button", { name: "Eliminar: Cancelado" }).click();
    const dialogo = page.getByRole("dialog", { name: "Eliminar evento" });
    await expect(dialogo).toContainText("Cancelado");
    // Cancelar lo deja como estaba.
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toBeHidden();
    await expect(filas(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Eliminar: Cancelado" }).click();
    await dialogo.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(dialogo).toBeHidden();
    await expect(page.getByText("Sin eventos para este día")).toBeVisible();
    await expect(casilla(page, hoy())).not.toHaveAccessibleName(/evento/);
  });

  test("lo que se agrega queda guardado al recargar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await page.getByRole("button", { name: "Agregar evento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Agregar evento" });
    await dialogo.getByLabel("¿Qué evento es?").fill("Persistente");
    await dialogo.getByRole("button", { name: "Agregar evento" }).click();
    await expect(filas(page)).toHaveCount(1);

    await page.reload();
    await expect(page.locator("[data-grilla]")).toHaveCount(1);
    await expect(filas(page).first()).toContainText("Persistente");
  });
});

test.describe("tareas completadas", () => {
  type Estado = "pendiente" | "atrasada" | "finalizada" | "proximo" | "pasado";
  /** El botón de un estado en el grupo de un origen (por defecto, el de las tareas). */
  const chipDeEstado = (
    pagina: Page,
    estado: Estado,
    origen: "tareas" | "contactos" = "tareas",
  ): Locator =>
    pagina.locator(
      `fieldset[data-origen='${origen}'] [data-filtro='estado'] [data-estado='${estado}']`,
    );

  async function abrirFiltros(pagina: Page): Promise<void> {
    await pagina.getByRole("button", { name: /Más filtros/ }).click();
    await expect(chipDeEstado(pagina, "finalizada")).toBeVisible();
  }

  /** Muestra las finalizadas (completadas y fallidas), que por defecto están ocultas. */
  async function mostrarCerradas(pagina: Page): Promise<void> {
    await chipDeEstado(pagina, "finalizada").click();
  }

  /** Cierra el panel de filtros (en pantallas anchas flota sobre la grilla). */
  async function masFiltrosCerrar(pagina: Page): Promise<void> {
    await pagina.getByRole("button", { name: /Más filtros/ }).click();
  }

  /** Una tarea de hoy sin hacer y otra de hoy ya hecha, y una hecha hace unos días. */
  async function sembrarCompletadas(pagina: Page): Promise<void> {
    const base = { notas: "", hora: "" };
    await pedirApi(pagina, "POST", "/api/tareas", { ...base, titulo: "Pendiente", fecha: hoy() });
    const hecha = await pedirApi<{ id: string }>(pagina, "POST", "/api/tareas", {
      ...base,
      titulo: "Hecha",
      fecha: hoy(),
    });
    await pedirApi(pagina, "PATCH", `/api/tareas/${hecha.id}/completada`, { completada: true });
  }

  test("por defecto no se ve lo completado y se avisa que hay algo oculto", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarCompletadas(page);
    await abrirCalendario(page);

    await expect(filas(page)).toHaveCount(1);
    await expect(eventosDelDia(page)).toContainText("Pendiente");
    await expect(eventosDelDia(page)).not.toContainText("Hecha");
    await expect(eventosDelDia(page)).toContainText("1 evento oculto por el filtro");
  });

  test("al pedirlo se muestran, tachadas y con la marca 'Completada', distintas de las pendientes", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarCompletadas(page);
    await abrirCalendario(page);
    await abrirFiltros(page);
    await mostrarCerradas(page);
    await expect(chipDeEstado(page, "finalizada")).toHaveAttribute("aria-pressed", "true");

    await expect(filas(page)).toHaveCount(2);
    const hecha = filas(page).filter({ hasText: "Hecha" });
    const pendiente = filas(page).filter({ hasText: "Pendiente" });
    await expect(hecha).toHaveAttribute("data-completado", "true");
    await expect(hecha).toContainText("Completada");
    await expect(hecha.locator("p.line-through")).toHaveText("Hecha");
    await expect(pendiente).toHaveAttribute("data-completado", "false");
    await expect(pendiente).not.toContainText("Completada");
    await expect(pendiente.locator("p.line-through")).toHaveCount(0);
    await expect(eventosDelDia(page)).not.toContainText("oculto por el filtro");
  });

  test("en el mes, el punto de un día con todo hecho queda vacío y con algo pendiente, lleno", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const base = { notas: "", hora: "" };
    const manana = sumarDias(hoy(), 1);
    const hecha = await pedirApi<{ id: string }>(page, "POST", "/api/tareas", {
      ...base,
      titulo: "Solo hecha",
      fecha: manana,
    });
    await pedirApi(page, "PATCH", `/api/tareas/${hecha.id}/completada`, { completada: true });
    await sembrarCompletadas(page);
    await abrirCalendario(page);

    // Sin pedir las completadas, el día de mañana no tiene nada.
    await expect(casilla(page, manana).locator("[data-origen='tareas']")).toHaveCount(0);
    await expect(casilla(page, hoy()).locator("[data-origen='tareas']")).toHaveAttribute(
      "data-completado",
      "false",
    );

    await abrirFiltros(page);
    await mostrarCerradas(page);
    await expect(casilla(page, manana).locator("[data-origen='tareas']")).toHaveAttribute(
      "data-completado",
      "true",
    );
    await expect(casilla(page, manana)).toHaveAccessibleName(/1 evento: Tareas \(1 completados\)/);
    // Hoy tiene una pendiente y una hecha: el punto sigue lleno.
    await expect(casilla(page, hoy()).locator("[data-origen='tareas']")).toHaveAttribute(
      "data-completado",
      "false",
    );
  });

  test("un recordatorio está completado cuando su día ya pasó", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const contacto = await crearPersona(page, "Lucía");
    await pedirApi(page, "POST", `/api/contactos/${contacto}/recordatorios`, {
      titulo: "Tomar la pastilla",
      repeticion: "diaria",
      hora: "09:00",
    });
    const ayer = sumarDias(hoy(), -1);
    await abrirCalendario(page);

    // Por defecto lo pasado no se ve; hoy sí, con el punto lleno.
    await expect(casilla(page, ayer).locator("[data-origen='contactos']")).toHaveCount(0);
    await expect(casilla(page, hoy()).locator("[data-origen='contactos']")).toHaveAttribute(
      "data-completado",
      "false",
    );

    // Mostrar las tareas finalizadas no trae los recordatorios pasados: tienen su propio estado.
    await abrirFiltros(page);
    await mostrarCerradas(page);
    await expect(casilla(page, ayer).locator("[data-origen='contactos']")).toHaveCount(0);
    await expect(chipDeEstado(page, "pasado", "contactos")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await chipDeEstado(page, "pasado", "contactos").click();
    await masFiltrosCerrar(page);
    await expect(casilla(page, ayer).locator("[data-origen='contactos']")).toHaveAttribute(
      "data-completado",
      "true",
    );
    await casilla(page, ayer).click();
    const fila = filas(page).filter({ hasText: "Tomar la pastilla" });
    await expect(fila).toHaveAttribute("data-completado", "true");
    await expect(fila).toContainText("Pasado");
    await expect(fila).not.toContainText("Completada");
    await expect(fila.locator("p.line-through")).toHaveText("Tomar la pastilla");
    // En la grilla: próximo es el círculo lleno y pasado, el círculo vacío (solo el borde).
    await expect(casilla(page, ayer).locator("[data-origen='contactos']")).toHaveAttribute(
      "data-estado",
      "pasado",
    );
    await expect(casilla(page, ayer).locator("[data-origen='contactos'] svg")).toHaveCount(0);
    await expect(casilla(page, hoy()).locator("[data-origen='contactos']")).toHaveAttribute(
      "data-estado",
      "pendiente",
    );

    // El de hoy sigue pendiente: todavía no pasó el día.
    await casilla(page, hoy()).click();
    await expect(filas(page).filter({ hasText: "Tomar la pastilla" })).toHaveAttribute(
      "data-completado",
      "false",
    );
  });

  test("una atrasada se ve como pendiente y una fallida queda oculta hasta pedir verlas", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    const ayer = sumarDias(hoy(), -1);
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Atrasada de ayer", dia: ayer },
        { titulo: "Fallida de ayer", dia: ayer, fallida: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirCalendario(page);
    await casilla(page, ayer).click();

    // Por defecto: la atrasada (igual que en Tareas) y el aviso de que hay una fallida oculta.
    await expect(filas(page)).toHaveCount(1);
    await expect(filas(page).first()).toContainText("Atrasada de ayer");
    await expect(filas(page).first()).toHaveAttribute("data-fallido", "false");
    await expect(eventosDelDia(page)).toContainText("1 evento oculto por el filtro");

    await abrirFiltros(page);
    await mostrarCerradas(page);
    await expect(chipDeEstado(page, "finalizada")).toHaveAttribute("aria-pressed", "true");
    await masFiltrosCerrar(page);
    await expect(filas(page)).toHaveCount(2);
    const fallida = filas(page).filter({ hasText: "Fallida de ayer" });
    await expect(fallida).toHaveAttribute("data-fallido", "true");
    await expect(fallida).toContainText("Fallida");
    await expect(fallida.locator("p.line-through")).toHaveText("Fallida de ayer");
    // Con una pendiente en el día, el punto de Tareas sigue lleno.
    await expect(casilla(page, ayer).locator("[data-origen='tareas']")).toHaveAttribute(
      "data-completado",
      "false",
    );
  });

  test("un día con solo fallidas tiene el punto vacío cuando se ven", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    const ayer = sumarDias(hoy(), -1);
    await sembrarTareasDePrueba(
      cuenta.email,
      [{ titulo: "Solo fallida", dia: ayer, fallida: true }],
      hoy(),
    );
    await entrar(page, cuenta);
    await abrirCalendario(page);
    await expect(casilla(page, ayer).locator("[data-origen='tareas']")).toHaveCount(0);

    await abrirFiltros(page);
    await mostrarCerradas(page);
    await masFiltrosCerrar(page);
    await expect(casilla(page, ayer).locator("[data-origen='tareas']")).toHaveAttribute(
      "data-completado",
      "true",
    );
    await expect(casilla(page, ayer)).toHaveAccessibleName(/1 fallido/);
  });

  test("el punto de la grilla cambia según el estado: lleno, tick, cruz o exclamación", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    const ayer = sumarDias(hoy(), -1);
    const anteayer = sumarDias(hoy(), -2);
    const manana = sumarDias(hoy(), 1);
    const hace3 = sumarDias(hoy(), -3);
    const hace4 = sumarDias(hoy(), -4);
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Atrasada de ayer", dia: ayer },
        { titulo: "Fallida de anteayer", dia: anteayer, fallida: true },
        { titulo: "Fallida de hace tres días", dia: hace3, fallida: true },
        { titulo: "Atrasada de hace cuatro días", dia: hace4 },
        { titulo: "Hecha de hace tres días", dia: hace3, hecha: true },
        { titulo: "Hecha de hace cuatro días", dia: hace4, hecha: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    const base = { notas: "", hora: "" };
    await pedirApi(page, "POST", "/api/tareas", { ...base, titulo: "Para mañana", fecha: manana });
    const hecha = await pedirApi<{ id: string }>(page, "POST", "/api/tareas", {
      ...base,
      titulo: "Hecha hoy",
      fecha: hoy(),
    });
    await pedirApi(page, "PATCH", `/api/tareas/${hecha.id}/completada`, { completada: true });
    await abrirCalendario(page);
    await abrirFiltros(page);
    await mostrarCerradas(page);
    await masFiltrosCerrar(page);

    const marca = (dia: string) => casilla(page, dia).locator("[data-origen='tareas']");
    // Un día con una completada y una fallida es "mixto"; uno con una atrasada y una completada, atrasado.
    await expect(marca(hace3)).toHaveAttribute("data-estado", "mixta");
    await expect(marca(hace3).locator("svg")).toHaveCount(1);
    // Con una atrasada, manda ella aunque haya algo completado.
    await expect(marca(hace4)).toHaveAttribute("data-estado", "atrasada");
    await expect(marca(manana)).toHaveAttribute("data-estado", "pendiente");
    await expect(marca(hoy())).toHaveAttribute("data-estado", "completada");
    await expect(marca(ayer)).toHaveAttribute("data-estado", "atrasada");
    await expect(marca(anteayer)).toHaveAttribute("data-estado", "fallida");
    // Solo el punto pendiente es lleno: los otros llevan un ícono.
    await expect(marca(manana).locator("svg")).toHaveCount(0);
    for (const dia of [hoy(), ayer, anteayer]) {
      await expect(marca(dia).locator("svg")).toHaveCount(1);
    }
    await expect(casilla(page, ayer)).toHaveAccessibleName(/1 atrasado/);

    // La fila del día dice lo mismo con palabras.
    await casilla(page, ayer).click();
    await expect(filas(page).filter({ hasText: "Atrasada de ayer" })).toContainText("Atrasada");
  });

  test("se recuerda al recargar, y 'Mostrar todo' no lo cambia", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarCompletadas(page);
    await abrirCalendario(page);
    await abrirFiltros(page);
    await mostrarCerradas(page);
    await expect(filas(page)).toHaveCount(2);

    await page.reload();
    await expect(filas(page)).toHaveCount(2);
    await abrirFiltros(page);
    await expect(chipDeEstado(page, "finalizada")).toHaveAttribute("aria-pressed", "true");

    // Se oculta una repetición para que aparezca 'Mostrar todo' y se lo usa.
    await page
      .locator("fieldset[data-origen='tareas']")
      .getByRole("button", { name: "Diarias" })
      .click();
    await page.getByRole("button", { name: "Mostrar todo" }).click();
    await expect(chipDeEstado(page, "finalizada")).toHaveAttribute("aria-pressed", "true");
    await expect(filas(page)).toHaveCount(2);
  });

  test("lo guardado cuando completadas y fallidas eran dos estados oculta las finalizadas", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarCompletadas(page);
    await page.evaluate(() =>
      localStorage.setItem("gestoria:calendario:estados-ocultos", '["completada"]'),
    );
    await abrirCalendario(page);
    await expect(filas(page)).toHaveCount(1);
    await abrirFiltros(page);
    await expect(chipDeEstado(page, "finalizada")).toHaveAttribute("aria-pressed", "false");
    await expect(chipDeEstado(page, "pendiente")).toHaveAttribute("aria-pressed", "true");
    // Antes los recordatorios pasados contaban como finalizados: siguen ocultos.
    await expect(chipDeEstado(page, "pasado", "contactos")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(chipDeEstado(page, "proximo", "contactos")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("un valor guardado dañado vuelve a ocultar las completadas", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarCompletadas(page);
    await page.evaluate(() =>
      localStorage.setItem("gestoria:calendario:estados-ocultos", '"quizás"'),
    );
    await abrirCalendario(page);
    await expect(filas(page)).toHaveCount(1);
  });

  test("una lista guardada vacía muestra todos los estados", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarCompletadas(page);
    await page.evaluate(() => localStorage.setItem("gestoria:calendario:estados-ocultos", "[]"));
    await abrirCalendario(page);
    await expect(filas(page)).toHaveCount(2);
    await abrirFiltros(page);
    for (const estado of ["pendiente", "atrasada", "finalizada"] as const) {
      await expect(chipDeEstado(page, estado)).toHaveAttribute("aria-pressed", "true");
    }
    for (const estado of ["proximo", "pasado"] as const) {
      await expect(chipDeEstado(page, estado, "contactos")).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("por defecto están marcadas pendiente, atrasada y próximo, y no finalizada ni pasado", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);
    await abrirFiltros(page);
    for (const [estado, marcado] of [
      ["pendiente", "true"],
      ["atrasada", "true"],
      ["finalizada", "false"],
    ] as const) {
      await expect(chipDeEstado(page, estado)).toHaveAttribute("aria-pressed", marcado);
    }
    for (const [estado, marcado] of [
      ["proximo", "true"],
      ["pasado", "false"],
    ] as const) {
      await expect(chipDeEstado(page, estado, "contactos")).toHaveAttribute(
        "aria-pressed",
        marcado,
      );
    }
    // Todos tienen texto, no solo color ni ícono; los recordatorios no tienen los de las tareas.
    const estadosDe = (origen: string) =>
      page.locator(`fieldset[data-origen='${origen}'] [data-filtro='estado']`);
    await expect(estadosDe("tareas")).toContainText(/Pendientes.*Atrasadas.*Finalizadas/);
    await expect(estadosDe("contactos")).toContainText(/Próximos.*Pasados/);
    await expect(estadosDe("contactos").locator("[data-estado='atrasada']")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Estado de Contactos" })).toBeVisible();
  });

  test("los recordatorios próximos y pasados se muestran u ocultan por su cuenta y se recuerdan", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const contacto = await crearPersona(page, "Lucía");
    await pedirApi(page, "POST", `/api/contactos/${contacto}/recordatorios`, {
      titulo: "Llamar",
      repeticion: "diaria",
      hora: "09:00",
    });
    const ayer = sumarDias(hoy(), -1);
    const contactosDe = (dia: string) => casilla(page, dia).locator("[data-origen='contactos']");
    await abrirCalendario(page);
    await expect(contactosDe(hoy())).toHaveCount(1);
    await expect(contactosDe(ayer)).toHaveCount(0);

    await abrirFiltros(page);
    await chipDeEstado(page, "pasado", "contactos").click();
    await expect(contactosDe(ayer)).toHaveCount(1);
    await chipDeEstado(page, "proximo", "contactos").click();
    await expect(contactosDe(hoy())).toHaveCount(0);
    await expect(contactosDe(ayer)).toHaveCount(1);
    // Los estados de las tareas no cambiaron.
    await expect(chipDeEstado(page, "pendiente")).toHaveAttribute("aria-pressed", "true");
    await expect(chipDeEstado(page, "finalizada")).toHaveAttribute("aria-pressed", "false");

    await page.reload();
    await expect(contactosDe(ayer)).toHaveCount(1);
    await expect(contactosDe(hoy())).toHaveCount(0);
    await abrirFiltros(page);
    await expect(chipDeEstado(page, "proximo", "contactos")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(chipDeEstado(page, "pasado", "contactos")).toHaveAttribute("aria-pressed", "true");
  });

  test("cada estado se muestra u oculta por su cuenta", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    const ayer = sumarDias(hoy(), -1);
    await sembrarTareasDePrueba(
      cuenta.email,
      [
        { titulo: "Atrasada de ayer", dia: ayer },
        { titulo: "Fallida de ayer", dia: ayer, fallida: true },
      ],
      hoy(),
    );
    await entrar(page, cuenta);
    await sembrarCompletadas(page);
    await abrirCalendario(page);

    // Hoy: por defecto solo la pendiente.
    await expect(filas(page)).toHaveCount(1);
    await expect(filas(page).first()).toContainText("Pendiente");
    await abrirFiltros(page);
    await chipDeEstado(page, "pendiente").click();
    await expect(filas(page)).toHaveCount(0);
    await chipDeEstado(page, "finalizada").click();
    await expect(filas(page)).toHaveCount(1);
    await expect(filas(page).first()).toContainText("Hecha");
    await chipDeEstado(page, "pendiente").click();
    await expect(filas(page)).toHaveCount(2);

    // Ayer: "Finalizada" ya está prendida, así que la atrasada y la fallida se ven juntas; se sacan por separado.
    await masFiltrosCerrar(page);
    await casilla(page, ayer).click();
    await expect(filas(page)).toHaveCount(2);
    await abrirFiltros(page);
    await chipDeEstado(page, "atrasada").click();
    await expect(filas(page)).toHaveCount(1);
    await expect(filas(page).first()).toContainText("Fallida de ayer");
    await expect(eventosDelDia(page)).toContainText("1 evento oculto por el filtro");
    await chipDeEstado(page, "finalizada").click();
    await expect(filas(page)).toHaveCount(0);
    await expect(eventosDelDia(page)).toContainText("Hay 2 eventos ocultos por el filtro");
  });

  test("ocultar los estados cambia los puntos del mes y 'Mostrar todo' no los toca", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    const ayer = sumarDias(hoy(), -1);
    await sembrarTareasDePrueba(cuenta.email, [{ titulo: "Atrasada de ayer", dia: ayer }], hoy());
    await entrar(page, cuenta);
    await abrirCalendario(page);
    await expect(casilla(page, ayer).locator("[data-origen='tareas']")).toHaveCount(1);

    await abrirFiltros(page);
    await chipDeEstado(page, "atrasada").click();
    await expect(casilla(page, ayer).locator("[data-origen='tareas']")).toHaveCount(0);
    // Se oculta una repetición para que aparezca 'Mostrar todo'; no devuelve las atrasadas.
    await page
      .locator("fieldset[data-origen='tareas']")
      .getByRole("button", { name: "Diarias" })
      .click();
    await page.getByRole("button", { name: "Mostrar todo" }).click();
    await expect(chipDeEstado(page, "atrasada")).toHaveAttribute("aria-pressed", "false");
    await expect(casilla(page, ayer).locator("[data-origen='tareas']")).toHaveCount(0);
  });

  for (const esquema of ["light", "dark"] as const) {
    test(`con las completadas a la vista todo se lee bien en modo ${esquema === "light" ? "claro" : "oscuro"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await entrar(page, await crearCuentaAprobada());
      await sembrarCompletadas(page);
      await abrirCalendario(page);
      await abrirFiltros(page);
      await mostrarCerradas(page);
      await expect(filas(page)).toHaveCount(2);
      await page.waitForTimeout(TRANSICION_MS);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
});

test.describe("cuando algo sale mal", () => {
  test("si no se pueden cargar los eventos, lo explica y se puede seguir usando el calendario", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await page.route("**/api/calendario/eventos?*", (ruta) => ruta.abort());
    await abrirCalendario(page);

    await expect(page.getByText(/No pudimos cargar los eventos/)).toBeVisible();
    // La navegación sigue andando.
    await page.getByRole("button", { name: "Mes siguiente" }).click();
    await expect(page.locator("[data-grilla]")).toHaveCount(1);
  });
});

test.describe("accesibilidad", () => {
  test("con eventos y con el formulario abierto no hay violaciones de axe", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await sembrarUnDia(page, hoy());
    await abrirCalendario(page);
    await expect(filas(page)).toHaveCount(5);
    await page.waitForTimeout(TRANSICION_MS);

    const revisar = async () => (await new AxeBuilder({ page }).analyze()).violations;
    expect(await revisar()).toEqual([]);

    await page.getByRole("button", { name: "Agregar evento" }).click();
    await expect(page.getByRole("dialog", { name: "Agregar evento" })).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar()).toEqual([]);
  });

  for (const esquema of ["light", "dark"] as const) {
    test(`los colores de cada origen y el filtro se leen bien en modo ${esquema === "light" ? "claro" : "oscuro"}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: esquema });
      await entrar(page, await crearCuentaAprobada());
      await sembrarUnDia(page, hoy());
      await abrirCalendario(page);
      await expect(filas(page)).toHaveCount(5);
      await page.waitForTimeout(TRANSICION_MS);

      const revisar = async () => (await new AxeBuilder({ page }).analyze()).violations;
      expect(await revisar()).toEqual([]);

      // También con un origen apagado (el botón apagado cambia de colores).
      await page
        .getByRole("group", { name: "Mostrar en el calendario" })
        .getByRole("button", { name: "Tareas" })
        .click();
      await page.waitForTimeout(TRANSICION_MS);
      expect(await revisar()).toEqual([]);
    });
  }

  test("se puede agregar un evento usando solo el teclado", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirCalendario(page);

    await page.getByRole("button", { name: "Agregar evento" }).focus();
    await page.keyboard.press("Enter");
    const dialogo = page.getByRole("dialog", { name: "Agregar evento" });
    // El foco queda en el primer campo, para escribir directo.
    await expect(dialogo.getByLabel("¿Qué evento es?")).toBeFocused();
    await page.keyboard.type("Con teclado");
    await page.keyboard.press("Enter");
    await expect(dialogo).toBeHidden();
    await expect(filas(page).first()).toContainText("Con teclado");
  });
});

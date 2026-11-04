// Tests end-to-end del módulo de contactos: alta de personas y empresas, validaciones,
// búsqueda y filtros, favoritos, edición, eliminación, recordatorios, etiquetas y los
// widgets de la columna lateral y el resumen de Contactos de la pantalla de inicio.
//
// Los datos de partida se preparan hablando con la API desde la sesión del navegador, en
// vez de pasar por los formularios: los formularios se prueban en los tests de alta y
// edición, y la lógica (orden, búsqueda, recordatorios, zonas horarias) ya tiene sus
// tests de integración en apps/api.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  type CuentaDePrueba,
  crearCuentaAprobada,
  limpiarBaseDePruebas,
  sembrarRecordatorioDiarioAntiguoDePrueba,
  sembrarRecordatoriosPasadosDePrueba,
} from "./utilidades";

// Mismo puerto fijo que utilidades.ts: la API que levanta Playwright.
const URL_API = "http://localhost:3101";
// La zona por defecto de las cuentas nuevas: es la que decide qué día es "hoy".
const ZONA = "America/Montevideo";
// Lo que tarda el selector de pestañas en terminar de cambiar de color (axe mide el contraste a mitad de camino).
const TRANSICION_MS = 500;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

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

/** Abre Contactos con una carga completa: los datos que se prepararon por la API se ven al instante. */
async function abrirContactos(pagina: Page): Promise<void> {
  await pagina.goto("/contactos");
  await expect(pagina.getByRole("heading", { name: "Contactos", level: 1 })).toBeVisible();
}

/** Llega a Contactos tocando el enlace del menú, como lo haría una persona. */
async function irAContactos(pagina: Page): Promise<void> {
  await pagina
    .getByRole("navigation", { name: "Navegación principal" })
    .getByRole("link", { name: "Contactos" })
    .click();
  await expect(pagina).toHaveURL(/\/contactos$/);
  await expect(pagina.getByRole("heading", { name: "Contactos", level: 1 })).toBeVisible();
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

type DatosPersona = {
  nombre: string;
  apellido?: string;
  telefono?: string;
  correo?: string;
  fechaNacimiento?: string;
  favorito?: boolean;
  etiquetaIds?: number[];
};

async function crearPersona(pagina: Page, datos: DatosPersona): Promise<string> {
  const creado = await pedirApi<{ id: string }>(pagina, "POST", "/api/contactos", {
    tipo: "persona",
    nombre: datos.nombre,
    apellido: datos.apellido ?? "",
    fechaNacimiento: datos.fechaNacimiento ?? "",
    telefonos: datos.telefono ? [{ numero: datos.telefono, tipo: "celular" }] : [],
    correos: datos.correo ? [datos.correo] : [],
    direccion: "",
    notas: "",
    favorito: datos.favorito ?? false,
    etiquetaIds: datos.etiquetaIds ?? [],
  });
  return creado.id;
}

async function crearEmpresa(
  pagina: Page,
  datos: { nombre: string; rubro?: string; telefono?: string },
): Promise<string> {
  const creado = await pedirApi<{ id: string }>(pagina, "POST", "/api/contactos", {
    tipo: "empresa",
    nombre: datos.nombre,
    rubro: datos.rubro ?? "",
    sitioWeb: "",
    horario: "",
    documento: "",
    personaDeContacto: "",
    telefonos: datos.telefono ? [{ numero: datos.telefono, tipo: "fijo" }] : [],
    correos: [],
    direccion: "",
    notas: "",
    favorito: false,
    etiquetaIds: [],
  });
  return creado.id;
}

/** Una fecha de nacimiento de 1990 que cumple años dentro de `dias` días (el 29/2 no existe en 1990). */
function nacimientoEn(dias: number): string {
  const fin = diaDeCalendario(dias).slice(4);
  return `1990${fin === "-02-29" ? "-02-28" : fin}`;
}

/** "AAAA-MM-DD" de hoy en la zona de las cuentas nuevas, sumando `dias`. */
function diaDeCalendario(dias = 0): string {
  const fecha = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

function dialogo(pagina: Page, nombre: string | RegExp): Locator {
  return pagina.getByRole("dialog", { name: nombre, exact: typeof nombre === "string" });
}

/** La fila del listado de un contacto, ubicada por su nombre. */
function fila(pagina: Page, nombre: string | RegExp): Locator {
  return pagina.getByRole("listitem").filter({ has: pagina.getByRole("button", { name: nombre }) });
}

async function agregarContacto(pagina: Page): Promise<Locator> {
  await pagina.getByRole("button", { name: "Agregar contacto" }).first().click();
  const formulario = dialogo(pagina, "Agregar contacto");
  await expect(formulario).toBeVisible();
  return formulario;
}

test.describe("el módulo vacío", () => {
  test("se llega desde el menú y explica cómo empezar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await irAContactos(page);

    await expect(page.getByRole("heading", { name: "Todavía no tenés contactos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Contactos" }).first()).toHaveAttribute(
      "aria-current",
      "page",
    );

    // El estado vacío ofrece el botón para empezar.
    await page.getByRole("button", { name: "Agregar mi primer contacto" }).click();
    await expect(dialogo(page, "Agregar contacto")).toBeVisible();
  });

  test("los widgets de la columna lateral invitan a cargar el primer contacto", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const columna = page.getByRole("complementary", { name: "Widgets" });
    await expect(columna.getByText("Todavía sin contactos")).toBeVisible();
  });
});

test.describe("agregar una persona", () => {
  test("con todos sus datos: queda en la lista y la ficha muestra todo", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Nombre", { exact: true }).fill("María");
    await formulario.getByLabel("Apellido").fill("Gómez");
    await formulario.getByLabel("Fecha de nacimiento").fill("1990-05-12");
    await formulario.getByLabel("Número 1").fill("099 123 456");
    await formulario.getByLabel("Correo 1", { exact: true }).fill("Maria@Ejemplo.com");
    await formulario.getByLabel("Dirección").fill("18 de Julio 1234");
    await formulario.getByLabel("Notas").fill("Le gusta el mate.");
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();

    // Al guardar se abre la ficha del contacto nuevo.
    const ficha = dialogo(page, "Contacto");
    await expect(ficha).toBeVisible();
    await expect(ficha.getByText("099 123 456")).toBeVisible();
    await expect(ficha.getByRole("link", { name: "099 123 456" })).toHaveAttribute(
      "href",
      "tel:099123456",
    );
    await expect(ficha.getByRole("link", { name: "maria@ejemplo.com" })).toHaveAttribute(
      "href",
      "mailto:maria@ejemplo.com",
    );
    await expect(ficha.getByText("12/05/1990")).toBeVisible();
    await expect(ficha.getByText("18 de Julio 1234")).toBeVisible();
    await expect(ficha.getByText("Le gusta el mate.")).toBeVisible();

    await ficha.getByRole("button", { name: "Cerrar" }).click();
    await expect(ficha).toBeHidden();
    await expect(fila(page, /María Gómez/)).toBeVisible();
  });

  test("con fecha de nacimiento ofrece crear el recordatorio del cumpleaños, marcado de entrada", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    const casilla = formulario.getByRole("checkbox", {
      name: "Crear un recordatorio de su cumpleaños",
    });
    // Sin fecha de nacimiento no hay nada que ofrecer.
    await expect(casilla).toHaveCount(0);

    await formulario.getByLabel("Nombre", { exact: true }).fill("María");
    await formulario.getByLabel("Fecha de nacimiento").fill(nacimientoEn(5));
    await expect(casilla).toBeChecked();

    // Si se borra la fecha, desaparece.
    await formulario.getByLabel("Fecha de nacimiento").fill("");
    await expect(casilla).toHaveCount(0);
    await formulario.getByLabel("Fecha de nacimiento").fill(nacimientoEn(5));

    await formulario.getByRole("button", { name: "Guardar contacto" }).click();
    const ficha = dialogo(page, "Contacto");
    await expect(ficha.getByText("Cumpleaños", { exact: true })).toBeVisible();
    await expect(ficha.getByText(/en 5 días/)).toBeVisible();
  });

  test("con la casilla desmarcada no se crea el recordatorio; en una empresa ni se ofrece", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Nombre", { exact: true }).fill("Beto");
    await formulario.getByLabel("Fecha de nacimiento").fill(nacimientoEn(5));
    await formulario.getByText("Crear un recordatorio de su cumpleaños").click();
    await expect(
      formulario.getByRole("checkbox", { name: "Crear un recordatorio de su cumpleaños" }),
    ).not.toBeChecked();
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();
    await expect(dialogo(page, "Contacto").getByText(/No tiene recordatorios/)).toBeVisible();
    await dialogo(page, "Contacto").getByRole("button", { name: "Cerrar" }).click();

    // En una empresa no hay fecha de nacimiento ni, por lo tanto, casilla.
    const deEmpresa = await agregarContacto(page);
    await deEmpresa.getByRole("radio", { name: "Empresa o servicio" }).click();
    await expect(deEmpresa.getByLabel("Fecha de nacimiento")).toHaveCount(0);
    await expect(deEmpresa.getByRole("checkbox", { name: /cumpleaños/ })).toHaveCount(0);
  });

  test("al editar no se ofrece el recordatorio del cumpleaños", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, { nombre: "Ana", fechaNacimiento: nacimientoEn(3) });
    await abrirContactos(page);

    await page.getByRole("button", { name: /Ana/ }).first().click();
    await dialogo(page, "Contacto").getByRole("button", { name: "Editar" }).click();
    const edicion = dialogo(page, "Editar contacto");
    await expect(edicion.getByLabel("Fecha de nacimiento")).toHaveValue(nacimientoEn(3));
    await expect(edicion.getByRole("checkbox", { name: /cumpleaños/ })).toHaveCount(0);
  });

  test("pide el nombre y avisa junto al campo si el teléfono o el correo no son válidos", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Número 1").fill("no es un número");
    await formulario.getByLabel("Correo 1", { exact: true }).fill("sin-arroba");
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();

    await expect(formulario.getByText("Escribí el nombre.")).toBeVisible();
    await expect(formulario.getByText("Usá solo números, espacios y + ( ) - .")).toBeVisible();
    await expect(formulario.getByText(/Revisá el correo/)).toBeVisible();
    // Nada se guardó y el formulario sigue abierto con lo escrito.
    await expect(formulario).toBeVisible();
    await expect(formulario.getByLabel("Número 1")).toHaveValue("no es un número");
  });

  test("las filas de teléfono y correo en blanco se ignoran, y se pueden agregar y quitar filas", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Nombre", { exact: true }).fill("Beto");
    await formulario.getByRole("button", { name: "Agregar teléfono" }).click();
    await formulario.getByRole("button", { name: "Agregar teléfono" }).click();
    await formulario.getByLabel("Número 2").fill("2900 0000");
    await expect(formulario.getByLabel("Número 3")).toBeVisible();
    await formulario.getByRole("button", { name: "Quitar el teléfono 3" }).click();
    await expect(formulario.getByLabel("Número 3")).toHaveCount(0);
    // El teléfono 1 queda en blanco: se descarta.
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();

    const ficha = dialogo(page, "Contacto");
    await expect(ficha.getByRole("link", { name: "2900 0000" })).toBeVisible();
    await expect(ficha.getByRole("link")).toHaveCount(1);
  });

  test("un error de un teléfono en la fila 2 se muestra en esa fila, aunque la 1 esté en blanco", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Nombre", { exact: true }).fill("Beto");
    await formulario.getByRole("button", { name: "Agregar teléfono" }).click();
    await formulario.getByLabel("Número 2").fill("xx");
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();

    const segunda = formulario.getByLabel("Número 2");
    await expect(segunda).toHaveAttribute("aria-invalid", "true");
    await expect(formulario.getByLabel("Número 1")).not.toHaveAttribute("aria-invalid", "true");
  });

  test("no deja guardar una fecha de nacimiento futura", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Nombre", { exact: true }).fill("Del futuro");
    await formulario.getByLabel("Fecha de nacimiento").fill("2999-01-01");
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();

    await expect(formulario.getByText(/no puede ser posterior a hoy/)).toBeVisible();
    await expect(formulario).toBeVisible();
  });
});

test.describe("agregar una empresa o servicio", () => {
  test("tiene sus propios campos y la ficha los muestra, con el sitio web como enlace", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByRole("radio", { name: "Empresa o servicio" }).click();
    // Una empresa no tiene apellido ni fecha de nacimiento.
    await expect(formulario.getByLabel("Apellido")).toHaveCount(0);
    await expect(formulario.getByLabel("Fecha de nacimiento")).toHaveCount(0);

    await formulario.getByLabel("Nombre de la empresa o servicio").fill("Ferretería Central");
    await formulario.getByLabel("Rubro").fill("Ferretería");
    await formulario.getByLabel("Número 1").fill("2411 1111");
    await formulario.getByLabel("Sitio web").fill("www.ferreteria.com.uy");
    await formulario.getByLabel("Horario de atención").fill("Lunes a viernes de 9 a 18");
    await formulario.getByLabel("RUT o documento").fill("21 234567 0012");
    await formulario.getByLabel("Persona de contacto").fill("Don Pedro");
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();

    const ficha = dialogo(page, "Contacto");
    await expect(ficha.getByText("Empresa o servicio")).toBeVisible();
    const web = ficha.getByRole("link", { name: "www.ferreteria.com.uy" });
    await expect(web).toHaveAttribute("href", "https://www.ferreteria.com.uy/");
    await expect(web).toHaveAttribute("target", "_blank");
    await expect(web).toHaveAttribute("rel", /noopener/);
    await expect(ficha.getByText("Lunes a viernes de 9 a 18")).toBeVisible();
    await expect(ficha.getByText("21 234567 0012")).toBeVisible();
    await expect(ficha.getByText("Don Pedro")).toBeVisible();
  });

  test("rechaza un sitio web que no es una dirección web", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByRole("radio", { name: "Empresa o servicio" }).click();
    await formulario.getByLabel("Nombre de la empresa o servicio").fill("Sospechosa");
    await formulario.getByLabel("Sitio web").fill("javascript:alert(1)");
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();

    await expect(formulario.getByText(/no parece válida/)).toBeVisible();
  });

  test("cambiar de persona a empresa en el formulario deja los campos limpios", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Nombre", { exact: true }).fill("Escrito antes");
    await formulario.getByRole("radio", { name: "Empresa o servicio" }).click();
    await expect(formulario.getByLabel("Nombre de la empresa o servicio")).toHaveValue("");
  });
});

test.describe("buscar y filtrar", () => {
  test("busca por nombre, teléfono y rubro, y filtra por tipo y favoritos", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, {
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "099 111 222",
      favorito: true,
    });
    await crearPersona(page, { nombre: "Beto", apellido: "Ruiz", telefono: "098 333 444" });
    await crearEmpresa(page, { nombre: "Electricidad Sur", rubro: "Electricista" });
    await abrirContactos(page);

    await expect(fila(page, /Ana Pérez/)).toBeVisible();
    await expect(fila(page, /Beto Ruiz/)).toBeVisible();
    await expect(fila(page, /Electricidad Sur/)).toBeVisible();

    const buscador = page.getByLabel("Buscar");
    await buscador.fill("ruiz");
    await expect(fila(page, /Beto Ruiz/)).toBeVisible();
    await expect(fila(page, /Ana Pérez/)).toHaveCount(0);

    await buscador.fill("111222");
    await expect(fila(page, /Ana Pérez/)).toBeVisible();
    await expect(fila(page, /Beto Ruiz/)).toHaveCount(0);

    await buscador.fill("electricista");
    await expect(fila(page, /Electricidad Sur/)).toBeVisible();

    await buscador.fill("nadie con este nombre");
    await expect(page.getByText("Ningún contacto coincide con la búsqueda.")).toBeVisible();

    await buscador.fill("");
    await page.getByRole("radio", { name: "Empresas" }).click();
    await expect(fila(page, /Electricidad Sur/)).toBeVisible();
    await expect(fila(page, /Ana Pérez/)).toHaveCount(0);

    await page.getByRole("radio", { name: "Favoritos" }).click();
    await expect(fila(page, /Ana Pérez/)).toBeVisible();
    await expect(fila(page, /Beto Ruiz/)).toHaveCount(0);
  });

  test("filtra por etiqueta", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const familia = await pedirApi<{ id: number }>(page, "POST", "/api/contactos/etiquetas", {
      nombre: "Familia",
    });
    await crearPersona(page, { nombre: "Ana", etiquetaIds: [familia.id] });
    await crearPersona(page, { nombre: "Beto" });
    await abrirContactos(page);

    await page.getByLabel("Etiqueta", { exact: true }).selectOption({ label: "Familia" });
    await expect(fila(page, /Ana/)).toBeVisible();
    await expect(fila(page, /Beto/)).toHaveCount(0);
  });

  test("los favoritos van primero y marcar uno se ve al instante", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, { nombre: "Abel" });
    await crearPersona(page, { nombre: "Zulema" });
    await abrirContactos(page);

    const nombres = () => page.locator("main ul > li > button:first-child").allTextContents();
    await expect(fila(page, /Abel/)).toBeVisible();
    expect((await nombres())[0]).toContain("Abel");

    const estrella = page.getByRole("button", { name: "Marcar a Zulema como favorito" });
    await estrella.click();
    await expect(
      page.getByRole("button", { name: "Quitar a Zulema de favoritos" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await nombres())[0]).toContain("Zulema");
  });
});

test.describe("editar y eliminar", () => {
  test("edita los datos y la ficha los refleja; el tipo no se puede cambiar", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, { nombre: "Ana", apellido: "Pérez", telefono: "099 111 222" });
    await abrirContactos(page);

    await page.getByRole("button", { name: /^Ana Pérez/ }).click();
    await dialogo(page, "Contacto").getByRole("button", { name: "Editar", exact: true }).click();

    const edicion = dialogo(page, "Editar contacto");
    await expect(edicion).toBeVisible();
    await expect(edicion.getByRole("radio")).toHaveCount(0);
    await expect(edicion.getByLabel("Nombre", { exact: true })).toHaveValue("Ana");
    await edicion.getByLabel("Nombre", { exact: true }).fill("Ana María");
    await edicion.getByLabel("Número 1").fill("2900 0000");
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();

    const ficha = dialogo(page, "Contacto");
    await expect(ficha.getByRole("link", { name: "2900 0000" })).toBeVisible();
    await ficha.getByRole("button", { name: "Cerrar" }).click();
    await expect(fila(page, /Ana María Pérez/)).toBeVisible();
  });

  test("eliminar pide confirmación, se puede cancelar y después el contacto desaparece", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    await abrirContactos(page);

    await page
      .getByRole("button", { name: /Ana Pérez/ })
      .first()
      .click();
    await dialogo(page, "Contacto").getByRole("button", { name: "Eliminar", exact: true }).click();

    const confirmacion = dialogo(page, "Eliminar contacto");
    await expect(confirmacion.getByText(/Se elimina a Ana Pérez/)).toBeVisible();

    // Cancelar vuelve a la ficha y no borra nada.
    await confirmacion.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo(page, "Contacto")).toBeVisible();
    await dialogo(page, "Contacto").getByRole("button", { name: "Eliminar", exact: true }).click();
    await dialogo(page, "Eliminar contacto")
      .getByRole("button", { name: "Eliminar", exact: true })
      .click();

    await expect(dialogo(page, "Eliminar contacto")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Todavía no tenés contactos" })).toBeVisible();
  });
});

test.describe("recordatorios", () => {
  test("el cumpleaños se sugiere con la fecha de nacimiento y aparece en la ficha y en la pestaña Recordatorios", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    // Cumple dentro de 3 días: el año de nacimiento es 1990.
    const nacimiento = nacimientoEn(3);
    await crearPersona(page, { nombre: "Ana", apellido: "Pérez", fechaNacimiento: nacimiento });
    await abrirContactos(page);

    await page
      .getByRole("button", { name: /Ana Pérez/ })
      .first()
      .click();
    const ficha = dialogo(page, "Contacto");
    await expect(ficha.getByText(/No tiene recordatorios/)).toBeVisible();
    await ficha.getByRole("button", { name: "Agregar", exact: true }).click();

    // Un toque en "Cumpleaños" completa título, repetición y la fecha de nacimiento.
    await ficha.getByRole("button", { name: "Cumpleaños", exact: true }).click();
    await expect(ficha.getByLabel("¿De qué te tenemos que acordar?")).toHaveValue("Cumpleaños");
    await expect(ficha.getByLabel("Se repite")).toHaveValue("anual");
    // ...y el día y el mes de la fecha de nacimiento.
    const [, mesDeNacimiento, diaDeNacimiento] = nacimiento.split("-").map(Number);
    await expect(ficha.getByLabel("Día", { exact: true })).toHaveValue(String(diaDeNacimiento));
    await expect(ficha.getByLabel("Mes", { exact: true })).toHaveValue(String(mesDeNacimiento));
    await ficha.getByRole("button", { name: "Agregar recordatorio" }).click();

    await expect(ficha.getByText("Cumpleaños", { exact: true })).toBeVisible();
    await expect(ficha.getByText(/en 3 días/)).toBeVisible();
    await expect(
      ficha.getByText(`Cada ${diaDeNacimiento} de ${MESES[(mesDeNacimiento ?? 1) - 1]}`),
    ).toBeVisible();

    // Ya existe: no se vuelve a sugerir.
    await ficha.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(ficha.getByRole("button", { name: "Cumpleaños", exact: true })).toHaveCount(0);
    await ficha.getByRole("button", { name: "Cancelar" }).click();
    await ficha.getByRole("button", { name: "Cerrar" }).click();

    await page.getByRole("tab", { name: "Recordatorios" }).click();
    await expect(page.getByRole("heading", { name: "Esta semana" })).toBeVisible();
    const aviso = page.getByRole("tabpanel").getByRole("button", { name: /^Cumpleaños/ });
    await expect(aviso).toContainText("en 3 días");
    await expect(aviso).toContainText("Ana Pérez");
  });

  test("en la pestaña Recordatorios el botón es 'Agregar recordatorio' y pide el contacto", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, {
      nombre: "Ana",
      apellido: "Pérez",
      fechaNacimiento: nacimientoEn(3),
    });
    await crearPersona(page, { nombre: "Beto" });
    await abrirContactos(page);

    // En Contactos sigue el de siempre; en Recordatorios cambia.
    await expect(page.getByRole("button", { name: "Agregar contacto" })).toBeVisible();
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    await expect(page.getByRole("button", { name: "Agregar contacto" })).toHaveCount(0);
    await page.getByRole("button", { name: "Agregar recordatorio" }).click();

    const nuevo = dialogo(page, "Agregar recordatorio");
    await expect(nuevo).toBeVisible();
    // Hasta que no se elige el contacto no hay formulario.
    await expect(nuevo.getByLabel("¿De qué te tenemos que acordar?")).toHaveCount(0);
    await nuevo.getByLabel("¿De qué contacto?").selectOption({ label: "Ana Pérez" });

    // Con el contacto elegido aparecen sus sugerencias, como en su ficha.
    await nuevo.getByRole("button", { name: "Cumpleaños", exact: true }).click();
    await expect(nuevo.getByLabel("Se repite")).toHaveValue("anual");
    await nuevo.getByRole("button", { name: "Agregar recordatorio" }).click();
    await expect(nuevo).toBeHidden();

    // Queda en la lista, sin salir de la pestaña.
    const recordatorio = page.getByRole("tabpanel").getByRole("button", { name: /^Cumpleaños/ });
    await expect(recordatorio).toContainText("Ana Pérez");
    await expect(recordatorio).toContainText("en 3 días");
  });

  test("los de una sola vez que pasaron quedan en 'Pasados', con el más reciente primero, y se eliminan con confirmación", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    const ana = await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    await pedirApi(page, "POST", `/api/contactos/${ana}/recordatorios`, {
      titulo: "Cita médica",
      repeticion: "unica",
      fecha: diaDeCalendario(3),
      hora: "",
    });
    await sembrarRecordatoriosPasadosDePrueba(cuenta.email, ana, [
      { titulo: "Renovar seguro", fecha: diaDeCalendario(-40) },
      { titulo: "Llamar al plomero", fecha: diaDeCalendario(-1) },
      { titulo: "Pagar la luz", fecha: diaDeCalendario(-3) },
    ]);
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    const panel = page.getByRole("tabpanel");

    // Por defecto, los próximos: el pasado no aparece.
    await expect(panel.getByRole("button", { name: /^Cita médica/ })).toBeVisible();
    await expect(panel.getByText("Llamar al plomero")).toHaveCount(0);

    await panel.getByRole("radio", { name: "Pasados" }).click();
    await expect(panel.getByRole("button", { name: /^Cita médica/ })).toHaveCount(0);
    await expect(panel.getByRole("heading", { name: "Ayer" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "La última semana" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Antes" })).toBeVisible();
    // Cuánto hace que pasó cada uno, el más reciente primero.
    const filas = panel.getByRole("listitem");
    await expect(filas).toHaveCount(3);
    await expect(filas.nth(0)).toContainText("Llamar al plomero");
    await expect(filas.nth(0)).toContainText("ayer");
    await expect(filas.nth(1)).toContainText("Pagar la luz");
    await expect(filas.nth(1)).toContainText("hace 3 días");
    await expect(filas.nth(2)).toContainText("Renovar seguro");
    await expect(filas.nth(2)).toContainText("hace 40 días");

    // Tocar uno abre la ficha de su contacto.
    await panel.getByRole("button", { name: /^Llamar al plomero/ }).click();
    await expect(dialogo(page, "Contacto")).toBeVisible();
    await dialogo(page, "Contacto").getByRole("button", { name: "Cerrar" }).click();

    // Eliminar pide confirmación; "No" lo deja como estaba.
    const eliminar = panel.getByRole("button", {
      name: /^Eliminar del historial: Pagar la luz/,
    });
    await eliminar.click();
    await panel.getByRole("button", { name: "No", exact: true }).click();
    await expect(filas).toHaveCount(3);
    await eliminar.click();
    await panel.getByRole("button", { name: "Sí", exact: true }).click();
    await expect(filas).toHaveCount(2);
    await expect(panel.getByText("Pagar la luz")).toHaveCount(0);

    // Sin accesibilidad rota en el histórico.
    await page.waitForTimeout(TRANSICION_MS);
    const resultado = await new AxeBuilder({ page }).analyze();
    expect(resultado.violations).toEqual([]);
  });

  test("uno que se repite deja una entrada por cada vez que cayó y sigue vivo; el historial se vacía sin tocar los recordatorios", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    const ana = await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    await sembrarRecordatorioDiarioAntiguoDePrueba(
      cuenta.email,
      ana,
      "Tomar la pastilla",
      3,
      diaDeCalendario(),
    );
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    const panel = page.getByRole("tabpanel");

    // El principal está en Próximos.
    await expect(panel.getByRole("button", { name: /^Tomar la pastilla/ })).toContainText("hoy");

    await panel.getByRole("radio", { name: "Pasados" }).click();
    const filas = panel.getByRole("listitem");
    await expect(filas).toHaveCount(3);
    await expect(filas.nth(0)).toContainText("ayer");
    await expect(filas.nth(1)).toContainText("hace 2 días");
    await expect(filas.nth(2)).toContainText("hace 3 días");
    await expect(filas.nth(0)).toContainText("Todos los días");

    // Eliminar una entrada suelta no toca el recordatorio ni vuelve a aparecer.
    await filas
      .nth(1)
      .getByRole("button", { name: /^Eliminar del historial/ })
      .click();
    await filas.nth(1).getByRole("button", { name: "Sí", exact: true }).click();
    await expect(filas).toHaveCount(2);
    await page.reload();
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    await panel.getByRole("radio", { name: "Pasados" }).click();
    await expect(filas).toHaveCount(2);

    // Vaciar todo: el aviso explica que los recordatorios no se borran.
    await panel.getByRole("button", { name: "Vaciar historial" }).click();
    const aviso = dialogo(page, "Vaciar el historial");
    await expect(aviso).toBeVisible();
    await expect(aviso.getByText("Tus recordatorios no se borran.")).toBeVisible();
    await aviso.getByRole("button", { name: "Cancelar" }).click();
    await expect(aviso).toBeHidden();
    await expect(filas).toHaveCount(2);

    await panel.getByRole("button", { name: "Vaciar historial" }).click();
    await aviso.getByRole("button", { name: "Vaciar historial" }).click();
    await expect(aviso).toBeHidden();
    await expect(panel.getByText("El historial está vacío")).toBeVisible();

    // El recordatorio principal sigue vivo.
    await panel.getByRole("radio", { name: "Próximos" }).click();
    await expect(panel.getByRole("button", { name: /^Tomar la pastilla/ })).toBeVisible();
  });

  test("un recordatorio importante lleva el distintivo, sin cambiar el orden, en la pestaña y en la ficha", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    const ana = await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    const nuevo = (datos: unknown) =>
      pedirApi(page, "POST", `/api/contactos/${ana}/recordatorios`, datos);
    // Los dos caen esta semana: el común antes y el importante después.
    await nuevo({
      titulo: "Común primero",
      repeticion: "unica",
      fecha: diaDeCalendario(1),
      hora: "",
    });
    await nuevo({
      titulo: "Importante después",
      repeticion: "unica",
      fecha: diaDeCalendario(5),
      hora: "",
      importante: true,
    });
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    const panel = page.getByRole("tabpanel");

    const semana = panel.getByRole("region", { name: "Esta semana" });
    await expect(semana.locator("[data-distintivo='importante']")).toHaveCount(1);
    const botones = semana.getByRole("listitem");
    // Sigue el orden por fecha: el común (mañana) antes que el importante (dentro de 5 días).
    await expect(botones.first()).toContainText("Común primero");
    await expect(botones.nth(1)).toContainText("Importante después");
    await expect(botones.nth(1).locator("[data-distintivo='importante']")).toBeVisible();

    // En la ficha del contacto también.
    await botones
      .first()
      .getByRole("button", { name: /^Común primero/ })
      .click();
    const ficha = dialogo(page, "Contacto");
    await expect(ficha.locator("[data-distintivo='importante']")).toHaveCount(1);
    await expect(ficha.getByRole("listitem").first()).toContainText("Común primero");
    await expect(ficha.getByRole("listitem").nth(1)).toContainText("Importante después");
  });

  test("se marca como importante al agregar un recordatorio desde la pestaña, y al editar se quita", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const ana = await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    await page.getByRole("button", { name: "Agregar recordatorio" }).click();

    const nuevo = dialogo(page, "Agregar recordatorio");
    await nuevo.getByLabel("¿De qué contacto?").selectOption({ label: "Ana Pérez" });
    await nuevo.getByLabel("¿De qué te tenemos que acordar?").fill("Renovar el pasaporte");
    const casilla = nuevo.getByRole("checkbox", { name: "Marcar como importante" });
    await expect(casilla).not.toBeChecked();
    await nuevo.getByText("Marcar como importante").click();
    await nuevo.getByRole("button", { name: "Agregar recordatorio" }).click();
    await expect(nuevo).toBeHidden();

    const panel = page.getByRole("tabpanel");
    await expect(
      panel
        .getByRole("button", { name: /^Renovar el pasaporte/ })
        .locator("[data-distintivo='importante']"),
    ).toBeVisible();

    // Editarlo desde la ficha: viene marcado y se puede sacar.
    await pedirApi(page, "GET", `/api/contactos/${ana}`);
    await panel.getByRole("button", { name: /^Renovar el pasaporte/ }).click();
    const ficha = dialogo(page, "Contacto");
    await ficha
      .getByRole("button", { name: "Editar el recordatorio Renovar el pasaporte" })
      .click();
    const edicion = ficha.getByRole("checkbox", { name: "Marcar como importante" });
    await expect(edicion).toBeChecked();
    await ficha.getByText("Marcar como importante").click();
    await ficha.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(ficha.locator("[data-distintivo='importante']")).toHaveCount(0);
  });

  test("el historial guarda el distintivo de lo que era importante", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    const ana = await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    await sembrarRecordatoriosPasadosDePrueba(cuenta.email, ana, [
      { titulo: "Era importante", fecha: diaDeCalendario(-2), importante: true },
      { titulo: "Era común", fecha: diaDeCalendario(-3) },
    ]);
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    const panel = page.getByRole("tabpanel");
    await panel.getByRole("radio", { name: "Pasados" }).click();
    const filas = panel.getByRole("listitem");
    await expect(filas).toHaveCount(2);
    await expect(
      filas.filter({ hasText: "Era importante" }).locator("[data-distintivo='importante']"),
    ).toBeVisible();
    await expect(
      filas.filter({ hasText: "Era común" }).locator("[data-distintivo='importante']"),
    ).toHaveCount(0);
  });

  test("los próximos se editan y se eliminan desde la pestaña, sin entrar a la ficha", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const ana = await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    await pedirApi(page, "POST", `/api/contactos/${ana}/recordatorios`, {
      titulo: "Llamar al plomero",
      repeticion: "unica",
      fecha: diaDeCalendario(3),
      hora: "",
    });
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    const panel = page.getByRole("tabpanel");
    const fila = panel.getByRole("listitem").filter({ hasText: "Llamar al plomero" });
    await expect(fila).toBeVisible();

    // Con mouse, las acciones están ocultas hasta apuntar a la fila (como en la lista de movimientos de Finanzas).
    const acciones = fila.locator("[data-acciones-de-fila]");
    await expect(acciones).toHaveCSS("opacity", "0");
    await fila.hover();
    await expect(acciones).toHaveCSS("opacity", "1");

    // Editar: abre el formulario con lo que ya tiene, en un diálogo.
    await fila.getByRole("button", { name: "Editar el recordatorio Llamar al plomero" }).click();
    const edicion = dialogo(page, "Editar recordatorio");
    await expect(edicion).toBeVisible();
    const titulo = edicion.getByLabel("¿De qué te tenemos que acordar?");
    await expect(titulo).toHaveValue("Llamar al plomero");
    await expect(edicion.getByLabel("El día")).toHaveValue(diaDeCalendario(3));
    await titulo.fill("Llamar al electricista");
    await edicion.getByText("Marcar como importante").click();
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edicion).toBeHidden();

    // La lista ya muestra el cambio.
    const editada = panel.getByRole("listitem").filter({ hasText: "Llamar al electricista" });
    await expect(editada).toBeVisible();
    await expect(editada.locator("[data-distintivo='importante']")).toBeVisible();
    await expect(panel.getByText("Llamar al plomero")).toHaveCount(0);

    // Eliminar: pide confirmación; "No" lo deja.
    const eliminar = editada.getByRole("button", {
      name: "Eliminar el recordatorio Llamar al electricista",
    });
    await eliminar.click();
    await editada.getByRole("button", { name: "No", exact: true }).click();
    await expect(editada).toBeVisible();
    await eliminar.click();
    await editada.getByRole("button", { name: "Sí", exact: true }).click();
    await expect(panel.getByText("Llamar al electricista")).toHaveCount(0);
    await expect(panel.getByText("No tenés recordatorios")).toBeVisible();
  });

  test("sin pasados, la pestaña lo explica", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    await page.getByRole("radio", { name: "Pasados" }).click();
    await expect(page.getByText("El historial está vacío")).toBeVisible();
    // Sin nada que borrar, el botón está deshabilitado.
    await expect(page.getByRole("button", { name: "Vaciar historial" })).toBeDisabled();
  });

  test("filtra por texto, contacto y repetición, cuenta los filtros y los limpia", async ({
    page,
  }) => {
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    const ana = await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    const seguros = await crearEmpresa(page, { nombre: "Seguros Sur" });
    const nuevo = (contacto: string, datos: unknown) =>
      pedirApi(page, "POST", `/api/contactos/${contacto}/recordatorios`, datos);
    await nuevo(ana, {
      titulo: "Cita médica",
      repeticion: "unica",
      fecha: diaDeCalendario(3),
      hora: "",
    });
    await nuevo(ana, {
      titulo: "Cumpleaños",
      repeticion: "anual",
      diaDelMes: 2,
      mes: 11,
      hora: "",
    });
    await nuevo(seguros, {
      titulo: "Pagar la cuota",
      repeticion: "mensual",
      diaDelMes: 5,
      hora: "",
    });
    await sembrarRecordatoriosPasadosDePrueba(cuenta.email, seguros, [
      { titulo: "Renovar seguro", fecha: diaDeCalendario(-2) },
    ]);
    await sembrarRecordatoriosPasadosDePrueba(cuenta.email, ana, [
      { titulo: "Llamar al plomero", fecha: diaDeCalendario(-2) },
    ]);
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    const panel = page.getByRole("tabpanel");
    const botones = panel.getByRole("listitem");
    await expect(botones).toHaveCount(3);

    // Texto: en el título...
    await panel.getByLabel("Buscar").fill("cita");
    await expect(botones).toHaveCount(1);
    await expect(panel.getByText("1 filtro puesto")).toBeVisible();
    // ...o en el nombre del contacto, sin importar mayúsculas.
    await panel.getByLabel("Buscar").fill("SEGUROS");
    await expect(botones).toHaveCount(1);
    await expect(botones.first()).toContainText("Pagar la cuota");

    // Limpiar vuelve a todo y quita el contador.
    await panel.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect(panel.getByLabel("Buscar")).toHaveValue("");
    await expect(botones).toHaveCount(3);
    await expect(panel.getByRole("button", { name: "Limpiar filtros" })).toHaveCount(0);

    // Contacto + repetición se combinan.
    await panel.getByLabel("Contacto").selectOption({ label: "Ana Pérez" });
    await expect(botones).toHaveCount(2);
    await panel.getByLabel("Se repite").selectOption("anual");
    await expect(botones).toHaveCount(1);
    await expect(botones.first()).toContainText("Cumpleaños");
    await expect(panel.getByText("2 filtros puestos")).toBeVisible();

    // Sin coincidencias, lo dice.
    await panel.getByLabel("Buscar").fill("zzz");
    await expect(panel.getByText("Ningún recordatorio coincide con los filtros.")).toBeVisible();

    // En Pasados los filtros siguen: se filtra por contacto y por cómo se repite el recordatorio de origen.
    await panel.getByRole("button", { name: "Limpiar filtros" }).click();
    await panel.getByRole("radio", { name: "Pasados" }).click();
    const filas = panel.getByRole("listitem");
    await expect(filas).toHaveCount(2);
    await panel.getByLabel("Se repite").selectOption("anual");
    await expect(
      panel.getByText("Ninguna entrada del historial coincide con los filtros."),
    ).toBeVisible();
    await panel.getByLabel("Se repite").selectOption("unica");
    await expect(filas).toHaveCount(2);
    await panel.getByLabel("Contacto").selectOption({ label: "Seguros Sur" });
    await expect(filas).toHaveCount(1);
    await expect(filas.first()).toContainText("Renovar seguro");
  });

  test("sin contactos, 'Agregar recordatorio' explica que primero hace falta uno", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    await page.getByRole("button", { name: "Agregar recordatorio" }).click();
    await expect(
      dialogo(page, "Agregar recordatorio").getByText(/Primero agregá uno en la pestaña Contactos/),
    ).toBeVisible();
  });

  test("uno de una sola vez en el pasado se rechaza junto a la fecha; con repetición se acepta", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, { nombre: "Ana" });
    await abrirContactos(page);

    await page.getByRole("button", { name: /Ana/ }).first().click();
    const ficha = dialogo(page, "Contacto");
    await ficha.getByRole("button", { name: "Agregar", exact: true }).click();
    await ficha.getByLabel("¿De qué te tenemos que acordar?").fill("Llamarle");
    await ficha.getByLabel("El día").fill("2020-01-01");
    await ficha.getByRole("button", { name: "Agregar recordatorio" }).click();
    await expect(ficha.getByText(/Ese día ya pasó/)).toBeVisible();

    // Cambiar a una repetición lo hace válido: empieza en el pasado y avisa a partir de hoy.
    await ficha.getByLabel("Se repite").selectOption("anual");
    await ficha.getByRole("button", { name: "Agregar recordatorio" }).click();
    await expect(ficha.getByRole("list").getByText("Llamarle")).toBeVisible();
  });

  test("edita y elimina un recordatorio, con confirmación", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const id = await crearPersona(page, { nombre: "Ana" });
    await pedirApi(page, "POST", `/api/contactos/${id}/recordatorios`, {
      titulo: "Llamarle",
      fecha: diaDeCalendario(5),
      repeticion: "unica",
      hora: "",
    });
    await abrirContactos(page);

    await page.getByRole("button", { name: /Ana/ }).first().click();
    const ficha = dialogo(page, "Contacto");
    await expect(ficha.getByText(/en 5 días/)).toBeVisible();

    await ficha.getByRole("button", { name: "Editar el recordatorio Llamarle" }).click();
    await ficha.getByLabel("¿De qué te tenemos que acordar?").fill("Llamarle por el regalo");
    await ficha.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(ficha.getByText("Llamarle por el regalo")).toBeVisible();

    await ficha
      .getByRole("button", { name: "Eliminar el recordatorio Llamarle por el regalo" })
      .click();
    await expect(ficha.getByText("¿Eliminar?")).toBeVisible();
    await ficha.getByRole("button", { name: "No", exact: true }).click();
    await expect(ficha.getByText("Llamarle por el regalo")).toBeVisible();

    await ficha
      .getByRole("button", { name: "Eliminar el recordatorio Llamarle por el regalo" })
      .click();
    await ficha.getByRole("button", { name: "Sí", exact: true }).click();
    await expect(ficha.getByText(/No tiene recordatorios/)).toBeVisible();
  });

  test("uno de hoy aparece como aviso en los widgets de Contactos y en el resumen del inicio", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    const id = await crearPersona(page, { nombre: "Ana", apellido: "Pérez" });
    await pedirApi(page, "POST", `/api/contactos/${id}/recordatorios`, {
      titulo: "Pagar la cuota",
      fecha: diaDeCalendario(0),
      repeticion: "unica",
      hora: "18:00",
    });

    // Pantalla de inicio: el resumen de Contactos lo avisa.
    await page.goto("/inicio");
    await page.getByRole("tab", { name: "Contactos" }).click();
    const aviso = page.locator("[data-resumen='contactos'] [data-aviso]");
    await expect(aviso).toContainText("Recordatorio de hoy");
    await expect(aviso).toContainText(/Pagar la cuota a las 18:00 \(Ana Pérez\)/);

    // Columna lateral de la pantalla de Contactos.
    await abrirContactos(page);
    const columna = page.getByRole("complementary", { name: "Widgets" });
    await expect(columna.getByText("Recordatorio de hoy")).toBeVisible();
    await expect(columna.getByRole("region")).not.toHaveCount(0);
  });
});

test.describe("lo que se pide según cada cuánto se repite", () => {
  async function abrirFormularioDeRecordatorio(page: Page): Promise<Locator> {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, { nombre: "Ana" });
    await abrirContactos(page);
    await page.getByRole("button", { name: /Ana/ }).first().click();
    const ficha = dialogo(page, "Contacto");
    await ficha.getByRole("button", { name: "Agregar", exact: true }).click();
    await ficha.getByLabel("¿De qué te tenemos que acordar?").fill("Aviso");
    return ficha;
  }

  test("cada repetición muestra solo el campo de tiempo que le corresponde", async ({ page }) => {
    const ficha = await abrirFormularioDeRecordatorio(page);
    const repite = ficha.getByLabel("Se repite");

    // Una sola vez: el día y, si quiere, la hora.
    await expect(ficha.getByLabel("El día")).toBeVisible();
    await expect(ficha.getByLabel("Hora (opcional)")).toBeVisible();
    await expect(ficha.getByLabel("Día de la semana")).toHaveCount(0);

    // Todos los días: solo la hora, y obligatoria.
    await repite.selectOption("diaria");
    await expect(ficha.getByLabel("¿A qué hora?")).toHaveValue("09:00");
    await expect(ficha.getByLabel("El día")).toHaveCount(0);
    await expect(ficha.getByLabel("Hora (opcional)")).toHaveCount(0);
    await expect(ficha.getByLabel("Día de la semana")).toHaveCount(0);

    // Todas las semanas: el día de la semana.
    await repite.selectOption("semanal");
    await expect(ficha.getByLabel("Día de la semana").locator("option")).toHaveText([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
    await expect(ficha.getByLabel("¿A qué hora?")).toHaveCount(0);
    await expect(ficha.getByLabel("Hora (opcional)")).toBeVisible();

    // Todos los meses: el día del mes, de 1 a 31.
    await repite.selectOption("mensual");
    await expect(ficha.getByLabel("Día del mes").locator("option")).toHaveCount(31);
    await expect(ficha.getByLabel("Día de la semana")).toHaveCount(0);
    await expect(ficha.getByText(/avisa el último día del mes/)).toBeVisible();

    // Todos los años: el día y el mes.
    await repite.selectOption("anual");
    await expect(ficha.getByLabel("Día", { exact: true })).toBeVisible();
    await expect(ficha.getByLabel("Mes", { exact: true }).locator("option")).toHaveCount(12);
    await expect(ficha.getByLabel("Día del mes")).toHaveCount(0);

    // Y volver a una sola vez trae de nuevo la fecha.
    await repite.selectOption("unica");
    await expect(ficha.getByLabel("El día")).toBeVisible();
  });

  test("guarda y describe cada repetición con lo que se eligió", async ({ page }) => {
    const ficha = await abrirFormularioDeRecordatorio(page);
    const guardar = ficha.getByRole("button", { name: "Agregar recordatorio" });

    await ficha.getByLabel("Se repite").selectOption("diaria");
    await ficha.getByLabel("¿A qué hora?").fill("08:30");
    await guardar.click();
    await expect(ficha.getByText(/Todos los días a las 08:30/)).toBeVisible();

    await ficha.getByRole("button", { name: "Agregar", exact: true }).click();
    await ficha.getByLabel("¿De qué te tenemos que acordar?").fill("Semanal");
    await ficha.getByLabel("Se repite").selectOption("semanal");
    await ficha.getByLabel("Día de la semana").selectOption("1");
    await guardar.click();
    await expect(ficha.getByText(/Todos los lunes/)).toBeVisible();

    await ficha.getByRole("button", { name: "Agregar", exact: true }).click();
    await ficha.getByLabel("¿De qué te tenemos que acordar?").fill("Mensual");
    await ficha.getByLabel("Se repite").selectOption("mensual");
    await ficha.getByLabel("Día del mes").selectOption("15");
    await ficha.getByLabel("Hora (opcional)").fill("10:00");
    await guardar.click();
    await expect(ficha.getByText(/El día 15 de cada mes a las 10:00/)).toBeVisible();

    await ficha.getByRole("button", { name: "Agregar", exact: true }).click();
    await ficha.getByLabel("¿De qué te tenemos que acordar?").fill("Anual");
    await ficha.getByLabel("Se repite").selectOption("anual");
    await ficha.getByLabel("Día", { exact: true }).selectOption("12");
    await ficha.getByLabel("Mes", { exact: true }).selectOption("5");
    await guardar.click();
    await expect(ficha.getByText(/Cada 12 de mayo/)).toBeVisible();
  });

  test("todos los días exige la hora y avisa junto al campo", async ({ page }) => {
    const ficha = await abrirFormularioDeRecordatorio(page);
    await ficha.getByLabel("Se repite").selectOption("diaria");
    await ficha.getByLabel("¿A qué hora?").fill("");
    await ficha.getByRole("button", { name: "Agregar recordatorio" }).click();

    await expect(ficha.getByText("Elegí a qué hora.")).toBeVisible();
    await expect(ficha.getByLabel("¿A qué hora?")).toHaveAttribute("aria-invalid", "true");
  });

  test("el 30 de febrero se rechaza en uno anual", async ({ page }) => {
    const ficha = await abrirFormularioDeRecordatorio(page);
    await ficha.getByLabel("Se repite").selectOption("anual");
    await ficha.getByLabel("Día", { exact: true }).selectOption("30");
    await ficha.getByLabel("Mes", { exact: true }).selectOption("2");
    await ficha.getByRole("button", { name: "Agregar recordatorio" }).click();

    await expect(ficha.getByText("Ese mes no tiene ese día.")).toBeVisible();
  });

  test("al editar uno semanal el formulario trae el día de la semana que tenía", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const id = await crearPersona(page, { nombre: "Ana" });
    await pedirApi(page, "POST", `/api/contactos/${id}/recordatorios`, {
      titulo: "Regar",
      repeticion: "semanal",
      diaSemana: 4,
      hora: "07:15",
    });
    await abrirContactos(page);
    await page.getByRole("button", { name: /Ana/ }).first().click();
    const ficha = dialogo(page, "Contacto");
    await expect(ficha.getByText(/Todos los jueves a las 07:15/)).toBeVisible();

    await ficha.getByRole("button", { name: "Editar el recordatorio Regar" }).click();
    await expect(ficha.getByLabel("Se repite")).toHaveValue("semanal");
    await expect(ficha.getByLabel("Día de la semana")).toHaveValue("4");
    await expect(ficha.getByLabel("Hora (opcional)")).toHaveValue("07:15");
  });
});

test.describe("color del avatar según las etiquetas", () => {
  /** El color de fondo real del avatar (el círculo con las iniciales) que hay dentro de un elemento. */
  async function colorDelAvatar(contenedor: Locator): Promise<string> {
    return await contenedor
      .locator("span[aria-hidden='true']")
      .first()
      .evaluate((elemento) => getComputedStyle(elemento).backgroundColor);
  }

  test("en Recordatorios, cada avatar tiene el mismo color que en el listado de contactos", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const familia = await pedirApi<{ id: number }>(page, "POST", "/api/contactos/etiquetas", {
      nombre: "Familia",
      color: "#cf1754",
    });
    const amigos = await pedirApi<{ id: number }>(page, "POST", "/api/contactos/etiquetas", {
      nombre: "Amigos",
      color: "#17b0cf",
    });

    const contactos = [
      { nombre: "Ana", etiquetaIds: [familia.id] },
      { nombre: "Beto", etiquetaIds: [familia.id, amigos.id] },
      { nombre: "Carla", etiquetaIds: [] },
    ];
    for (const [indice, datos] of contactos.entries()) {
      const id = await crearPersona(page, datos);
      await pedirApi(page, "POST", `/api/contactos/${id}/recordatorios`, {
        titulo: `Aviso de ${datos.nombre}`,
        repeticion: "unica",
        fecha: diaDeCalendario(indice + 1),
        hora: "",
      });
    }

    await abrirContactos(page);
    const enElListado: Record<string, string> = {};
    for (const { nombre } of contactos) {
      enElListado[nombre] = await colorDelAvatar(fila(page, new RegExp(nombre)));
    }
    // Una sola etiqueta: el color de la etiqueta. Dos: la mezcla. Ninguna: el acento de siempre.
    expect(enElListado.Ana).toBe("rgb(207, 23, 84)");
    expect(enElListado.Beto).not.toBe(enElListado.Ana);
    expect(enElListado.Beto).not.toBe(enElListado.Carla);

    await page.getByRole("tab", { name: "Recordatorios" }).click();
    for (const { nombre } of contactos) {
      const aviso = page
        .getByRole("tabpanel")
        .getByRole("button", { name: new RegExp(`^Aviso de ${nombre}`) });
      await expect(aviso).toBeVisible();
      expect(await colorDelAvatar(aviso), nombre).toBe(enElListado[nombre]);
    }
  });

  test("el color se actualiza en Recordatorios al cambiar las etiquetas del contacto", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    const familia = await pedirApi<{ id: number }>(page, "POST", "/api/contactos/etiquetas", {
      nombre: "Familia",
      color: "#cf1754",
    });
    const id = await crearPersona(page, { nombre: "Ana" });
    await pedirApi(page, "POST", `/api/contactos/${id}/recordatorios`, {
      titulo: "Aviso de Ana",
      repeticion: "unica",
      fecha: diaDeCalendario(1),
      hora: "",
    });
    await abrirContactos(page);
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    const aviso = page.getByRole("tabpanel").getByRole("button", { name: /^Aviso de Ana/ });
    const sinEtiqueta = await colorDelAvatar(aviso);

    await pedirApi(page, "PUT", `/api/contactos/${id}`, {
      tipo: "persona",
      nombre: "Ana",
      apellido: "",
      fechaNacimiento: "",
      telefonos: [],
      correos: [],
      direccion: "",
      notas: "",
      favorito: false,
      etiquetaIds: [familia.id],
    });
    await page.reload();
    await page.getByRole("tab", { name: "Recordatorios" }).click();
    const conEtiqueta = await colorDelAvatar(
      page.getByRole("tabpanel").getByRole("button", { name: /^Aviso de Ana/ }),
    );
    expect(conEtiqueta).toBe("rgb(207, 23, 84)");
    expect(conEtiqueta).not.toBe(sinEtiqueta);
  });
});

test.describe("etiquetas por defecto", () => {
  test("una cuenta nueva ya tiene Familia, Amigos, Trabajo y Servicios, y se pueden usar y eliminar", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada({ conEtiquetasIniciales: true }));
    await abrirContactos(page);

    await page.getByRole("tab", { name: "Etiquetas" }).click();
    const panel = page.getByRole("tabpanel");
    for (const nombre of ["Familia", "Amigos", "Trabajo", "Servicios"]) {
      await expect(panel.getByText(nombre, { exact: true })).toBeVisible();
    }
    await expect(panel.getByText("Todavía no tenés etiquetas.")).toHaveCount(0);

    // Se ofrecen al crear un contacto, sin tener que crearlas antes.
    await page.getByRole("tab", { name: "Contactos" }).click();
    const formulario = await agregarContacto(page);
    for (const nombre of ["Familia", "Amigos", "Trabajo", "Servicios"]) {
      await expect(formulario.getByRole("button", { name: nombre })).toBeVisible();
    }
    await formulario.getByRole("button", { name: "Cancelar" }).click();

    // Se pueden eliminar, y al recargar no vuelven.
    await page.getByRole("tab", { name: "Etiquetas" }).click();
    for (const nombre of ["Familia", "Amigos", "Trabajo", "Servicios"]) {
      await page.getByRole("button", { name: `Eliminar ${nombre}` }).click();
      await dialogo(page, "Eliminar etiqueta")
        .getByRole("button", { name: "Eliminar", exact: true })
        .click();
      await expect(panel.getByText(nombre, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText("Todavía no tenés etiquetas.")).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Etiquetas" }).click();
    await expect(page.getByText("Todavía no tenés etiquetas.")).toBeVisible();
  });
});

test.describe("etiquetas", () => {
  test("se crean, se usan en un contacto, se renombran y al eliminarlas se le quitan al contacto", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    // Crear desde la pestaña Etiquetas.
    await page.getByRole("tab", { name: "Etiquetas" }).click();
    await expect(page.getByText("Todavía no tenés etiquetas.")).toBeVisible();
    await page.getByRole("button", { name: "Crear una etiqueta" }).click();
    const nueva = dialogo(page, "Nueva etiqueta");
    await nueva.getByLabel("Nombre").fill("Familia");
    await nueva.getByRole("button", { name: "Crear etiqueta" }).click();
    await expect(page.getByRole("tabpanel").getByText("Familia")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("0 contactos")).toBeVisible();

    // Usarla al crear un contacto.
    await page.getByRole("tab", { name: "Contactos" }).click();
    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Nombre", { exact: true }).fill("Ana");
    await formulario.getByRole("button", { name: "Familia" }).click();
    await expect(formulario.getByRole("button", { name: "Familia" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();
    await expect(dialogo(page, "Contacto").getByText("Familia")).toBeVisible();
    await dialogo(page, "Contacto").getByRole("button", { name: "Cerrar" }).click();

    // Renombrarla.
    await page.getByRole("tab", { name: "Etiquetas" }).click();
    await expect(page.getByRole("tabpanel").getByText("1 contacto", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Editar Familia" }).click();
    const edicion = dialogo(page, "Editar etiqueta");
    await edicion.getByLabel("Nombre").fill("Mi familia");
    await edicion.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("tabpanel").getByText("Mi familia")).toBeVisible();

    // Eliminarla: el contacto sigue, pero sin la etiqueta.
    await page.getByRole("button", { name: "Eliminar Mi familia" }).click();
    await expect(
      dialogo(page, "Eliminar etiqueta").getByText(/Se la quitamos a 1 contacto/),
    ).toBeVisible();
    await dialogo(page, "Eliminar etiqueta")
      .getByRole("button", { name: "Eliminar", exact: true })
      .click();
    await expect(page.getByText("Todavía no tenés etiquetas.")).toBeVisible();

    await page.getByRole("tab", { name: "Contactos" }).click();
    await page.getByRole("button", { name: /Ana/ }).first().click();
    await expect(dialogo(page, "Contacto").getByText("Mi familia")).toHaveCount(0);
  });

  test("crear una etiqueta nueva desde el formulario del contacto la deja seleccionada", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await abrirContactos(page);

    const formulario = await agregarContacto(page);
    await formulario.getByLabel("Nombre", { exact: true }).fill("Ana");
    await formulario.getByLabel("Nueva etiqueta").fill("Amigos");
    await formulario.getByLabel("Nueva etiqueta").press("Enter");

    await expect(formulario.getByRole("button", { name: "Amigos" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Enter creó la etiqueta pero no envió el formulario.
    await expect(formulario).toBeVisible();
  });
});

test.describe("widgets", () => {
  test("la columna lateral tiene carruseles de texto y de gráficos con los datos de los contactos", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, { nombre: "Ana", favorito: true, fechaNacimiento: nacimientoEn(4) });
    await crearEmpresa(page, { nombre: "Taller", rubro: "Mecánico" });
    await abrirContactos(page);

    const columna = page.getByRole("complementary", { name: "Widgets" });
    await expect(
      columna.getByRole("region", { name: /Widgets de contactos: texto/ }),
    ).toBeVisible();
    // Los contactos sin teléfono ni correo se avisan primero.
    await expect(columna.getByText("Sin forma de comunicarse")).toBeVisible();
  });

  test("muestra el próximo recordatorio, los de la semana pasada y los cumpleaños por mes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const cuenta = await crearCuentaAprobada();
    await entrar(page, cuenta);
    const ana = await crearPersona(page, {
      nombre: "Ana",
      apellido: "Pérez",
      fechaNacimiento: nacimientoEn(40),
    });
    // Uno diario que arrancó hace 3 días: deja tres entradas en el historial (la última, ayer).
    await sembrarRecordatorioDiarioAntiguoDePrueba(
      cuenta.email,
      ana,
      "Tomar la pastilla",
      3,
      diaDeCalendario(),
    );
    await pedirApi(page, "POST", `/api/contactos/${ana}/recordatorios`, {
      titulo: "Cita médica",
      repeticion: "unica",
      fecha: diaDeCalendario(2),
      hora: "10:30",
    });
    await pedirApi(page, "POST", `/api/contactos/${ana}/recordatorios`, {
      titulo: "Devolver el libro",
      repeticion: "unica",
      fecha: diaDeCalendario(5),
      hora: "",
    });
    await abrirContactos(page);

    async function mostrarWidget(carrusel: Locator, titulo: string): Promise<Locator> {
      const widget = carrusel.getByRole("group").filter({ hasText: titulo });
      for (let intento = 0; intento < 14; intento++) {
        if (await widget.isVisible()) return widget;
        await carrusel.getByRole("button", { name: "Widget siguiente" }).click();
      }
      await expect(widget).toBeVisible();
      return widget;
    }

    const columna = page.getByRole("complementary", { name: "Widgets" });
    const texto = columna.getByRole("region", { name: /Widgets de contactos: texto/ });
    const proximo = await mostrarWidget(texto, "Próximo recordatorio");
    await expect(proximo).toContainText("en 2 días");
    await expect(proximo).toContainText("Cita médica (Ana Pérez)");
    await expect(proximo).toContainText("a las 10:30");

    // La semana pasada es una lista de lo que ya cayó, sin cifra: qué fue, de quién y cuándo.
    const semana = await mostrarWidget(texto, "Recordatorios de la semana");
    await expect(semana).toContainText("Tomar la pastilla · Ana Pérez");
    await expect(semana).toContainText("Ayer");
    await expect(semana).not.toContainText("Cita médica");

    // Cumpleaños por mes: una barra por mes, con su número debajo (del 1 al 12).
    const graficos = columna.getByRole("region", { name: /Widgets de contactos: gráficos/ });
    const porMes = await mostrarWidget(graficos, "Cumpleaños por mes");
    await expect(porMes).toContainText("es el mes con más (1)");
    await expect(porMes.locator("div.flex-1.rounded-sm")).toHaveCount(12);
    const meses = Array.from({ length: 12 }, (_, mes) => String(mes + 1));
    await expect(porMes.locator("span.text-center")).toHaveText(meses);
    // La barra del mes actual tiene otro color que las demás.
    const barras = porMes.locator("div.flex-1.rounded-sm");
    const actual = barras.nth(new Date().getMonth());
    await expect(actual).toHaveCSS("background-color", "rgb(124, 58, 237)");

    // Los widgets que se sacaron ya no están en ninguno de los dos carruseles.
    const sacados = ["Tus contactos", "Tus etiquetas", "Favoritos", "Historial de la semana"];
    for (const titulo of sacados) {
      await expect(columna.getByText(titulo, { exact: true })).toHaveCount(0);
    }
  });

  test("el resumen de Contactos de la pantalla de inicio destaca el próximo cumpleaños", async ({
    page,
  }) => {
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, {
      nombre: "Ana",
      apellido: "Pérez",
      favorito: true,
      telefono: "099 111 222",
      fechaNacimiento: nacimientoEn(4),
    });
    await crearEmpresa(page, { nombre: "Taller", rubro: "Mecánico", telefono: "2411 1111" });
    await page.goto("/inicio");
    await page.getByRole("tab", { name: "Contactos" }).click();

    const destacado = page.locator("[data-resumen='contactos'] [data-destacado]");
    await expect(destacado).toContainText("Próximo cumpleaños");
    await expect(destacado).toContainText("Ana Pérez");
    await expect(destacado).toContainText(/Cumple \d+ el .+ \(en 4 días\)\./);
  });
});

test.describe("privacidad", () => {
  test("una cuenta no ve los contactos de otra", async ({ browser }) => {
    const contextoA = await browser.newContext();
    const paginaA = await contextoA.newPage();
    await entrar(paginaA, await crearCuentaAprobada());
    await crearPersona(paginaA, { nombre: "Secreto", apellido: "De Ana" });

    const contextoB = await browser.newContext();
    const paginaB = await contextoB.newPage();
    await entrar(paginaB, await crearCuentaAprobada());
    await abrirContactos(paginaB);

    await expect(
      paginaB.getByRole("heading", { name: "Todavía no tenés contactos" }),
    ).toBeVisible();
    await expect(paginaB.getByText("Secreto")).toHaveCount(0);

    await contextoA.close();
    await contextoB.close();
  });
});

test.describe("accesibilidad y pantallas chicas", () => {
  test("el listado, la ficha y el formulario no tienen violaciones de axe", async ({ page }) => {
    await entrar(page, await crearCuentaAprobada());
    const id = await crearPersona(page, {
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "099 111 222",
      favorito: true,
    });
    await pedirApi(page, "POST", `/api/contactos/${id}/recordatorios`, {
      titulo: "Cumpleaños",
      repeticion: "anual",
      diaDelMes: Number(diaDeCalendario(2).slice(8, 10)),
      mes: Number(diaDeCalendario(2).slice(5, 7)),
      hora: "",
    });
    await abrirContactos(page);
    await expect(fila(page, /Ana Pérez/)).toBeVisible();

    const revisar = async () => (await new AxeBuilder({ page }).analyze()).violations;

    expect(await revisar(), "listado").toEqual([]);

    await page.getByRole("tab", { name: "Recordatorios" }).click();
    await expect(page.getByRole("button", { name: /^Cumpleaños/ })).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar(), "recordatorios").toEqual([]);

    await page.getByRole("tab", { name: "Etiquetas" }).click();
    await expect(page.getByText("Todavía no tenés etiquetas.")).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar(), "etiquetas").toEqual([]);

    await page.getByRole("tab", { name: "Contactos" }).click();
    await page
      .getByRole("button", { name: /Ana Pérez/ })
      .first()
      .click();
    await expect(dialogo(page, "Contacto").getByText("099 111 222")).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar(), "ficha").toEqual([]);

    await dialogo(page, "Contacto").getByRole("button", { name: "Editar", exact: true }).click();
    await expect(dialogo(page, "Editar contacto")).toBeVisible();
    await page.waitForTimeout(TRANSICION_MS);
    expect(await revisar(), "formulario").toEqual([]);
  });

  test("en una pantalla angosta no hay desplazamiento horizontal y el formulario es usable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await entrar(page, await crearCuentaAprobada());
    await crearPersona(page, {
      nombre: "Ana con un nombre bastante largo",
      apellido: "y un apellido también largo",
      telefono: "099 111 222",
    });
    await abrirContactos(page);
    await expect(page.getByRole("button", { name: /Ana con un nombre/ }).first()).toBeVisible();

    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(desborda).toBe(false);

    const formulario = await agregarContacto(page);
    await expect(formulario.getByLabel("Nombre", { exact: true })).toBeVisible();
    await formulario.getByLabel("Nombre", { exact: true }).fill("Beto");
    await formulario.getByRole("button", { name: "Guardar contacto" }).scrollIntoViewIfNeeded();
    await formulario.getByRole("button", { name: "Guardar contacto" }).click();
    await expect(dialogo(page, "Contacto")).toBeVisible();
  });
});

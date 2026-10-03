// Tests end-to-end del flujo de ingreso, en un navegador real.
//
// Prueban lo que la persona ve y hace, no las llamadas a la API: eso ya está
// cubierto por los tests de integración de apps/api.

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { crearCuentaAprobada, limpiarBaseDePruebas } from "./utilidades";

test.beforeEach(async () => {
  await limpiarBaseDePruebas();
});

/** Completa el formulario de ingreso y lo envía. */
async function entrar(pagina: Page, identificador: string, password: string): Promise<void> {
  await pagina.getByLabel("Usuario o correo").fill(identificador);
  await pagina.getByLabel("Contraseña").fill(password);
  await pagina.getByRole("button", { name: "Entrar" }).click();
}

test.describe("pantalla por defecto", () => {
  test("sin sesión, la raíz lleva a la pantalla de ingreso", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/ingresar$/);
    await expect(page.getByRole("tab", { name: "Entrar" })).toBeVisible();
  });

  test("una pantalla protegida sin sesión también lleva a ingresar", async ({ page }) => {
    await page.goto("/inicio");

    await expect(page).toHaveURL(/\/ingresar$/);
  });
});

test.describe("toggle entre entrar y crear cuenta", () => {
  test("cambia de formulario sin cambiar de página", async ({ page }) => {
    await page.goto("/ingresar");

    await expect(page.getByLabel("Usuario o correo")).toBeVisible();

    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    await expect(page.getByLabel("Nombre")).toBeVisible();
    await expect(page.getByLabel("Usuario o correo")).toBeHidden();
    // Misma URL: no hubo navegación.
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test("se puede volver al formulario de entrar", async ({ page }) => {
    await page.goto("/ingresar");

    await page.getByRole("tab", { name: "Crear cuenta" }).click();
    await page.getByRole("tab", { name: "Entrar" }).click();

    await expect(page.getByLabel("Usuario o correo")).toBeVisible();
  });

  test("las pestañas se pueden usar con el teclado", async ({ page }) => {
    await page.goto("/ingresar");

    await page.getByRole("tab", { name: "Crear cuenta" }).focus();
    await page.keyboard.press("Enter");

    await expect(page.getByLabel("Nombre")).toBeVisible();
  });
});

test.describe("entrar", () => {
  test("con el usuario correcto lleva al inicio", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);

    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByRole("heading", { name: `Hola, ${cuenta.nombre}` })).toBeVisible();
  });

  test("con el correo también entra", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await entrar(page, cuenta.email, cuenta.password);

    await expect(page).toHaveURL(/\/inicio$/);
  });

  test("con la contraseña equivocada muestra el error junto al campo", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, "clave-equivocada");

    // Se busca dentro del formulario: Next agrega su propio role="alert" para
    // anunciar los cambios de ruta, y sin acotar el alcance habría dos.
    await expect(page.locator("form").getByRole("alert")).toContainText(/incorrectos/i);
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test("no pierde lo escrito cuando falla", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, "clave-equivocada");
    await expect(page.locator("form").getByRole("alert")).toBeVisible();

    // La persona corrige la contraseña sin tener que volver a escribir el usuario.
    await expect(page.getByLabel("Usuario o correo")).toHaveValue(cuenta.usuario);
  });

  test("una cuenta pendiente ve por qué no puede entrar", async ({ page }) => {
    const cuenta = await crearCuentaAprobada({ estado: "pendiente" });

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);

    await expect(page.locator("form").getByRole("status")).toContainText(/aprobación/i);
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test("valida antes de enviar si faltan datos", async ({ page }) => {
    await page.goto("/ingresar");

    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText(/Escribí tu usuario o tu correo/)).toBeVisible();
  });
});

test.describe("crear cuenta", () => {
  test("explica que queda pendiente y no inicia sesión", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Apellido").fill("Pérez");
    await page.getByLabel("Usuario").fill("ana.perez");
    await page.getByLabel("Correo").fill("ana.perez@ejemplo.test");
    await page.getByLabel("Contraseña").fill("clave-de-prueba");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    // El aviso explica los dos pasos, no solo uno: si dijera únicamente
    // "confirmá tu correo", la persona lo haría y se toparía con otro rechazo.
    await expect(page.getByText(/Revisá tu correo/i)).toBeVisible();
    await expect(page.getByText(/administrador apruebe tu cuenta/i)).toBeVisible();

    // Registrarse no da acceso: sigue en la pantalla de ingreso.
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test("volver tras registrarse deja el formulario de entrar usable, no colapsado", async ({
    page,
  }) => {
    await page.goto("/ingresar");
    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Apellido").fill("Pérez");
    await page.getByLabel("Usuario").fill(`ana.${Date.now()}`);
    await page.getByLabel("Correo").fill(`ana.${Date.now()}@ejemplo.test`);
    await page.getByLabel("Contraseña").fill("clave-de-prueba");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText(/Revisá tu correo/i)).toBeVisible();

    await page.getByRole("button", { name: "Volver" }).click();

    // El bug real: el contenedor que anima el alto quedaba en 0 para siempre
    // (el ResizeObserver medía un elemento ya desmontado), así que el
    // formulario estaba en el DOM pero invisible. Comprobar que el campo
    // no solo existe sino que es usable cierra ese caso.
    const campo = page.getByLabel("Usuario o correo");
    await expect(campo).toBeVisible();
    await campo.fill("alguien");
    await expect(campo).toHaveValue("alguien");
  });

  test("ofrece reenviar el correo si no llegó", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Apellido").fill("Pérez");
    await page.getByLabel("Usuario").fill("ana.perez2");
    await page.getByLabel("Correo").fill("ana.perez2@ejemplo.test");
    await page.getByLabel("Contraseña").fill("clave-de-prueba");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await page.getByRole("button", { name: /reenviar/i }).click();

    await expect(page.getByText(/Te lo mandamos de nuevo/i)).toBeVisible();
  });

  test("no deja escribir más de 24 caracteres en los campos cortos", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    // El atributo maxLength frena la escritura antes de que haya un error que
    // mostrar: es mejor impedir el problema que explicarlo después.
    await page.getByLabel("Nombre").fill("a".repeat(40));
    await expect(page.getByLabel("Nombre")).toHaveValue("a".repeat(24));

    await page.getByLabel("Usuario").fill("b".repeat(40));
    await expect(page.getByLabel("Usuario")).toHaveValue("b".repeat(24));
  });

  test("muestra los errores junto a cada campo", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    await page.getByLabel("Correo").fill("no-es-un-correo");
    await page.getByLabel("Contraseña").fill("corta");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByText(/Revisá el correo/)).toBeVisible();
    await expect(page.getByText(/al menos 8 caracteres/)).toBeVisible();
  });

  test("avisa si el usuario ya está ocupado", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    await page.getByLabel("Nombre").fill("Otra");
    await page.getByLabel("Apellido").fill("Persona");
    await page.getByLabel("Usuario").fill(cuenta.usuario);
    await page.getByLabel("Correo").fill("otra.persona@ejemplo.test");
    await page.getByLabel("Contraseña").fill("clave-de-prueba");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(page.getByText(/ya está ocupado/i)).toBeVisible();
  });
});

test.describe("salir", () => {
  test("cierra la sesión y vuelve a la pantalla de ingreso", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);
    await expect(page).toHaveURL(/\/inicio$/);

    await page.getByRole("button", { name: "Salir" }).click();

    await expect(page).toHaveURL(/\/ingresar$/);

    // Volver atrás no debería devolver el acceso.
    await page.goto("/inicio");
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});

test.describe("accesibilidad", () => {
  test("la pantalla de ingreso no tiene violaciones", async ({ page }) => {
    await page.goto("/ingresar");

    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(resultado.violations).toEqual([]);
  });

  test("el formulario de registro no tiene violaciones", async ({ page }) => {
    await page.goto("/ingresar");
    await page.getByRole("tab", { name: "Crear cuenta" }).click();
    await expect(page.getByLabel("Nombre")).toBeVisible();

    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(resultado.violations).toEqual([]);
  });

  test("la pantalla de inicio no tiene violaciones", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);
    await expect(page).toHaveURL(/\/inicio$/);

    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(resultado.violations).toEqual([]);
  });

  test("no tiene violaciones en modo oscuro", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/ingresar");

    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(resultado.violations).toEqual([]);
  });

  test("se puede completar el ingreso solo con el teclado", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await page.getByLabel("Usuario o correo").focus();
    await page.keyboard.type(cuenta.usuario);
    await page.keyboard.press("Tab");
    await page.keyboard.type(cuenta.password);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/inicio$/);
  });
});

test.describe("en pantalla chica", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("la pantalla de ingreso se usa cómodamente en el teléfono", async ({ page }) => {
    await page.goto("/ingresar");

    const boton = page.getByRole("button", { name: "Entrar" });
    const caja = await boton.boundingBox();

    // Área táctil cómoda: al menos 44 px de alto (docs/guias/usabilidad.md).
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Sin desbordes horizontales.
    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(desborda).toBe(false);
  });
});

test.describe("barra superior y pie", () => {
  test("la barra tiene el logotipo y el selector de tema", async ({ page }) => {
    await page.goto("/ingresar");

    const barra = page.getByRole("navigation", { name: "Barra principal" });
    // El nombre accesible es "gestorIA" entero, aunque visualmente esté partido
    // en dos para destacar el "IA".
    await expect(barra.getByRole("link", { name: "gestorIA" })).toBeVisible();
    await expect(barra.getByRole("radiogroup", { name: "Tema de la interfaz" })).toBeVisible();
  });

  test("el selector de tema tiene dos opciones, no tres", async ({ page }) => {
    await page.goto("/ingresar");

    const opciones = page
      .getByRole("radiogroup", { name: "Tema de la interfaz" })
      .getByRole("radio");
    await expect(opciones).toHaveCount(2);
    await expect(opciones.nth(0)).toHaveAttribute("aria-label", "Tema claro");
    await expect(opciones.nth(1)).toHaveAttribute("aria-label", "Tema oscuro");
  });

  test("cambiar el tema aplica y se recuerda al recargar", async ({ page }) => {
    await page.goto("/ingresar");

    await page.getByRole("radio", { name: "Tema oscuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("sin elección guardada sigue la preferencia del sistema", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/ingresar");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("el pie está en todas las pantallas", async ({ page }) => {
    await page.goto("/ingresar");
    await expect(page.getByRole("contentinfo")).toContainText("gestorIA");

    await page.goto("/correo-confirmado");
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("sin sesión, la barra no muestra el botón de salir", async ({ page }) => {
    await page.goto("/ingresar");

    await expect(page.getByRole("button", { name: "Salir" })).toBeHidden();
  });

  test("con sesión, salir está en la barra y funciona", async ({ page }) => {
    const cuenta = await crearCuentaAprobada();

    await page.goto("/ingresar");
    await entrar(page, cuenta.usuario, cuenta.password);
    await expect(page).toHaveURL(/\/inicio$/);

    const barra = page.getByRole("navigation", { name: "Barra principal" });
    await expect(barra.getByRole("button", { name: "Salir" })).toBeVisible();

    await barra.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});

test.describe("transición entre los dos formularios", () => {
  test("la tarjeta acompaña el cambio de alto en vez de saltar", async ({ page }) => {
    // Se fija la preferencia para no depender de la configuración del equipo.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/ingresar");

    const contenedor = page.locator("[data-animacion='alto']");
    const altoEntrar = (await contenedor.boundingBox())?.height ?? 0;
    expect(altoEntrar).toBeGreaterThan(0);

    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    // Se muestrea el alto mientras dura la transición. Si en algún momento está
    // entre el inicial y el final, es que se animó; si saltara, solo se verían
    // los dos extremos. Muestrear en vez de mirar un instante fijo evita que el
    // test dependa de la velocidad del equipo.
    const muestras: number[] = [];
    for (let intento = 0; intento < 20; intento += 1) {
      muestras.push((await contenedor.boundingBox())?.height ?? 0);
      await page.waitForTimeout(25);
    }

    await expect(page.getByLabel("Nombre")).toBeVisible();
    await page.waitForTimeout(400);
    const altoRegistro = (await contenedor.boundingBox())?.height ?? 0;

    // Crear cuenta tiene más campos, así que la tarjeta termina más alta.
    expect(altoRegistro).toBeGreaterThan(altoEntrar);

    const intermedias = muestras.filter((alto) => alto > altoEntrar && alto < altoRegistro);
    expect(intermedias.length, `alturas observadas: ${muestras.join(", ")}`).toBeGreaterThan(0);
  });

  test("con la preferencia de reducir movimiento el cambio es inmediato", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ingresar");

    await page.getByRole("tab", { name: "Crear cuenta" }).click();

    // Sin esperas ni animaciones intermedias: el formulario ya está.
    await expect(page.getByLabel("Nombre")).toBeVisible({ timeout: 1000 });
  });

  test("se puede ir y volver varias veces sin romperse", async ({ page }) => {
    await page.goto("/ingresar");

    for (let vuelta = 0; vuelta < 3; vuelta += 1) {
      await page.getByRole("tab", { name: "Crear cuenta" }).click();
      await expect(page.getByLabel("Nombre")).toBeVisible();
      await page.getByRole("tab", { name: "Entrar" }).click();
      await expect(page.getByLabel("Usuario o correo")).toBeVisible();
    }

    // Y el formulario sigue siendo usable después de tanto ir y venir.
    await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });
});

test.describe("marca", () => {
  test("el título de cada pantalla lleva el nombre de la app", async ({ page }) => {
    await page.goto("/ingresar");
    await expect(page).toHaveTitle(/gestorIA/);

    await page.goto("/correo-confirmado");
    await expect(page).toHaveTitle(/gestorIA/);
  });

  test("un lector de pantalla lee el nombre entero, no partido", async ({ page }) => {
    await page.goto("/ingresar");

    // Visualmente son dos trozos ("gestor" y "IA" en acento), pero el nombre
    // accesible tiene que ser uno solo.
    const logotipo = page.getByRole("navigation", { name: "Barra principal" }).getByRole("link");
    await expect(logotipo).toHaveAccessibleName("gestorIA");
  });

  test("sirve un favicon", async ({ page }) => {
    await page.goto("/ingresar");

    const enlace = page.locator('link[rel="icon"]');
    await expect(enlace).toHaveCount(1);

    const href = await enlace.getAttribute("href");
    const respuesta = await page.request.get(href as string);
    expect(respuesta.status()).toBe(200);
  });
});

test.describe("respuesta visual", () => {
  test("la barra superior proyecta sombra sobre el cuerpo", async ({ page }) => {
    await page.goto("/ingresar");

    const sombra = await page
      .getByRole("banner")
      .evaluate((elemento) => getComputedStyle(elemento).boxShadow);

    expect(sombra).not.toBe("none");
  });

  test("los botones reaccionan al pasar el mouse", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/ingresar");

    const boton = page.getByRole("button", { name: "Entrar" });

    const enReposo = await boton.evaluate((el) => getComputedStyle(el).boxShadow);
    await boton.hover();
    await page.waitForTimeout(250);
    const conMouse = await boton.evaluate((el) => getComputedStyle(el).boxShadow);

    // Sube un nivel de elevación: la sombra tiene que cambiar.
    expect(conMouse).not.toBe(enReposo);
  });

  test("los campos muestran un anillo de foco al llegar con el teclado", async ({ page }) => {
    await page.goto("/ingresar");

    const campo = page.getByLabel("Usuario o correo");
    await campo.focus();
    await page.waitForTimeout(200);

    const estilos = await campo.evaluate((el) => {
      const calculado = getComputedStyle(el);
      return { sombra: calculado.boxShadow, borde: calculado.borderColor };
    });

    // El foco nunca se quita sin reemplazarlo por algo igual de claro: acá el
    // reemplazo es el anillo de sombra más el borde de acento.
    expect(estilos.sombra).not.toBe("none");
    expect(estilos.borde).not.toBe("");
  });

  test("con reducir movimiento no hay desplazamientos", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ingresar");

    // El título llega a su lugar sin animación de entrada.
    const titulo = page.getByRole("heading", { name: "Entrá a tu cuenta" });
    await expect(titulo).toBeVisible();

    const transformacion = await titulo.evaluate((el) => getComputedStyle(el).transform);
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(transformacion);
  });
});

test.describe("fondo animado", () => {
  /** Lo que se ve en el canvas, como cadena, para comparar dos momentos. */
  async function retrato(page: Page): Promise<string> {
    return page
      .locator("canvas.fondo-animado")
      .evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  }

  test("hay uno solo, cubre la ventana y está detrás del contenido", async ({ page }) => {
    await page.goto("/ingresar");

    const fondo = page.locator("canvas.fondo-animado");
    await expect(fondo).toHaveCount(1);

    const medidas = await fondo.evaluate((el) => ({
      posicion: getComputedStyle(el).position,
      caja: el.getBoundingClientRect(),
      ventana: { ancho: window.innerWidth, alto: window.innerHeight },
    }));

    // `fixed` es lo que hace que siga cubriendo la ventana al hacer scroll.
    expect(medidas.posicion).toBe("fixed");
    expect(medidas.caja.width).toBeGreaterThanOrEqual(medidas.ventana.ancho);
    expect(medidas.caja.height).toBeGreaterThanOrEqual(medidas.ventana.alto);
  });

  test("no agrega scroll horizontal", async ({ page }) => {
    // Un elemento de ancho 100vw es la forma más fácil de romper esto sin
    // darse cuenta, y en el celular se nota enseguida.
    await page.goto("/ingresar");

    const desborda = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(desborda).toBe(false);
  });

  test("es decorativo: no lo ve un lector de pantalla ni se come los clics", async ({ page }) => {
    await page.goto("/ingresar");

    const fondo = page.locator("canvas.fondo-animado");
    await expect(fondo).toHaveAttribute("aria-hidden", "true");
    // Enfocable pero invisible para un lector de pantalla sería una trampa.
    await expect(fondo).toHaveAttribute("tabindex", "-1");

    const sinEventos = await fondo.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(sinEventos).toBe("none");

    // Y el formulario que queda encima sigue siendo usable.
    await page.getByLabel("Usuario o correo").click();
    await expect(page.getByLabel("Usuario o correo")).toBeFocused();
  });

  test("se dibuja mucho más chico de lo que se muestra", async ({ page }) => {
    // De acá sale el difuminado, y también el que sea barato: si el lienzo
    // pasara a tener el tamaño de la ventana, se perderían las dos cosas.
    await page.goto("/ingresar");

    const proporcion = await page
      .locator("canvas.fondo-animado")
      .evaluate((el) => window.innerWidth / (el as HTMLCanvasElement).width);

    expect(proporcion).toBeGreaterThan(8);
  });

  test("las formas se mueven", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/ingresar");

    const primero = await retrato(page);
    await page.waitForTimeout(2000);
    const segundo = await retrato(page);

    expect(segundo).not.toBe(primero);
  });

  test("con reducir movimiento queda un solo cuadro, pero el color sigue ahí", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ingresar");

    const primero = await retrato(page);
    await page.waitForTimeout(2000);
    const segundo = await retrato(page);

    // Lo que molesta es el movimiento, no el color: el cuadro está pintado.
    expect(segundo).toBe(primero);
    expect(primero.length).toBeGreaterThan("data:image/png;base64,".length + 100);
  });

  test("el modo oscuro se nota más que el claro", async ({ page }) => {
    // Sobre un fondo casi negro, la misma intensidad que en claro no se ve.
    await page.goto("/ingresar");

    const opacidad = async () =>
      Number(
        await page.locator("canvas.fondo-animado").evaluate((el) => getComputedStyle(el).opacity),
      );

    await page.getByRole("radio", { name: "Tema claro" }).click();
    const enClaro = await opacidad();

    // Con `poll` y no con una lectura directa: la intensidad se transiciona al
    // cambiar de tema, así que justo después del clic todavía está a mitad de
    // camino y el valor leído sería el viejo.
    await page.getByRole("radio", { name: "Tema oscuro" }).click();
    await expect.poll(opacidad).toBeGreaterThan(enClaro);
  });

  test("no le baja el contraste al texto que se apoya en él", async ({ page }) => {
    // El título de esta pantalla se apoya directo sobre el fondo, sin tarjeta
    // que lo aísle, así que es el caso donde un lavado fuerte se notaría.
    await page.goto("/ingresar");

    const resultado = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2aa"])
      .analyze();

    expect(resultado.violations).toEqual([]);
  });
});

test.describe("brillo de bordes", () => {
  /** La capa SVG del panel de ingreso. */
  function capa(page: Page) {
    return page.locator(".con-brillo > .brillo-svg").first();
  }

  test("se enciende con el mouse cerca y se apaga al alejarlo", async ({ page }) => {
    await page.goto("/ingresar");

    const svg = capa(page);
    await expect(svg).toHaveCount(1);

    const caja = await page.locator(".con-brillo").first().boundingBox();
    if (!caja) throw new Error("el panel no tiene caja");

    // Lejos de todo: apagado.
    await page.mouse.move(5, 5);
    await expect(svg).not.toHaveClass(/activo/);

    // Encima: encendido.
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await expect(svg).toHaveClass(/activo/);
  });

  test("se enciende también con el mouse afuera pero cerca", async ({ page }) => {
    // El brillo se anticipa al contacto: no espera a que el puntero entre.
    await page.goto("/ingresar");

    const caja = await page.locator(".con-brillo").first().boundingBox();
    if (!caja) throw new Error("el panel no tiene caja");

    await page.mouse.move(caja.x - 40, caja.y + caja.height / 2);
    await expect(capa(page)).toHaveClass(/activo/);
  });

  test("el gradiente sigue al puntero", async ({ page }) => {
    await page.goto("/ingresar");

    const caja = await page.locator(".con-brillo").first().boundingBox();
    if (!caja) throw new Error("el panel no tiene caja");

    const centro = () =>
      page
        .locator(".con-brillo radialGradient")
        .first()
        .evaluate((el) => el.getAttribute("cx"));

    await page.mouse.move(caja.x + 20, caja.y + 20);
    await expect(capa(page)).toHaveClass(/activo/);
    const izquierda = await centro();

    await page.mouse.move(caja.x + caja.width - 20, caja.y + 20);
    await expect.poll(centro).not.toBe(izquierda);
  });

  test("toma el color de acento del tema activo", async ({ page }) => {
    // Un gradiente SVG no hereda las variables CSS del documento: si nadie le
    // reescribe el color al cambiar de tema, se queda con el del tema anterior.
    await page.goto("/ingresar");

    const primeraParada = () =>
      page
        .locator(".con-brillo stop")
        .first()
        .evaluate((el) => el.getAttribute("stop-color"));

    await page.getByRole("radio", { name: "Tema claro" }).click();
    await expect.poll(primeraParada).toBe("#0f766e");

    await page.getByRole("radio", { name: "Tema oscuro" }).click();
    await expect.poll(primeraParada).toBe("#0d9488");
  });

  test("es decorativo: no se come los clics ni lo ve un lector de pantalla", async ({ page }) => {
    await page.goto("/ingresar");

    const svg = capa(page);
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(await svg.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");

    // El formulario que está debajo de la capa sigue siendo usable.
    await page.getByLabel("Usuario o correo").click();
    await expect(page.getByLabel("Usuario o correo")).toBeFocused();
  });
});

test.describe("microinteracciones", () => {
  test("el botón se levanta al pasar el mouse y se hunde al presionar", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/ingresar");

    const boton = page.getByRole("button", { name: "Entrar" });
    const transformacion = () => boton.evaluate((el) => getComputedStyle(el).transform);

    expect(await transformacion()).toBe("none");

    await boton.hover();
    // matrix(1, 0, 0, 1, 0, -2): se levanta los 2 px del token.
    await expect.poll(transformacion).toContain("-2");
  });

  test("las tarjetas NO se mueven al pasar el mouse", async ({ page }) => {
    // La elevación al hover es exclusiva de los botones: si todo lo que está
    // debajo del cursor se desplaza, la pantalla se vuelve inestable.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/ingresar");

    const panel = page.locator(".con-brillo").first();
    const antes = await panel.boundingBox();

    await panel.hover();
    await page.waitForTimeout(400);
    const despues = await panel.boundingBox();

    expect(despues?.y).toBeCloseTo(antes?.y ?? 0, 1);
    expect(await panel.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  });

  test("el selector de tema desliza el indicador hasta la opción elegida", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/ingresar");

    const indicador = page.locator("[aria-label='Tema de la interfaz'] span[aria-hidden='true']");

    await page.getByRole("radio", { name: "Tema claro" }).click();
    await expect(indicador).toHaveCount(1);
    const enClaro = await indicador.boundingBox();

    await page.getByRole("radio", { name: "Tema oscuro" }).click();
    // Sigue habiendo uno solo: es el mismo que se mudó, no uno nuevo.
    await expect(indicador).toHaveCount(1);
    await expect
      .poll(async () => (await indicador.boundingBox())?.x)
      .toBeGreaterThan(enClaro?.x ?? 0);
  });

  test("los campos toman el acento en el borde al enfocarlos", async ({ page }) => {
    await page.goto("/ingresar");

    const campo = page.getByLabel("Usuario o correo");
    const borde = () => campo.evaluate((el) => getComputedStyle(el).borderColor);

    const enReposo = await borde();
    await campo.focus();
    await expect.poll(borde).not.toBe(enReposo);
  });
});

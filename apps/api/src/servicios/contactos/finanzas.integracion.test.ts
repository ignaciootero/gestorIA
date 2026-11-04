// Tests de integración de lo que une a los contactos con Finanzas: el contacto en cada
// movimiento, la plata en la ficha, la lista de opciones y los widgets, contra gestion_test.

import { type ClienteDb, esquema } from "@gestoria/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  cargarMovimiento,
  crearContactoPorApi,
  crearDeudaPorApi,
  type EntornoDeFinanzas,
  empresaValida,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
  prepararFinanzas,
} from "../../pruebas/contactos-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { limpiarContactos } from "./limpieza.ts";
import { obtenerWidgetsDeContactos } from "./widgets.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let finanzas: EntornoDeFinanzas;
let taller: string;

/** 12:00 en Montevideo del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente);
  finanzas = await prepararFinanzas(app, ana.cookies);
  taller = await crearContactoPorApi(app, ana.cookies, empresaValida({ nombre: "Taller Sur" }));
});

afterAll(async () => {
  await cliente.cerrar();
});

type MovimientoJson = {
  id: string;
  tipo: string;
  contacto: { id: string; nombre: string; apellido: string | null; eliminado: boolean } | null;
};

async function movimiento(
  datos: Parameters<typeof cargarMovimiento>[3],
  cookies = ana.cookies,
  entorno = finanzas,
): Promise<MovimientoJson> {
  const respuesta = await cargarMovimiento(app, cookies, entorno, datos);
  expect(respuesta.status, await respuesta.clone().text()).toBe(201);
  return await leerJson<MovimientoJson>(respuesta);
}

describe("el contacto en un movimiento", () => {
  it("un gasto y un ingreso pueden llevar contacto, y el movimiento lo devuelve", async () => {
    const gasto = await movimiento({ tipo: "gasto", contactoId: taller });
    expect(gasto.contacto).toEqual({
      id: taller,
      nombre: "Taller Sur",
      apellido: null,
      eliminado: false,
    });

    const ingreso = await movimiento({ tipo: "ingreso", contactoId: taller });
    expect(ingreso.contacto?.id).toBe(taller);
  });

  it("es opcional: sin contacto, o con null, queda sin contacto", async () => {
    expect((await movimiento({})).contacto).toBeNull();
    expect((await movimiento({ contactoId: null })).contacto).toBeNull();
  });

  it("rechaza un contacto que no existe, es de otra persona o está en la papelera", async () => {
    const campoDe = async (contactoId: string) => {
      const respuesta = await cargarMovimiento(app, ana.cookies, finanzas, { contactoId });
      expect(respuesta.status, contactoId).toBe(400);
      return (await leerJson<{ error: { campos: { campo: string }[] } }>(respuesta)).error.campos[0]
        ?.campo;
    };

    const otra = await entrarComoPersona(app, cliente);
    const ajeno = await crearContactoPorApi(app, otra.cookies, personaValida({ nombre: "Ajeno" }));
    expect(await campoDe(ajeno)).toBe("contactoId");
    expect(await campoDe("00000000-0000-4000-8000-000000000000")).toBe("contactoId");
    expect(await campoDe("no-es-un-id")).toBe("contactoId");

    const borrado = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Borrado" }),
    );
    await pedir(app, ana.cookies, `/api/contactos/${borrado}`, "DELETE");
    expect(await campoDe(borrado)).toBe("contactoId");
  });

  it("una transferencia entre cuentas propias no lleva contacto", async () => {
    const { cuentas } = await leerJson<{ cuentas: { id: string }[] }>(
      await pedir(app, ana.cookies, "/api/finanzas/cuentas"),
    );
    const { categorias } = await leerJson<{ categorias: { id: number; sistema: string | null }[] }>(
      await pedir(app, ana.cookies, "/api/finanzas/categorias"),
    );
    const respuesta = await pedir(app, ana.cookies, "/api/finanzas/movimientos", "POST", {
      tipo: "neutro",
      importe: 10,
      descripcion: "Pasaje",
      fecha: "2026-10-10T12:00:00.000Z",
      categoriaId: categorias.find((categoria) => categoria.sistema === "transferencia")?.id,
      cuentaFinancieraId: cuentas[0]?.id,
      cuentaDestinoId: cuentas[1]?.id,
      contactoId: taller,
    });
    expect(respuesta.status).toBe(400);
  });

  it("al editar se puede poner, cambiar y quitar", async () => {
    const otro = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Otro" }));
    const creado = await movimiento({});
    const editar = (contactoId: string | null) =>
      pedir(app, ana.cookies, `/api/finanzas/movimientos/${creado.id}`, "PATCH", {
        tipo: "gasto",
        importe: 100,
        descripcion: "Movimiento",
        fecha: "2026-10-10T12:00:00.000Z",
        categoriaId: finanzas.categoriaId,
        cuentaFinancieraId: finanzas.cuentaId,
        contactoId,
      });

    expect((await leerJson<MovimientoJson>(await editar(taller))).contacto?.id).toBe(taller);
    expect((await leerJson<MovimientoJson>(await editar(otro))).contacto?.id).toBe(otro);
    expect((await leerJson<MovimientoJson>(await editar(null))).contacto).toBeNull();
  });

  it("si el contacto pasó a la papelera, el movimiento lo sigue mostrando y se puede editar sin tocarlo", async () => {
    const creado = await movimiento({ contactoId: taller });
    await pedir(app, ana.cookies, `/api/contactos/${taller}`, "DELETE");

    const lista = await leerJson<{ movimientos: MovimientoJson[] }>(
      await pedir(app, ana.cookies, "/api/finanzas/movimientos"),
    );
    expect(lista.movimientos[0]?.contacto).toMatchObject({ id: taller, eliminado: true });

    // Editar otra cosa del movimiento y dejar el mismo contacto no falla.
    const editado = await pedir(
      app,
      ana.cookies,
      `/api/finanzas/movimientos/${creado.id}`,
      "PATCH",
      {
        tipo: "gasto",
        importe: 250,
        descripcion: "Cambiado",
        fecha: "2026-10-10T12:00:00.000Z",
        categoriaId: finanzas.categoriaId,
        cuentaFinancieraId: finanzas.cuentaId,
        contactoId: taller,
      },
    );
    expect(editado.status).toBe(200);
  });

  it("duplicar conserva el contacto, salvo que ya esté en la papelera", async () => {
    const creado = await movimiento({ contactoId: taller });
    const copia = await leerJson<MovimientoJson>(
      await pedir(app, ana.cookies, `/api/finanzas/movimientos/${creado.id}/duplicar`, "POST"),
    );
    expect(copia.contacto?.id).toBe(taller);

    await pedir(app, ana.cookies, `/api/contactos/${taller}`, "DELETE");
    const otraCopia = await pedir(
      app,
      ana.cookies,
      `/api/finanzas/movimientos/${creado.id}/duplicar`,
      "POST",
    );
    expect(otraCopia.status).toBe(201);
    expect((await leerJson<MovimientoJson>(otraCopia)).contacto).toBeNull();
  });

  it("el listado se filtra por contacto, sin mezclar con los de otra persona", async () => {
    const otro = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Otro" }));
    await movimiento({ contactoId: taller, descripcion: "Con taller" });
    await movimiento({ contactoId: otro, descripcion: "Con otro" });
    await movimiento({ descripcion: "Sin nadie" });

    const descripciones = async (consulta: string, cookies = ana.cookies) =>
      (
        await leerJson<{ movimientos: { descripcion: string }[] }>(
          await pedir(app, cookies, `/api/finanzas/movimientos${consulta}`),
        )
      ).movimientos.map((m) => m.descripcion);

    expect(await descripciones(`?contactoId=${taller}`)).toEqual(["Con taller"]);
    expect(await descripciones("")).toHaveLength(3);
    expect((await pedir(app, ana.cookies, "/api/finanzas/movimientos?contactoId=x")).status).toBe(
      400,
    );

    const ajena = await entrarComoPersona(app, cliente);
    expect(await descripciones(`?contactoId=${taller}`, ajena.cookies)).toEqual([]);
  });

  it("al borrar el contacto en definitivo, el movimiento se queda sin contacto y sigue existiendo", async () => {
    const creado = await movimiento({ contactoId: taller });
    await pedir(app, ana.cookies, `/api/contactos/${taller}`, "DELETE");
    // Pasan 31 días.
    await limpiarContactos(cliente, new Date(Date.now() + 31 * 86_400_000));

    const fila = await cliente.db.query.movimientos.findFirst({
      where: eq(esquema.movimientos.id, creado.id),
    });
    expect(fila).toBeDefined();
    expect(fila?.contactoId).toBeNull();
  });
});

describe("la plata en la ficha del contacto", () => {
  type FinanzasJson = {
    monedaBase: string;
    movimientos: {
      recientes: { descripcion: string }[];
      cantidad: number;
      gastosCentavos: number;
      ingresosCentavos: number;
    };
    deudas: {
      pendientes: { concepto: string; pendienteCentavos: number }[];
      resumen: { meDeben: { moneda: string; centavos: number }[]; debo: unknown[] };
      saldadas: number;
    };
  };

  async function leerFinanzas(id: string, cookies = ana.cookies): Promise<FinanzasJson> {
    const respuesta = await pedir(app, cookies, `/api/contactos/${id}/finanzas`);
    expect(respuesta.status).toBe(200);
    return await leerJson<FinanzasJson>(respuesta);
  }

  it("sin nada devuelve ceros", async () => {
    expect(await leerFinanzas(taller)).toMatchObject({
      monedaBase: "UYU",
      movimientos: { recientes: [], cantidad: 0, gastosCentavos: 0, ingresosCentavos: 0 },
      deudas: { pendientes: [], saldadas: 0 },
    });
  });

  it("suma gastos e ingresos en la moneda base, trae los más recientes y cuenta todos", async () => {
    for (let numero = 1; numero <= 7; numero += 1) {
      await movimiento({
        contactoId: taller,
        importe: 100,
        descripcion: `Gasto ${numero}`,
        fecha: `2026-10-0${numero}T12:00:00.000Z`,
      });
    }
    await movimiento({ contactoId: taller, tipo: "ingreso", importe: 40.5, descripcion: "Cobro" });
    // De otro contacto y sin contacto: no cuentan.
    const otro = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Otro" }));
    await movimiento({ contactoId: otro, importe: 999 });
    await movimiento({ importe: 888 });

    const datos = await leerFinanzas(taller);
    expect(datos.movimientos).toMatchObject({
      cantidad: 8,
      gastosCentavos: 70_000,
      ingresosCentavos: 4050,
    });
    expect(datos.movimientos.recientes).toHaveLength(5);
    expect(datos.movimientos.recientes[0]?.descripcion).toBe("Cobro");
  });

  it("no cuenta los movimientos eliminados", async () => {
    const creado = await movimiento({ contactoId: taller, importe: 100 });
    await movimiento({ contactoId: taller, importe: 50 });
    await pedir(app, ana.cookies, `/api/finanzas/movimientos/${creado.id}`, "DELETE");
    expect((await leerFinanzas(taller)).movimientos).toMatchObject({
      cantidad: 1,
      gastosCentavos: 5000,
    });
  });

  it("muestra las deudas pendientes, lo que falta por moneda y cuántas están saldadas", async () => {
    const pendiente = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: taller,
      concepto: "Arreglo",
      monto: 1000,
    });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${pendiente}/pagos`, "POST", {
      monto: 250,
      fecha: "2026-10-05",
    });
    const saldada = await crearDeudaPorApi(app, ana.cookies, { contactoId: taller, monto: 10 });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${saldada}/pagos`, "POST", {
      monto: 10,
      fecha: "2026-10-05",
    });

    const { deudas } = await leerFinanzas(taller);
    expect(deudas.pendientes).toMatchObject([{ concepto: "Arreglo", pendienteCentavos: 75_000 }]);
    expect(deudas.resumen.meDeben).toEqual([{ moneda: "UYU", centavos: 75_000, deudas: 1 }]);
    expect(deudas.saldadas).toBe(1);
  });

  it("responde 404 para un contacto inexistente, eliminado o de otra persona", async () => {
    const otra = await entrarComoPersona(app, cliente);
    expect((await pedir(app, otra.cookies, `/api/contactos/${taller}/finanzas`)).status).toBe(404);
    expect(
      (
        await pedir(
          app,
          ana.cookies,
          "/api/contactos/00000000-0000-4000-8000-000000000000/finanzas",
        )
      ).status,
    ).toBe(404);
    await pedir(app, ana.cookies, `/api/contactos/${taller}`, "DELETE");
    expect((await pedir(app, ana.cookies, `/api/contactos/${taller}/finanzas`)).status).toBe(404);
  });
});

describe("la lista de opciones para elegir un contacto", () => {
  it("trae lo mínimo, por nombre, y solo de la persona y sin los eliminados", async () => {
    await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Zoe", apellido: "Ruiz" }));
    const borrado = await crearContactoPorApi(
      app,
      ana.cookies,
      personaValida({ nombre: "Borrado" }),
    );
    await pedir(app, ana.cookies, `/api/contactos/${borrado}`, "DELETE");
    const otra = await entrarComoPersona(app, cliente);
    await crearContactoPorApi(app, otra.cookies, personaValida({ nombre: "De otra" }));

    const { contactos } = await leerJson<{ contactos: Record<string, unknown>[] }>(
      await pedir(app, ana.cookies, "/api/contactos/opciones"),
    );
    expect(contactos.map((contacto) => contacto["nombre"])).toEqual(["Taller Sur", "Zoe"]);
    expect(Object.keys(contactos[0] ?? {}).sort()).toEqual(["apellido", "id", "nombre", "tipo"]);
  });

  it("pide sesión", async () => {
    expect((await pedir(app, null, "/api/contactos/opciones")).status).toBe(401);
  });
});

describe("los widgets con plata", () => {
  it("los widgets de Contactos suman las deudas pendientes por sentido y moneda, con los que más deben", async () => {
    const carla = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Carla" }));
    const beto = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Beto" }));
    await crearDeudaPorApi(app, ana.cookies, { contactoId: taller, monto: 300 });
    await crearDeudaPorApi(app, ana.cookies, { contactoId: taller, monto: 200 });
    await crearDeudaPorApi(app, ana.cookies, { contactoId: carla, monto: 450 });
    await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    await crearDeudaPorApi(app, ana.cookies, { contactoId: carla, monto: 20, moneda: "USD" });
    // Pagada en parte: cuenta lo que falta.
    const enParte = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 1000 });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${enParte}/pagos`, "POST", {
      monto: 600,
      fecha: "2026-10-05",
    });
    // Saldada, con alguien que no es contacto y en el otro sentido: no cuentan acá.
    const saldada = await crearDeudaPorApi(app, ana.cookies, { contactoId: carla, monto: 10 });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${saldada}/pagos`, "POST", {
      monto: 10,
      fecha: "2026-10-05",
    });
    await crearDeudaPorApi(app, ana.cookies, { nombreLibre: "Vecino", monto: 9999 });
    await crearDeudaPorApi(app, ana.cookies, { contactoId: taller, monto: 70, sentido: "debo" });

    const { deudas } = await obtenerWidgetsDeContactos(cliente, ana.userId, AHORA);
    expect(deudas.teDeben.totales).toEqual([
      { moneda: "USD", centavos: 2000, deudas: 1 },
      { moneda: "UYU", centavos: 145_000, deudas: 5 },
    ]);
    expect(deudas.teDeben.contactos).toBe(3);
    // Por moneda y, dentro de cada una, de mayor a menor (las del Taller y las de Beto se suman;
    // empatan y van por nombre). Carla en pesos queda cuarta y no entra: son hasta tres.
    expect(deudas.teDeben.mayores).toEqual([
      { tipo: "persona", nombre: "Carla", apellido: "Pérez", moneda: "USD", centavos: 2000 },
      { tipo: "persona", nombre: "Beto", apellido: "Pérez", moneda: "UYU", centavos: 50_000 },
      { tipo: "empresa", nombre: "Taller Sur", apellido: null, moneda: "UYU", centavos: 50_000 },
    ]);
    expect(deudas.debes).toEqual({
      totales: [{ moneda: "UYU", centavos: 7000, deudas: 1 }],
      contactos: 1,
      mayores: [
        { tipo: "empresa", nombre: "Taller Sur", apellido: null, moneda: "UYU", centavos: 7000 },
      ],
    });
  });

  it("el próximo vencimiento es la deuda con fecha límite que vence antes, aunque ya haya vencido", async () => {
    await crearDeudaPorApi(app, ana.cookies, { contactoId: taller, monto: 100 });
    await crearDeudaPorApi(app, ana.cookies, {
      contactoId: taller,
      concepto: "Repuesto",
      monto: 300,
      sentido: "debo",
      fechaLimite: "2026-10-25",
    });
    await crearDeudaPorApi(app, ana.cookies, {
      contactoId: taller,
      concepto: "Arreglo",
      monto: 200,
      fechaLimite: "2026-10-15",
    });
    // Con alguien que no es contacto: no cuenta, aunque venza antes.
    await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Vecino",
      monto: 50,
      fechaLimite: "2026-10-02",
    });

    const { deudas } = await obtenerWidgetsDeContactos(cliente, ana.userId, AHORA);
    expect(deudas.proximoVencimiento).toEqual({
      concepto: "Arreglo",
      sentido: "me_deben",
      contacto: { tipo: "empresa", nombre: "Taller Sur", apellido: null },
      moneda: "UYU",
      centavos: 20_000,
      fechaLimite: "2026-10-15",
      dias: -5,
    });
  });

  it("sin deudas con contactos no hay totales ni vencimiento, y no ve las de otra persona", async () => {
    const otra = await entrarComoPersona(app, cliente);
    await prepararFinanzas(app, otra.cookies);
    const suyo = await crearContactoPorApi(app, otra.cookies, personaValida({ nombre: "Suyo" }));
    await crearDeudaPorApi(app, otra.cookies, {
      contactoId: suyo,
      monto: 500,
      fechaLimite: "2026-10-30",
    });

    const { deudas } = await obtenerWidgetsDeContactos(cliente, ana.userId, AHORA);
    const vacio = { totales: [], contactos: 0, mayores: [] };
    expect(deudas).toEqual({ teDeben: vacio, debes: vacio, proximoVencimiento: null });
  });

  it("los widgets de Finanzas traen lo que le deben y lo que debe, por moneda", async () => {
    await crearDeudaPorApi(app, ana.cookies, { contactoId: taller, monto: 500 });
    await crearDeudaPorApi(app, ana.cookies, {
      contactoId: taller,
      monto: 80,
      moneda: "USD",
      sentido: "debo",
    });

    const respuesta = await pedir(app, ana.cookies, "/api/finanzas/widgets");
    expect(respuesta.status).toBe(200);
    const cuerpo = await leerJson<{
      deudas: { meDeben: unknown[]; debo: unknown[]; contactos: number };
    }>(respuesta);
    expect(cuerpo.deudas.meDeben).toEqual([{ moneda: "UYU", centavos: 50_000, deudas: 1 }]);
    expect(cuerpo.deudas.debo).toEqual([{ moneda: "USD", centavos: 8000, deudas: 1 }]);
    expect(cuerpo.deudas.contactos).toBe(1);
  });
});

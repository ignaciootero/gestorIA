// Tests de integración de las deudas y préstamos con un contacto, contra gestion_test.
//
// Las reglas de fechas ("no puede ser futura") se prueban con el servicio y un `ahora` fijo; el
// resto, con la API real (validaciones, permisos, aislamiento entre personas).

import type { ClienteDb } from "@gestoria/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { limpiarBase } from "../../pruebas/auth-de-prueba.ts";
import {
  crearContactoPorApi,
  crearDeudaPorApi,
  empresaValida,
  entrarComoPersona,
  type PersonaDePrueba,
  pedir,
  personaValida,
  prepararFinanzas,
  registrarDeuda,
} from "../../pruebas/contactos-de-prueba.ts";
import { crearFuenteDePrueba } from "../../pruebas/cotizaciones-de-prueba.ts";
import { appDePrueba, clienteDePrueba, leerJson } from "../../pruebas/entorno-de-prueba.ts";
import { limpiarContactos } from "../contactos/limpieza.ts";
import { crearDeuda, registrarPago } from "./deudas.ts";

let cliente: ClienteDb;
let app: ReturnType<typeof appDePrueba>;
let ana: PersonaDePrueba;
let beto: string;

/** 12:00 en Montevideo del martes 20 de octubre de 2026. */
const AHORA = new Date("2026-10-20T15:00:00.000Z");

beforeAll(() => {
  cliente = clienteDePrueba();
  app = appDePrueba(cliente);
});

beforeEach(async () => {
  await limpiarBase(cliente);
  ana = await entrarComoPersona(app, cliente);
  beto = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Beto" }));
});

afterAll(async () => {
  await cliente.cerrar();
});

type DeudaJson = {
  id: string;
  sentido: string;
  concepto: string;
  montoCentavos: number;
  moneda: string;
  fecha: string;
  fechaLimite: string | null;
  pagadoCentavos: number;
  pendienteCentavos: number;
  saldada: boolean;
  contacto: { id: string; nombre: string; eliminado: boolean } | null;
  nombreLibre: string | null;
  pagos: { id: string; montoCentavos: number; fecha: string }[];
};

type ListaJson = { deudas: DeudaJson[]; total: number };

function pagar(deudaId: string, cuerpo: unknown, cookies = ana.cookies) {
  return pedir(app, cookies, `/api/finanzas/deudas/${deudaId}/pagos`, "POST", cuerpo);
}

async function leer(deudaId: string, cookies = ana.cookies): Promise<DeudaJson> {
  const respuesta = await pedir(app, cookies, `/api/finanzas/deudas/${deudaId}`);
  expect(respuesta.status).toBe(200);
  return await leerJson<DeudaJson>(respuesta);
}

async function listar(consulta = "", cookies = ana.cookies): Promise<ListaJson> {
  const respuesta = await pedir(app, cookies, `/api/finanzas/deudas${consulta}`);
  expect(respuesta.status).toBe(200);
  return await leerJson<ListaJson>(respuesta);
}

describe("sin sesión", () => {
  const rutas: [string, string][] = [
    ["GET", "/api/finanzas/deudas"],
    ["POST", "/api/finanzas/deudas"],
    ["GET", "/api/finanzas/deudas/resumen"],
    ["GET", "/api/finanzas/deudas/00000000-0000-4000-8000-000000000000"],
    ["POST", "/api/finanzas/deudas/00000000-0000-4000-8000-000000000000/pagos"],
  ];

  it.each(rutas)("rechaza %s %s con 401", async (metodo, ruta) => {
    expect((await pedir(app, null, ruta, metodo, metodo === "POST" ? {} : undefined)).status).toBe(
      401,
    );
  });
});

describe("registrar una deuda", () => {
  it("crea una deuda en cada sentido, con su contacto y todo pendiente", async () => {
    const respuesta = await registrarDeuda(app, ana.cookies, {
      contactoId: beto,
      sentido: "me_deben",
      concepto: "Préstamo para el alquiler",
      monto: 5000.5,
      moneda: "UYU",
      fecha: "2026-10-01",
    });
    expect(respuesta.status).toBe(201);
    expect(await leerJson<DeudaJson>(respuesta)).toMatchObject({
      sentido: "me_deben",
      concepto: "Préstamo para el alquiler",
      montoCentavos: 500_050,
      moneda: "UYU",
      fecha: "2026-10-01",
      pagadoCentavos: 0,
      pendienteCentavos: 500_050,
      saldada: false,
      contacto: { id: beto, nombre: "Beto", eliminado: false },
      pagos: [],
    });

    const debo = await registrarDeuda(app, ana.cookies, {
      contactoId: beto,
      sentido: "debo",
      moneda: "USD",
    });
    expect(debo.status).toBe(201);
    expect(await leerJson<DeudaJson>(debo)).toMatchObject({ sentido: "debo", moneda: "USD" });
  });

  it("guarda los centésimos exactos y acepta el tope de un importe", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 0.01 });
    expect((await leer(id)).montoCentavos).toBe(1);

    const grande = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      monto: 9_999_999_999,
    });
    expect((await leer(grande)).montoCentavos).toBe(999_999_999_900);
  });

  it("valida cada campo y dice cuál falla", async () => {
    const campoDe = async (cambios: Record<string, unknown>) => {
      const respuesta = await registrarDeuda(app, ana.cookies, {
        contactoId: beto,
        ...cambios,
      });
      expect(respuesta.status, JSON.stringify(cambios)).toBe(400);
      const cuerpo = await leerJson<{ error: { campos: { campo: string }[] } }>(respuesta);
      return cuerpo.error.campos[0]?.campo;
    };

    expect(await campoDe({ sentido: "regalo" })).toBe("sentido");
    expect(await campoDe({ concepto: "  " })).toBe("concepto");
    expect(await campoDe({ concepto: "a".repeat(141) })).toBe("concepto");
    expect(await campoDe({ monto: 0 })).toBe("monto");
    expect(await campoDe({ monto: -5 })).toBe("monto");
    expect(await campoDe({ monto: 10_000_000_000 })).toBe("monto");
    expect(await campoDe({ moneda: "XYZ" })).toBe("moneda");
    expect(await campoDe({ fecha: "2026-02-30" })).toBe("fecha");
    expect(await campoDe({ fecha: "ayer" })).toBe("fecha");
    expect(await campoDe({ contactoId: "ana" })).toBe("contactoId");
  });

  it("no acepta una fecha posterior a hoy, ni un contacto que no es de la persona o está eliminado", async () => {
    const futura = await registrarDeuda(app, ana.cookies, {
      contactoId: beto,
      fecha: "2999-01-01",
    });
    expect(futura.status).toBe(400);

    const otra = await entrarComoPersona(app, cliente);
    const deOtra = await crearContactoPorApi(app, otra.cookies, personaValida({ nombre: "Ajeno" }));
    const ajeno = await registrarDeuda(app, ana.cookies, { contactoId: deOtra });
    expect(ajeno.status).toBe(400);
    expect(
      (
        await registrarDeuda(app, ana.cookies, {
          contactoId: "00000000-0000-4000-8000-000000000000",
        })
      ).status,
    ).toBe(400);

    await pedir(app, ana.cookies, `/api/contactos/${beto}`, "DELETE");
    expect((await registrarDeuda(app, ana.cookies, { contactoId: beto })).status).toBe(400);
    expect((await listar("?estado=todas")).total).toBe(0);
  });

  it("'hoy' es el de la zona horaria de la persona", async () => {
    // 01:00 UTC del 21/10: en Montevideo sigue siendo el 20.
    const madrugada = new Date("2026-10-21T01:00:00.000Z");
    const deHoy = await crearDeuda(
      cliente,
      ana.userId,
      {
        contactoId: beto,
        sentido: "me_deben",
        concepto: "Hoy",
        montoCentavos: 100,
        moneda: "UYU",
        fecha: "2026-10-20",
      },
      madrugada,
    );
    expect(deHoy.fecha).toBe("2026-10-20");

    await expect(
      crearDeuda(
        cliente,
        ana.userId,
        {
          contactoId: beto,
          sentido: "me_deben",
          concepto: "Mañana",
          montoCentavos: 100,
          moneda: "UYU",
          fecha: "2026-10-21",
        },
        madrugada,
      ),
    ).rejects.toThrow();
  });
});

describe("deudas con alguien que no es un contacto", () => {
  it("se registra solo con un nombre, y queda indicado que no es un contacto", async () => {
    const respuesta = await registrarDeuda(app, ana.cookies, {
      nombreLibre: "  El del taller  ",
      sentido: "debo",
      monto: 800,
    });
    expect(respuesta.status).toBe(201);
    const deuda = await leerJson<DeudaJson>(respuesta);
    expect(deuda).toMatchObject({
      contacto: null,
      nombreLibre: "El del taller",
      sentido: "debo",
      pendienteCentavos: 80_000,
    });
    // Se lee igual por su id y en el listado.
    expect(await leer(deuda.id)).toMatchObject({ contacto: null, nombreLibre: "El del taller" });
    const lista = await listar();
    expect(lista.deudas).toHaveLength(1);
    expect(lista.deudas[0]).toMatchObject({ contacto: null, nombreLibre: "El del taller" });
  });

  it("una con contacto lo trae y no tiene nombre escrito", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto });
    expect(await leer(id)).toMatchObject({ contacto: { id: beto }, nombreLibre: null });
  });

  it("pide uno de los dos: sin ninguno, o con los dos, falla y dice en qué campo", async () => {
    const sinNinguno = await registrarDeuda(app, ana.cookies, {});
    expect(sinNinguno.status).toBe(400);
    const cuerpo = await leerJson<{ error: { campos: { campo: string }[] } }>(sinNinguno);
    expect(cuerpo.error.campos.map((aviso) => aviso.campo)).toEqual(
      expect.arrayContaining(["contactoId", "nombreLibre"]),
    );

    expect((await registrarDeuda(app, ana.cookies, { nombreLibre: "   " })).status).toBe(400);

    const conLosDos = await registrarDeuda(app, ana.cookies, {
      contactoId: beto,
      nombreLibre: "Beto",
    });
    expect(conLosDos.status).toBe(400);
    expect((await listar("?estado=todas")).total).toBe(0);
  });

  it("limita el largo del nombre, y un contacto ajeno sigue siendo inválido", async () => {
    expect((await registrarDeuda(app, ana.cookies, { nombreLibre: "a".repeat(81) })).status).toBe(
      400,
    );
    expect((await registrarDeuda(app, ana.cookies, { nombreLibre: "a".repeat(80) })).status).toBe(
      201,
    );
    const otra = await entrarComoPersona(app, cliente);
    const ajeno = await crearContactoPorApi(app, otra.cookies, personaValida({ nombre: "Zoe" }));
    expect((await registrarDeuda(app, ana.cookies, { contactoId: ajeno })).status).toBe(400);
  });

  it("el servicio también exige uno de los dos", async () => {
    const base = {
      sentido: "me_deben" as const,
      concepto: "x",
      montoCentavos: 100,
      moneda: "UYU",
      fecha: "2026-10-01",
    };
    await expect(crearDeuda(cliente, ana.userId, base, AHORA)).rejects.toThrow();
    await expect(
      crearDeuda(cliente, ana.userId, { ...base, contactoId: beto, nombreLibre: "Beto" }, AHORA),
    ).rejects.toThrow();
  });

  it("la base misma impide una deuda sin con quién", async () => {
    await expect(
      cliente.db.execute(
        sql`insert into deudas (user_id, sentido, concepto, monto_centavos, moneda, fecha) values (${ana.userId}, 'debo', 'x', 100, 'UYU', '2026-10-01')`,
      ),
    ).rejects.toThrow();
  });

  it("se salda con pagos como cualquier otra, se edita y se elimina", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { nombreLibre: "Vecino", monto: 100 });
    await pagar(id, { monto: 40, fecha: "2026-10-05" });
    expect(await leer(id)).toMatchObject({ pagadoCentavos: 4000, pendienteCentavos: 6000 });
    const editada = await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "PUT", {
      concepto: "Cambio",
      monto: 120,
      fecha: "2026-10-01",
    });
    expect(editada.status).toBe(200);
    expect(await leerJson<DeudaJson>(editada)).toMatchObject({
      nombreLibre: "Vecino",
      contacto: null,
      concepto: "Cambio",
    });
    expect((await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "DELETE")).status).toBe(
      200,
    );
  });

  it("suman a lo que te deben y debés, pero no cuentan como contactos", async () => {
    await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 1000 });
    await crearDeudaPorApi(app, ana.cookies, { nombreLibre: "Vecino", monto: 500 });
    await crearDeudaPorApi(app, ana.cookies, { nombreLibre: "Vecino", monto: 70, sentido: "debo" });

    const resumen = await leerJson<{
      meDeben: { moneda: string; centavos: number; deudas: number }[];
      debo: { moneda: string; centavos: number; deudas: number }[];
      contactos: number;
    }>(await pedir(app, ana.cookies, "/api/finanzas/deudas/resumen"));
    expect(resumen.meDeben).toEqual([{ moneda: "UYU", centavos: 150_000, deudas: 2 }]);
    expect(resumen.debo).toEqual([{ moneda: "UYU", centavos: 7000, deudas: 1 }]);
    expect(resumen.contactos).toBe(1);
  });

  it("filtrar por contacto no trae las de nombre escrito", async () => {
    await crearDeudaPorApi(app, ana.cookies, { contactoId: beto });
    await crearDeudaPorApi(app, ana.cookies, { nombreLibre: "Vecino" });
    const deBeto = await listar(`?contactoId=${beto}`);
    expect(deBeto.total).toBe(1);
    expect(deBeto.deudas[0]?.contacto?.id).toBe(beto);
  });

  it("una persona no ve las deudas con nombre de otra", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const id = await crearDeudaPorApi(app, ana.cookies, { nombreLibre: "Vecino" });
    expect((await listar("?estado=todas", otra.cookies)).total).toBe(0);
    expect((await pedir(app, otra.cookies, `/api/finanzas/deudas/${id}`)).status).toBe(404);
  });

  it("eliminada, la limpieza la borra en definitivo pasado el plazo", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { nombreLibre: "Vecino" });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "DELETE");
    const pasado = await limpiarContactos(cliente, new Date(Date.now() + 31 * 24 * 60 * 60 * 1000));
    expect(pasado.deudasBorradas).toBe(1);
  });
});

describe("fecha límite", () => {
  const editar = (id: string, cuerpo: Record<string, unknown>) =>
    pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "PUT", cuerpo);

  it("es opcional: sin ella la deuda queda con null, y con ella se guarda y se lista", async () => {
    const sin = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto });
    expect((await leer(sin)).fechaLimite).toBeNull();

    const con = await registrarDeuda(app, ana.cookies, {
      contactoId: beto,
      fecha: "2026-10-01",
      fechaLimite: "2026-11-15",
    });
    expect(con.status).toBe(201);
    const creada = await leerJson<DeudaJson>(con);
    expect(creada.fechaLimite).toBe("2026-11-15");
    const lista = await listar();
    expect(lista.deudas.find((deuda) => deuda.id === creada.id)?.fechaLimite).toBe("2026-11-15");
    // Una cadena vacía cuenta como sin límite.
    const vacia = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, fechaLimite: "" });
    expect((await leer(vacia)).fechaLimite).toBeNull();
  });

  it("puede ser el mismo día de la deuda, no uno anterior, y tiene que ser un día válido", async () => {
    const igual = await registrarDeuda(app, ana.cookies, {
      contactoId: beto,
      fecha: "2026-10-01",
      fechaLimite: "2026-10-01",
    });
    expect(igual.status).toBe(201);

    const anterior = await registrarDeuda(app, ana.cookies, {
      contactoId: beto,
      fecha: "2026-10-10",
      fechaLimite: "2026-10-09",
    });
    expect(anterior.status).toBe(400);
    const cuerpo = await leerJson<{ error: { campos: { campo: string }[] } }>(anterior);
    expect(cuerpo.error.campos[0]?.campo).toBe("fechaLimite");

    for (const fechaLimite of ["2026-02-30", "mañana"]) {
      expect(
        (await registrarDeuda(app, ana.cookies, { contactoId: beto, fechaLimite })).status,
        fechaLimite,
      ).toBe(400);
    }
  });

  it("se permite un límite que ya pasó (una deuda atrasada)", async () => {
    const respuesta = await registrarDeuda(app, ana.cookies, {
      contactoId: beto,
      fecha: "2026-01-01",
      fechaLimite: "2026-02-01",
    });
    expect(respuesta.status).toBe(201);
  });

  it("al editar se cambia, y vacía la quita; sin el campo queda como estaba", async () => {
    const id = (
      await leerJson<DeudaJson>(
        await registrarDeuda(app, ana.cookies, {
          contactoId: beto,
          fecha: "2026-10-01",
          fechaLimite: "2026-11-01",
        }),
      )
    ).id;
    const base = { concepto: "Préstamo", monto: 1000, fecha: "2026-10-01" };

    expect(
      (await leerJson<DeudaJson>(await editar(id, { ...base, fechaLimite: "2026-12-01" })))
        .fechaLimite,
    ).toBe("2026-12-01");
    expect((await leerJson<DeudaJson>(await editar(id, base))).fechaLimite).toBe("2026-12-01");
    expect(
      (await leerJson<DeudaJson>(await editar(id, { ...base, fechaLimite: "" }))).fechaLimite,
    ).toBeNull();
  });

  it("al editar no puede quedar antes del día de la deuda, ni mover el día de la deuda más allá del límite", async () => {
    const id = (
      await leerJson<DeudaJson>(
        await registrarDeuda(app, ana.cookies, {
          contactoId: beto,
          fecha: "2026-10-01",
          fechaLimite: "2026-10-20",
        }),
      )
    ).id;
    const base = { concepto: "Préstamo", monto: 1000 };
    expect(
      (await editar(id, { ...base, fecha: "2026-10-01", fechaLimite: "2026-09-30" })).status,
    ).toBe(400);
    // Solo se cambia el día de la deuda: el límite que ya tenía pasaría a ser anterior.
    const respuesta = await editar(id, { ...base, fecha: "2026-10-25" });
    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<{ error: { campos: { campo: string }[] } }>(respuesta);
    expect(cuerpo.error.campos[0]?.campo).toBe("fechaLimite");
    expect((await leer(id)).fechaLimite).toBe("2026-10-20");
  });

  it("también vale para las deudas con solo un nombre, y los pagos no la tocan", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Vecino",
      fechaLimite: "2026-10-30",
      monto: 100,
    });
    await pagar(id, { monto: 100, fecha: "2026-10-05" });
    expect(await leer(id)).toMatchObject({ saldada: true, fechaLimite: "2026-10-30" });
  });

  it("el servicio la valida igual que la ruta", async () => {
    const base = {
      contactoId: beto,
      sentido: "me_deben" as const,
      concepto: "x",
      montoCentavos: 100,
      moneda: "UYU",
      fecha: "2026-10-10",
    };
    await expect(
      crearDeuda(cliente, ana.userId, { ...base, fechaLimite: "2026-10-09" }, AHORA),
    ).rejects.toThrow();
    const creada = await crearDeuda(
      cliente,
      ana.userId,
      { ...base, fechaLimite: "2026-10-10" },
      AHORA,
    );
    expect(creada.fechaLimite).toBe("2026-10-10");
  });

  it("la base misma impide un límite anterior al día de la deuda", async () => {
    await expect(
      cliente.db.execute(
        sql`insert into deudas (user_id, nombre_libre, sentido, concepto, monto_centavos, moneda, fecha, fecha_limite) values (${ana.userId}, x, debo, x, 100, UYU, 2026-10-10, 2026-10-09)`,
      ),
    ).rejects.toThrow();
  });

  it("una persona no ve la fecha límite de las deudas de otra", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      fechaLimite: "2026-12-01",
    });
    expect((await pedir(app, otra.cookies, `/api/finanzas/deudas/${id}`)).status).toBe(404);
    const ajena = await pedir(app, otra.cookies, `/api/finanzas/deudas/${id}`, "PUT", {
      concepto: "x",
      monto: 1,
      fecha: "2026-10-01",
      fechaLimite: "",
    });
    expect(ajena.status).toBe(404);
    expect((await leer(id)).fechaLimite).toBe("2026-12-01");
  });
});

describe("un pago que genera su ingreso o gasto", () => {
  type MovimientoJson = {
    id: string;
    tipo: string;
    importeCentavos: number;
    importeConvertidoCentavos: number;
    descripcion: string;
    fecha: string;
    cuentaFinanciera: { id: string; nombre: string };
    contacto: { id: string } | null;
  };
  type CuentaJson = { id: string; nombre: string; moneda: string; saldoCentavos: number };

  let entorno: { cuentaId: string; categoriaId: number };

  beforeEach(async () => {
    entorno = await prepararFinanzas(app, ana.cookies);
  });

  async function movimientos(cookies = ana.cookies): Promise<MovimientoJson[]> {
    const respuesta = await pedir(app, cookies, "/api/finanzas/movimientos?limit=100");
    expect(respuesta.status).toBe(200);
    return (await leerJson<{ movimientos: MovimientoJson[] }>(respuesta)).movimientos;
  }

  async function saldoDe(cuentaId: string, cookies = ana.cookies): Promise<number> {
    const { cuentas } = await leerJson<{ cuentas: CuentaJson[] }>(
      await pedir(app, cookies, "/api/finanzas/cuentas"),
    );
    return cuentas.find((cuenta) => cuenta.id === cuentaId)?.saldoCentavos ?? Number.NaN;
  }

  function pagarConMovimiento(
    deudaId: string,
    cuerpo: Record<string, unknown>,
    cookies = ana.cookies,
  ) {
    return pagar(
      deudaId,
      {
        fecha: "2026-10-05",
        movimiento: { cuentaFinancieraId: entorno.cuentaId, categoriaId: entorno.categoriaId },
        ...cuerpo,
      },
      cookies,
    );
  }

  it("un cobro genera un ingreso en la cuenta elegida, con el contacto y la descripción", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      monto: 1000,
      concepto: "Préstamo para el alquiler",
    });
    const antes = await saldoDe(entorno.cuentaId);

    const respuesta = await pagarConMovimiento(id, { monto: 400 });
    expect(respuesta.status).toBe(201);
    const deuda = await leerJson<
      DeudaJson & { pagos: { movimiento: { tipo: string; cuenta: string } | null }[] }
    >(respuesta);
    expect(deuda).toMatchObject({ pagadoCentavos: 40_000, pendienteCentavos: 60_000 });
    expect(deuda.pagos[0]?.movimiento).toMatchObject({ tipo: "ingreso" });

    const [movimiento] = await movimientos();
    expect(movimiento).toMatchObject({
      tipo: "ingreso",
      importeCentavos: 40_000,
      descripcion: "Cobro: Préstamo para el alquiler",
      cuentaFinanciera: { id: entorno.cuentaId },
      contacto: { id: beto },
    });
    expect(await saldoDe(entorno.cuentaId)).toBe(antes + 40_000);
  });

  it("un pago de lo que debés genera un gasto, y completa la deuda", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      sentido: "debo",
      monto: 250,
      concepto: "Cuota",
    });
    const antes = await saldoDe(entorno.cuentaId);

    const respuesta = await pagarConMovimiento(id, { monto: 250 });
    expect(respuesta.status).toBe(201);
    expect(await leerJson<DeudaJson>(respuesta)).toMatchObject({ saldada: true });

    const [movimiento] = await movimientos();
    expect(movimiento).toMatchObject({
      tipo: "gasto",
      importeCentavos: 25_000,
      descripcion: "Pago: Cuota",
    });
    expect(await saldoDe(entorno.cuentaId)).toBe(antes - 25_000);
  });

  it("sin pedirlo no se genera nada: la deuda sigue sin tocar las cuentas", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    const antes = await saldoDe(entorno.cuentaId);
    expect((await pagar(id, { monto: 100, fecha: "2026-10-05" })).status).toBe(201);
    expect(await movimientos()).toEqual([]);
    expect(await saldoDe(entorno.cuentaId)).toBe(antes);
  });

  it("el movimiento cae el día del pago: hoy, a la hora de ahora; otro día, a mediodía de ese día", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      monto: 1000,
      fecha: "2026-09-01",
    });
    await pagarConMovimiento(id, { monto: 100, fecha: "2026-10-05" });
    const [pasado] = await movimientos();
    // La zona de las cuentas nuevas es Montevideo (UTC-3): mediodía local son las 15:00 UTC.
    expect(pasado?.fecha).toBe("2026-10-05T15:00:00.000Z");

    const hoy = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Montevideo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const antes = Date.now();
    await pagarConMovimiento(id, { monto: 100, fecha: hoy });
    const deHoy = (await movimientos()).find((movimiento) => movimiento.id !== pasado?.id);
    const instante = new Date(deHoy?.fecha ?? 0).getTime();
    expect(instante).toBeGreaterThanOrEqual(antes - 5000);
    expect(instante).toBeLessThanOrEqual(Date.now() + 5000);
  });

  it("si el día del pago no cae en ningún período, no se registra ni el pago ni el movimiento", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      monto: 500,
      fecha: "2025-05-01",
    });
    const respuesta = await pagarConMovimiento(id, { monto: 100, fecha: "2025-06-01" });
    expect(respuesta.status).toBe(400);
    const cuerpo = await leerJson<{ error: { campos: { campo: string; mensaje: string }[] } }>(
      respuesta,
    );
    expect(cuerpo.error.campos[0]?.campo).toBe("movimiento");
    expect(cuerpo.error.campos[0]?.mensaje).toMatch(/no cae dentro de ninguno de tus períodos/);

    expect(await leer(id)).toMatchObject({ pagadoCentavos: 0, pagos: [] });
    expect(await movimientos()).toEqual([]);
    // Sin generar el movimiento, ese mismo pago sí se puede registrar.
    expect((await pagar(id, { monto: 100, fecha: "2025-06-01" })).status).toBe(201);
  });

  it("sin período abierto avisa y no registra nada", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const deOtra = await crearContactoPorApi(app, otra.cookies, personaValida({ nombre: "Zoe" }));
    const id = await crearDeudaPorApi(app, otra.cookies, { contactoId: deOtra, monto: 100 });
    // Cuentas y categorías existen desde el primer pedido, pero no hay ningún período.
    const { cuentas } = await leerJson<{ cuentas: CuentaJson[] }>(
      await pedir(app, otra.cookies, "/api/finanzas/cuentas"),
    );
    const { categorias } = await leerJson<{ categorias: { id: number; sistema: string | null }[] }>(
      await pedir(app, otra.cookies, "/api/finanzas/categorias"),
    );
    const respuesta = await pagar(
      id,
      {
        monto: 50,
        fecha: "2026-10-05",
        movimiento: {
          cuentaFinancieraId: cuentas[0]?.id,
          categoriaId: categorias.find((categoria) => categoria.sistema === null)?.id,
        },
      },
      otra.cookies,
    );
    expect(respuesta.status).toBe(400);
    expect(await respuesta.text()).toMatch(/No tenés un período abierto/);
    expect(await leer(id, otra.cookies)).toMatchObject({ pagadoCentavos: 0 });
  });

  describe("con una cuenta de otra moneda que la deuda", () => {
    async function cuentaEn(moneda: string): Promise<CuentaJson> {
      return await leerJson<CuentaJson>(
        await pedir(app, ana.cookies, "/api/finanzas/cuentas", "POST", {
          nombre: `Cuenta ${moneda}`,
          saldoInicial: 0,
          moneda,
        }),
      );
    }

    type CampoJson = { error: { campos: { campo: string; mensaje: string }[] } };

    it("convierte con la cotización del día: una deuda en dólares cobrada en una cuenta en pesos", async () => {
      const id = await crearDeudaPorApi(app, ana.cookies, {
        contactoId: beto,
        monto: 100,
        moneda: "USD",
      });
      // La cuenta por defecto es en pesos (la moneda base) y el dólar vale 40 en la cotización de prueba.
      const respuesta = await pagarConMovimiento(id, { monto: 25 });
      expect(respuesta.status).toBe(201);
      expect(await leerJson<DeudaJson>(respuesta)).toMatchObject({
        pagadoCentavos: 2500,
        pendienteCentavos: 7500,
      });

      const [movimiento] = await movimientos();
      // El movimiento es en la moneda de la cuenta (pesos): 25 dólares son 1.000 pesos.
      expect(movimiento).toMatchObject({
        tipo: "ingreso",
        importeCentavos: 100_000,
        importeConvertidoCentavos: 100_000,
      });
      // La descripción conserva de cuánto era el pago.
      expect(movimiento?.descripcion).toMatch(/^Cobro: Préstamo \(US\$\s?25,00\)$/);
      expect(await saldoDe(entorno.cuentaId)).toBe(100_000);
    });

    it("y al revés: una deuda en pesos cobrada en una cuenta en dólares", async () => {
      const dolares = await cuentaEn("USD");
      const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 1000 });
      const respuesta = await pagarConMovimiento(id, {
        monto: 400,
        movimiento: { cuentaFinancieraId: dolares.id, categoriaId: entorno.categoriaId },
      });
      expect(respuesta.status).toBe(201);
      const [movimiento] = await movimientos();
      // 400 pesos son 10 dólares; y el movimiento, ya en pesos base, vuelve a 400.
      expect(movimiento).toMatchObject({
        importeCentavos: 1000,
        importeConvertidoCentavos: 40_000,
      });
      expect(await saldoDe(dolares.id)).toBe(1000);
    });

    it("con una cotización escrita", async () => {
      const id = await crearDeudaPorApi(app, ana.cookies, {
        contactoId: beto,
        monto: 100,
        moneda: "USD",
      });
      const respuesta = await pagarConMovimiento(id, {
        monto: 25,
        movimiento: {
          cuentaFinancieraId: entorno.cuentaId,
          categoriaId: entorno.categoriaId,
          cambio: { modo: "tasa", tasa: 38 },
        },
      });
      expect(respuesta.status).toBe(201);
      expect((await movimientos())[0]).toMatchObject({ importeCentavos: 95_000 });
    });

    it("con el importe que llegó a la cuenta", async () => {
      const id = await crearDeudaPorApi(app, ana.cookies, {
        contactoId: beto,
        monto: 100,
        moneda: "USD",
      });
      const respuesta = await pagarConMovimiento(id, {
        monto: 25,
        movimiento: {
          cuentaFinancieraId: entorno.cuentaId,
          categoriaId: entorno.categoriaId,
          cambio: { modo: "importe", importeConvertido: 900 },
        },
      });
      expect(respuesta.status).toBe(201);
      // Lo que se descuenta de la deuda es lo pagado (25 dólares); en la cuenta entraron 900 pesos.
      expect(await leerJson<DeudaJson>(respuesta)).toMatchObject({ pagadoCentavos: 2500 });
      expect((await movimientos())[0]).toMatchObject({ importeCentavos: 90_000 });
      expect(await saldoDe(entorno.cuentaId)).toBe(90_000);
    });

    it("una cotización inválida se rechaza y no se registra nada", async () => {
      const id = await crearDeudaPorApi(app, ana.cookies, {
        contactoId: beto,
        monto: 100,
        moneda: "USD",
      });
      for (const cambio of [
        { modo: "tasa", tasa: 0 },
        { modo: "tasa", tasa: -3 },
        { modo: "importe", importeConvertido: 0 },
      ]) {
        const respuesta = await pagarConMovimiento(id, {
          monto: 25,
          movimiento: {
            cuentaFinancieraId: entorno.cuentaId,
            categoriaId: entorno.categoriaId,
            cambio,
          },
        });
        expect(respuesta.status, JSON.stringify(cambio)).toBe(400);
      }
      expect(await leer(id)).toMatchObject({ pagadoCentavos: 0 });
      expect(await movimientos()).toEqual([]);
    });

    it("pedir una cotización distinta a la automática en la misma moneda es un error", async () => {
      const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
      const respuesta = await pagarConMovimiento(id, {
        monto: 10,
        movimiento: {
          cuentaFinancieraId: entorno.cuentaId,
          categoriaId: entorno.categoriaId,
          cambio: { modo: "tasa", tasa: 2 },
        },
      });
      expect(respuesta.status).toBe(400);
      const cuerpo = await leerJson<CampoJson>(respuesta);
      expect(cuerpo.error.campos[0]?.campo).toBe("movimiento");
      expect(await leer(id)).toMatchObject({ pagadoCentavos: 0 });
    });

    it("sin la cotización del día pide escribirla, y no registra el pago hasta tenerla", async () => {
      const caida = crearFuenteDePrueba();
      caida.caida = true;
      const appSinCotizacion = appDePrueba(cliente, undefined, caida.fuente);
      const id = await crearDeudaPorApi(app, ana.cookies, {
        contactoId: beto,
        monto: 100,
        moneda: "USD",
      });
      const cuerpo = {
        monto: 25,
        fecha: "2026-10-05",
        movimiento: { cuentaFinancieraId: entorno.cuentaId, categoriaId: entorno.categoriaId },
      };
      const ruta = `/api/finanzas/deudas/${id}/pagos`;
      const sin = await pedir(appSinCotizacion, ana.cookies, ruta, "POST", cuerpo);
      expect(sin.status).toBe(400);
      expect((await leerJson<CampoJson>(sin)).error.campos[0]?.mensaje).toMatch(/cotización/);
      expect(await leer(id)).toMatchObject({ pagadoCentavos: 0 });

      // Escribiendo la cotización sí se registra, aunque la fuente siga caída.
      const con = await pedir(appSinCotizacion, ana.cookies, ruta, "POST", {
        ...cuerpo,
        movimiento: { ...cuerpo.movimiento, cambio: { modo: "tasa", tasa: 40 } },
      });
      expect(con.status).toBe(201);
    });

    it("al quitar el pago se va el movimiento convertido y vuelve el saldo", async () => {
      const id = await crearDeudaPorApi(app, ana.cookies, {
        contactoId: beto,
        monto: 100,
        moneda: "USD",
      });
      const conPago = await leerJson<DeudaJson>(await pagarConMovimiento(id, { monto: 25 }));
      expect(await saldoDe(entorno.cuentaId)).toBe(100_000);
      await pedir(
        app,
        ana.cookies,
        `/api/finanzas/deudas/${id}/pagos/${conPago.pagos[0]?.id}`,
        "DELETE",
      );
      expect(await saldoDe(entorno.cuentaId)).toBe(0);
      expect(await movimientos()).toEqual([]);
    });

    it("una descripción larguísima sigue entrando con la aclaración del importe", async () => {
      const id = await crearDeudaPorApi(app, ana.cookies, {
        contactoId: beto,
        monto: 100,
        moneda: "USD",
        concepto: "x".repeat(140),
      });
      expect((await pagarConMovimiento(id, { monto: 25 })).status).toBe(201);
      const descripcion = (await movimientos())[0]?.descripcion ?? "";
      expect(descripcion.length).toBeLessThanOrEqual(140);
      expect(descripcion).toMatch(/\(US\$\s?25,00\)$/);
    });
  });

  it("una deuda en dólares se salda en una cuenta en dólares, y el movimiento se convierte a la moneda base", async () => {
    const dolares = await leerJson<CuentaJson>(
      await pedir(app, ana.cookies, "/api/finanzas/cuentas", "POST", {
        nombre: "Dólares",
        saldoInicial: 0,
        moneda: "USD",
      }),
    );
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      monto: 100,
      moneda: "USD",
    });
    const respuesta = await pagarConMovimiento(id, {
      monto: 25,
      movimiento: { cuentaFinancieraId: dolares.id, categoriaId: entorno.categoriaId },
    });
    expect(respuesta.status).toBe(201);
    const [movimiento] = await movimientos();
    // 25 dólares a 40 pesos cada uno (la cotización de prueba).
    expect(movimiento).toMatchObject({ importeCentavos: 2500, importeConvertidoCentavos: 100_000 });
    expect(await saldoDe(dolares.id)).toBe(2500);
  });

  it("no acepta la cuenta o la categoría de otra persona, ni la categoría de las transferencias", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const ajena = await prepararFinanzas(app, otra.cookies);
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });

    const cuentaAjena = await pagarConMovimiento(id, {
      monto: 10,
      movimiento: { cuentaFinancieraId: ajena.cuentaId, categoriaId: entorno.categoriaId },
    });
    expect(cuentaAjena.status).toBe(400);
    const categoriaAjena = await pagarConMovimiento(id, {
      monto: 10,
      movimiento: { cuentaFinancieraId: entorno.cuentaId, categoriaId: 999_999 },
    });
    expect(categoriaAjena.status).toBe(400);

    const { categorias } = await leerJson<{ categorias: { id: number; sistema: string | null }[] }>(
      await pedir(app, ana.cookies, "/api/finanzas/categorias"),
    );
    const transferencia = categorias.find((categoria) => categoria.sistema === "transferencia");
    const conTransferencia = await pagarConMovimiento(id, {
      monto: 10,
      movimiento: { cuentaFinancieraId: entorno.cuentaId, categoriaId: transferencia?.id },
    });
    expect(conTransferencia.status).toBe(400);

    expect(await leer(id)).toMatchObject({ pagadoCentavos: 0 });
    expect(await movimientos()).toEqual([]);
    expect(await movimientos(otra.cookies)).toEqual([]);
  });

  it("pide la cuenta y la categoría cuando se quiere generar el movimiento", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    const sinCuenta = await pagar(id, {
      monto: 10,
      fecha: "2026-10-05",
      movimiento: { categoriaId: entorno.categoriaId },
    });
    expect(sinCuenta.status).toBe(400);
    const sinCategoria = await pagar(id, {
      monto: 10,
      fecha: "2026-10-05",
      movimiento: { cuentaFinancieraId: entorno.cuentaId },
    });
    expect(sinCategoria.status).toBe(400);
  });

  it("un pago que pasa de lo que falta se rechaza sin generar ningún movimiento", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    const respuesta = await pagarConMovimiento(id, { monto: 100.01 });
    expect(respuesta.status).toBe(400);
    expect(await movimientos()).toEqual([]);
    expect(await leer(id)).toMatchObject({ pagadoCentavos: 0 });
  });

  it("dos pagos a la vez que no entran juntos: solo uno se registra, con un solo movimiento", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    const respuestas = await Promise.all([
      pagarConMovimiento(id, { monto: 80 }),
      pagarConMovimiento(id, { monto: 80 }),
    ]);
    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual([201, 400]);
    expect(await movimientos()).toHaveLength(1);
    expect(await leer(id)).toMatchObject({ pagadoCentavos: 8000 });
  });

  it("quitar el pago elimina también su movimiento y devuelve el saldo de la cuenta", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 300 });
    const antes = await saldoDe(entorno.cuentaId);
    const conPago = await leerJson<DeudaJson>(await pagarConMovimiento(id, { monto: 300 }));
    expect(await saldoDe(entorno.cuentaId)).toBe(antes + 30_000);

    const quitado = await pedir(
      app,
      ana.cookies,
      `/api/finanzas/deudas/${id}/pagos/${conPago.pagos[0]?.id}`,
      "DELETE",
    );
    expect(quitado.status).toBe(200);
    expect(await leerJson<DeudaJson>(quitado)).toMatchObject({ pagadoCentavos: 0, saldada: false });
    expect(await movimientos()).toEqual([]);
    expect(await saldoDe(entorno.cuentaId)).toBe(antes);
  });

  it("quitar un pago sin movimiento no toca ningún movimiento", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 300 });
    await pagarConMovimiento(id, { monto: 100 });
    const sin = await leerJson<DeudaJson>(await pagar(id, { monto: 50, fecha: "2026-10-06" }));
    const pagoSin = sin.pagos.find((pago) => pago.montoCentavos === 5000);
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}/pagos/${pagoSin?.id}`, "DELETE");
    expect(await movimientos()).toHaveLength(1);
  });

  it("si el movimiento se eliminó por su lado, el pago queda como un pago común y se puede quitar", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    await pagarConMovimiento(id, { monto: 100 });
    const [movimiento] = await movimientos();
    expect(
      (await pedir(app, ana.cookies, `/api/finanzas/movimientos/${movimiento?.id}`, "DELETE"))
        .status,
    ).toBe(200);

    const deuda = await leer(id);
    expect(deuda.pagos[0]).toMatchObject({ movimiento: null });
    expect(deuda.saldada).toBe(true);
    const quitado = await pedir(
      app,
      ana.cookies,
      `/api/finanzas/deudas/${id}/pagos/${deuda.pagos[0]?.id}`,
      "DELETE",
    );
    expect(quitado.status).toBe(200);
  });

  it("una deuda con solo un nombre, o con un contacto en la papelera, genera el movimiento sin contacto", async () => {
    const conNombre = await crearDeudaPorApi(app, ana.cookies, {
      nombreLibre: "Vecino",
      monto: 100,
    });
    await pagarConMovimiento(conNombre, { monto: 10 });

    const deBeto = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    await cliente.db.execute(sql`update contactos set eliminado_en = now() where id = ${beto}`);
    expect((await pagarConMovimiento(deBeto, { monto: 10 })).status).toBe(201);

    const lista = await movimientos();
    expect(lista).toHaveLength(2);
    expect(lista.every((movimiento) => movimiento.contacto === null)).toBe(true);
  });

  it("la descripción respeta el largo máximo aunque el concepto sea larguísimo", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      monto: 100,
      concepto: "x".repeat(140),
    });
    expect((await pagarConMovimiento(id, { monto: 10 })).status).toBe(201);
    const [movimiento] = await movimientos();
    expect(movimiento?.descripcion.length).toBe(140);
  });

  it("una cuenta oculta no sirve para el movimiento", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    await pedir(app, ana.cookies, `/api/finanzas/cuentas/${entorno.cuentaId}/ocultar`, "POST");
    expect((await pagarConMovimiento(id, { monto: 10 })).status).toBe(400);
    expect(await leer(id)).toMatchObject({ pagadoCentavos: 0 });
  });

  it("el servicio también lo hace en una sola transacción: si falla el movimiento, no queda el pago", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    await expect(
      registrarPago(
        cliente,
        ana.userId,
        id,
        {
          montoCentavos: 1000,
          fecha: "2026-10-05",
          movimiento: { cuentaFinancieraId: entorno.cuentaId, categoriaId: 999_999 },
        },
        AHORA,
      ),
    ).rejects.toThrow();
    expect(await leer(id)).toMatchObject({ pagadoCentavos: 0, pagos: [] });
  });
});

describe("pagos parciales y saldo", () => {
  it("cada pago baja lo que falta, y al completar queda saldada", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 1000 });

    expect((await pagar(id, { monto: 300, fecha: "2026-10-05" })).status).toBe(201);
    expect(await leer(id)).toMatchObject({
      pagadoCentavos: 30_000,
      pendienteCentavos: 70_000,
      saldada: false,
    });

    expect((await pagar(id, { monto: 700, fecha: "2026-10-06" })).status).toBe(201);
    const saldada = await leer(id);
    expect(saldada).toMatchObject({ pagadoCentavos: 100_000, pendienteCentavos: 0, saldada: true });
    // Los pagos, el más nuevo primero.
    expect(saldada.pagos.map((pago) => pago.montoCentavos)).toEqual([70_000, 30_000]);
  });

  it("no hay errores de redondeo: tres pagos de 33,33 sobre 100,00 dejan 1 centésimo", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    for (let numero = 0; numero < 3; numero += 1) {
      expect((await pagar(id, { monto: 33.33, fecha: "2026-10-05" })).status).toBe(201);
    }
    expect(await leer(id)).toMatchObject({ pagadoCentavos: 9999, pendienteCentavos: 1 });
  });

  it("no deja pagar más de lo que falta, y dice que ya está saldada si no falta nada", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    await pagar(id, { monto: 60, fecha: "2026-10-05" });

    const demasiado = await pagar(id, { monto: 40.01, fecha: "2026-10-05" });
    expect(demasiado.status).toBe(400);
    const cuerpo = await leerJson<{ error: { campos: { campo: string }[] } }>(demasiado);
    expect(cuerpo.error.campos[0]?.campo).toBe("monto");
    expect((await leer(id)).pagadoCentavos).toBe(6000);

    // Justo lo que falta sí.
    expect((await pagar(id, { monto: 40, fecha: "2026-10-05" })).status).toBe(201);
    // Ya saldada: otro pago es un conflicto con su propio mensaje.
    const sobrante = await pagar(id, { monto: 1, fecha: "2026-10-05" });
    expect(sobrante.status).toBe(409);
  });

  it("dos pagos a la vez nunca dejan el saldo en negativo", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 1000 });

    const respuestas = await Promise.all([
      pagar(id, { monto: 600, fecha: "2026-10-05" }),
      pagar(id, { monto: 600, fecha: "2026-10-05" }),
    ]);

    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual([201, 400]);
    expect(await leer(id)).toMatchObject({ pagadoCentavos: 60_000, pendienteCentavos: 40_000 });
  });

  it("valida el monto y la fecha del pago", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      monto: 100,
      fecha: "2026-10-05",
    });
    for (const cuerpo of [
      { monto: 0, fecha: "2026-10-06" },
      { monto: -1, fecha: "2026-10-06" },
      { monto: 10, fecha: "2026-02-30" },
      { monto: 10 },
      { fecha: "2026-10-06" },
      // Antes de que existiera la deuda.
      { monto: 10, fecha: "2026-10-04" },
      // En el futuro.
      { monto: 10, fecha: "2999-01-01" },
    ]) {
      expect((await pagar(id, cuerpo)).status, JSON.stringify(cuerpo)).toBe(400);
    }
    expect((await leer(id)).pagadoCentavos).toBe(0);
  });

  it("un pago en el servicio con 'ahora' fijo respeta el día de la persona", async () => {
    const deuda = await crearDeuda(
      cliente,
      ana.userId,
      {
        contactoId: beto,
        sentido: "debo",
        concepto: "x",
        montoCentavos: 1000,
        moneda: "UYU",
        fecha: "2026-10-01",
      },
      AHORA,
    );
    await expect(
      registrarPago(
        cliente,
        ana.userId,
        deuda.id,
        { montoCentavos: 100, fecha: "2026-10-21" },
        AHORA,
      ),
    ).rejects.toThrow();
    const pagada = await registrarPago(
      cliente,
      ana.userId,
      deuda.id,
      { montoCentavos: 100, fecha: "2026-10-20" },
      AHORA,
    );
    expect(pagada?.pagadoCentavos).toBe(100);
  });

  it("eliminar un pago devuelve el saldo, y una deuda saldada vuelve a estar pendiente", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    const pagada = await leerJson<DeudaJson>(await pagar(id, { monto: 100, fecha: "2026-10-05" }));
    expect(pagada.saldada).toBe(true);
    expect((await listar()).total).toBe(0);

    const pagoId = pagada.pagos[0]?.id ?? "";
    const respuesta = await pedir(
      app,
      ana.cookies,
      `/api/finanzas/deudas/${id}/pagos/${pagoId}`,
      "DELETE",
    );
    expect(respuesta.status).toBe(200);
    expect(await leerJson<DeudaJson>(respuesta)).toMatchObject({
      pagadoCentavos: 0,
      pendienteCentavos: 10_000,
      saldada: false,
      pagos: [],
    });
    expect((await listar()).total).toBe(1);

    // Repetirlo da 404.
    expect(
      (await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}/pagos/${pagoId}`, "DELETE"))
        .status,
    ).toBe(404);
  });
});

describe("editar y eliminar una deuda", () => {
  it("cambia el concepto, el monto y el día; con quién, el sentido y la moneda quedan", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      monto: 100,
      moneda: "USD",
      sentido: "debo",
    });
    const respuesta = await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "PUT", {
      concepto: "Otro concepto",
      monto: 250,
      fecha: "2026-09-15",
      moneda: "UYU",
      sentido: "me_deben",
    });
    expect(respuesta.status).toBe(200);
    expect(await leerJson<DeudaJson>(respuesta)).toMatchObject({
      concepto: "Otro concepto",
      montoCentavos: 25_000,
      fecha: "2026-09-15",
      moneda: "USD",
      sentido: "debo",
      contacto: { id: beto },
    });
  });

  it("el monto no puede quedar por debajo de lo ya pagado, pero sí igual", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    await pagar(id, { monto: 60, fecha: "2026-10-05" });
    const editar = (monto: number) =>
      pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "PUT", {
        concepto: "x",
        monto,
        fecha: "2026-10-01",
      });

    expect((await editar(59.99)).status).toBe(400);
    expect((await editar(60)).status).toBe(200);
    expect(await leer(id)).toMatchObject({ montoCentavos: 6000, saldada: true });
  });

  it("el día de la deuda no puede pasar a ser posterior al de un pago", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, fecha: "2026-10-01" });
    await pagar(id, { monto: 10, fecha: "2026-10-05" });
    const respuesta = await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "PUT", {
      concepto: "x",
      monto: 1000,
      fecha: "2026-10-10",
    });
    expect(respuesta.status).toBe(400);
  });

  it("eliminar es lógico: desaparece de las listas y del resumen, y repetirlo da 404", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto });
    expect((await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "DELETE")).status).toBe(
      200,
    );

    expect((await listar("?estado=todas")).total).toBe(0);
    expect((await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`)).status).toBe(404);
    expect((await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "DELETE")).status).toBe(
      404,
    );
    const resumen = await leerJson<{ meDeben: unknown[] }>(
      await pedir(app, ana.cookies, "/api/finanzas/deudas/resumen"),
    );
    expect(resumen.meDeben).toEqual([]);

    const fila = await cliente.db.query.deudas.findFirst({ where: (t, { eq }) => eq(t.id, id) });
    expect(fila?.eliminadoEn).not.toBeNull();
    // Una deuda eliminada no admite pagos.
    expect((await pagar(id, { monto: 1, fecha: "2026-10-05" })).status).toBe(404);
  });
});

describe("listar y resumir", () => {
  it("por defecto trae las pendientes, y se filtra por estado, sentido y contacto", async () => {
    const carla = await crearContactoPorApi(
      app,
      ana.cookies,
      empresaValida({ nombre: "Carla SA" }),
    );
    const pendiente = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      concepto: "Pendiente",
    });
    const saldada = await crearDeudaPorApi(app, ana.cookies, {
      contactoId: beto,
      concepto: "Saldada",
      monto: 10,
    });
    await pagar(saldada, { monto: 10, fecha: "2026-10-05" });
    await crearDeudaPorApi(app, ana.cookies, {
      contactoId: carla,
      concepto: "De Carla",
      sentido: "debo",
    });

    const conceptos = async (consulta: string) =>
      (await listar(consulta)).deudas.map((deuda) => deuda.concepto).sort();

    expect(await conceptos("")).toEqual(["De Carla", "Pendiente"]);
    expect(await conceptos("?estado=saldadas")).toEqual(["Saldada"]);
    expect(await conceptos("?estado=todas")).toEqual(["De Carla", "Pendiente", "Saldada"]);
    expect(await conceptos("?sentido=debo")).toEqual(["De Carla"]);
    expect(await conceptos(`?contactoId=${beto}&estado=todas`)).toEqual(["Pendiente", "Saldada"]);
    expect(pendiente).toBeTruthy();
  });

  it("ordena por día, la más reciente primero, y pagina con el total", async () => {
    for (const dia of ["01", "02", "03", "04", "05"]) {
      await crearDeudaPorApi(app, ana.cookies, {
        contactoId: beto,
        concepto: `Día ${dia}`,
        fecha: `2026-10-${dia}`,
      });
    }
    const pagina = await listar("?limit=2&offset=1");
    expect(pagina.total).toBe(5);
    expect(pagina.deudas.map((deuda) => deuda.concepto)).toEqual(["Día 04", "Día 03"]);
  });

  it("rechaza filtros inválidos", async () => {
    for (const consulta of [
      "?sentido=regalo",
      "?estado=quizas",
      "?limit=0",
      "?limit=1000",
      "?contactoId=x",
    ]) {
      expect(
        (await pedir(app, ana.cookies, `/api/finanzas/deudas${consulta}`)).status,
        consulta,
      ).toBe(400);
    }
  });

  it("el resumen suma lo pendiente por moneda y sentido, sin mezclar monedas", async () => {
    const carla = await crearContactoPorApi(app, ana.cookies, personaValida({ nombre: "Carla" }));
    const parcial = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 1000 });
    await pagar(parcial, { monto: 400, fecha: "2026-10-05" });
    await crearDeudaPorApi(app, ana.cookies, { contactoId: carla, monto: 500 });
    await crearDeudaPorApi(app, ana.cookies, { contactoId: carla, monto: 100, moneda: "USD" });
    await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 250, sentido: "debo" });
    // Una saldada no suma.
    const saldada = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 50 });
    await pagar(saldada, { monto: 50, fecha: "2026-10-05" });

    const resumen = await leerJson<{
      meDeben: { moneda: string; centavos: number; deudas: number }[];
      debo: { moneda: string; centavos: number; deudas: number }[];
      contactos: number;
    }>(await pedir(app, ana.cookies, "/api/finanzas/deudas/resumen"));

    expect(resumen.meDeben).toEqual([
      { moneda: "USD", centavos: 10_000, deudas: 1 },
      { moneda: "UYU", centavos: 110_000, deudas: 2 },
    ]);
    expect(resumen.debo).toEqual([{ moneda: "UYU", centavos: 25_000, deudas: 1 }]);
    expect(resumen.contactos).toBe(2);

    const soloBeto = await leerJson<{ meDeben: { centavos: number }[] }>(
      await pedir(app, ana.cookies, `/api/finanzas/deudas/resumen?contactoId=${beto}`),
    );
    expect(soloBeto.meDeben).toEqual([{ moneda: "UYU", centavos: 60_000, deudas: 1 }]);
  });

  it("sin deudas, el resumen viene vacío", async () => {
    expect(await leerJson(await pedir(app, ana.cookies, "/api/finanzas/deudas/resumen"))).toEqual({
      meDeben: [],
      debo: [],
      contactos: 0,
    });
  });
});

describe("el contacto y sus deudas", () => {
  it("un contacto con deudas pendientes no se puede eliminar; sin pendientes sí", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    const bloqueado = await pedir(app, ana.cookies, `/api/contactos/${beto}`, "DELETE");
    expect(bloqueado.status).toBe(409);
    expect((await pedir(app, ana.cookies, `/api/contactos/${beto}`)).status).toBe(200);

    await pagar(id, { monto: 100, fecha: "2026-10-05" });
    expect((await pedir(app, ana.cookies, `/api/contactos/${beto}`, "DELETE")).status).toBe(200);

    // La deuda saldada queda en el historial, con el contacto marcado como eliminado.
    const deuda = (await listar("?estado=saldadas")).deudas[0];
    expect(deuda?.contacto).toMatchObject({ id: beto, eliminado: true });
  });

  it("las deudas eliminadas no impiden eliminar al contacto", async () => {
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto });
    await pedir(app, ana.cookies, `/api/finanzas/deudas/${id}`, "DELETE");
    expect((await pedir(app, ana.cookies, `/api/contactos/${beto}`, "DELETE")).status).toBe(200);
  });
});

describe("privacidad entre personas", () => {
  it("una persona no ve, edita, paga ni elimina las deudas de otra", async () => {
    const otra = await entrarComoPersona(app, cliente);
    const id = await crearDeudaPorApi(app, ana.cookies, { contactoId: beto, monto: 100 });
    const cuerpo = { concepto: "x", monto: 5, fecha: "2026-10-01" };

    expect((await listar("?estado=todas", otra.cookies)).total).toBe(0);
    expect((await pedir(app, otra.cookies, `/api/finanzas/deudas/${id}`)).status).toBe(404);
    expect(
      (await pedir(app, otra.cookies, `/api/finanzas/deudas/${id}`, "PUT", cuerpo)).status,
    ).toBe(404);
    expect((await pagar(id, { monto: 10, fecha: "2026-10-05" }, otra.cookies)).status).toBe(404);
    expect((await pedir(app, otra.cookies, `/api/finanzas/deudas/${id}`, "DELETE")).status).toBe(
      404,
    );

    const resumenAjeno = await leerJson<{ meDeben: unknown[] }>(
      await pedir(app, otra.cookies, "/api/finanzas/deudas/resumen"),
    );
    expect(resumenAjeno.meDeben).toEqual([]);

    // Y el pago de otra persona tampoco se puede borrar con las cookies equivocadas.
    const conPago = await leerJson<DeudaJson>(await pagar(id, { monto: 10, fecha: "2026-10-05" }));
    const pagoId = conPago.pagos[0]?.id ?? "";
    expect(
      (await pedir(app, otra.cookies, `/api/finanzas/deudas/${id}/pagos/${pagoId}`, "DELETE"))
        .status,
    ).toBe(404);
    expect((await leer(id)).pagadoCentavos).toBe(1000);
  });
});

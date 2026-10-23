// Siembra tareas realistas para una cuenta (la del admin): tareas repetitivas de todos los tipos
// (diarias, semanales, mensuales y anuales, con y sin hora), tareas sueltas para hoy, mañana y los
// próximos días, algunas atrasadas, y un historial de tres semanas con lo que se hizo y lo que
// quedó sin hacer.
//
// También lo nuevo de las tareas: repetitivas "cada varios días", una que se da por fallida sola si
// pasa el día, tareas fallidas (a mano y solas), una atrasada que está por darse por fallida, y lo
// hecho hoy de los tres orígenes (de hoy, atrasadas y adelantadas) para ver las secciones de la lista.
//
// Para tener historial no se espera a que pasen los días: las repetitivas se crean con la fecha de
// inicio en el pasado y se arman sus tareas desde entonces (con el mismo servicio que las arma al
// abrir la lista); después se tilda la mayoría, como lo haría una persona constante pero no
// perfecta. Las tareas sueltas del pasado, que la API no deja crear, se insertan directo.
//
// Las tareas llevan las categorías por defecto de la cuenta (Casa, Salud, Trámites...), salvo alguna
// que queda sin categoría a propósito, porque es opcional.
//
// Es parte de la carga general de sembrar-datos-de-prueba.ts, que decide si corre (no pisa datos).

import { type ClienteDb, esquema } from "@gestoria/db";
import { type DatosDeTareaRepetitiva, diaDeHoy, instanteDelDia, sumarDias } from "@gestoria/shared";
import { eq } from "drizzle-orm";
import { obtenerZonaHoraria } from "../servicios/finanzas/periodos.ts";
import { listarCategoriasDeTareas } from "../servicios/tareas/categorias.ts";
import { crearTareaRepetitiva, generarTareasRepetitivas } from "../servicios/tareas/repetitivas.ts";
import { crearTarea } from "../servicios/tareas/tareas.ts";

/** Cuántos días de historial se arman. */
const DIAS_DE_HISTORIAL = 21;

type Contexto = {
  cliente: ClienteDb;
  userId: string;
  ahora: Date;
};

export type ResumenDeSiembraDeTareas = {
  repetitivas: number;
  tareas: number;
  hechas: number;
};

const diaria = (titulo: string, hora = "", notas = ""): DatosDeTareaRepetitiva => ({
  titulo,
  notas,
  repeticion: "diaria",
  hora,
});
const semanal = (
  titulo: string,
  diasSemana: number[],
  hora = "",
  notas = "",
): DatosDeTareaRepetitiva => ({ titulo, notas, repeticion: "semanal", diasSemana, hora });
const mensual = (titulo: string, diaDelMes: number, notas = ""): DatosDeTareaRepetitiva => ({
  titulo,
  notas,
  repeticion: "mensual",
  diaDelMes,
  hora: "",
});
const cadaVariosDias = (
  titulo: string,
  cadaDias: number,
  fechaInicio: string,
  hora = "",
  notas = "",
): DatosDeTareaRepetitiva => ({
  titulo,
  notas,
  repeticion: "intervalo",
  cadaDias,
  fechaInicio,
  hora,
});
const anual = (
  titulo: string,
  diaDelMes: number,
  mes: number,
  notas = "",
): DatosDeTareaRepetitiva => ({ titulo, notas, repeticion: "anual", diaDelMes, mes, hora: "" });

/** La categoría de cada tarea (por el nombre de las de por defecto). Las que no están quedan sin categoría. */
const CATEGORIA_DE: Record<string, string> = {
  "Tomar la vitamina": "Salud",
  "Hacer ejercicio": "Salud",
  "Regar las plantas": "Casa",
  "Sacar la basura": "Casa",
  "Llamar a la abuela": "Personal",
  "Pagar el alquiler": "Casa",
  "Revisar la factura de Antel": "Trámites",
  "Pagar el seguro del auto": "Trámites",
  "Lavar la ropa": "Casa",
  "Fertilizar las plantas": "Casa",
  "Tomar el antibiótico": "Salud",
  "Pagar la tarjeta de crédito": "Trámites",
  "Preparar la valija del viaje": "Personal",
  "Escanear los documentos": "Trámites",
  "Llamar al banco por la tarjeta": "Trámites",
  "Arreglar la persiana": "Casa",
  "Ir a la feria": "Compras",
  "Comprar pan y leche": "Compras",
  "Pasar por el correo a buscar el paquete": "Trámites",
  "Llamar al plomero": "Casa",
  "Sacar turno con el dentista": "Salud",
  "Reunión con el contador": "Trabajo",
  "Renovar la cédula de identidad": "Trámites",
  "Comprar el regalo de cumpleaños de mamá": "Compras",
  "Devolver el libro a la biblioteca": "Estudio",
  "Cambiar la lamparita del pasillo": "Casa",
  "Pagar la patente": "Trámites",
  "Comprar el regalo de Diego": "Compras",
  "Renovar el seguro médico": "Salud",
};

/** Qué tan constante es la persona con cada rutina: cuántas de cada 10 veces la hace. */
const CONSTANCIA: Record<string, number> = {
  "Tomar la vitamina": 9,
  "Hacer ejercicio": 6,
  "Regar las plantas": 8,
  "Sacar la basura": 10,
  "Llamar a la abuela": 7,
  "Pagar el alquiler": 10,
  "Revisar la factura de Antel": 8,
  "Lavar la ropa": 8,
  "Fertilizar las plantas": 5,
  "Tomar el antibiótico": 7,
};

export async function sembrarTareasDe(contexto: Contexto): Promise<ResumenDeSiembraDeTareas> {
  const { cliente, userId, ahora } = contexto;
  const zona = await obtenerZonaHoraria(cliente, userId);
  const hoy = diaDeHoy(zona, ahora);
  const hace = (dias: number): string => sumarDias(hoy, -dias);
  const resumen: ResumenDeSiembraDeTareas = { repetitivas: 0, tareas: 0, hechas: 0 };
  // Listar las categorías es lo que crea las de por defecto la primera vez.
  const categorias = new Map(
    (await listarCategoriasDeTareas(cliente, userId)).map((c) => [c.nombre, c.id]),
  );
  const categoriaDe = (titulo: string): number | null =>
    categorias.get(CATEGORIA_DE[titulo] ?? "") ?? null;

  // ---------- Tareas repetitivas ----------
  const repetitivas: DatosDeTareaRepetitiva[] = [
    // Algunas son importantes: llevan el distintivo.
    { ...diaria("Tomar la vitamina", "08:00"), importante: true },
    semanal("Hacer ejercicio", [1, 3, 5], "07:00", "Aunque sea 20 minutos"),
    semanal("Regar las plantas", [1], "", "Las del balcón y las del living"),
    semanal("Sacar la basura", [2, 5], "21:00"),
    semanal("Llamar a la abuela", [6, 7], "11:00"),
    { ...mensual("Pagar el alquiler", 5, "Transferencia al BROU"), importante: true },
    mensual("Revisar la factura de Antel", 10),
    anual("Pagar el seguro del auto", 15, 12),
    // Cada varios días: día por medio y cada 5 días (el inicio se corre hacia atrás más abajo).
    cadaVariosDias("Lavar la ropa", 2, hoy),
    cadaVariosDias("Fertilizar las plantas", 5, hoy, "18:00", "Medio tapón por maceta"),
    // Se da por fallida sola si pasa el día sin hacerla: no se acumula como atrasada.
    { ...diaria("Tomar el antibiótico", "09:00", "Hasta terminar la caja"), fallaSola: true },
  ];

  const creadas = new Map<string, string>();
  for (const datos of repetitivas) {
    const creada = await crearTareaRepetitiva(
      cliente,
      userId,
      { ...datos, categoriaId: categoriaDe(datos.titulo) },
      ahora,
    );
    creadas.set(creada.id, datos.titulo);
    resumen.repetitivas += 1;
  }

  // Las que se repiten cada día o cada semana empiezan hace tres semanas, para tener historial; las
  // mensuales y anuales empiezan hoy (no tendrían nada que mostrar del pasado reciente).
  const conHistorial = [...creadas.entries()].filter(
    ([, titulo]) => titulo !== "Pagar el seguro del auto",
  );
  const desde = hace(DIAS_DE_HISTORIAL);
  const porIntervalo = new Set(["Lavar la ropa", "Fertilizar las plantas"]);
  for (const [id, titulo] of conHistorial) {
    await cliente.db
      .update(esquema.tareasRepetitivas)
      .set({
        desde,
        generadaHasta: sumarDias(desde, -1),
        // Las de cada varios días cuentan desde su fecha de inicio.
        ...(porIntervalo.has(titulo) ? { fechaInicio: desde } : {}),
      })
      .where(eq(esquema.tareasRepetitivas.id, id));
  }
  // Se quita lo que se armó al crearlas (solo hoy) para volver a armar todo desde el principio.
  for (const [id] of conHistorial) {
    await cliente.db.delete(esquema.tareas).where(eq(esquema.tareas.repetitivaId, id));
  }
  await generarTareasRepetitivas(cliente, userId, hoy);

  // Se tilda la mayoría de los días pasados, según la constancia de cada rutina. Hoy queda todo
  // pendiente salvo la vitamina de la mañana, que ya se tomó.
  const armadas = await cliente.db
    .select()
    .from(esquema.tareas)
    .where(eq(esquema.tareas.userId, userId));
  let indice = 0;
  for (const tarea of armadas) {
    if (tarea.repetitivaId === null) continue;
    const titulo = creadas.get(tarea.repetitivaId) ?? "";
    indice += 1;
    const esHoy = tarea.dia === hoy;
    const lahizo = esHoy
      ? titulo === "Tomar la vitamina"
      : (indice * 7 + Number(tarea.dia.slice(8, 10))) % 10 < (CONSTANCIA[titulo] ?? 7);
    if (!lahizo) continue;
    await cliente.db
      .update(esquema.tareas)
      // Una que ya se había dado por fallida sola y la persona dice que sí la hizo vuelve a estar hecha.
      .set({ completadaEn: instanteDelDia(tarea.dia, zona, esHoy ? 9 : 20), falladaEn: null })
      .where(eq(esquema.tareas.id, tarea.id));
    resumen.hechas += 1;
  }

  // ---------- Tareas sueltas ----------
  // Para hoy, mañana y los próximos días (por el mismo servicio que usa la pantalla).
  const sueltas: {
    titulo: string;
    fecha: string;
    hora: string;
    notas: string;
    importante?: boolean;
  }[] = [
    { titulo: "Comprar pan y leche", fecha: "", hora: "", notas: "" },
    {
      titulo: "Pasar por el correo a buscar el paquete",
      fecha: "",
      hora: "17:30",
      notas: "Llevar la cédula",
      importante: true,
    },
    { titulo: "Llamar al plomero", fecha: "", hora: "", notas: "Por la pérdida de la canilla" },
    { titulo: "Sacar turno con el dentista", fecha: sumarDias(hoy, 1), hora: "", notas: "" },
    {
      titulo: "Reunión con el contador",
      fecha: sumarDias(hoy, 2),
      hora: "10:00",
      notas: "Llevar las facturas del mes",
      importante: true,
    },
    { titulo: "Renovar la cédula de identidad", fecha: sumarDias(hoy, 5), hora: "", notas: "" },
    {
      titulo: "Comprar el regalo de cumpleaños de mamá",
      fecha: sumarDias(hoy, 9),
      hora: "",
      notas: "",
    },
  ];
  for (const datos of sueltas) {
    await crearTarea(cliente, userId, { ...datos, categoriaId: categoriaDe(datos.titulo) }, ahora);
    resumen.tareas += 1;
  }

  // Del pasado (la API no deja crearlas): algunas siguen sin hacerse —están atrasadas— y otras se
  // hicieron, para que el historial tenga también tareas de uso único.
  const delPasado: { titulo: string; dia: string; hechaEl?: string; importante?: boolean }[] = [
    // Atrasada e importante: arriba de todo en "Atrasadas".
    { titulo: "Devolver el libro a la biblioteca", dia: hace(4), importante: true },
    { titulo: "Cambiar la lamparita del pasillo", dia: hace(2) },
    { titulo: "Pagar la patente", dia: hace(6), hechaEl: hace(6) },
    // Sin categoría a propósito: es opcional.
    { titulo: "Llevar el auto al service", dia: hace(9), hechaEl: hace(8) },
    { titulo: "Comprar el regalo de Diego", dia: hace(12), hechaEl: hace(12) },
    { titulo: "Renovar el seguro médico", dia: hace(15), hechaEl: hace(14) },
  ];
  for (const tarea of delPasado) {
    await cliente.db.insert(esquema.tareas).values({
      userId,
      titulo: tarea.titulo,
      categoriaId: categoriaDe(tarea.titulo),
      importante: tarea.importante ?? false,
      dia: tarea.dia,
      completadaEn: tarea.hechaEl ? instanteDelDia(tarea.hechaEl, zona, 19) : null,
    });
    resumen.tareas += 1;
    if (tarea.hechaEl) resumen.hechas += 1;
  }

  // ---------- Fallidas, por fallar y lo hecho hoy de otros días ----------
  const insertar = async (
    titulo: string,
    dia: string,
    estado: { hechaEl?: string; hechaHora?: number; falladaEl?: string; falladaHora?: number } = {},
  ) => {
    await cliente.db.insert(esquema.tareas).values({
      userId,
      titulo,
      categoriaId: categoriaDe(titulo),
      dia,
      completadaEn: estado.hechaEl
        ? instanteDelDia(estado.hechaEl, zona, estado.hechaHora ?? 19)
        : null,
      falladaEn: estado.falladaEl
        ? instanteDelDia(estado.falladaEl, zona, estado.falladaHora ?? 10)
        : null,
    });
    resumen.tareas += 1;
    if (estado.hechaEl) resumen.hechas += 1;
  };
  // Dadas por fallidas a mano, de días anteriores: aparecen en el historial con la cruz roja.
  await insertar("Llamar al banco por la tarjeta", hace(5), { falladaEl: hace(4) });
  await insertar("Ir a la feria", hace(3), { falladaEl: hace(2), falladaHora: 12 });
  // Fallida hoy: la lista de hoy tiene su sección "Fallidas hoy".
  await insertar("Arreglar la persiana", hace(2), { falladaEl: hoy, falladaHora: 8 });
  // Atrasada con casi una semana: ya avisa que está por darse por fallida sola.
  await insertar("Escanear los documentos", hace(6));
  // Hechas hoy de otros días: "Estaban atrasadas" y "Adelantadas" junto a "Eran de hoy".
  await insertar("Pagar la tarjeta de crédito", hace(3), { hechaEl: hoy, hechaHora: 8 });
  await insertar("Preparar la valija del viaje", sumarDias(hoy, 4), { hechaEl: hoy, hechaHora: 9 });

  return resumen;
}

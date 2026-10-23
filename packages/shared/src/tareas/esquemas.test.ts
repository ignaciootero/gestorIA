import { describe, expect, it } from "vitest";
import { caeEnElDia } from "../contactos/fechas.ts";
import { CATEGORIAS_DE_TAREA_POR_DEFECTO } from "./constantes.ts";
import {
  esquemaCategoriaDeTarea,
  esquemaCompletarTarea,
  esquemaTarea,
  esquemaTareaRepetitiva,
} from "./esquemas.ts";

const tareaValida = { titulo: "Pagar la luz", notas: "", fecha: "", hora: "" };

describe("esquemaTarea (uso único)", () => {
  it("acepta una tarea con lo mínimo", () => {
    expect(esquemaTarea.safeParse(tareaValida).success).toBe(true);
  });

  it("acepta día y hora", () => {
    expect(
      esquemaTarea.safeParse({ ...tareaValida, fecha: "2026-10-25", hora: "08:30" }).success,
    ).toBe(true);
  });

  it("recorta los espacios del título y lo exige", () => {
    const ok = esquemaTarea.safeParse({ ...tareaValida, titulo: "  Llamar  " });
    expect(ok.success && ok.data.titulo).toBe("Llamar");
    for (const titulo of ["", "   "]) {
      const malo = esquemaTarea.safeParse({ ...tareaValida, titulo });
      expect(malo.success).toBe(false);
      expect(malo.error?.issues[0]?.message).toBe("Escribí qué hay que hacer.");
    }
  });

  it("limita el largo del título y de las notas", () => {
    expect(esquemaTarea.safeParse({ ...tareaValida, titulo: "a".repeat(120) }).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...tareaValida, titulo: "a".repeat(121) }).success).toBe(false);
    expect(esquemaTarea.safeParse({ ...tareaValida, notas: "a".repeat(500) }).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...tareaValida, notas: "a".repeat(501) }).success).toBe(false);
  });

  it("rechaza días que no existen y horas mal escritas", () => {
    expect(esquemaTarea.safeParse({ ...tareaValida, fecha: "2026-02-30" }).success).toBe(false);
    expect(esquemaTarea.safeParse({ ...tareaValida, fecha: "mañana" }).success).toBe(false);
    expect(esquemaTarea.safeParse({ ...tareaValida, hora: "25:00" }).success).toBe(false);
    expect(esquemaTarea.safeParse({ ...tareaValida, hora: "9:00" }).success).toBe(false);
  });
});

describe("esquemaTareaRepetitiva", () => {
  const base = { titulo: "Regar las plantas", notas: "", hora: "" };

  it("acepta cada repetición con sus campos", () => {
    for (const datos of [
      { ...base, repeticion: "diaria" },
      { ...base, repeticion: "semanal", diasSemana: [7] },
      { ...base, repeticion: "semanal", diasSemana: [1, 2, 4] },
      { ...base, repeticion: "semanal", diasSemana: [6, 7] },
      { ...base, repeticion: "semanal", diasSemana: [1, 2, 3, 4, 5, 6, 7] },
      { ...base, repeticion: "mensual", diaDelMes: 31 },
      { ...base, repeticion: "anual", diaDelMes: 29, mes: 2 },
      { ...base, repeticion: "diaria", hora: "07:15" },
    ]) {
      expect(esquemaTareaRepetitiva.safeParse(datos).success, JSON.stringify(datos)).toBe(true);
    }
  });

  it("no existe una repetición de una sola vez", () => {
    expect(esquemaTareaRepetitiva.safeParse({ ...base, repeticion: "unica" }).success).toBe(false);
    expect(esquemaTareaRepetitiva.safeParse({ ...base, repeticion: "ninguna" }).success).toBe(
      false,
    );
  });

  it("exige el campo que corresponde a cada repetición", () => {
    expect(esquemaTareaRepetitiva.safeParse({ ...base, repeticion: "semanal" }).success).toBe(
      false,
    );
    expect(esquemaTareaRepetitiva.safeParse({ ...base, repeticion: "mensual" }).success).toBe(
      false,
    );
    expect(
      esquemaTareaRepetitiva.safeParse({ ...base, repeticion: "anual", diaDelMes: 3 }).success,
    ).toBe(false);
  });

  it("rechaza valores fuera de rango", () => {
    for (const datos of [
      { ...base, repeticion: "semanal", diasSemana: [0] },
      { ...base, repeticion: "semanal", diasSemana: [8] },
      { ...base, repeticion: "semanal", diasSemana: [1, 8] },
      { ...base, repeticion: "semanal", diasSemana: [1.5] },
      { ...base, repeticion: "mensual", diaDelMes: 0 },
      { ...base, repeticion: "mensual", diaDelMes: 32 },
      { ...base, repeticion: "anual", diaDelMes: 1, mes: 13 },
    ]) {
      expect(esquemaTareaRepetitiva.safeParse(datos).success, JSON.stringify(datos)).toBe(false);
    }
  });

  it("rechaza un día que el mes no tiene (31 de abril)", () => {
    const resultado = esquemaTareaRepetitiva.safeParse({
      ...base,
      repeticion: "anual",
      diaDelMes: 31,
      mes: 4,
    });
    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toBe("Ese mes no tiene ese día.");
  });

  it("exige título y respeta los largos", () => {
    expect(
      esquemaTareaRepetitiva.safeParse({ ...base, titulo: "", repeticion: "diaria" }).success,
    ).toBe(false);
    expect(
      esquemaTareaRepetitiva.safeParse({ ...base, titulo: "a".repeat(121), repeticion: "diaria" })
        .success,
    ).toBe(false);
  });
});

describe("esquemaCompletarTarea", () => {
  it("pide un booleano", () => {
    expect(esquemaCompletarTarea.safeParse({ completada: true }).success).toBe(true);
    expect(esquemaCompletarTarea.safeParse({ completada: "si" }).success).toBe(false);
    expect(esquemaCompletarTarea.safeParse({}).success).toBe(false);
  });
});

describe("caeEnElDia", () => {
  const vacio = { fecha: null, diaSemana: null, diaDelMes: null, mes: null };

  it("una diaria cae todos los días", () => {
    expect(caeEnElDia({ ...vacio, repeticion: "diaria" }, "2026-10-21")).toBe(true);
    expect(caeEnElDia({ ...vacio, repeticion: "diaria" }, "2024-02-29")).toBe(true);
  });

  it("una semanal cae solo ese día de la semana", () => {
    const miercoles = { ...vacio, repeticion: "semanal" as const, diaSemana: 3 };
    expect(caeEnElDia(miercoles, "2026-10-21")).toBe(true); // miércoles
    expect(caeEnElDia(miercoles, "2026-10-22")).toBe(false);
    expect(caeEnElDia(miercoles, "2026-10-28")).toBe(true);
  });

  it("una mensual del 31 cae el último día de los meses más cortos", () => {
    const dia31 = { ...vacio, repeticion: "mensual" as const, diaDelMes: 31 };
    expect(caeEnElDia(dia31, "2026-04-30")).toBe(true);
    expect(caeEnElDia(dia31, "2026-04-29")).toBe(false);
    expect(caeEnElDia(dia31, "2026-02-28")).toBe(true);
    expect(caeEnElDia(dia31, "2028-02-29")).toBe(true);
    expect(caeEnElDia(dia31, "2026-05-31")).toBe(true);
  });

  it("una anual del 29 de febrero cae el 28 en los años comunes", () => {
    const bisiesto = { ...vacio, repeticion: "anual" as const, diaDelMes: 29, mes: 2 };
    expect(caeEnElDia(bisiesto, "2026-02-28")).toBe(true);
    expect(caeEnElDia(bisiesto, "2028-02-29")).toBe(true);
    expect(caeEnElDia(bisiesto, "2028-02-28")).toBe(false);
    expect(caeEnElDia(bisiesto, "2026-03-01")).toBe(false);
  });
});

describe("categoría de una tarea", () => {
  it("es opcional: sin ella, con null o con un número", () => {
    expect(esquemaTarea.safeParse(tareaValida).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...tareaValida, categoriaId: null }).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...tareaValida, categoriaId: 3 }).success).toBe(true);
    const repetitiva = { titulo: "Regar", notas: "", repeticion: "diaria", hora: "" };
    expect(esquemaTareaRepetitiva.safeParse(repetitiva).success).toBe(true);
    expect(esquemaTareaRepetitiva.safeParse({ ...repetitiva, categoriaId: null }).success).toBe(
      true,
    );
    expect(esquemaTareaRepetitiva.safeParse({ ...repetitiva, categoriaId: 2 }).success).toBe(true);
  });

  it("rechaza un id que no es un entero positivo", () => {
    for (const categoriaId of [0, -1, 1.5, "3", Number.NaN]) {
      const malo = esquemaTarea.safeParse({ ...tareaValida, categoriaId });
      expect(malo.success, String(categoriaId)).toBe(false);
    }
    const mala = esquemaTareaRepetitiva.safeParse({
      titulo: "Regar",
      notas: "",
      repeticion: "semanal",
      diasSemana: [2],
      hora: "",
      categoriaId: 0,
    });
    expect(mala.success).toBe(false);
    expect(mala.error?.issues[0]?.message).toBe("Elegí una categoría válida.");
  });
});

describe("días de la semana de una tarea semanal", () => {
  const semanal = { titulo: "Gimnasio", notas: "", hora: "", repeticion: "semanal" };

  it("pide al menos un día", () => {
    for (const datos of [
      semanal,
      { ...semanal, diasSemana: [] },
      { ...semanal, diasSemana: null },
    ]) {
      expect(esquemaTareaRepetitiva.safeParse(datos).success, JSON.stringify(datos)).toBe(false);
    }
    const vacio = esquemaTareaRepetitiva.safeParse({ ...semanal, diasSemana: [] });
    expect(vacio.error?.issues[0]?.message).toBe("Elegí al menos un día de la semana.");
    expect(vacio.error?.issues[0]?.path).toEqual(["diasSemana"]);
  });

  it("no acepta el mismo día dos veces", () => {
    const repetido = esquemaTareaRepetitiva.safeParse({ ...semanal, diasSemana: [1, 3, 1] });
    expect(repetido.success).toBe(false);
    expect(repetido.error?.issues[0]?.message).toBe("No repitas los días de la semana.");
  });

  it("ya no acepta el campo de un solo día", () => {
    expect(esquemaTareaRepetitiva.safeParse({ ...semanal, diaSemana: 3 }).success).toBe(false);
  });

  it("acepta los días en cualquier orden", () => {
    expect(esquemaTareaRepetitiva.safeParse({ ...semanal, diasSemana: [5, 1, 3] }).success).toBe(
      true,
    );
  });
});

describe("esquemaCategoriaDeTarea", () => {
  it("acepta un nombre solo o con color", () => {
    expect(esquemaCategoriaDeTarea.safeParse({ nombre: "Hobbies" }).success).toBe(true);
    expect(esquemaCategoriaDeTarea.safeParse({ nombre: "Hobbies", color: "#12ab9f" }).success).toBe(
      true,
    );
  });

  it("recorta el nombre y lo exige", () => {
    const ok = esquemaCategoriaDeTarea.safeParse({ nombre: "  Hobbies  " });
    expect(ok.success && ok.data.nombre).toBe("Hobbies");
    for (const nombre of ["", "   "]) {
      const malo = esquemaCategoriaDeTarea.safeParse({ nombre });
      expect(malo.success).toBe(false);
      expect(malo.error?.issues[0]?.message).toBe("Escribí un nombre para la categoría.");
    }
  });

  it("limita el largo del nombre a 30 caracteres", () => {
    expect(esquemaCategoriaDeTarea.safeParse({ nombre: "a".repeat(30) }).success).toBe(true);
    expect(esquemaCategoriaDeTarea.safeParse({ nombre: "a".repeat(31) }).success).toBe(false);
  });

  it("rechaza un color que no es #rrggbb", () => {
    for (const color of ["rojo", "#fff", "#12345g", "123456"]) {
      expect(esquemaCategoriaDeTarea.safeParse({ nombre: "Hobbies", color }).success, color).toBe(
        false,
      );
    }
  });
});

describe("CATEGORIAS_DE_TAREA_POR_DEFECTO", () => {
  it("tiene nombres y colores distintos y válidos", () => {
    const nombres = CATEGORIAS_DE_TAREA_POR_DEFECTO.map((categoria) =>
      categoria.nombre.toLowerCase(),
    );
    const colores = CATEGORIAS_DE_TAREA_POR_DEFECTO.map((categoria) => categoria.color);
    expect(new Set(nombres).size).toBe(nombres.length);
    expect(new Set(colores).size).toBe(colores.length);
    for (const categoria of CATEGORIAS_DE_TAREA_POR_DEFECTO) {
      expect(esquemaCategoriaDeTarea.safeParse(categoria).success, categoria.nombre).toBe(true);
    }
  });
});

describe("tarea que se repite cada tantos días", () => {
  const base = {
    titulo: "Regar los helechos",
    notas: "",
    repeticion: "intervalo",
    cadaDias: 2,
    fechaInicio: "2026-10-25",
    hora: "",
  };

  it("acepta la cantidad de días, el inicio y la hora opcional", () => {
    expect(esquemaTareaRepetitiva.safeParse(base).success).toBe(true);
    expect(esquemaTareaRepetitiva.safeParse({ ...base, hora: "08:30" }).success).toBe(true);
  });

  it("el inicio en blanco es hoy (lo resuelve el servicio)", () => {
    expect(esquemaTareaRepetitiva.safeParse({ ...base, fechaInicio: "" }).success).toBe(true);
  });

  it("exige los dos campos", () => {
    expect(esquemaTareaRepetitiva.safeParse({ ...base, cadaDias: undefined }).success).toBe(false);
    expect(esquemaTareaRepetitiva.safeParse({ ...base, fechaInicio: undefined }).success).toBe(
      false,
    );
  });

  it("acepta de 2 a 365 días y rechaza lo demás, con un mensaje claro", () => {
    for (const cadaDias of [2, 3, 30, 365]) {
      expect(esquemaTareaRepetitiva.safeParse({ ...base, cadaDias }).success, `${cadaDias}`).toBe(
        true,
      );
    }
    for (const cadaDias of [1, 0, -2, 366, 2.5, Number.NaN, "2", null]) {
      expect(esquemaTareaRepetitiva.safeParse({ ...base, cadaDias }).success, `${cadaDias}`).toBe(
        false,
      );
    }
    const uno = esquemaTareaRepetitiva.safeParse({ ...base, cadaDias: 1 });
    expect(uno.error?.issues[0]?.message).toContain("Todos los días");
  });

  it("rechaza un inicio que no es un día real", () => {
    for (const fechaInicio of ["2026-02-30", "mañana", "25/10/2026"]) {
      expect(esquemaTareaRepetitiva.safeParse({ ...base, fechaInicio }).success).toBe(false);
    }
  });
});

describe("tareas importantes", () => {
  it("importante es opcional y solo acepta verdadero o falso, en una suelta y en cada repetición", () => {
    expect(esquemaTarea.safeParse(tareaValida).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...tareaValida, importante: true }).success).toBe(true);
    expect(esquemaTarea.safeParse({ ...tareaValida, importante: false }).success).toBe(true);
    for (const malo of ["si", 1, null]) {
      expect(esquemaTarea.safeParse({ ...tareaValida, importante: malo }).success).toBe(false);
    }

    const repeticiones = [
      { repeticion: "diaria" },
      { repeticion: "intervalo", cadaDias: 3, fechaInicio: "" },
      { repeticion: "semanal", diasSemana: [1] },
      { repeticion: "mensual", diaDelMes: 5 },
      { repeticion: "anual", diaDelMes: 5, mes: 6 },
    ];
    for (const regla of repeticiones) {
      const datos = { titulo: "Rutina", notas: "", hora: "", ...regla };
      expect(esquemaTareaRepetitiva.safeParse(datos).success, regla.repeticion).toBe(true);
      const importante = esquemaTareaRepetitiva.safeParse({ ...datos, importante: true });
      expect(importante.success && importante.data.importante, regla.repeticion).toBe(true);
      expect(
        esquemaTareaRepetitiva.safeParse({ ...datos, importante: "si" }).success,
        regla.repeticion,
      ).toBe(false);
    }
  });
});

// Tests unitarios de los esquemas del módulo de contactos.

import { describe, expect, it } from "vitest";
import {
  aEnlaceWeb,
  enlaceDeMapa,
  esquemaContacto,
  esquemaEtiquetaDeContacto,
  esquemaRecordatorio,
  esquemaTelefono,
} from "./esquemas.ts";

const persona = {
  tipo: "persona",
  nombre: "Ana",
  apellido: "",
  fechaNacimiento: "",
  telefonos: [],
  correos: [],
  direccion: "",
  notas: "",
  favorito: false,
  etiquetaIds: [],
} as const;

const empresa = {
  tipo: "empresa",
  nombre: "Electricidad Sur",
  rubro: "",
  sitioWeb: "",
  horario: "",
  documento: "",
  personaDeContacto: "",
  telefonos: [],
  correos: [],
  direccion: "",
  notas: "",
  favorito: false,
  etiquetaIds: [],
} as const;

function mensajes(resultado: { success: boolean; error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues.map((problema) => problema.message) ?? [];
}

describe("esquemaTelefono", () => {
  it("acepta los formatos con los que se escribe un número", () => {
    for (const numero of ["099 123 456", "+598 99 123 456", "(02) 900-0000", "911", "0800.1234"]) {
      expect(esquemaTelefono.safeParse({ numero, tipo: "celular" }).success, numero).toBe(true);
    }
  });

  it("rechaza letras, números demasiado cortos o largos y el tipo desconocido", () => {
    expect(esquemaTelefono.safeParse({ numero: "abc", tipo: "fijo" }).success).toBe(false);
    expect(esquemaTelefono.safeParse({ numero: "12", tipo: "fijo" }).success).toBe(false);
    expect(esquemaTelefono.safeParse({ numero: "1234567890123456", tipo: "fijo" }).success).toBe(
      false,
    );
    expect(esquemaTelefono.safeParse({ numero: "", tipo: "fijo" }).success).toBe(false);
    expect(esquemaTelefono.safeParse({ numero: "099123456", tipo: "satelital" }).success).toBe(
      false,
    );
  });
});

describe("aEnlaceWeb", () => {
  it("agrega https:// cuando no lo trae", () => {
    expect(aEnlaceWeb("www.ejemplo.com.uy")).toBe("https://www.ejemplo.com.uy/");
    expect(aEnlaceWeb("http://ejemplo.com")).toBe("http://ejemplo.com/");
  });

  it("rechaza lo que no es un sitio web, en especial esquemas peligrosos", () => {
    expect(aEnlaceWeb("javascript://ejemplo.com/%0Aalert(1)")).toBeNull();
    expect(aEnlaceWeb("javascript:alert(1)")).toBeNull();
    expect(aEnlaceWeb("data:text/html,<b>x</b>")).toBeNull();
    expect(aEnlaceWeb("ftp://ejemplo.com")).toBeNull();
    expect(aEnlaceWeb("localhost")).toBeNull();
    expect(aEnlaceWeb("dos palabras.com")).toBeNull();
    expect(aEnlaceWeb("")).toBeNull();
  });
});

describe("enlaceDeMapa", () => {
  it("arma la búsqueda de OpenStreetMap con la dirección codificada", () => {
    expect(enlaceDeMapa("18 de Julio 1234, Montevideo")).toBe(
      "https://www.openstreetmap.org/search?query=18%20de%20Julio%201234%2C%20Montevideo",
    );
  });

  it("una dirección con caracteres especiales no puede cambiar el enlace", () => {
    const enlace = enlaceDeMapa('Calle 1 & Calle 2 #5 "Local"?x=1');
    const url = new URL(enlace);
    expect(url.origin).toBe("https://www.openstreetmap.org");
    expect(url.pathname).toBe("/search");
    expect([...url.searchParams.keys()]).toEqual(["query"]);
    expect(url.searchParams.get("query")).toBe('Calle 1 & Calle 2 #5 "Local"?x=1');
    expect(url.hash).toBe("");
  });

  it("ignora los espacios de las puntas y respeta tildes y eñes", () => {
    expect(new URL(enlaceDeMapa("  Av. Brasil 2500 – Pocitos  ")).searchParams.get("query")).toBe(
      "Av. Brasil 2500 – Pocitos",
    );
    expect(new URL(enlaceDeMapa("Ñandú 12")).searchParams.get("query")).toBe("Ñandú 12");
  });
});

describe("esquemaContacto", () => {
  it("acepta una persona y una empresa con lo mínimo, dejando en blanco lo opcional", () => {
    expect(esquemaContacto.safeParse(persona).success).toBe(true);
    expect(esquemaContacto.safeParse(empresa).success).toBe(true);
  });

  it("exige el nombre, sin contar los espacios", () => {
    expect(mensajes(esquemaContacto.safeParse({ ...persona, nombre: "   " }))).toContain(
      "Escribí el nombre.",
    );
    expect(mensajes(esquemaContacto.safeParse({ ...empresa, nombre: "" }))).toContain(
      "Escribí el nombre de la empresa o servicio.",
    );
  });

  it("limita el largo de los textos", () => {
    expect(esquemaContacto.safeParse({ ...persona, nombre: "a".repeat(61) }).success).toBe(false);
    expect(esquemaContacto.safeParse({ ...persona, notas: "a".repeat(1001) }).success).toBe(false);
    expect(esquemaContacto.safeParse({ ...persona, notas: "a".repeat(1000) }).success).toBe(true);
  });

  it("valida la fecha de nacimiento: que exista y que no sea absurda", () => {
    const con = (fechaNacimiento: string) =>
      esquemaContacto.safeParse({ ...persona, fechaNacimiento });
    expect(con("1990-05-12").success).toBe(true);
    expect(con("2000-02-29").success).toBe(true);
    expect(con("2001-02-29").success).toBe(false);
    expect(con("1850-01-01").success).toBe(false);
    expect(con("12/05/1990").success).toBe(false);
  });

  it("acepta recordarCumpleanos solo como booleano y lo descarta en una empresa", () => {
    const con = (recordarCumpleanos: unknown) =>
      esquemaContacto.safeParse({ ...persona, recordarCumpleanos });
    expect(con(true).success).toBe(true);
    expect(con(false).success).toBe(true);
    expect(con("si").success).toBe(false);
    expect(esquemaContacto.safeParse(persona).success).toBe(true);

    const deEmpresa = esquemaContacto.safeParse({ ...empresa, recordarCumpleanos: true });
    expect(deEmpresa.success && "recordarCumpleanos" in deEmpresa.data).toBe(false);
  });

  it("valida los correos y los pasa a minúsculas", () => {
    const bueno = esquemaContacto.safeParse({ ...persona, correos: ["  ANA@Ejemplo.com "] });
    expect(bueno.success && bueno.data.correos).toEqual(["ana@ejemplo.com"]);
    expect(esquemaContacto.safeParse({ ...persona, correos: ["sin-arroba"] }).success).toBe(false);
  });

  it("limita cuántos teléfonos, correos y etiquetas se pueden cargar", () => {
    const telefono = { numero: "099 123 456", tipo: "celular" } as const;
    expect(
      esquemaContacto.safeParse({ ...persona, telefonos: Array(5).fill(telefono) }).success,
    ).toBe(true);
    expect(
      esquemaContacto.safeParse({ ...persona, telefonos: Array(6).fill(telefono) }).success,
    ).toBe(false);
    expect(
      esquemaContacto.safeParse({ ...persona, etiquetaIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] })
        .success,
    ).toBe(false);
  });

  it("valida el sitio web de una empresa", () => {
    expect(esquemaContacto.safeParse({ ...empresa, sitioWeb: "www.ejemplo.com" }).success).toBe(
      true,
    );
    expect(esquemaContacto.safeParse({ ...empresa, sitioWeb: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });

  it("no mezcla los campos de una persona con los de una empresa", () => {
    // `discriminatedUnion` descarta lo que no pertenece al tipo; no hace falta que falle.
    const resultado = esquemaContacto.safeParse({ ...empresa, fechaNacimiento: "1990-05-12" });
    expect(resultado.success && "fechaNacimiento" in resultado.data).toBe(false);
  });

  it("rechaza un tipo desconocido", () => {
    expect(esquemaContacto.safeParse({ ...persona, tipo: "robot" }).success).toBe(false);
  });
});

describe("esquemaEtiquetaDeContacto", () => {
  it("pide un nombre corto y acepta un color opcional", () => {
    expect(esquemaEtiquetaDeContacto.safeParse({ nombre: "Familia" }).success).toBe(true);
    expect(
      esquemaEtiquetaDeContacto.safeParse({ nombre: "Familia", color: "#0f766e" }).success,
    ).toBe(true);
    expect(esquemaEtiquetaDeContacto.safeParse({ nombre: " " }).success).toBe(false);
    expect(esquemaEtiquetaDeContacto.safeParse({ nombre: "a".repeat(31) }).success).toBe(false);
    expect(esquemaEtiquetaDeContacto.safeParse({ nombre: "Familia", color: "rojo" }).success).toBe(
      false,
    );
  });
});

describe("esquemaRecordatorio", () => {
  const titulo = "Llamarle";

  it("una sola vez: pide el día, y la hora es opcional", () => {
    expect(
      esquemaRecordatorio.safeParse({ titulo, repeticion: "unica", fecha: "2026-05-12", hora: "" })
        .success,
    ).toBe(true);
    expect(
      esquemaRecordatorio.safeParse({
        titulo,
        repeticion: "unica",
        fecha: "2026-05-12",
        hora: "18:30",
      }).success,
    ).toBe(true);
    expect(
      esquemaRecordatorio.safeParse({ titulo, repeticion: "unica", fecha: "2026-02-30", hora: "" })
        .success,
    ).toBe(false);
    expect(esquemaRecordatorio.safeParse({ titulo, repeticion: "unica", hora: "" }).success).toBe(
      false,
    );
  });

  it("diaria: pide la hora y no acepta que falte", () => {
    expect(
      esquemaRecordatorio.safeParse({ titulo, repeticion: "diaria", hora: "08:00" }).success,
    ).toBe(true);
    const sinHora = esquemaRecordatorio.safeParse({ titulo, repeticion: "diaria", hora: "" });
    expect(sinHora.success).toBe(false);
    expect(sinHora.error?.issues[0]?.message).toBe("Elegí a qué hora.");
    expect(esquemaRecordatorio.safeParse({ titulo, repeticion: "diaria" }).success).toBe(false);
  });

  it("semanal: pide el día de la semana, de 1 (lunes) a 7 (domingo)", () => {
    const con = (diaSemana: unknown) =>
      esquemaRecordatorio.safeParse({ titulo, repeticion: "semanal", diaSemana, hora: "" }).success;
    expect(con(1)).toBe(true);
    expect(con(7)).toBe(true);
    expect(con(0)).toBe(false);
    expect(con(8)).toBe(false);
    expect(con(2.5)).toBe(false);
    expect(con("lunes")).toBe(false);
    expect(con(undefined)).toBe(false);
  });

  it("mensual: pide el día del mes, de 1 a 31", () => {
    const con = (diaDelMes: unknown) =>
      esquemaRecordatorio.safeParse({ titulo, repeticion: "mensual", diaDelMes, hora: "" }).success;
    expect(con(1)).toBe(true);
    expect(con(31)).toBe(true);
    expect(con(0)).toBe(false);
    expect(con(32)).toBe(false);
    expect(con(undefined)).toBe(false);
  });

  it("anual: pide día y mes, y el mes tiene que tener ese día", () => {
    const con = (diaDelMes: number, mes: number) =>
      esquemaRecordatorio.safeParse({ titulo, repeticion: "anual", diaDelMes, mes, hora: "" });
    expect(con(12, 5).success).toBe(true);
    expect(con(29, 2).success).toBe(true);
    expect(con(31, 12).success).toBe(true);
    const treintaDeFebrero = con(30, 2);
    expect(treintaDeFebrero.success).toBe(false);
    expect(treintaDeFebrero.error?.issues[0]?.path).toEqual(["diaDelMes"]);
    expect(con(31, 4).success).toBe(false);
    expect(con(1, 13).success).toBe(false);
    expect(con(1, 0).success).toBe(false);
  });

  it("la hora tiene que ser HH:MM entre 00:00 y 23:59", () => {
    const con = (hora: string) =>
      esquemaRecordatorio.safeParse({ titulo, repeticion: "diaria", hora }).success;
    for (const buena of ["00:00", "09:05", "23:59"]) expect(con(buena), buena).toBe(true);
    for (const mala of ["24:00", "9:00", "12:60", "12:5", "mediodía", "12:00:00", " 12:00"]) {
      expect(con(mala), mala).toBe(false);
    }
  });

  it("rechaza título vacío o largo y una repetición desconocida", () => {
    const base = { repeticion: "diaria", hora: "08:00" };
    expect(esquemaRecordatorio.safeParse({ ...base, titulo: " " }).success).toBe(false);
    expect(esquemaRecordatorio.safeParse({ ...base, titulo: "a".repeat(81) }).success).toBe(false);
    expect(esquemaRecordatorio.safeParse({ titulo, repeticion: "cada tanto" }).success).toBe(false);
    expect(esquemaRecordatorio.safeParse({ titulo, hora: "08:00" }).success).toBe(false);
  });

  it("no mezcla campos: lo que no corresponde a la repetición se descarta", () => {
    const resultado = esquemaRecordatorio.safeParse({
      titulo,
      repeticion: "diaria",
      hora: "08:00",
      diaSemana: 3,
      fecha: "2026-05-12",
    });
    expect(resultado.success && Object.keys(resultado.data).sort()).toEqual([
      "hora",
      "repeticion",
      "titulo",
    ]);
  });
});

describe("recordatorios importantes", () => {
  const base = { titulo: "Llamarle", hora: "" };
  const variantes = [
    { repeticion: "unica", fecha: "2026-05-12" },
    { repeticion: "diaria", hora: "08:00" },
    { repeticion: "semanal", diaSemana: 2 },
    { repeticion: "mensual", diaDelMes: 15 },
    { repeticion: "anual", diaDelMes: 12, mes: 5 },
  ];

  it("importante es opcional y solo acepta verdadero o falso, con cada repetición", () => {
    for (const variante of variantes) {
      const datos = { ...base, ...variante };
      expect(esquemaRecordatorio.safeParse(datos).success, variante.repeticion).toBe(true);
      const importante = esquemaRecordatorio.safeParse({ ...datos, importante: true });
      expect(importante.success && importante.data.importante, variante.repeticion).toBe(true);
      expect(esquemaRecordatorio.safeParse({ ...datos, importante: false }).success).toBe(true);
      for (const malo of ["si", 1, null]) {
        expect(
          esquemaRecordatorio.safeParse({ ...datos, importante: malo }).success,
          `${variante.repeticion} ${String(malo)}`,
        ).toBe(false);
      }
    }
  });
});

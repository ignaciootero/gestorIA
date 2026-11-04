// Cliente de las rutas del módulo de contactos (apps/api/src/rutas/contactos.ts).
//
// Mismo patrón que lib/api-finanzas.ts: un `pedir` genérico y una función por endpoint,
// con los tipos tal como los devuelve la API (fechas con hora como texto; los días de
// calendario como "AAAA-MM-DD").

import type {
  DatosDeContacto,
  DatosDeRecordatorio,
  Repeticion,
  TipoDeContacto,
  TipoDeTelefono,
} from "@gestoria/shared";
import type { Deuda, ResumenDeDeudas } from "./api-deudas";
import type { Movimiento } from "./api-finanzas";
import { URL_API } from "./entorno";

export type { DatosDeContacto, DatosDeRecordatorio };

async function pedir<T>(ruta: string, opciones?: RequestInit): Promise<T> {
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    credentials: "include",
    ...opciones,
    headers: { "content-type": "application/json", ...opciones?.headers },
  });

  if (!respuesta.ok) {
    throw await respuesta.json();
  }

  return respuesta.json() as Promise<T>;
}

export type TelefonoDeContacto = { id: string; numero: string; tipo: TipoDeTelefono };
export type EtiquetaDeUnContacto = { id: number; nombre: string; color: string };

/** Lo que muestra el listado. */
export type ResumenDeContacto = {
  id: string;
  tipo: TipoDeContacto;
  nombre: string;
  apellido: string | null;
  /** Solo empresas. */
  rubro: string | null;
  favorito: boolean;
  telefonos: TelefonoDeContacto[];
  correos: string[];
  etiquetas: EtiquetaDeUnContacto[];
};

export type Recordatorio = {
  id: string;
  contactoId: string;
  titulo: string;
  repeticion: Repeticion;
  /** Cuándo cae, según la repetición; lo que ella no usa va en nulo. */
  fecha: string | null;
  diaSemana: number | null;
  diaDelMes: number | null;
  mes: number | null;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  /** Lleva un distintivo; no cambia el orden de las listas. */
  importante: boolean;
  /** La próxima vez que cae, desde hoy inclusive. */
  proximaFecha: string;
  /** 0 es hoy. */
  diasRestantes: number;
};

export type RecordatorioConContacto = Recordatorio & {
  contacto: {
    id: string;
    tipo: TipoDeContacto;
    nombre: string;
    apellido: string | null;
    /** Para pintar el avatar del mismo color que en el listado de contactos. */
    etiquetas: EtiquetaDeUnContacto[];
  };
};

export type Contacto = ResumenDeContacto & {
  fechaNacimiento: string | null;
  sitioWeb: string | null;
  horario: string | null;
  documento: string | null;
  personaDeContacto: string | null;
  direccion: string | null;
  notas: string | null;
  recordatorios: Recordatorio[];
  creadoEn: string;
  actualizadoEn: string;
};

export type Etiqueta = { id: number; nombre: string; color: string; contactos: number };

// --- Contactos ---

export type FiltrosDeContactos = {
  tipo?: TipoDeContacto | undefined;
  favoritos?: boolean | undefined;
  etiquetaId?: number | undefined;
  busqueda?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

function consulta(parametros: Record<string, string | number | boolean | undefined>): string {
  const busqueda = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== "") busqueda.set(clave, String(valor));
  }
  const texto = busqueda.toString();
  return texto === "" ? "" : `?${texto}`;
}

export function obtenerContactos(
  filtros: FiltrosDeContactos = {},
): Promise<{ contactos: ResumenDeContacto[]; total: number }> {
  return pedir(`/api/contactos${consulta({ ...filtros })}`);
}

export function obtenerContacto(id: string): Promise<Contacto> {
  return pedir(`/api/contactos/${id}`);
}

export function crearContacto(datos: DatosDeContacto): Promise<Contacto> {
  return pedir("/api/contactos", { method: "POST", body: JSON.stringify(datos) });
}

export function editarContacto(id: string, datos: DatosDeContacto): Promise<Contacto> {
  return pedir(`/api/contactos/${id}`, { method: "PUT", body: JSON.stringify(datos) });
}

export function marcarFavorito(id: string, favorito: boolean): Promise<{ favorito: boolean }> {
  return pedir(`/api/contactos/${id}/favorito`, {
    method: "PATCH",
    body: JSON.stringify({ favorito }),
  });
}

export function eliminarContacto(id: string): Promise<{ ok: true }> {
  return pedir(`/api/contactos/${id}`, { method: "DELETE" });
}

// --- Etiquetas ---

export function obtenerEtiquetas(): Promise<{ etiquetas: Etiqueta[] }> {
  return pedir("/api/contactos/etiquetas");
}

/** Sin `color`, el servidor elige el más distinto de los que ya tiene la persona. */
export function crearEtiqueta(nombre: string, color?: string): Promise<Etiqueta> {
  return pedir("/api/contactos/etiquetas", {
    method: "POST",
    body: JSON.stringify({ nombre, ...(color === undefined ? {} : { color }) }),
  });
}

export function editarEtiqueta(id: number, nombre: string, color: string): Promise<Etiqueta> {
  return pedir(`/api/contactos/etiquetas/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nombre, color }),
  });
}

export function eliminarEtiqueta(id: number): Promise<{ ok: true }> {
  return pedir(`/api/contactos/etiquetas/${id}`, { method: "DELETE" });
}

// --- Recordatorios ---

export type FiltrosDeRecordatorios = {
  dias?: number | undefined;
  busqueda?: string | undefined;
  repeticion?: Repeticion | undefined;
  contactoId?: string | undefined;
  limit?: number | undefined;
};

export function obtenerRecordatorios(
  opciones: FiltrosDeRecordatorios = {},
): Promise<{ recordatorios: RecordatorioConContacto[]; total: number }> {
  return pedir(`/api/contactos/recordatorios${consulta(opciones)}`);
}

// --- Histórico de recordatorios ---

/** Una vez que un recordatorio cayó y su día ya pasó (también en los que se repiten). */
export type EntradaDelHistorial = {
  id: string;
  contactoId: string;
  recordatorioId: string;
  titulo: string;
  /** Cómo se repite el recordatorio de origen. */
  repeticion: Repeticion;
  /** El día en que cayó, "AAAA-MM-DD". */
  dia: string;
  hora: string | null;
  /** Si el recordatorio de origen era importante cuando cayó. */
  importante: boolean;
  /** Cuántos días pasaron desde entonces: 1 es ayer. */
  diasAtras: number;
  contacto: RecordatorioConContacto["contacto"];
};

export type FiltrosDelHistorialDeRecordatorios = {
  busqueda?: string | undefined;
  repeticion?: Repeticion | undefined;
  contactoId?: string | undefined;
  limit?: number | undefined;
};

export function obtenerHistorialDeRecordatorios(
  filtros: FiltrosDelHistorialDeRecordatorios = {},
): Promise<{ entradas: EntradaDelHistorial[]; total: number }> {
  return pedir(`/api/contactos/recordatorios/historial${consulta(filtros)}`);
}

export function eliminarDelHistorial(id: string): Promise<{ ok: true }> {
  return pedir(`/api/contactos/recordatorios/historial/${id}`, { method: "DELETE" });
}

/** Vacía todo el histórico; no toca los recordatorios. */
export function vaciarElHistorial(): Promise<{ eliminadas: number }> {
  return pedir("/api/contactos/recordatorios/historial", { method: "DELETE" });
}

export function crearRecordatorio(
  contactoId: string,
  datos: DatosDeRecordatorio,
): Promise<Recordatorio> {
  return pedir(`/api/contactos/${contactoId}/recordatorios`, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function editarRecordatorio(
  contactoId: string,
  id: string,
  datos: DatosDeRecordatorio,
): Promise<Recordatorio> {
  return pedir(`/api/contactos/${contactoId}/recordatorios/${id}`, {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

export function eliminarRecordatorio(contactoId: string, id: string): Promise<{ ok: true }> {
  return pedir(`/api/contactos/${contactoId}/recordatorios/${id}`, { method: "DELETE" });
}

// --- Widgets ---

type ContactoBreve = { tipo: TipoDeContacto; nombre: string; apellido: string | null };

export type RecordatorioQueViene = {
  titulo: string;
  repeticion: string;
  fecha: string;
  /** "HH:MM"; null es "todo el día". */
  hora: string | null;
  dias: number;
  contacto: ContactoBreve;
};

/** Deudas pendientes con contactos en un sentido (te deben o debés). */
export type DeudasConContactos = {
  /** Lo que falta, por moneda: las monedas nunca se mezclan. */
  totales: { moneda: string; centavos: number; deudas: number }[];
  /** Cuántos contactos distintos. */
  contactos: number;
  /** Los contactos con más plata pendiente (por moneda), hasta tres. */
  mayores: (ContactoBreve & { moneda: string; centavos: number })[];
};

export type WidgetsDeContactos = {
  /** El día de hoy para la persona ("AAAA-MM-DD"), en su zona horaria. */
  hoy: string;
  totales: { personas: number; empresas: number; sinDatosDeContacto: number };
  recordatorios: {
    hoy: number;
    proximos7: number;
    proximos30: number;
    porSemana: number[];
    proximos: RecordatorioQueViene[];
  };
  /** Los que cayeron en los últimos 7 días (1 es ayer), el más reciente primero; hasta ocho. */
  semanaPasada: {
    titulo: string;
    dia: string;
    /** "HH:MM"; null es "todo el día". */
    hora: string | null;
    diasAtras: number;
    contacto: ContactoBreve;
  }[];
  proximoCumpleanos: {
    nombre: string;
    apellido: string | null;
    fecha: string;
    dias: number;
    nacimiento: string;
  } | null;
  /** Cuántos cumpleaños caen en cada mes, de enero a diciembre. */
  cumpleanosPorMes: number[];
  deudas: {
    teDeben: DeudasConContactos;
    debes: DeudasConContactos;
    /** La deuda con fecha límite que vence antes; `dias` es negativo si ya venció. */
    proximoVencimiento: {
      concepto: string;
      sentido: "me_deben" | "debo";
      contacto: ContactoBreve;
      moneda: string;
      centavos: number;
      fechaLimite: string;
      dias: number;
    } | null;
  };
};

export function obtenerWidgetsDeContactos(): Promise<WidgetsDeContactos> {
  return pedir("/api/contactos/widgets");
}

// --- Lo que une a los contactos con Finanzas ---

/** Un contacto para elegir en un selector (por ejemplo, al cargar un movimiento). */
export type OpcionDeContacto = {
  id: string;
  tipo: TipoDeContacto;
  nombre: string;
  apellido: string | null;
};

export function obtenerOpcionesDeContactos(): Promise<{ contactos: OpcionDeContacto[] }> {
  return pedir("/api/contactos/opciones");
}

export type FinanzasDeUnContacto = {
  monedaBase: string;
  movimientos: {
    /** Los más recientes. */
    recientes: Movimiento[];
    /** Cuántos hay en total con este contacto. */
    cantidad: number;
    /** Sumas en la moneda base. */
    gastosCentavos: number;
    ingresosCentavos: number;
  };
  deudas: {
    pendientes: Deuda[];
    resumen: ResumenDeDeudas;
    /** Cuántas ya están saldadas. */
    saldadas: number;
  };
};

/** La plata con un contacto: movimientos cargados con él y sus deudas. */
export function obtenerFinanzasDeContacto(id: string): Promise<FinanzasDeUnContacto> {
  return pedir(`/api/contactos/${id}/finanzas`);
}

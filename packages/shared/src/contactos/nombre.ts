// Cómo se nombra un contacto en pantalla.

/** "Ana Pérez" para una persona (el apellido es opcional); el nombre a secas para una empresa. */
export function nombreCompletoDeContacto(contacto: {
  nombre: string;
  apellido?: string | null | undefined;
}): string {
  return [contacto.nombre, contacto.apellido].filter(Boolean).join(" ");
}

/** Hasta dos letras para el avatar: "AP" para "Ana Pérez", "E" para "Electricidad". */
export function inicialesDeContacto(contacto: {
  nombre: string;
  apellido?: string | null | undefined;
}): string {
  const palabras = nombreCompletoDeContacto(contacto)
    .split(/\s+/)
    .filter((palabra) => /^\p{L}|^\p{N}/u.test(palabra));
  const primera = palabras[0];
  const ultima = palabras.length > 1 ? palabras[palabras.length - 1] : undefined;
  return [primera, ultima]
    .filter((palabra): palabra is string => palabra !== undefined)
    .map((palabra) => (Array.from(palabra)[0] ?? "").toLocaleUpperCase("es"))
    .join("");
}

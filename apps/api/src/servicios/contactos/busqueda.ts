// Búsqueda de texto en Contactos: lo que escribe la persona se busca tal cual.

/** Escapa `%`, `_` y `\` para que lo que escribe la persona se busque tal cual, no como comodines. */
export function patronDeBusqueda(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)}%`;
}

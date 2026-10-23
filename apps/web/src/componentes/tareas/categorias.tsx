// Lo que comparten las pantallas de tareas sobre las categorías: cargarlas (una sola consulta para
// toda la pantalla, porque todas usan la misma clave) y mostrar la de una tarea como un puntito de
// color con su nombre. El nombre va siempre en texto: el color solo no alcanza (accesibilidad).

"use client";

import { useQuery } from "@tanstack/react-query";
import { type CategoriaDeTarea, obtenerCategoriasDeTarea } from "@/lib/api-tareas";
import { cn } from "@/lib/clases";

export const CLAVE_DE_CATEGORIAS_DE_TAREA = ["tareas", "categorias"] as const;

export function useCategoriasDeTarea() {
  return useQuery({
    queryKey: CLAVE_DE_CATEGORIAS_DE_TAREA,
    queryFn: obtenerCategoriasDeTarea,
  });
}

/** La categoría de una tarea; no muestra nada si no tiene o si todavía no se cargaron. */
export function EtiquetaDeCategoria({
  categoriaId,
  className,
}: {
  categoriaId: number | null;
  className?: string;
}) {
  const { data } = useCategoriasDeTarea();
  if (categoriaId === null) return null;
  const categoria: CategoriaDeTarea | undefined = data?.categorias.find(
    (otra) => otra.id === categoriaId,
  );
  if (!categoria) return null;

  return (
    <span
      className={cn("inline-flex min-w-0 max-w-40 items-center gap-1.5 text-xs", className)}
      title={categoria.nombre}
    >
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: categoria.color }}
      />
      <span className="truncate">{categoria.nombre}</span>
    </span>
  );
}

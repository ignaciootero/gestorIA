// Aviso que se muestra antes de dar una tarea por fallida, para que quede claro qué significa: la cruz no es
// "terminarla" (eso es la casilla), es decir que ya no se va a hacer. Se puede pedir no volver a verlo
// ("No volver a mostrar"); eso se recuerda en este navegador (lib/preferencias-tareas.ts).
//
// Se usa con un hook: `pedir(tarea)` abre el aviso (o, si ya se pidió no verlo, confirma de una) y `aviso` es el
// diálogo, que hay que dibujar una vez en la pantalla.

"use client";

import { XCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Boton } from "@/componentes/ui/boton";
import { Casilla } from "@/componentes/ui/casilla";
import { Dialogo } from "@/componentes/ui/dialogo";
import type { Tarea } from "@/lib/api-tareas";
import { avisoDeFallidaOculto, ocultarAvisoDeFallida } from "@/lib/preferencias-tareas";

export function usarAvisoDeFallida(confirmar: (tarea: Tarea) => void): {
  pedir: (tarea: Tarea) => void;
  aviso: ReactNode;
} {
  const [tarea, setTarea] = useState<Tarea | null>(null);
  const [noVolverAMostrar, setNoVolverAMostrar] = useState(false);

  function pedir(candidata: Tarea) {
    if (avisoDeFallidaOculto()) {
      confirmar(candidata);
      return;
    }
    setNoVolverAMostrar(false);
    setTarea(candidata);
  }

  function aceptar() {
    if (!tarea) return;
    if (noVolverAMostrar) ocultarAvisoDeFallida();
    const elegida = tarea;
    setTarea(null);
    confirmar(elegida);
  }

  const aviso = (
    <Dialogo
      abierto={tarea !== null}
      onCerrar={() => setTarea(null)}
      titulo="¿Dar la tarea por fallida?"
      icono={XCircle}
      tono="peligro"
    >
      {tarea ? (
        <>
          <p className="text-sm text-texto">
            <strong className="font-medium">{tarea.titulo}</strong>
          </p>
          <p className="text-sm text-texto-secundario">
            Dala por fallida si{" "}
            <strong className="font-medium text-texto">ya no la vas a hacer</strong>: sale de tu
            lista y cuenta como no hecha. Podés deshacerlo.
          </p>
          <Casilla
            marcada={noVolverAMostrar}
            onCambio={setNoVolverAMostrar}
            etiqueta="No volver a mostrar"
          />
          <div className="flex justify-end gap-2">
            <Boton variante="sutil" onClick={() => setTarea(null)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" onClick={aceptar}>
              Dar por fallida
            </Boton>
          </div>
        </>
      ) : null}
    </Dialogo>
  );

  return { pedir, aviso };
}

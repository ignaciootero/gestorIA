// Modo claro y oscuro.
//
// El selector tiene dos opciones, no tres. Igual se respeta la preferencia del
// sistema: mientras la persona no elija nada, la interfaz sigue a Windows o al
// teléfono y cambia sola si el sistema cambia. La elección explícita la guarda
// el navegador y a partir de ahí manda (docs/guias/estetica.md).

"use client";

import { RESORTE } from "@gestoria/ui-tokens";
import { Moon, Sun } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/clases";

export type Tema = "claro" | "oscuro";

const CLAVE = "gestion.tema";

type ContextoTema = {
  /** El tema que se está viendo, haya sido elegido o venga del sistema. */
  tema: Tema;
  cambiarTema: (nuevo: Tema) => void;
};

const Contexto = createContext<ContextoTema | null>(null);

function esTema(valor: unknown): valor is Tema {
  return valor === "claro" || valor === "oscuro";
}

/** Lo que prefiere el sistema operativo en este momento. */
function temaDelSistema(): Tema {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
}

function aplicar(tema: Tema): void {
  document.documentElement.setAttribute("data-theme", tema === "oscuro" ? "dark" : "light");
}

export function ProveedorDeTema({ children }: { children: ReactNode }) {
  // Arranca en claro y se corrige en el efecto. El destello lo evita el script
  // inline del layout, que corre antes del primer pintado.
  const [tema, setTema] = useState<Tema>("claro");

  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE);

    if (esTema(guardado)) {
      setTema(guardado);
      return;
    }

    // Sin elección guardada: se sigue al sistema, y se sigue escuchando por si
    // cambia (por ejemplo al anochecer, con el modo oscuro automático).
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const seguirAlSistema = () => {
      const delSistema = temaDelSistema();
      setTema(delSistema);
      aplicar(delSistema);
    };

    seguirAlSistema();
    consulta.addEventListener("change", seguirAlSistema);
    return () => consulta.removeEventListener("change", seguirAlSistema);
  }, []);

  const cambiarTema = useCallback((nuevo: Tema) => {
    setTema(nuevo);
    aplicar(nuevo);
    window.localStorage.setItem(CLAVE, nuevo);
  }, []);

  return <Contexto.Provider value={{ tema, cambiarTema }}>{children}</Contexto.Provider>;
}

export function useTema(): ContextoTema {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("useTema necesita estar dentro de ProveedorDeTema.");
  }
  return contexto;
}

const OPCIONES: { valor: Tema; etiqueta: string; Icono: typeof Sun }[] = [
  { valor: "claro", etiqueta: "Tema claro", Icono: Sun },
  { valor: "oscuro", etiqueta: "Tema oscuro", Icono: Moon },
];

export function SelectorDeTema({ className }: { className?: string }) {
  const { tema, cambiarTema } = useTema();
  const reducirMovimiento = useReducedMotion();

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className={cn(
        "inline-flex rounded-control border border-borde bg-superficie p-0.5",
        className,
      )}
    >
      {OPCIONES.map(({ valor, etiqueta, Icono }) => {
        const elegido = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={elegido}
            aria-label={etiqueta}
            title={etiqueta}
            onClick={() => cambiarTema(valor)}
            className={cn(
              "relative inline-flex size-8 items-center justify-center rounded-[0.375rem]",
              "transition-colors duration-(--anim-duracion) ease-(--anim-curva)",
              elegido ? "text-acento-suave-texto" : "text-texto-secundario hover:text-texto",
            )}
          >
            {/*
              Un selector segmentado lleva un indicador que se desliza hasta la
              opción elegida, no un fondo que se prende y se apaga. El
              `layoutId` compartido es lo que hace que Motion entienda que es el
              mismo elemento que se mudó (docs/guias/estetica.md).
            */}
            {elegido ? (
              <motion.span
                layoutId="indicador-de-tema"
                aria-hidden="true"
                transition={reducirMovimiento ? { duration: 0 } : RESORTE.firme}
                className="absolute inset-0 rounded-[0.375rem] bg-acento-suave"
              />
            ) : null}
            <Icono aria-hidden="true" className="relative size-4" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Script que corre antes de pintar la primera pantalla.
 *
 * Sin esto, quien tiene el tema oscuro (elegido o por preferencia del sistema)
 * ve un destello blanco mientras carga el JavaScript de React. Va inline en el
 * <head> a propósito.
 */
export const SCRIPT_TEMA_INICIAL = `
(function () {
  try {
    var t = localStorage.getItem("${CLAVE}");
    if (t !== "claro" && t !== "oscuro") {
      t = matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro";
    }
    document.documentElement.setAttribute("data-theme", t === "oscuro" ? "dark" : "light");
  } catch (e) {}
})();
`;

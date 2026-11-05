// Color de acento elegido por la persona: un color para el modo claro y otro para el oscuro.
//
// El proveedor lee los colores de la sesión (se guardan en la cuenta), deriva sus cuatro tonos
// (packages/ui-tokens, acento-personalizado.ts) y los aplica como variables CSS. El selector es
// un diálogo con el tono del modo que se está viendo y un botón para volver al verde agua; el
// resultado se ve directo en la app, detrás del diálogo.
//
// Mientras se elige, el color se ve al instante (vista previa) y se guarda en la cuenta un rato
// después de soltar el selector, para no mandar un pedido por cada movimiento del mouse.

"use client";

import type { ColoresDeAcento } from "@gestoria/shared";
import { type ModoDeColor, TEMA_CLARO, TEMA_OSCURO } from "@gestoria/ui-tokens";
import { Palette, RotateCcw } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTema } from "@/componentes/tema";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import { aplicarTonos, guardarCopia, tonosDe } from "@/lib/color-de-acento";
import { URL_API } from "@/lib/entorno";

/** El verde agua de la app en cada modo (lo que muestra el selector cuando no hay uno elegido). */
const ORIGINAL: Record<ModoDeColor, string> = {
  claro: TEMA_CLARO.acento,
  oscuro: TEMA_OSCURO.acento,
};

/** Cuánto se espera después del último cambio para guardar en la cuenta. */
const ESPERA_PARA_GUARDAR_MS = 600;

type ContextoDeColor = {
  /** Los colores que se ven: los elegidos o, mientras se elige, los de la vista previa. */
  colores: ColoresDeAcento;
  /** Muestra unos colores al instante y los guarda en la cuenta un rato después. */
  cambiarColores: (nuevos: ColoresDeAcento) => void;
  /** Si el último guardado falló. */
  error: boolean;
};

const Contexto = createContext<ContextoDeColor | null>(null);

async function guardarEnLaCuenta(colores: ColoresDeAcento): Promise<void> {
  const respuesta = await fetch(`${URL_API}/api/yo/colores`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(colores),
  });
  if (!respuesta.ok) throw new Error(`No se guardaron los colores (${respuesta.status}).`);
}

export function ProveedorDeColorDeAcento({ children }: { children: ReactNode }) {
  const { data: sesion, isPending, refetch } = useSession();
  const { tema } = useTema();
  const [vistaPrevia, setVistaPrevia] = useState<ColoresDeAcento | null>(null);
  const [error, setError] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hayCuenta = Boolean(sesion?.user);
  const claroDeLaCuenta = sesion?.user.colorDeAcentoClaro ?? null;
  const oscuroDeLaCuenta = sesion?.user.colorDeAcentoOscuro ?? null;
  // Primitivos y no un objeto: son lo que miran los efectos de abajo.
  const claro = vistaPrevia ? vistaPrevia.claro : claroDeLaCuenta;
  const oscuro = vistaPrevia ? vistaPrevia.oscuro : oscuroDeLaCuenta;

  // Antes de pintar: al cambiar de tema, los tonos del modo nuevo tienen que estar en el mismo
  // cuadro que el cambio, no uno después. Mientras se resuelve la sesión no se toca nada: ya
  // están los que dejó el script del layout.
  useLayoutEffect(() => {
    if (isPending) return;
    aplicarTonos(tonosDe({ claro, oscuro }, tema));
  }, [claro, oscuro, tema, isPending]);

  // La copia del navegador sigue a la cuenta: al entrar con otra cuenta o al salir, cambia.
  useEffect(() => {
    if (isPending) return;
    guardarCopia(hayCuenta ? { claro: claroDeLaCuenta, oscuro: oscuroDeLaCuenta } : null);
  }, [hayCuenta, claroDeLaCuenta, oscuroDeLaCuenta, isPending]);

  useEffect(() => () => clearTimeout(espera.current), []);

  const cambiarColores = useCallback(
    (nuevos: ColoresDeAcento) => {
      setVistaPrevia(nuevos);
      setError(false);
      clearTimeout(espera.current);
      espera.current = setTimeout(async () => {
        try {
          await guardarEnLaCuenta(nuevos);
          await refetch();
          setVistaPrevia(null);
        } catch {
          // La vista previa queda: la persona ve lo que eligió y el aviso de que no se guardó.
          setError(true);
        }
      }, ESPERA_PARA_GUARDAR_MS);
    },
    [refetch],
  );

  return (
    <Contexto.Provider value={{ colores: { claro, oscuro }, cambiarColores, error }}>
      {children}
    </Contexto.Provider>
  );
}

export function useColorDeAcento(): ContextoDeColor {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("useColorDeAcento necesita estar dentro de ProveedorDeColorDeAcento.");
  }
  return contexto;
}

/**
 * Botón de la barra que abre el selector de color. Solo con sesión: el color es de la cuenta.
 * Elige el tono del modo que se está viendo; el del otro modo se elige estando en ese modo.
 */
export function SelectorDeColor() {
  const { colores, cambiarColores, error } = useColorDeAcento();
  const { tema } = useTema();
  const [abierto, setAbierto] = useState(false);
  const elegido = colores[tema];
  const valor = elegido ?? ORIGINAL[tema];
  const nombreDelModo = tema === "claro" ? "modo claro" : "modo oscuro";
  /** Cambia solo el del modo que se está viendo; null vuelve al original. */
  const cambiarTono = (color: string | null) =>
    cambiarColores(tema === "claro" ? { ...colores, claro: color } : { ...colores, oscuro: color });

  return (
    <>
      <button
        type="button"
        aria-label="Color de la app"
        title="Color de la app"
        onClick={() => setAbierto(true)}
        className={cn(
          "flex size-9 items-center justify-center rounded-control text-acento",
          "transition-colors duration-(--duracion-rapida) ease-salida",
          "hover:bg-superficie-suave",
        )}
      >
        <Palette aria-hidden="true" className="size-4" />
      </button>

      <Dialogo
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Color de la app"
        icono={Palette}
      >
        <p className="text-sm text-texto-secundario">
          Seleccioná el tono para el {nombreDelModo}.
        </p>

        {/* El color, su código y, si no es el original, cómo volver a él: todo en una fila. */}
        <div className="flex items-center gap-3 rounded-control border border-borde bg-superficie-suave p-2">
          <input
            type="color"
            aria-label={`Tono del ${nombreDelModo}`}
            value={valor}
            onChange={(evento) => cambiarTono(evento.target.value)}
            className="h-10 w-14 shrink-0 cursor-pointer rounded-control border border-borde-fuerte bg-superficie p-1"
          />
          <span className="font-mono text-sm uppercase text-texto">{valor}</span>
          {elegido === null ? (
            <span className="ml-auto pr-2 text-sm text-texto-secundario">Original</span>
          ) : (
            <Boton
              variante="sutil"
              tamano="chico"
              className="ml-auto"
              title="Volver al color original"
              onClick={() => cambiarTono(null)}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Restablecer
            </Boton>
          )}
        </div>

        {error ? (
          <p role="alert" className="text-sm text-peligro">
            No pudimos guardar el color. Revisá la conexión y probá de nuevo.
          </p>
        ) : null}
        <div className="flex justify-end">
          <Boton onClick={() => setAbierto(false)}>Listo</Boton>
        </div>
      </Dialogo>
    </>
  );
}

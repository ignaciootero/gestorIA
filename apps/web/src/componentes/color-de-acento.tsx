// Color de acento elegido por la persona: un color para el modo claro y otro para el oscuro.
//
// El proveedor lee los colores de la sesión (se guardan en la cuenta), deriva sus cuatro tonos
// (packages/ui-tokens, acento-personalizado.ts) y los aplica como variables CSS. El selector es
// un diálogo con un color por modo, una vista previa de cómo queda cada uno y un botón para
// volver al verde agua de la app.
//
// Mientras se elige, el color se ve al instante (vista previa) y se guarda en la cuenta un rato
// después de soltar el selector, para no mandar un pedido por cada movimiento del mouse.

"use client";

import type { ColoresDeAcento } from "@gestoria/shared";
import { type ModoDeColor, TEMA_CLARO, TEMA_OSCURO } from "@gestoria/ui-tokens";
import { Moon, Palette, RotateCcw, Sun } from "lucide-react";
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

/** Sin color elegido: los dos modos con el de la app. */
const DE_LA_APP: ColoresDeAcento = { claro: null, oscuro: null };

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

/** Cómo queda el acento en un modo: un botón, algo seleccionado y un enlace. */
function VistaPrevia({ modo, colores }: { modo: ModoDeColor; colores: ColoresDeAcento }) {
  const base = modo === "claro" ? TEMA_CLARO : TEMA_OSCURO;
  const tonos = tonosDe(colores, modo) ?? base;
  return (
    // Es una muestra, no algo para usar: la leen igual los lectores de pantalla como texto.
    <div
      className="flex flex-wrap items-center gap-2 rounded-control border border-borde p-2"
      style={{ backgroundColor: base.superficie }}
    >
      <span
        className="rounded-control px-3 py-1.5 text-sm font-medium"
        style={{ backgroundColor: tonos.acento, color: tonos.acentoTexto }}
      >
        Botón
      </span>
      <span
        className="rounded-control px-3 py-1.5 text-sm"
        style={{ backgroundColor: tonos.acentoSuave, color: tonos.acentoSuaveTexto }}
      >
        Seleccionado
      </span>
      <span className="text-sm underline" style={{ color: tonos.acento }}>
        Enlace
      </span>
    </div>
  );
}

function ColorDeUnModo({
  modo,
  colores,
  alCambiar,
}: {
  modo: ModoDeColor;
  colores: ColoresDeAcento;
  alCambiar: (color: string) => void;
}) {
  const Icono = modo === "claro" ? Sun : Moon;
  const nombre = modo === "claro" ? "Modo claro" : "Modo oscuro";
  const id = `color-de-acento-${modo}`;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium text-texto">
        <Icono aria-hidden="true" className="size-4" />
        {nombre}
      </legend>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          aria-label={`Color de acento del ${nombre.toLowerCase()}`}
          value={colores[modo] ?? ORIGINAL[modo]}
          onChange={(evento) => alCambiar(evento.target.value)}
          className="h-11 w-16 shrink-0 cursor-pointer rounded-control border border-borde-fuerte bg-superficie p-1"
        />
        <span className="text-sm text-texto-secundario">
          {colores[modo] === null ? "El de la app" : "Elegido por vos"}
        </span>
      </div>
      <VistaPrevia modo={modo} colores={colores} />
    </fieldset>
  );
}

/** Botón de la barra que abre el selector de color. Solo con sesión: el color es de la cuenta. */
export function SelectorDeColor() {
  const { colores, cambiarColores, error } = useColorDeAcento();
  const [abierto, setAbierto] = useState(false);
  const esElOriginal = colores.claro === null && colores.oscuro === null;

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
          Elegí un color para cada modo. Se usa en botones, enlaces y lo seleccionado, y se
          guarda en tu cuenta. Si con el color elegido el texto no se lee bien, se ajusta un poco
          más claro u oscuro, sin cambiar el tono.
        </p>
        <div className="flex flex-col gap-4">
          <ColorDeUnModo
            modo="claro"
            colores={colores}
            alCambiar={(color) => cambiarColores({ ...colores, claro: color })}
          />
          <ColorDeUnModo
            modo="oscuro"
            colores={colores}
            alCambiar={(color) => cambiarColores({ ...colores, oscuro: color })}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-peligro">
            No pudimos guardar el color. Revisá la conexión y probá de nuevo.
          </p>
        ) : null}
        <div className="flex flex-wrap justify-between gap-2">
          <Boton
            variante="secundario"
            onClick={() => cambiarColores(DE_LA_APP)}
            disabled={esElOriginal}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Volver al color original
          </Boton>
          <Boton onClick={() => setAbierto(false)}>Listo</Boton>
        </div>
      </Dialogo>
    </>
  );
}

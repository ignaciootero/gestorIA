// Apariencia elegida por la persona, un juego por modo (claro y oscuro): el color de acento y los
// ajustes del fondo animado (intensidad, velocidad, tamaño de las manchas y un segundo tono).
//
// El proveedor lee lo elegido de la sesión (se guarda en la cuenta) y lo aplica: los cuatro
// tonos del acento (packages/ui-tokens, acento-personalizado.ts) y la intensidad del fondo como
// variables CSS; el resto del fondo lo lee el lienzo (layout/fondo-animado.tsx) del contexto. El
// selector es un diálogo con lo del modo que se está viendo; el resultado se ve directo en la
// app, detrás del diálogo.
//
// Mientras se elige, todo se ve al instante (vista previa) y se guarda en la cuenta un rato
// después del último cambio, para no mandar un pedido por cada movimiento del mouse.

"use client";

import {
  type AjustesDelFondoGuardados,
  type ColoresDeAcento,
  type Fondos,
  leerAjustesDelFondo,
} from "@gestoria/shared";
import {
  AJUSTES_DEL_FONDO_POR_DEFECTO,
  LIMITES_DEL_FONDO,
  type ModoDeColor,
  TEMA_CLARO,
  TEMA_OSCURO,
} from "@gestoria/ui-tokens";
import { Palette, RotateCcw } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTema } from "@/componentes/tema";
import { Boton } from "@/componentes/ui/boton";
import { Dialogo } from "@/componentes/ui/dialogo";
import { Interruptor } from "@/componentes/ui/interruptor";
import { useSession } from "@/lib/auth-cliente";
import { cn } from "@/lib/clases";
import {
  aplicarIntensidad,
  aplicarTonos,
  guardarCopia,
  opacidadDe,
  tonosDe,
} from "@/lib/color-de-acento";
import { URL_API } from "@/lib/entorno";

/** El verde agua de la app en cada modo (lo que muestra el selector cuando no hay uno elegido). */
const ORIGINAL: Record<ModoDeColor, string> = {
  claro: TEMA_CLARO.acento,
  oscuro: TEMA_OSCURO.acento,
};

/** El segundo tono que se propone al encenderlo: un índigo, que va bien con casi todo. */
const SEGUNDO_TONO_INICIAL = "#6366f1";

/** Cuánto se espera después del último cambio para guardar en la cuenta. */
const ESPERA_PARA_GUARDAR_MS = 600;

type ContextoDeApariencia = {
  /** Los colores que se ven: los elegidos o, mientras se elige, los de la vista previa. */
  colores: ColoresDeAcento;
  /** Muestra unos colores al instante y los guarda en la cuenta un rato después. */
  cambiarColores: (nuevos: ColoresDeAcento) => void;
  /** Los ajustes del fondo que se ven; null en un modo es el fondo de la app. */
  fondos: Fondos;
  /** Lo mismo que `cambiarColores`, para el fondo. */
  cambiarFondos: (nuevos: Fondos) => void;
  /** Si el último guardado falló. */
  error: boolean;
};

const Contexto = createContext<ContextoDeApariencia | null>(null);

async function guardarEnLaCuenta(ruta: string, cuerpo: unknown): Promise<void> {
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  if (!respuesta.ok) throw new Error(`No se guardó la apariencia (${respuesta.status}).`);
}

/**
 * Vista previa con guardado diferido: el valor se ve al instante y se guarda en la cuenta un rato
 * después del último cambio. Al terminar se vuelve a pedir la sesión, que pasa a traer lo
 * guardado, y la vista previa se suelta.
 */
function useGuardadoDiferido<T>(
  ruta: string,
  refetch: () => Promise<unknown>,
  alFallar: (fallo: boolean) => void,
) {
  const [vistaPrevia, setVistaPrevia] = useState<T | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(espera.current), []);

  const cambiar = useCallback(
    (nuevo: T) => {
      setVistaPrevia(nuevo);
      alFallar(false);
      clearTimeout(espera.current);
      espera.current = setTimeout(async () => {
        try {
          await guardarEnLaCuenta(ruta, nuevo);
          await refetch();
          setVistaPrevia(null);
        } catch {
          // La vista previa queda: la persona ve lo que eligió y el aviso de que no se guardó.
          alFallar(true);
        }
      }, ESPERA_PARA_GUARDAR_MS);
    },
    [ruta, refetch, alFallar],
  );

  return { vistaPrevia, cambiar };
}

export function ProveedorDeColorDeAcento({ children }: { children: ReactNode }) {
  const { data: sesion, isPending, refetch } = useSession();
  const { tema } = useTema();
  const [error, setError] = useState(false);
  const colores = useGuardadoDiferido<ColoresDeAcento>("/api/yo/colores", refetch, setError);
  const fondos = useGuardadoDiferido<Fondos>("/api/yo/fondo", refetch, setError);

  const usuario = sesion?.user;
  const hayCuenta = Boolean(usuario);

  // Lo de la cuenta. Los efectos de abajo miran textos y no objetos, que cambiarían en cada
  // render aunque digan lo mismo.
  const claroDeLaCuenta = usuario?.colorDeAcentoClaro ?? null;
  const oscuroDeLaCuenta = usuario?.colorDeAcentoOscuro ?? null;
  const fondoClaroDeLaCuenta = usuario?.fondoClaro ?? null;
  const fondoOscuroDeLaCuenta = usuario?.fondoOscuro ?? null;
  const fondosDeLaCuenta = useMemo<Fondos>(
    () => ({
      claro: leerAjustesDelFondo(fondoClaroDeLaCuenta),
      oscuro: leerAjustesDelFondo(fondoOscuroDeLaCuenta),
    }),
    [fondoClaroDeLaCuenta, fondoOscuroDeLaCuenta],
  );

  // Lo que se ve: la vista previa mientras se elige, si no lo de la cuenta.
  const claro = colores.vistaPrevia ? colores.vistaPrevia.claro : claroDeLaCuenta;
  const oscuro = colores.vistaPrevia ? colores.vistaPrevia.oscuro : oscuroDeLaCuenta;
  const fondosVisibles = fondos.vistaPrevia ?? fondosDeLaCuenta;
  const opacidad = opacidadDe(fondosVisibles, tema);

  // Antes de pintar: al cambiar de tema, lo del modo nuevo tiene que estar en el mismo cuadro que
  // el cambio, no uno después. Mientras se resuelve la sesión no se toca nada: ya está lo que
  // dejó el script del layout.
  useLayoutEffect(() => {
    if (isPending) return;
    aplicarTonos(tonosDe({ claro, oscuro }, tema));
    aplicarIntensidad(opacidad);
  }, [claro, oscuro, opacidad, tema, isPending]);

  // La copia del navegador sigue a la cuenta: al entrar con otra cuenta o al salir, cambia.
  useEffect(() => {
    if (isPending) return;
    const deLaCuenta = { claro: claroDeLaCuenta, oscuro: oscuroDeLaCuenta };
    guardarCopia(hayCuenta ? { colores: deLaCuenta, fondos: fondosDeLaCuenta } : null);
  }, [hayCuenta, claroDeLaCuenta, oscuroDeLaCuenta, fondosDeLaCuenta, isPending]);

  return (
    <Contexto.Provider
      value={{
        colores: { claro, oscuro },
        cambiarColores: colores.cambiar,
        fondos: fondosVisibles,
        cambiarFondos: fondos.cambiar,
        error,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}

export function useColorDeAcento(): ContextoDeApariencia {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("useColorDeAcento necesita estar dentro de ProveedorDeColorDeAcento.");
  }
  return contexto;
}

/** Un ajuste con barra deslizante: el nombre, el valor en palabras y la barra. */
function Deslizador({
  etiqueta,
  valor,
  texto,
  minimo,
  maximo,
  paso,
  alCambiar,
}: {
  etiqueta: string;
  valor: number;
  /** El valor como se lee ("56 %", "Quieto"). También lo anuncia el lector de pantalla. */
  texto: string;
  minimo: number;
  maximo: number;
  paso: number;
  alCambiar: (valor: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label htmlFor={id} className="text-texto">
          {etiqueta}
        </label>
        <span className="numeros-tabulares text-texto-secundario">{texto}</span>
      </div>
      <input
        id={id}
        type="range"
        min={minimo}
        max={maximo}
        step={paso}
        value={valor}
        aria-valuetext={texto}
        onChange={(evento) => alCambiar(Number(evento.target.value))}
        className="h-6 w-full cursor-pointer accent-acento"
      />
    </div>
  );
}

/** Encabezado de cada parte del diálogo, con "Restablecer" a la derecha (o "Original"). */
function Encabezado({
  id,
  titulo,
  esOriginal,
  alRestablecer,
  que,
}: {
  /** Para que la sección que encabeza se llame como el título (`aria-labelledby`). */
  id: string;
  titulo: string;
  esOriginal: boolean;
  alRestablecer: () => void;
  /** Qué se restablece, para el nombre accesible del botón ("el color", "el fondo"). */
  que: string;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      <h3 id={id} className="text-sm font-medium text-texto">
        {titulo}
      </h3>
      {esOriginal ? (
        <span className="pr-2 text-sm text-texto-secundario">Original</span>
      ) : (
        <Boton
          variante="sutil"
          tamano="chico"
          aria-label={`Restablecer ${que}`}
          title={`Volver ${que === "el color" ? "al color" : "al fondo"} original`}
          onClick={alRestablecer}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Restablecer
        </Boton>
      )}
    </div>
  );
}

function formatearVelocidad(velocidad: number): string {
  if (velocidad === 0) return "Quieto";
  return `${(velocidad / 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}×`;
}

/** El editor de los ajustes del fondo del modo que se está viendo. */
function EditorDelFondo({ modo }: { modo: ModoDeColor }) {
  const { fondos, cambiarFondos } = useColorDeAcento();
  const idDelTitulo = useId();
  const elegido = fondos[modo];
  const ajustes: AjustesDelFondoGuardados = elegido ?? AJUSTES_DEL_FONDO_POR_DEFECTO[modo];

  const cambiar = (cambios: Partial<AjustesDelFondoGuardados> | null) => {
    const nuevos = cambios === null ? null : { ...ajustes, ...cambios };
    cambiarFondos(modo === "claro" ? { ...fondos, claro: nuevos } : { ...fondos, oscuro: nuevos });
  };

  return (
    <section aria-labelledby={idDelTitulo} className="flex flex-col gap-3">
      <Encabezado
        id={idDelTitulo}
        titulo="Fondo"
        que="el fondo"
        esOriginal={elegido === null}
        alRestablecer={() => cambiar(null)}
      />
      <Deslizador
        etiqueta="Intensidad"
        valor={ajustes.intensidad}
        texto={ajustes.intensidad === 0 ? "Apagado" : `${ajustes.intensidad} %`}
        minimo={LIMITES_DEL_FONDO.intensidad.minimo}
        maximo={LIMITES_DEL_FONDO.intensidad.maximo}
        paso={1}
        alCambiar={(intensidad) => cambiar({ intensidad })}
      />
      <Deslizador
        etiqueta="Velocidad"
        valor={ajustes.velocidad}
        texto={formatearVelocidad(ajustes.velocidad)}
        minimo={LIMITES_DEL_FONDO.velocidad.minimo}
        maximo={LIMITES_DEL_FONDO.velocidad.maximo}
        paso={10}
        alCambiar={(velocidad) => cambiar({ velocidad })}
      />
      <Deslizador
        etiqueta="Tamaño de las manchas"
        valor={ajustes.tamano}
        texto={`${ajustes.tamano} %`}
        minimo={LIMITES_DEL_FONDO.tamano.minimo}
        maximo={LIMITES_DEL_FONDO.tamano.maximo}
        paso={5}
        alCambiar={(tamano) => cambiar({ tamano })}
      />
      <div className="flex min-h-11 items-center gap-3">
        <Interruptor
          etiqueta="Segundo tono"
          encendido={ajustes.tonoSecundario !== null}
          onCambio={(encendido) =>
            cambiar({ tonoSecundario: encendido ? SEGUNDO_TONO_INICIAL : null })
          }
        />
        <span className="text-sm text-texto">Segundo tono</span>
        {ajustes.tonoSecundario !== null ? (
          <input
            type="color"
            aria-label="Segundo tono del fondo"
            value={ajustes.tonoSecundario}
            onChange={(evento) => cambiar({ tonoSecundario: evento.target.value })}
            className="ml-auto h-9 w-12 shrink-0 cursor-pointer rounded-control border border-borde-fuerte bg-superficie p-1"
          />
        ) : null}
      </div>
    </section>
  );
}

/**
 * Botón de la barra que abre el selector de apariencia. Solo con sesión: es de la cuenta.
 * Muestra lo del modo que se está viendo; lo del otro modo se elige estando en ese modo.
 */
export function SelectorDeColor() {
  const { colores, cambiarColores, error } = useColorDeAcento();
  const { tema } = useTema();
  const [abierto, setAbierto] = useState(false);
  const idDelTono = useId();
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

        <section aria-labelledby={idDelTono} className="flex flex-col gap-2">
          <Encabezado
            id={idDelTono}
            titulo="Tono"
            que="el color"
            esOriginal={elegido === null}
            alRestablecer={() => cambiarTono(null)}
          />
          <div className="flex items-center gap-3 rounded-control border border-borde bg-superficie-suave p-2">
            <input
              type="color"
              aria-label={`Tono del ${nombreDelModo}`}
              value={valor}
              onChange={(evento) => cambiarTono(evento.target.value)}
              className="h-10 w-14 shrink-0 cursor-pointer rounded-control border border-borde-fuerte bg-superficie p-1"
            />
            <span className="font-mono text-sm uppercase text-texto">{valor}</span>
          </div>
        </section>

        <div className="border-t border-borde" />
        <EditorDelFondo modo={tema} />

        {error ? (
          <p role="alert" className="text-sm text-peligro">
            No pudimos guardar los cambios. Revisá la conexión y probá de nuevo.
          </p>
        ) : null}
        <div className="flex justify-end">
          <Boton onClick={() => setAbierto(false)}>Listo</Boton>
        </div>
      </Dialogo>
    </>
  );
}

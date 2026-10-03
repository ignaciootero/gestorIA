// Campo para escribir un importe de dinero, con los miles separados mientras se
// escribe ("1.234.567,50").
//
// Un <input type="number"> no puede mostrar separadores de miles, así que acá es
// un campo de texto con teclado numérico en el móvil (`inputMode="decimal"`). El
// formato y la interpretación viven en `packages/shared` (importe-escrito.ts) y
// salen de `Intl` para la región.
//
// Cómo se escribe:
// - los miles se separan solos; no hace falta escribir el punto;
// - la coma es el separador decimal y, para quien escribe con el teclado numérico,
//   un punto escrito también vale como decimal;
// - se admiten hasta dos decimales;
// - al pegar un importe de otro lado ("1,234.56", "$ 250.5") se interpreta solo.
//
// El valor que sube a quien lo usa es un número (o NaN si el campo está vacío o
// incompleto), igual que daba `valueAsNumber`: por eso se usa con `Controller` de
// react-hook-form y los mismos esquemas Zod de siempre.
//
// El cursor se conserva donde estaba aunque el formato agregue o quite puntos:
// se cuenta cuántos dígitos había antes del cursor y se lo vuelve a poner detrás
// del mismo dígito.

"use client";

import {
  darFormatoAImporteEscrito,
  interpretarImporteEscrito,
  normalizarImportePegado,
  separadoresDeImporte,
  textoDeImporte,
} from "@gestoria/shared";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type ComponentProps,
  forwardRef,
  type MutableRefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Campo } from "./campo";

type PropsCampoDeImporte = Omit<
  ComponentProps<typeof Campo>,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode"
> & {
  /** El importe como número. `undefined` o NaN muestran el campo vacío. */
  value: number | undefined;
  onChange: (valor: number) => void;
  /** Deja escribir un signo menos al principio (saldos). Los importes y límites no. */
  permitirNegativo?: boolean;
};

/** Cuántos caracteres "significativos" (dígitos, coma decimal y signo) hay en el texto. */
function contarSignificativos(texto: string, decimal: string): number {
  let cuenta = 0;
  for (const caracter of texto) {
    if (/\d/.test(caracter) || caracter === decimal || caracter === "-") cuenta += 1;
  }
  return cuenta;
}

/** La posición en `texto` justo después del carácter significativo número `cantidad`. */
function posicionDespuesDe(texto: string, cantidad: number, decimal: string): number {
  if (cantidad <= 0) return 0;
  let cuenta = 0;
  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i] ?? "";
    if (/\d/.test(caracter) || caracter === decimal || caracter === "-") cuenta += 1;
    if (cuenta === cantidad) return i + 1;
  }
  return texto.length;
}

export const CampoDeImporte = forwardRef<HTMLInputElement, PropsCampoDeImporte>(
  function CampoDeImporte(
    { value, onChange, onBlur, permitirNegativo = false, ...resto },
    referenciaExterna,
  ) {
    const { decimal } = separadoresDeImporte();
    const [texto, setTexto] = useState(() => textoDeImporte(value));
    const entrada = useRef<HTMLInputElement | null>(null);
    // Dónde dejar el cursor después del próximo render (o null para no tocarlo).
    const cursorPendiente = useRef<number | null>(null);
    // Para forzar el efecto del cursor aunque el texto no haya cambiado.
    const [, setRepintar] = useState(0);

    const asignarReferencia = useCallback(
      (elemento: HTMLInputElement | null) => {
        entrada.current = elemento;
        if (typeof referenciaExterna === "function") referenciaExterna(elemento);
        else if (referenciaExterna) {
          (referenciaExterna as MutableRefObject<HTMLInputElement | null>).current = elemento;
        }
      },
      [referenciaExterna],
    );

    // Si el valor cambia desde afuera (un `reset`, un valor por defecto que llega
    // tarde), el texto lo sigue. Lo que sube desde acá ya coincide con el texto y
    // no lo toca, para no pisar lo que se está escribiendo ("12," sigue siendo "12,").
    useEffect(() => {
      const actual = interpretarImporteEscrito(texto);
      const esperado = value ?? Number.NaN;
      const coinciden = Object.is(actual, esperado) || actual === esperado;
      if (!coinciden) setTexto(textoDeImporte(value));
    }, [value]);

    useLayoutEffect(() => {
      const posicion = cursorPendiente.current;
      if (posicion !== null && entrada.current) {
        entrada.current.setSelectionRange(posicion, posicion);
      }
      cursorPendiente.current = null;
    });

    /** Aplica un texto nuevo (ya con el cursor en `posicionCruda` dentro de él). */
    function aplicar(crudo: string, posicionCruda: number): void {
      const formateado = darFormatoAImporteEscrito(crudo, { permitirNegativo });
      cursorPendiente.current = posicionDespuesDe(
        formateado,
        contarSignificativos(crudo.slice(0, posicionCruda), decimal),
        decimal,
      );
      setTexto(formateado);
      setRepintar((n) => n + 1);
      onChange(interpretarImporteEscrito(formateado));
    }

    function alCambiar(evento: ChangeEvent<HTMLInputElement>): void {
      const elemento = evento.currentTarget;
      let crudo = elemento.value;
      let posicion = elemento.selectionStart ?? crudo.length;
      const nativo = evento.nativeEvent as InputEvent;
      const dato = nativo.data;

      // Un evento que no es de entrada real (un autocompletado, una herramienta de
      // pruebas que asigna el valor entero) trae el importe completo: se interpreta
      // como si se lo hubiera pegado.
      const esEntradaReal = typeof InputEvent !== "undefined" && nativo instanceof InputEvent;

      if (!esEntradaReal) {
        crudo = normalizarImportePegado(crudo);
        posicion = crudo.length;
      } else if (nativo.inputType === "insertText" && dato === ".") {
        // Un punto escrito es la coma decimal (con el teclado numérico es la tecla
        // que hay). Si ya hay una coma, no hace nada.
        const sinPunto = crudo.slice(0, posicion - 1) + crudo.slice(posicion);
        if (texto.includes(decimal)) {
          crudo = sinPunto;
          posicion -= 1;
        } else {
          crudo = `${crudo.slice(0, posicion - 1)}${decimal}${crudo.slice(posicion)}`;
        }
      } else if (typeof dato === "string" && dato.length > 1 && crudo === dato) {
        // Se reemplazó todo el contenido de golpe (autocompletar, lectores de
        // pantalla): se lo interpreta como un importe pegado.
        crudo = normalizarImportePegado(crudo);
        posicion = crudo.length;
      }

      aplicar(crudo, posicion);
    }

    function alPegar(evento: ClipboardEvent<HTMLInputElement>): void {
      evento.preventDefault();
      const elemento = evento.currentTarget;
      const pegado = normalizarImportePegado(evento.clipboardData.getData("text"));
      const inicio = elemento.selectionStart ?? texto.length;
      const fin = elemento.selectionEnd ?? inicio;
      const crudo = texto.slice(0, inicio) + pegado + texto.slice(fin);
      aplicar(crudo, inicio + pegado.length);
    }

    return (
      <Campo
        {...resto}
        ref={asignarReferencia}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={texto}
        onChange={alCambiar}
        onPaste={alPegar}
        onBlur={(evento) => {
          // Una coma que quedó sin decimales ("12,") se limpia al salir del campo.
          if (texto.endsWith(decimal)) setTexto(texto.slice(0, -decimal.length));
          onBlur?.(evento);
        }}
      />
    );
  },
);

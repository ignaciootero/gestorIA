// Cotización de un movimiento que cruza monedas: un gasto o ingreso en una cuenta que
// no está en la moneda base, o una transferencia entre cuentas de distinta moneda.
//
// Lo habitual tiene que ser un solo vistazo y cero pasos: se muestra la cotización de
// la fecha del movimiento (la trae la API, nunca el navegador) y a cuánto equivale el
// importe. Quien necesite otra (un banco que da mejor cambio) toca "Cambiar" (en el
// encabezado; el mismo botón deja "Usar la del día" para volver) y elige entre escribirla o indicar el importe del otro lado, y la
// cotización se calcula sola. Si no hay cotización disponible, se pide escribirla en
// vez de bloquear el movimiento.
//
// Al editar, lo que se propone es la cotización que el movimiento ya tenía guardada:
// una cotización es parte de lo que se registró y no se cambia sola.
//
// Este componente no guarda nada: le avisa al formulario qué pedir a la API (`cambio`),
// a cuánto equivale el importe y si falta algo para poder guardar.

"use client";

import {
  centavosDesdeImporte,
  convertirCentavos,
  convertirCentavosInverso,
  type DatosCambio,
  decirCotizacion,
  derivarTasa,
  esTasaValida,
  formatearFecha,
  formatearMonto,
  formatearTasa,
  tasaDesdeCotizacionDicha,
} from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Undo2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { CampoDeImporte } from "@/componentes/ui/campo-de-importe";
import { Selector } from "@/componentes/ui/selector";
import { obtenerCotizacion } from "@/lib/api-finanzas";

/** Lo que el formulario necesita saber de la cotización elegida. */
export type EstadoDelCambio = {
  /** Lo que se manda a la API. `undefined`: al crear, la del día; al editar, la que ya tenía. */
  cambio: DatosCambio | undefined;
  /** Cuánto sale de la cuenta de origen, en su moneda (centésimos); null si aún no se sabe. */
  importeOrigenCentavos: number | null;
  /** Cuánto llega al destino (o a cuánto equivale), en su moneda (centésimos); null si aún no se sabe. */
  convertidoCentavos: number | null;
  /** Lo que falta para poder guardar, dicho para la persona; null si está todo. */
  error: string | null;
};

type Modo = "sugerida" | "automatica" | "tasa" | "importe";

const DECIMALES_DE_UNA_COTIZACION = 6;

type Props = {
  monedaDeOrigen: string;
  monedaDeDestino: string;
  /** El importe escrito, en la unidad normal; NaN si está vacío. */
  importe: number;
  /** En cuál de las dos monedas se escribió el importe (solo una transferencia puede escribirlo en la de destino). */
  monedaDelImporte: "origen" | "destino";
  /** Instante ISO de la fecha del movimiento; null si todavía no es válida. */
  fecha: string | null;
  /** Al editar, lo que el movimiento ya tiene guardado (solo vale si las cuentas no cambiaron). */
  guardado?:
    | {
        tipoDeCambio: number;
        manual: boolean;
        importeCentavos: number;
        importeConvertidoCentavos: number;
      }
    | undefined;
  esTransferencia: boolean;
  /** Se intentó guardar: si falta algo, se dice en voz alta junto a los campos. */
  mostrarError: boolean;
  onCambiar: (estado: EstadoDelCambio) => void;
};

/** El importe convertido, o null si no hay con qué (sin importe o sin tasa) o no se puede calcular. */
function convertir(importeCentavos: number | null, tasa: number | null): number | null {
  if (importeCentavos === null || tasa === null) return null;
  try {
    return convertirCentavos(importeCentavos, tasa);
  } catch {
    return null;
  }
}

/**
 * Cuánto sale del origen para que lleguen `destinoCentavos` con esta tasa, o null si no hay con
 * qué (sin importe o sin tasa) o el resultado no sirve (menos de un centésimo, o no cabe).
 */
function calcularElOrigen(destinoCentavos: number | null, tasa: number | null): number | null {
  if (destinoCentavos === null || tasa === null) return null;
  try {
    const origen = convertirCentavosInverso(destinoCentavos, tasa);
    return origen > 0 ? origen : null;
  } catch {
    return null;
  }
}

export function SeccionDeCambio({
  monedaDeOrigen,
  monedaDeDestino,
  importe,
  monedaDelImporte,
  fecha,
  guardado,
  esTransferencia,
  mostrarError,
  onCambiar,
}: Props) {
  const idTitulo = useId();
  const [modo, setModo] = useState<Modo>("sugerida");
  const [abierta, setAbierta] = useState(false);
  const [tasaEscrita, setTasaEscrita] = useState(Number.NaN);
  const [recibidoEscrito, setRecibidoEscrito] = useState(Number.NaN);

  const cotizacion = useQuery({
    queryKey: [
      "finanzas",
      "cotizacion",
      monedaDeOrigen,
      monedaDeDestino,
      fecha === null ? null : fecha.slice(0, 10),
    ],
    queryFn: () => obtenerCotizacion(monedaDeOrigen, monedaDeDestino, fecha as string),
    enabled: fecha !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const sinCotizacion = cotizacion.isError;

  // Sin cotización que usar, no queda otra que escribirla.
  const usaLaDelDia = modo === "automatica" || (modo === "sugerida" && !guardado);
  const modoEfectivo: Modo = usaLaDelDia && sinCotizacion ? "tasa" : modo;

  // Lo escrito está en la moneda de origen o, en una transferencia, puede estar en la de destino.
  const enDestino = monedaDelImporte === "destino";
  const escritoCentavos =
    Number.isFinite(importe) && importe > 0 ? centavosDesdeImporte(importe) : null;
  // La moneda del "otro lado": la que no es en la que se escribió el importe.
  const monedaDelOtroLado = enDestino ? monedaDeOrigen : monedaDeDestino;

  let tasa: number | null = null;
  // Los dos lados del movimiento: lo que sale de la cuenta (moneda de origen) y lo que llega (destino).
  let importeOrigenCentavos: number | null = enDestino ? null : escritoCentavos;
  let convertidoCentavos: number | null = enDestino ? escritoCentavos : null;
  let cambio: DatosCambio | undefined;
  let error: string | null = null;

  if (modoEfectivo === "sugerida" || modoEfectivo === "automatica") {
    const conservada = modoEfectivo === "sugerida" ? guardado : undefined;
    tasa = conservada ? conservada.tipoDeCambio : (cotizacion.data?.tasa ?? null);
    if (!enDestino) {
      cambio = modoEfectivo === "automatica" ? { modo: "automatico" } : undefined;
      // Con el mismo importe, al editar queda el convertido exacto que ya tenía.
      convertidoCentavos =
        conservada && escritoCentavos === conservada.importeCentavos
          ? conservada.importeConvertidoCentavos
          : convertir(escritoCentavos, tasa);
    }
  } else if (modoEfectivo === "tasa") {
    // Lo que se escribe está dicho como se dice una cotización ("1 USD = 40 UYU"): se pasa a la tasa de origen a destino.
    const escrita =
      Number.isFinite(tasaEscrita) && tasaEscrita > 0
        ? tasaDesdeCotizacionDicha(monedaDeOrigen, monedaDeDestino, tasaEscrita)
        : null;
    tasa = escrita !== null && esTasaValida(escrita) ? escrita : null;
    if (!enDestino) {
      cambio = tasa === null ? undefined : { modo: "tasa", tasa };
      convertidoCentavos = convertir(escritoCentavos, tasa);
    }
    if (tasa === null) {
      error = sinCotizacion
        ? "No pudimos traer la cotización de ese día. Escribila para seguir."
        : "Escribí la cotización.";
    }
  } else {
    // Se indican los dos importes: el escrito arriba y el del otro lado, y la cotización sale de ahí.
    const delOtroLado =
      Number.isFinite(recibidoEscrito) && recibidoEscrito > 0
        ? centavosDesdeImporte(recibidoEscrito)
        : null;
    const entregado = enDestino ? delOtroLado : escritoCentavos;
    const recibido = enDestino ? escritoCentavos : delOtroLado;
    tasa = entregado !== null && recibido !== null ? derivarTasa(entregado, recibido) : null;
    importeOrigenCentavos = entregado;
    convertidoCentavos = recibido;
    // `importeConvertido` es siempre lo que llega al destino, escrito en una u otra casilla.
    const importeDestino = enDestino ? importe : recibidoEscrito;
    cambio = recibido === null ? undefined : { modo: "importe", importeConvertido: importeDestino };
    if (delOtroLado === null) {
      error = `Escribí el importe en ${monedaDelOtroLado}.`;
    } else if (escritoCentavos !== null && tasa === null) {
      error = "Esos dos importes dan una cotización que no parece correcta. Revisalos.";
    }
  }

  // Si lo escrito es lo que llega al destino y la cotización viene de afuera (la del día o una
  // escrita), cuánto sale del origen se calcula; se guardan los dos importes como quedaron a la vista.
  if (enDestino && modoEfectivo !== "importe") {
    importeOrigenCentavos = calcularElOrigen(escritoCentavos, tasa);
    cambio = escritoCentavos === null ? undefined : { modo: "importe", importeConvertido: importe };
    if (error === null && escritoCentavos !== null && importeOrigenCentavos === null) {
      error =
        tasa === null
          ? "Esperá a que se cargue la cotización."
          : "Ese importe es demasiado chico para esta cotización.";
    }
  }

  // Le avisa al formulario solo cuando algo cambió de verdad (no en cada render).
  const clave = JSON.stringify([cambio, importeOrigenCentavos, convertidoCentavos, error]);
  useEffect(() => {
    onCambiar({ cambio, importeOrigenCentavos, convertidoCentavos, error });
  }, [clave]);

  const opciones: { valor: Modo; etiqueta: string }[] = [
    guardado
      ? { valor: "sugerida", etiqueta: "La que ya tiene guardada" }
      : { valor: "sugerida", etiqueta: "La del día" },
    ...(guardado ? [{ valor: "automatica" as const, etiqueta: "La del día" }] : []),
    { valor: "tasa", etiqueta: "Escribir la cotización" },
    { valor: "importe", etiqueta: `Indicar el importe en ${monedaDelOtroLado}` },
  ];

  const origenDeLaTasa =
    modoEfectivo === "sugerida" && guardado
      ? guardado.manual
        ? "la que se escribió al cargarlo"
        : "la del día en que se cargó"
      : modoEfectivo === "tasa"
        ? "la que escribiste"
        : modoEfectivo === "importe"
          ? "calculada con tus dos importes"
          : cotizacion.data
            ? `del ${formatearFecha(`${cotizacion.data.fechaDeLaFuente}T12:00:00Z`, "UTC")}`
            : null;

  const muestraCampos = abierta || sinCotizacion;

  /** Cierra las opciones y deja la cotización propuesta (la guardada al editar, la del día al crear). */
  function volverALaSugerida(): void {
    setModo("sugerida");
    setAbierta(false);
  }
  // Siempre se dice igual: "1 USD = 40,2857 UYU", con la moneda que más vale como unidad.
  const dicha = decirCotizacion(monedaDeOrigen, monedaDeDestino, tasa ?? 1);

  return (
    <section
      aria-labelledby={idTitulo}
      className="flex flex-col gap-3 rounded-control border border-borde bg-superficie-suave p-3"
    >
      {/* El botón queda siempre en el encabezado: no se mueve al abrir las opciones. */}
      <div className="flex items-center justify-between gap-2">
        <h3 id={idTitulo} className="text-sm font-medium text-texto">
          Cotización
        </h3>

        {/* Sin cotización que usar no hay a qué volver: los campos quedan abiertos. */}
        {sinCotizacion ? null : abierta ? (
          <Boton tamano="chico" variante="secundario" aria-expanded onClick={volverALaSugerida}>
            <Undo2 aria-hidden="true" className="size-4" />
            {guardado ? "Volver a la guardada" : "Usar la del día"}
          </Boton>
        ) : (
          <Boton
            tamano="chico"
            variante="secundario"
            aria-expanded={false}
            aria-label="Cambiar la cotización"
            onClick={() => setAbierta(true)}
          >
            <Pencil aria-hidden="true" className="size-4" />
            Cambiar
          </Boton>
        )}
      </div>

      {/* `empty:hidden`: sin texto (escribiendo la cotización) no deja un hueco entre bloques. */}
      <div aria-live="polite" className="flex flex-col gap-0.5 text-sm empty:hidden">
        {tasa !== null ? (
          <p className="text-texto">
            1 {dicha.unidad} = {formatearTasa(dicha.valor)} {dicha.otra}
            {origenDeLaTasa ? (
              <span className="text-texto-secundario"> · {origenDeLaTasa}</span>
            ) : null}
          </p>
        ) : cotizacion.isPending && fecha !== null && modoEfectivo !== "tasa" ? (
          <p className="text-texto-secundario">Buscando la cotización…</p>
        ) : fecha === null && modoEfectivo !== "tasa" ? (
          <p className="text-texto-secundario">Elegí la fecha para ver la cotización.</p>
        ) : null}

        {convertidoCentavos !== null ? (
          <p className="font-medium text-texto">
            {esTransferencia
              ? `Llegan ${formatearMonto(convertidoCentavos, monedaDeDestino)} a la cuenta de destino.`
              : `Equivale a ${formatearMonto(convertidoCentavos, monedaDeDestino)}.`}
          </p>
        ) : null}

        {enDestino && importeOrigenCentavos !== null ? (
          <p className="font-medium text-texto">
            {`Salen ${formatearMonto(importeOrigenCentavos, monedaDeOrigen)} de la cuenta de origen.`}
          </p>
        ) : null}
      </div>

      {cotizacion.data?.desactualizada && modoEfectivo !== "tasa" ? (
        <Aviso tono="advertencia">
          No pudimos traer la cotización de ese día: usamos la más reciente que tenemos. Si no te
          sirve, cambiala.
        </Aviso>
      ) : null}

      {sinCotizacion ? (
        <Aviso tono="advertencia">
          No pudimos traer la cotización de ese día. Escribila vos para seguir.
        </Aviso>
      ) : null}

      {muestraCampos ? (
        <div className="flex flex-col gap-3">
          {sinCotizacion ? null : (
            <Selector
              etiqueta="Cotización a usar"
              value={modo}
              onChange={(evento) => setModo(evento.target.value as Modo)}
            >
              {opciones.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </Selector>
          )}

          {modoEfectivo === "tasa" ? (
            <CampoDeImporte
              etiqueta={`Cotización (cuántos ${dicha.otra} vale 1 ${dicha.unidad})`}
              moneda={dicha.otra}
              decimales={DECIMALES_DE_UNA_COTIZACION}
              value={tasaEscrita}
              onChange={setTasaEscrita}
              ayuda="Por ejemplo, la que te da tu banco."
              error={
                Number.isNaN(tasaEscrita) || tasa !== null
                  ? undefined
                  : "Esa cotización no es válida."
              }
            />
          ) : null}

          {modoEfectivo === "importe" ? (
            <CampoDeImporte
              moneda={monedaDelOtroLado}
              etiqueta={`Importe en ${monedaDelOtroLado}`}
              value={recibidoEscrito}
              onChange={setRecibidoEscrito}
              ayuda={
                esTransferencia
                  ? enDestino
                    ? "Cuánto salió de la cuenta de origen. La cotización se calcula sola."
                    : "Cuánto llegó a la cuenta de destino. La cotización se calcula sola."
                  : "Cuánto te cobraron (o te pagaron) en esa moneda. La cotización se calcula sola."
              }
            />
          ) : null}
        </div>
      ) : null}

      {mostrarError && error !== null && !sinCotizacion ? (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      ) : null}
    </section>
  );
}

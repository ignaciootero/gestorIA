// Auditoría de acciones de admin: quién, qué, a quién y cuándo.

"use client";

import { ACCIONES_AUDITORIA, type AccionAuditoria } from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Selector } from "@/componentes/ui/selector";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { obtenerAuditoria } from "@/lib/api-admin";
import { interpretarError } from "@/lib/mensajes-de-error";
import { EntradaDeAuditoria, ETIQUETA_DE_ACCION } from "./entrada-de-auditoria";

const POR_PAGINA = 30;

export function Auditoria() {
  const [pagina, setPagina] = useState(0);
  const [accion, setAccion] = useState<AccionAuditoria | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "auditoria", { pagina, accion, desde, hasta }],
    queryFn: () =>
      obtenerAuditoria({
        limit: POR_PAGINA,
        offset: pagina * POR_PAGINA,
        accion,
        desde,
        hasta,
      }),
  });

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <Selector
          etiqueta="Tipo de acción"
          value={accion}
          onChange={(evento) => {
            setAccion(evento.target.value as AccionAuditoria | "");
            setPagina(0);
          }}
        >
          <option value="">Todas</option>
          {Object.values(ACCIONES_AUDITORIA).map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_DE_ACCION[valor]}
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="Desde"
          type="date"
          value={desde}
          max={hasta || undefined}
          onChange={(evento) => {
            setDesde(evento.target.value);
            setPagina(0);
          }}
        />
        <Campo
          etiqueta="Hasta"
          type="date"
          value={hasta}
          min={desde || undefined}
          onChange={(evento) => {
            setHasta(evento.target.value);
            setPagina(0);
          }}
        />
      </Tarjeta>

      {isPending ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="solo-lectores">Cargando auditoría</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-tarjeta bg-superficie-suave" />
          ))}
        </div>
      ) : error ? (
        <Aviso tono="peligro">{interpretarError(error).mensaje}</Aviso>
      ) : data.entradas.length === 0 ? (
        <Tarjeta className="p-6 text-center text-sm text-texto-secundario">
          {accion || desde || hasta
            ? "Ninguna acción coincide con el filtro."
            : "Todavía no hay acciones registradas."}
        </Tarjeta>
      ) : (
        <div className="flex flex-col gap-2">
          {data.entradas.map((entrada) => (
            <EntradaDeAuditoria key={entrada.id} entrada={entrada} />
          ))}

          <div className="flex items-center justify-between pt-2 text-sm text-texto-secundario">
            <span>
              {data.total === 0 ? 0 : pagina * POR_PAGINA + 1}–
              {Math.min((pagina + 1) * POR_PAGINA, data.total)} de {data.total}
            </span>
            <div className="flex gap-2">
              <Boton
                tamano="chico"
                variante="sutil"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Boton>
              <Boton
                tamano="chico"
                variante="sutil"
                disabled={(pagina + 1) * POR_PAGINA >= data.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Siguiente
              </Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

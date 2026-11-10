// El encabezado de cada módulo (Finanzas, Contactos, Tareas, Calendario y Administración), con la
// misma bienvenida en pasos que la pantalla de inicio (ver SaludoDeInicio), para que cada pantalla
// "se arme" en vez de aparecer de golpe:
// 1. El ícono del módulo (el mismo del menú, en su color) aparece con un resorte suave.
// 2. El título se escribe letra por letra, en cascada.
// 3. Sube la descripción.
// 4. Entra el contenido de la pantalla (EntradaDeContenido), con el título todavía en camino.
//
// Todo es `transform` y `opacity`, dura menos de un segundo y no bloquea nada: se puede usar la
// pantalla mientras termina. Con la preferencia de reducir movimiento aparece quieto, de una vez.
//
// Las páginas son componentes de servidor y no pueden pasarle un componente (el ícono) a uno de
// cliente: por eso se elige el módulo por nombre y el ícono se busca acá.

"use client";

import { CURVA_SALIDA, DURACION_MS, RESORTE } from "@gestoria/ui-tokens";
import {
  BookUser,
  CalendarDays,
  ListChecks,
  type LucideIcon,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/clases";

/** El ícono de cada módulo (el del menú) y su color: el de origen, o el acento para Administración. */
const MODULOS = {
  finanzas: { Icono: Wallet, clase: "bg-origen-finanzas-fondo text-origen-finanzas-texto" },
  contactos: { Icono: BookUser, clase: "bg-origen-contactos-fondo text-origen-contactos-texto" },
  tareas: { Icono: ListChecks, clase: "bg-origen-tareas-fondo text-origen-tareas-texto" },
  calendario: { Icono: CalendarDays, clase: "bg-origen-manual-fondo text-origen-manual-texto" },
  admin: { Icono: ShieldCheck, clase: "bg-acento-suave text-acento-suave-texto" },
} as const satisfies Record<string, { Icono: LucideIcon; clase: string }>;

/** Cuándo empieza a escribirse el título y cuánto espera cada letra a la anterior. */
const INICIO_DE_LAS_LETRAS_S = 0.08;
const LETRA_S = 0.025;

/** Cuándo entra el contenido de la pantalla: con el título ya en camino. */
const ENTRADA_DEL_CONTENIDO_S = 0.2;

function useSube() {
  const reducirMovimiento = useReducedMotion();
  return (demora: number, desplazamiento = 8) => ({
    initial: reducirMovimiento ? false : { opacity: 0, y: desplazamiento },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURACION_MS.lenta / 1000, delay: demora, ease: CURVA_SALIDA },
  });
}

export function EncabezadoDeModulo({
  modulo,
  titulo,
  descripcion,
  claseDeLaDescripcion,
}: {
  modulo: keyof typeof MODULOS;
  titulo: string;
  descripcion: string;
  /** Para ajustar la descripción (por ejemplo, esconderla en una ventana baja). */
  claseDeLaDescripcion?: string;
}) {
  const reducirMovimiento = useReducedMotion();
  const sube = useSube();
  const { Icono, clase } = MODULOS[modulo];
  const palabras = titulo.split(" ");
  const finDeLasLetras = INICIO_DE_LAS_LETRAS_S + titulo.length * LETRA_S;
  // Cada letra con su demora, contando las de las palabras anteriores (y el espacio entre ellas).
  let posicion = 0;

  return (
    <header className="flex flex-col items-center text-center">
      <div className="flex items-center gap-3">
        <motion.span
          aria-hidden="true"
          className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", clase)}
          initial={reducirMovimiento ? false : { opacity: 0, scale: 0.6, rotate: -12 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={RESORTE.suave}
        >
          <Icono className="size-5" />
        </motion.span>
        {/* Las letras se animan una por una, así que el nombre accesible va aparte, entero. */}
        <h1 aria-label={titulo} className="text-2xl font-semibold tracking-tight">
          <span aria-hidden="true">
            {palabras.map((palabra, indice) => {
              const letras = [...palabra].map((letra) => {
                const demora = INICIO_DE_LAS_LETRAS_S + posicion * LETRA_S;
                posicion += 1;
                return { letra, demora };
              });
              posicion += 1;
              return (
                // Las palabras y sus letras están en un orden fijo: la posición es su identidad.
                <Fragment key={indice}>
                  {indice > 0 ? " " : null}
                  <span className="inline-block whitespace-nowrap">
                    {letras.map(({ letra, demora }, orden) => (
                      <motion.span key={orden} className="inline-block" {...sube(demora, 10)}>
                        {letra}
                      </motion.span>
                    ))}
                  </span>
                </Fragment>
              );
            })}
          </span>
        </h1>
      </div>
      <motion.p
        className={cn("mt-1 text-sm text-texto-secundario", claseDeLaDescripcion)}
        {...sube(Math.min(finDeLasLetras, 0.35))}
      >
        {descripcion}
      </motion.p>
    </header>
  );
}

/**
 * El contenido de la pantalla, que entra subiendo apenas después del encabezado. Solo `opacity` y
 * `transform`; `className` es para que siga ocupando el lugar que le toca (por ejemplo, `flex-1`).
 */
export function EntradaDeContenido({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const sube = useSube();
  return (
    <motion.div className={cn(className)} {...sube(ENTRADA_DEL_CONTENIDO_S, 16)}>
      {children}
    </motion.div>
  );
}

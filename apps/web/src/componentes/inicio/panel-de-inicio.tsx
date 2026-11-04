// Contenido de la pantalla de inicio: un saludo y un carrusel con el resumen de cada módulo
// (Finanzas, Calendario, Tareas y Contactos), que pasa solo de uno a otro.
//
// Es una pantalla para orientarse de un vistazo: cada resumen trae solo lo más importante de su
// módulo —una cifra destacada, a lo sumo un aviso, una lista corta y un gráfico— y el detalle queda
// en el módulo. Entra entera en la ventana, sin desplazamiento vertical (ver `pantallaFija` en
// EstructuraDeApp).
//
// Los cuatro pedidos salen juntos al entrar, no recién cuando le toca a cada resumen: así pasar de
// uno a otro es instantáneo. Usan las mismas claves de caché que los módulos, de modo que entrar a
// un módulo después no vuelve a pedir nada, y cualquier cambio allá pone al día el resumen.
//
// Verifica la sesión contra la API antes de mostrar nada. El proxy ya redirige a quien no tiene
// cookie, pero eso es solo para evitar un destello de pantalla equivocada: quien decide de verdad
// es el servidor (CLAUDE.md, Permisos verificados en el backend).

"use client";

import { diaDeHoy, sumarDias } from "@gestoria/shared";
import { useQuery } from "@tanstack/react-query";
import { BookUser, CalendarDays, ListChecks, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import { ESTILOS_DE_ORIGEN } from "@/componentes/calendario/origenes";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { obtenerEventos } from "@/lib/api-calendario";
import { obtenerWidgetsDeContactos } from "@/lib/api-contactos";
import { obtenerWidgets } from "@/lib/api-finanzas";
import { obtenerWidgetsDeTareas } from "@/lib/api-tareas";
import { URL_API } from "@/lib/entorno";
import { interpretarError } from "@/lib/mensajes-de-error";
import { zonaDelDispositivo } from "@/lib/preferencias-finanzas";
import { CarruselDeInicio, type Diapositiva } from "./carrusel-de-inicio";
import type { IdentidadDeModulo } from "./piezas-de-resumen";
import { DIAS_DEL_RESUMEN_DEL_CALENDARIO, ResumenDeCalendario } from "./resumen-de-calendario";
import { ResumenDeContactos } from "./resumen-de-contactos";
import { ResumenDeFinanzas } from "./resumen-de-finanzas";
import { ResumenDeTareas } from "./resumen-de-tareas";

type Yo = {
  id: string;
  usuario: string | null;
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  estado: string;
};

async function obtenerYo(): Promise<Yo> {
  const respuesta = await fetch(`${URL_API}/api/yo`, { credentials: "include" });

  if (!respuesta.ok) {
    throw await respuesta.json();
  }

  return respuesta.json() as Promise<Yo>;
}

/** Cada módulo con su ícono (el del menú), su página y su color de origen. */
const MODULOS = {
  finanzas: { nombre: "Finanzas", Icono: Wallet, href: "/finanzas", origen: "finanzas" },
  calendario: { nombre: "Calendario", Icono: CalendarDays, href: "/calendario", origen: "manual" },
  tareas: { nombre: "Tareas", Icono: ListChecks, href: "/tareas", origen: "tareas" },
  contactos: { nombre: "Contactos", Icono: BookUser, href: "/contactos", origen: "contactos" },
} as const;

/** El resumen de un módulo, listo para el carrusel. */
function diapositiva(
  clave: keyof typeof MODULOS,
  armar: (modulo: IdentidadDeModulo) => ReactNode,
): Diapositiva {
  const { origen, ...datos } = MODULOS[clave];
  const { suave, punto } = ESTILOS_DE_ORIGEN[origen];
  const modulo = { ...datos, suave, punto };
  return { id: clave, nombre: modulo.nombre, Icono: modulo.Icono, punto, contenido: armar(modulo) };
}

/** "martes 3 de noviembre". */
function hoyEnPalabras(dia: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${dia}T00:00:00Z`));
}

function Carrusel({ hoy }: { hoy: string }) {
  const finanzas = useQuery({ queryKey: ["finanzas", "widgets"], queryFn: obtenerWidgets });
  const tareas = useQuery({ queryKey: ["tareas", "widgets"], queryFn: obtenerWidgetsDeTareas });
  const contactos = useQuery({
    queryKey: ["contactos", "widgets"],
    queryFn: obtenerWidgetsDeContactos,
  });
  const hasta = sumarDias(hoy, DIAS_DEL_RESUMEN_DEL_CALENDARIO - 1);
  const calendario = useQuery({
    queryKey: ["calendario", "eventos", hoy, hasta],
    queryFn: () => obtenerEventos(hoy, hasta),
  });

  const diapositivas = [
    diapositiva("finanzas", (modulo) => <ResumenDeFinanzas modulo={modulo} consulta={finanzas} />),
    diapositiva("calendario", (modulo) => (
      <ResumenDeCalendario modulo={modulo} consulta={calendario} hoy={hoy} />
    )),
    diapositiva("tareas", (modulo) => <ResumenDeTareas modulo={modulo} consulta={tareas} />),
    diapositiva("contactos", (modulo) => (
      <ResumenDeContactos modulo={modulo} consulta={contactos} />
    )),
  ];

  return <CarruselDeInicio diapositivas={diapositivas} etiqueta="Resumen de tus módulos" />;
}

export function PanelDeInicio() {
  const router = useRouter();
  const { data: yo, error, isPending } = useQuery({ queryKey: ["yo"], queryFn: obtenerYo });
  // Solo se calcula en el navegador: esta parte nunca se dibuja en el servidor (antes de tener los
  // datos de la sesión se ve el esqueleto).
  const hoy = useMemo(() => (yo ? diaDeHoy(zonaDelDispositivo()) : null), [yo]);

  if (isPending) {
    // Esqueleto con la forma del contenido, no una pantalla en blanco
    // (docs/guias/rendimiento.md, Velocidad percibida).
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
        <div aria-busy="true" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-4">
          <span className="solo-lectores">Cargando tus datos</span>
          <div className="mx-auto h-8 w-48 animate-pulse rounded-control bg-superficie-suave" />
          <div className="min-h-40 flex-1 animate-pulse rounded-tarjeta bg-superficie-suave" />
        </div>
      </div>
    );
  }

  if (error) {
    const interpretado = interpretarError(error);
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Aviso tono="peligro" titulo="No pudimos cargar tus datos">
          {interpretado.mensaje}
        </Aviso>
        <Boton variante="secundario" onClick={() => router.replace("/ingresar")}>
          Volver a entrar
        </Boton>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {yo.nombre}</h1>
        {hoy ? (
          // En una ventana baja se esconde para dejarle el lugar al carrusel.
          <p className="mt-1 text-sm text-texto-secundario first-letter:uppercase [@media(max-height:700px)]:hidden">
            {hoyEnPalabras(hoy)}
          </p>
        ) : null}
      </header>

      {hoy ? <Carrusel hoy={hoy} /> : null}
    </div>
  );
}

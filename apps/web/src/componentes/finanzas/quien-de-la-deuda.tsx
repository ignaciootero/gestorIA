// Con quién es una deuda: un contacto (con enlace a su ficha) o alguien que no está en los contactos
// (solo un nombre escrito a mano). Siempre queda dicho cuál de los dos es, con texto y no solo con
// el color: "Contacto" lleva a su ficha; "No es un contacto" es solo un nombre.
//
// Un contacto en la papelera no se puede abrir (su ficha ya no existe para la persona), así que ahí
// no hay enlace y se avisa.

import { Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { AvatarDeContacto } from "@/componentes/contactos/avatar-de-contacto";
import { Insignia } from "@/componentes/ui/insignia";
import { type Deuda, nombreDeLaDeuda } from "@/lib/api-deudas";
import { cn } from "@/lib/clases";

/** La pantalla de Contactos con la ficha de ese contacto ya abierta. */
export function enlaceAlContacto(contactoId: string): string {
  return `/contactos?contacto=${contactoId}`;
}

/** El círculo de la izquierda: las iniciales del contacto, o un ícono genérico si es solo un nombre. */
export function AvatarDeLaDeuda({ deuda }: { deuda: Pick<Deuda, "contacto" | "nombreLibre"> }) {
  if (deuda.contacto) return <AvatarDeContacto contacto={deuda.contacto} />;
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-superficie-suave text-texto-secundario"
    >
      <UserRound className="size-5" />
    </span>
  );
}

/**
 * El nombre de con quién es la deuda, con su indicación. Con un contacto, el nombre es un enlace
 * a su ficha; si el contacto está en la papelera, es texto y lo dice.
 */
export function QuienDeLaDeuda({
  deuda,
  className,
}: {
  deuda: Pick<Deuda, "contacto" | "nombreLibre">;
  className?: string;
}) {
  const nombre = nombreDeLaDeuda(deuda);

  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5", className)}>
      {deuda.contacto && !deuda.contacto.eliminado ? (
        <>
          <Link
            href={enlaceAlContacto(deuda.contacto.id)}
            aria-label={`Ver el contacto ${nombre}`}
            className="min-w-0 break-words font-medium text-texto underline decoration-borde-fuerte underline-offset-2 hover:decoration-texto"
          >
            {nombre}
          </Link>
          <Insignia tono="info" icono={UserRound}>
            Contacto
          </Insignia>
        </>
      ) : deuda.contacto ? (
        <>
          <span className="min-w-0 break-words">{nombre}</span>
          <Insignia tono="advertencia" icono={Trash2}>
            Contacto en la papelera
          </Insignia>
        </>
      ) : (
        <>
          <span className="min-w-0 break-words">{nombre}</span>
          <Insignia>No es un contacto</Insignia>
        </>
      )}
    </span>
  );
}

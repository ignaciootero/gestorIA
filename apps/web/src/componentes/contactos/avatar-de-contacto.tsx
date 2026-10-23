// Avatar de un contacto: las iniciales de una persona o un edificio para una empresa o
// servicio (docs/guias/estetica.md: avatares con iniciales cuando no hay foto).
//
// El color de fondo sale de las etiquetas del contacto: con una, es el color de esa etiqueta; con
// varias, la mezcla de todos sus colores; sin ninguna (o si no se conocen sus etiquetas, como en las
// deudas), el color de acento suave de siempre. El texto va en blanco u oscuro, el
// que mejor se lea sobre el fondo.
//
// Es decorativo: el nombre siempre está escrito al lado, así que se oculta a los
// lectores de pantalla.

import {
  colorDeTextoSobre,
  inicialesDeContacto,
  mezclarColores,
  type TipoDeContacto,
} from "@gestoria/shared";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/clases";

export function AvatarDeContacto({
  contacto,
  className,
}: {
  contacto: {
    tipo: TipoDeContacto;
    nombre: string;
    apellido?: string | null;
    etiquetas?: readonly { color: string }[];
  };
  className?: string;
}) {
  const fondo = mezclarColores((contacto.etiquetas ?? []).map((etiqueta) => etiqueta.color));

  return (
    <span
      aria-hidden="true"
      style={fondo ? { backgroundColor: fondo, color: colorDeTextoSobre(fondo) } : undefined}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        !fondo && "bg-acento-suave text-acento-suave-texto",
        className,
      )}
    >
      {contacto.tipo === "empresa" ? (
        <Building2 className="size-5" />
      ) : (
        inicialesDeContacto(contacto)
      )}
    </span>
  );
}

// Contenido de la guía de estilo interna.

"use client";

import {
  ANIMACION,
  BRILLO_DE_BORDE,
  ESPACIADO,
  FONDO_ANIMADO,
  MICROINTERACCION,
  PROPORCION_PRESION,
  RADIO,
  TIPOGRAFIA,
} from "@gestoria/ui-tokens";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Isotipo, Logotipo } from "@/componentes/marca/logotipo";
import { Aviso } from "@/componentes/ui/aviso";
import { Boton } from "@/componentes/ui/boton";
import { Campo } from "@/componentes/ui/campo";
import { Casilla } from "@/componentes/ui/casilla";
import { Interruptor } from "@/componentes/ui/interruptor";
import { ItemAnimado, ListaAnimada } from "@/componentes/ui/lista-animada";
import { Tarjeta } from "@/componentes/ui/tarjeta";
import { ValorConPulso } from "@/componentes/ui/valor-con-pulso";

/** Los tokens semánticos, con la variable CSS que los define. */
const COLORES = [
  { nombre: "fondo", variable: "--color-fondo" },
  { nombre: "superficie", variable: "--color-superficie" },
  { nombre: "superficie-suave", variable: "--color-superficie-suave" },
  { nombre: "texto", variable: "--color-texto" },
  { nombre: "texto-secundario", variable: "--color-texto-secundario" },
  { nombre: "borde", variable: "--color-borde" },
  { nombre: "borde-fuerte", variable: "--color-borde-fuerte" },
  { nombre: "acento", variable: "--color-acento" },
  { nombre: "acento-suave", variable: "--color-acento-suave" },
  { nombre: "exito", variable: "--color-exito" },
  { nombre: "advertencia", variable: "--color-advertencia" },
  { nombre: "peligro", variable: "--color-peligro" },
];

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

export function GuiaDeEstilo() {
  const [conError, setConError] = useState(false);
  const [animando, setAnimando] = useState(0);
  const [casilla, setCasilla] = useState(false);
  const [tarea, setTarea] = useState(true);
  const [interruptor, setInterruptor] = useState(true);
  const [filas, setFilas] = useState([1, 2, 3]);
  const reducirMovimiento = useReducedMotion();

  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-12 p-4 py-10 sm:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Guía de estilo</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Tokens y componentes del sistema visual. Solo visible en desarrollo. Cambiá el tema desde
          la barra de arriba para revisar el contraste en los dos.
        </p>
      </header>

      <Seccion titulo="Logotipo">
        <p className="text-sm text-texto-secundario">
          El nombre es un juego de palabras entre "gestoría" e IA, y el logotipo lo hace visible:
          "IA" va con el color de acento. El símbolo es una ficha con dos renglones —lo que se
          gestiona— y un destello. Está dibujado con{" "}
          <code className="font-mono text-xs">currentColor</code>, así que hereda el color de donde
          se use.
        </p>
        <Tarjeta className="flex flex-col gap-6 p-6">
          <div>
            <p className="mb-3 text-xs font-medium text-texto-secundario">
              Logotipo — símbolo y nombre. La versión por defecto.
            </p>
            <div className="flex flex-wrap items-end gap-8">
              <Logotipo tamanoSimbolo={24} />
              <Logotipo tamanoSimbolo={32} className="text-xl" />
              <Logotipo tamanoSimbolo={44} className="text-3xl" />
            </div>
          </div>

          <div className="border-t border-borde pt-6">
            <p className="mb-3 text-xs font-medium text-texto-secundario">
              Isotipo — solo el símbolo, para donde el nombre no entra o sobra.
            </p>
            <div className="flex flex-wrap items-end gap-6">
              {[20, 24, 32, 48].map((tamano) => (
                <div key={tamano} className="flex flex-col items-center gap-2">
                  <Isotipo tamano={tamano} className="text-acento" />
                  <code className="font-mono text-[10px] text-texto-secundario">{tamano}px</code>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 border-t border-borde pt-6">
            {/* Sobre acento y en texto plano: tiene que funcionar en los dos. */}
            {/* Sobre el acento va en mono: el "IA" en acento sería invisible. */}
            <div className="rounded-tarjeta bg-acento p-4 text-acento-texto">
              <Logotipo mono />
            </div>
            <div className="rounded-tarjeta bg-superficie-suave p-4">
              <Logotipo soloTexto />
            </div>
          </div>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Colores">
        <p className="text-sm text-texto-secundario">
          Base neutra para casi todo y un único acento (azul petróleo) para la acción principal, lo
          seleccionado, los enlaces y el foco.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COLORES.map(({ nombre, variable }) => (
            <div key={nombre} className="flex items-center gap-3">
              <div
                className="size-10 shrink-0 rounded-control border border-borde"
                style={{ backgroundColor: `var(${variable})` }}
              />
              <code className="font-mono text-xs text-texto-secundario">{nombre}</code>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Tipografía">
        <p className="text-sm text-texto-secundario">
          Geist, con tres pesos como máximo. Números tabulares en montos, fechas y horas.
        </p>
        <Tarjeta className="flex flex-col gap-3 p-6">
          {Object.entries(TIPOGRAFIA.tamano).map(([nombre, tamano]) => (
            <div key={nombre} className="flex items-baseline gap-4">
              <code className="w-12 shrink-0 font-mono text-xs text-texto-secundario">
                {nombre}
              </code>
              <span style={{ fontSize: tamano }}>Gastos de septiembre</span>
            </div>
          ))}
          <div className="mt-2 flex items-baseline gap-4 border-t border-borde pt-3">
            <code className="w-12 shrink-0 font-mono text-xs text-texto-secundario">nums</code>
            <span className="numeros-tabulares">$ 1.200,50 · 16/09/2026 · 14:30</span>
          </div>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Botones">
        <p className="text-sm text-texto-secundario">
          Como máximo una acción principal (con acento) por pantalla.
        </p>
        <Tarjeta className="flex flex-wrap items-center gap-3 p-6">
          <Boton>Guardar gasto</Boton>
          <Boton variante="secundario">Cancelar</Boton>
          <Boton variante="sutil">Ver más</Boton>
          <Boton tamano="chico">Chico</Boton>
          <Boton disabled>Deshabilitado</Boton>
          <Boton cargando>Guardando</Boton>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Campos">
        <p className="text-sm text-texto-secundario">
          Cada campo lleva su etiqueta asociada. El error aparece junto al campo, con ícono además
          del color.
        </p>
        <Tarjeta className="flex flex-col gap-4 p-6">
          <Campo etiqueta="Usuario" defaultValue="iotero" ayuda="Con esto vas a entrar." />
          <Campo
            etiqueta="Correo"
            type="email"
            defaultValue="no-es-un-correo"
            error={conError ? "Revisá el correo: parece que le falta algo." : undefined}
          />
          <Boton variante="secundario" tamano="chico" onClick={() => setConError((v) => !v)}>
            {conError ? "Quitar el error" : "Mostrar un error"}
          </Boton>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Avisos">
        <div className="flex flex-col gap-3">
          <Aviso tono="info">Tu cuenta usa pesos uruguayos por defecto.</Aviso>
          <Aviso tono="exito" titulo="Recibimos tu solicitud">
            Te avisamos apenas esté aprobada.
          </Aviso>
          <Aviso tono="advertencia">Tu cuenta todavía está esperando aprobación.</Aviso>
          <Aviso tono="peligro">Usuario o contraseña incorrectos.</Aviso>
        </div>
      </Seccion>

      <Seccion titulo="Estados de carga y vacío">
        <div className="grid gap-4 sm:grid-cols-2">
          <Tarjeta className="flex flex-col gap-3 p-6">
            <p className="text-sm font-medium">Cargando</p>
            <div className="h-4 w-2/3 animate-pulse rounded bg-superficie-suave" />
            <div className="h-4 animate-pulse rounded bg-superficie-suave" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-superficie-suave" />
          </Tarjeta>
          <Tarjeta className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm font-medium">Todavía no hay gastos</p>
            <p className="text-sm text-texto-secundario">
              Cuando registres el primero, lo vas a ver acá.
            </p>
            <Boton tamano="chico">Registrar un gasto</Boton>
          </Tarjeta>
        </div>
      </Seccion>

      <Seccion titulo="Animación">
        <p className="text-sm text-texto-secundario">
          {ANIMACION.duracion.normal} con desaceleración suave, sin rebotes. Se animan solo{" "}
          <code className="font-mono text-xs">transform</code> y{" "}
          <code className="font-mono text-xs">opacity</code>.{" "}
          {reducirMovimiento
            ? "Tu sistema pide reducir movimiento: las animaciones son instantáneas."
            : "Respeta la preferencia de reducir movimiento del sistema."}
        </p>
        <Tarjeta className="flex items-center gap-6 p-6">
          <Boton variante="secundario" tamano="chico" onClick={() => setAnimando((n) => n + 1)}>
            Repetir
          </Boton>
          <motion.div
            key={animando}
            initial={reducirMovimiento ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reducirMovimiento ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-tarjeta bg-acento-suave px-4 py-2 text-sm text-acento-suave-texto"
          >
            Guardado
          </motion.div>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Microinteracciones">
        <p className="text-sm text-texto-secundario">
          El tacto de lo que se puede tocar, en una escala aparte de las duraciones de arriba:{" "}
          {MICROINTERACCION.duracion} con la misma curva, y el {PROPORCION_PRESION * 100} % de eso
          para el presionado, que tiene que sentirse instantáneo. Un botón se levanta{" "}
          {MICROINTERACCION.elevacionHover} al pasarle el mouse y escala a{" "}
          {MICROINTERACCION.escalaPresion} al presionarlo.
        </p>
        <Tarjeta className="flex flex-wrap items-center gap-3 p-6">
          <Boton>Mantené presionado</Boton>
          <Boton variante="secundario">Secundario</Boton>
          <Boton variante="sutil">Sutil</Boton>
          <Boton disabled>Deshabilitado</Boton>
        </Tarjeta>
        <p className="text-xs text-texto-secundario">
          <strong>La elevación al hover es exclusiva de los botones.</strong> Las tarjetas, las
          filas y todo lo demás no se desplazan ni escalan al pasar el mouse: si todo lo que está
          debajo del cursor se mueve, la pantalla se vuelve inestable y deja de distinguirse qué es
          lo accionable. El deshabilitado tampoco se mueve, porque un botón que reacciona pero no
          hace nada, miente.
        </p>
      </Seccion>

      <Seccion titulo="Casillas y tareas">
        <p className="text-sm text-texto-secundario">
          El tilde se dibuja animando el recorrido del trazo, la caja se hunde al presionarla y, en
          una tarea, el texto se tacha con una línea que crece de izquierda a derecha.
        </p>
        <Tarjeta className="flex flex-col gap-4 p-6">
          <Casilla etiqueta="Recibir un resumen semanal" marcada={casilla} onCambio={setCasilla} />
          <Casilla tachar etiqueta="Pagar el alquiler" marcada={tarea} onCambio={setTarea} />
          <Casilla etiqueta="Deshabilitada" marcada={false} onCambio={() => {}} disabled />
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Interruptores">
        <p className="text-sm text-texto-secundario">
          Para lo que se aplica al instante, sin botón de guardar. La perilla se desliza, el fondo
          pasa al acento y al presionar la perilla se estira hacia el lado contrario al que está
          apoyada.
        </p>
        <Tarjeta className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Avisarme de los vencimientos</span>
            <Interruptor
              etiqueta="Avisarme de los vencimientos"
              encendido={interruptor}
              onCambio={setInterruptor}
            />
          </div>
          <div className="flex items-center justify-between gap-4 opacity-100">
            <span className="text-sm text-texto-secundario">Deshabilitado</span>
            <Interruptor etiqueta="Deshabilitado" encendido={false} onCambio={() => {}} disabled />
          </div>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Listas y valores que cambian">
        <p className="text-sm text-texto-secundario">
          Los elementos entran en cascada, deslizándose unos píxeles, y salen más rápido de lo que
          entran: agregar algo puede acompañar, pero borrar tiene que sentirse resuelto. Los totales
          pulsan al cambiar, para que una actualización no pase inadvertida.
        </p>
        <Tarjeta className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-texto-secundario">Total</span>
            <ValorConPulso valor={`$ ${(filas.length * 1250).toLocaleString("es-UY")}`} />
          </div>

          <ListaAnimada className="gap-2">
            {filas.map((fila) => (
              <ItemAnimado
                key={fila}
                className="flex items-center justify-between gap-3 rounded-control border border-borde px-3 py-2 text-sm"
              >
                <span>Gasto {fila}</span>
                <Boton
                  variante="sutil"
                  tamano="chico"
                  onClick={() => setFilas((actuales) => actuales.filter((n) => n !== fila))}
                >
                  Quitar
                </Boton>
              </ItemAnimado>
            ))}
          </ListaAnimada>

          <Boton
            variante="secundario"
            tamano="chico"
            className="self-start"
            onClick={() => setFilas((actuales) => [...actuales, (actuales.at(-1) ?? 0) + 1])}
          >
            Agregar uno
          </Boton>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Brillo de bordes">
        <p className="text-sm text-texto-secundario">
          En las tarjetas y paneles que agrupan contenido, el borde se ilumina según la cercanía del
          mouse: el tramo más próximo brilla y el brillo se apaga a lo largo del contorno. Se
          enciende con el mouse hasta a {BRILLO_DE_BORDE.alcance} del contenedor, incluso desde
          afuera, y solo con mouse: en una pantalla táctil no existe.
        </p>
        <Tarjeta brillo className="flex flex-col gap-3 p-6">
          <p className="text-sm font-medium">Acercá el mouse al borde</p>
          <p className="text-xs text-texto-secundario">
            Son dos rectángulos SVG que siguen la línea del borde —uno fino y nítido, otro ancho y
            difuminado como halo—, con el trazo pintado por un gradiente radial centrado en el
            puntero.
          </p>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Fondo animado">
        <p className="text-sm text-texto-secundario">
          {FONDO_ANIMADO.formas} formas de color que se mueven, giran, cambian de tamaño y de color
          detrás de todo el contenido. El difuminado no sale de{" "}
          <code className="font-mono text-xs">filter: blur()</code>: el lienzo se pinta a 1/
          {FONDO_ANIMADO.difuminado} del tamaño de la ventana y el navegador lo agranda. Como máximo{" "}
          {FONDO_ANIMADO.cuadrosPorSegundo} cuadros por segundo, en pausa con la pestaña oculta y un
          solo cuadro fijo si el sistema pide reducir movimiento.
        </p>
        <Tarjeta className="flex flex-col gap-2 p-6 text-sm">
          <p>
            Intensidad en claro: <strong>{FONDO_ANIMADO.claro.intensidad}</strong> (tono{" "}
            {FONDO_ANIMADO.claro.tono} ±{FONDO_ANIMADO.claro.rango}) · en oscuro:{" "}
            <strong>{FONDO_ANIMADO.oscuro.intensidad}</strong> (tono {FONDO_ANIMADO.oscuro.tono} ±
            {FONDO_ANIMADO.oscuro.rango})
          </p>
          <p className="text-xs text-texto-secundario">
            Sobre un fondo casi negro, la misma intensidad que en claro no se percibe. Lo que se ve
            atrás de esta página es el fondo real: no hay ninguna muestra que pueda reemplazarlo.
          </p>
        </Tarjeta>
      </Seccion>

      <Seccion titulo="Elevación">
        <p className="text-sm text-texto-secundario">
          La profundidad dice qué está por encima de qué. Un elemento sube un nivel al pasarle el
          mouse y baja al presionarlo: pasá el mouse por la tarjeta del medio.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {(["sutil", "elevada", "flotante"] as const).map((nivel) => (
            <Tarjeta
              key={nivel}
              elevacion={nivel}
              interactiva={nivel === "elevada"}
              className="p-6"
            >
              <p className="text-sm font-medium">{nivel}</p>
              <p className="mt-1 text-xs text-texto-secundario">
                {nivel === "sutil"
                  ? "Apoyado sobre el fondo"
                  : nivel === "elevada"
                    ? "Levantado, reacciona al mouse"
                    : "Por encima del contenido"}
              </p>
            </Tarjeta>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Espaciado y formas">
        <Tarjeta className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-end gap-3">
            {Object.entries(ESPACIADO).map(([nombre, valor]) => (
              <div key={nombre} className="flex flex-col items-center gap-1">
                <div className="bg-acento" style={{ width: valor, height: valor }} />
                <code className="font-mono text-[10px] text-texto-secundario">{nombre}</code>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 border-t border-borde pt-4">
            {Object.entries(RADIO).map(([nombre, valor]) => (
              <div key={nombre} className="flex flex-col items-center gap-1">
                <div
                  className="size-12 border border-borde-fuerte bg-superficie-suave"
                  style={{ borderRadius: valor }}
                />
                <code className="font-mono text-[10px] text-texto-secundario">{nombre}</code>
              </div>
            ))}
          </div>
        </Tarjeta>
      </Seccion>
    </main>
  );
}

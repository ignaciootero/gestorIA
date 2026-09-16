// Tipos compartidos por la app de Hono: lo que viaja en el contexto de cada peticion.

import type { RequestIdVariables } from "hono/request-id";
import type { Logger } from "./logger.ts";

export type VariablesApi = RequestIdVariables & {
  /** Logger con el idPeticion ya incorporado: todo lo que loguee una peticion queda enlazado. */
  log: Logger;
  /** Marca de inicio (performance.now) para calcular la duración de la peticion. */
  inicioMs: number;
};

export type EntornoHono = {
  Variables: VariablesApi;
};

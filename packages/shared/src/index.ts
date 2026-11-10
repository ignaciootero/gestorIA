// Punto de entrada del paquete compartido: esquemas Zod, tipos y constantes que
// usan la API, la web y el movil.

export type { AccionAuditoria } from "./admin/auditoria.ts";
export { ACCIONES_AUDITORIA } from "./admin/auditoria.ts";
export type { CamposAdicionalesUsuario } from "./auth/campos-usuario.ts";
export { CAMPOS_ADICIONALES_USUARIO } from "./auth/campos-usuario.ts";
export { type ColoresDeAcento, esquemaColoresDeAcento } from "./auth/colores-de-acento.ts";
export {
  type AjustesDelFondoGuardados,
  esquemaAjustesDelFondo,
  esquemaFondos,
  type Fondos,
  leerAjustesDelFondo,
} from "./auth/fondo.ts";
export type { DatosCambioPassword, DatosLogin, DatosRegistro } from "./auth/esquemas.ts";
export {
  esquemaApellido,
  esquemaCambioPassword,
  esquemaEmail,
  esquemaLogin,
  esquemaNombre,
  esquemaPassword,
  esquemaReenvioVerificacion,
  esquemaRegistro,
  esquemaRegistroServidor,
  esquemaUsuario,
  LARGO_MAXIMO_CAMPO,
  LARGO_MAXIMO_EMAIL,
  LARGO_MAXIMO_PASSWORD,
  LARGO_MAXIMO_USUARIO,
  LARGO_MINIMO_PASSWORD,
  LARGO_MINIMO_USUARIO,
  pareceEmail,
} from "./auth/esquemas.ts";
export type { EstadoCuenta, Rol } from "./auth/estados.ts";
export {
  ESTADOS_CUENTA,
  ESTADOS_CUENTA_VALIDOS,
  MONEDA_POR_DEFECTO,
  ROLES,
  ROLES_VALIDOS,
  ZONA_HORARIA_POR_DEFECTO,
} from "./auth/estados.ts";
export type { FuenteDeAzar } from "./azar.ts";
export { elegirAlAzar, mezclar } from "./azar.ts";
export type { MesDeCalendario } from "./calendario/calendario.ts";
export {
  DIAS_POR_SEMANA,
  describirDiaCompleto,
  esElMismoMes,
  mesDe,
  mesesEntre,
  mismoDiaEnOtroMes,
  nombreDelMesConAnio,
  nombreDeMesDelCalendario,
  numeroDeSemana,
  primerDiaDelMes,
  SEMANAS_POR_MES,
  semanasDelMes,
  sumarMeses,
} from "./calendario/calendario.ts";
export type {
  DatosDeEventoDeCalendario,
  EstadoDeDeudaEnElCalendario,
  EstadoDeEvento,
  EstadoDeEventoPropio,
  EstadoDeRecordatorio,
  EstadoParaFiltrar,
  EventoDeCalendario,
  FiltroDeEventos,
  MarcadorDeEstado,
  OrigenConRepeticion,
  OrigenDeEvento,
  RangoDeEventos,
  RepeticionDeEvento,
} from "./calendario/eventos.ts";
export {
  ANIO_MAXIMO_DEL_CALENDARIO,
  ANIO_MINIMO_DEL_CALENDARIO,
  cantidadDeRestriccionesPorRepeticion,
  compararEventos,
  DIAS_MAXIMOS_POR_CONSULTA_DE_EVENTOS,
  ESTADOS_DE_DEUDA,
  ESTADOS_DE_EVENTO,
  ESTADOS_DE_EVENTO_PROPIO,
  ESTADOS_DE_RECORDATORIO,
  ESTADOS_OCULTOS_POR_DEFECTO,
  esEventoPasado,
  esquemaEventoDeCalendario,
  esquemaRangoDeEventos,
  estadoDeEvento,
  estadoParaFiltrar,
  estadosDeOrigen,
  estadosPorDefecto,
  filtroSinRestricciones,
  hayRestricciones,
  LARGO_MAXIMO_NOTAS_DE_EVENTO,
  LARGO_MAXIMO_TITULO_DE_EVENTO,
  MAXIMO_DE_EVENTOS_DE_CALENDARIO,
  marcadorDeEventos,
  NOMBRES_DE_ORIGEN,
  NOMBRES_DE_REPETICION_EN_PLURAL,
  ORIGENES_CON_REPETICION,
  ORIGENES_DE_EVENTO,
  ocurrenciasEnRango,
  pasaElFiltro,
  REPETICIONES_DE_EVENTO,
  repeticionesDeEvento,
} from "./calendario/eventos.ts";
export {
  colorDeTextoSobre,
  mezclarColores,
  TEXTO_CLARO,
  TEXTO_OSCURO,
} from "./contactos/colores.ts";
export type {
  Repeticion,
  SugerenciaDeRecordatorio,
  TipoDeContacto,
  TipoDeTelefono,
} from "./contactos/constantes.ts";
export {
  DIAS_MAXIMOS_DE_CADA_MES,
  ETIQUETAS_POR_DEFECTO,
  MAXIMO_DE_CORREOS,
  MAXIMO_DE_ETIQUETAS,
  MAXIMO_DE_ETIQUETAS_POR_CONTACTO,
  MAXIMO_DE_RECORDATORIOS_POR_CONTACTO,
  MAXIMO_DE_TELEFONOS,
  NOMBRES_DE_DIA_DE_LA_SEMANA,
  NOMBRES_DE_DIA_EN_PLURAL,
  NOMBRES_DE_MES,
  NOMBRES_DE_REPETICION,
  REPETICIONES,
  REPETICIONES_VALIDAS,
  SUGERENCIAS_DE_RECORDATORIO,
  TIPOS_DE_CONTACTO,
  TIPOS_DE_CONTACTO_VALIDOS,
  TIPOS_DE_TELEFONO,
  TIPOS_DE_TELEFONO_VALIDOS,
  TITULO_DEL_CUMPLEANOS,
} from "./contactos/constantes.ts";
export type {
  DatosDeContacto,
  DatosDeEmpresa,
  DatosDeEtiquetaDeContacto,
  DatosDePersona,
  DatosDeRecordatorio,
  DatosDeTelefono,
} from "./contactos/esquemas.ts";
export {
  aEnlaceWeb,
  enlaceDeMapa,
  esquemaContacto,
  esquemaDiaDeCalendario,
  esquemaEmpresa,
  esquemaEtiquetaDeContacto,
  esquemaFavorito,
  esquemaPersona,
  esquemaRecordatorio,
  esquemaTelefono,
  LARGO_MAXIMO_DIRECCION,
  LARGO_MAXIMO_NOMBRE_DE_CONTACTO,
  LARGO_MAXIMO_NOMBRE_DE_ETIQUETA,
  LARGO_MAXIMO_NOTAS,
  LARGO_MAXIMO_TITULO_DE_RECORDATORIO,
} from "./contactos/esquemas.ts";
export type { CuandoCae } from "./contactos/fechas.ts";
export {
  caeEnElDia,
  describirDiasRestantes,
  describirProgramacion,
  diaDeHoy,
  diaIsoDeLaSemana,
  diasEntre,
  edadQueCumple,
  esDiaReal,
  formatearDiaDeCalendario,
  formatearDiaYMes,
  instanteDelDia,
  proximaOcurrencia,
  recortarHora,
  sumarDias,
} from "./contactos/fechas.ts";
export { inicialesDeContacto, nombreCompletoDeContacto } from "./contactos/nombre.ts";
export type { CampoInvalido, CodigoError, RespuestaError } from "./errores/codigos.ts";
export { CODIGOS_ERROR, esRespuestaError } from "./errores/codigos.ts";
export type { CotizacionDicha } from "./finanzas/cambio.ts";
export {
  convertirCentavos,
  convertirCentavosInverso,
  DECIMALES_DE_TASA,
  decirCotizacion,
  derivarTasa,
  esTasaValida,
  redondearTasa,
  TASA_MAXIMA,
  TASA_MINIMA,
  tasaDesdeCotizacionDicha,
  tasaEntreMonedas,
} from "./finanzas/cambio.ts";
export { colorMasDistinto, distanciaDeColor } from "./finanzas/colores.ts";
export type { TipoMovimiento } from "./finanzas/constantes.ts";
export {
  CATEGORIA_DE_TRANSFERENCIA,
  CATEGORIAS_POR_DEFECTO,
  CUENTAS_FINANCIERAS_POR_DEFECTO,
  SISTEMA_TRANSFERENCIA,
  TIPOS_MOVIMIENTO,
  TIPOS_MOVIMIENTO_VALIDOS,
} from "./finanzas/constantes.ts";
export type {
  DatosDeDeuda,
  DatosDePagoDeDeuda,
  DatosEditarDeuda,
  SentidoDeDeuda,
} from "./finanzas/deudas.ts";
export {
  avisoDeFechaLimite,
  avisosDeConQuien,
  esquemaDeuda,
  esquemaEditarDeuda,
  esquemaPagoDeDeuda,
  LARGO_MAXIMO_CONCEPTO_DE_DEUDA,
  LARGO_MAXIMO_NOMBRE_LIBRE_DE_DEUDA,
  NOMBRES_DE_SENTIDO,
  SENTIDOS_DE_DEUDA,
  SENTIDOS_DE_DEUDA_VALIDOS,
} from "./finanzas/deudas.ts";
export type {
  DatosAbrirPeriodo,
  DatosAjusteDeSaldo,
  DatosCambio,
  DatosCategoria,
  DatosCerrarPeriodo,
  DatosConsultaDeCotizacion,
  DatosCuentaFinanciera,
  DatosMovimiento,
  DatosPresupuesto,
  DatosReemplazarCategoria,
  DatosRenombrarCuentaFinanciera,
  DatosRenombrarPeriodo,
} from "./finanzas/esquemas.ts";
export {
  esquemaAbrirPeriodo,
  esquemaAjusteDeSaldo,
  esquemaCambio,
  esquemaCamposDeMovimiento,
  esquemaCerrarPeriodo,
  esquemaColorCategoria,
  esquemaConsultaDeCotizacion,
  esquemaCrearCategoria,
  esquemaCrearCuentaFinanciera,
  esquemaDescripcion,
  esquemaFechaHora,
  esquemaIdCategoria,
  esquemaImporte,
  esquemaMoneda,
  esquemaMovimiento,
  esquemaNombreCategoria,
  esquemaNombreCuentaFinanciera,
  esquemaNombrePeriodo,
  esquemaPresupuesto,
  esquemaReemplazarCategoria,
  esquemaRenombrarCuentaFinanciera,
  esquemaRenombrarPeriodo,
  esquemaSaldoInicial,
  esquemaTasaDeCambio,
  IMPORTE_MAXIMO,
  LARGO_MAXIMO_DESCRIPCION,
  LARGO_MAXIMO_NOMBRE,
  validarDestinoDeTransferencia,
} from "./finanzas/esquemas.ts";
export type { CodigoDeMoneda } from "./finanzas/monedas.ts";
export {
  CODIGOS_DE_MONEDA,
  esMonedaAdmitida,
  MONEDAS_ADMITIDAS,
  nombreDeMoneda,
} from "./finanzas/monedas.ts";
export { nombreDelMes, nombreDelMesYAnio, sugerirNombreDePeriodo } from "./finanzas/periodos.ts";
export { formatearFecha, formatearFechaHora } from "./formato/fecha.ts";
export {
  darFormatoAImporteEscrito,
  interpretarImporteEscrito,
  normalizarImportePegado,
  separadoresDeImporte,
  textoDeImporte,
} from "./formato/importe-escrito.ts";
export { centavosDesdeImporte, formatearMonto, importeDesdeCentavos } from "./formato/moneda.ts";
export { formatearPorcentaje } from "./formato/porcentaje.ts";
export { formatearTasa } from "./formato/tasa.ts";
export {
  DESCRIPCION_APP,
  NOMBRE_APP,
  NOMBRE_APP_PARTES,
  tituloDePantalla,
} from "./marca.ts";
export type { RepeticionDeTarea } from "./tareas/constantes.ts";
export {
  CATEGORIAS_DE_TAREA_POR_DEFECTO,
  DIAS_DE_ATRASO_PARA_FALLAR,
  DIAS_DE_HISTORIAL_DE_TAREAS,
  DIAS_DE_TAREAS_A_ARMAR,
  DIAS_POR_DEFECTO_DEL_HISTORIAL,
  LARGO_MAXIMO_NOMBRE_DE_CATEGORIA_DE_TAREA,
  LARGO_MAXIMO_NOTAS_DE_TAREA,
  LARGO_MAXIMO_TITULO_DE_TAREA,
  MAXIMO_DE_CATEGORIAS_DE_TAREA,
  MAXIMO_DE_DIAS_ENTRE_REPETICIONES,
  MAXIMO_DE_TAREAS_EN_EL_HISTORIAL,
  MAXIMO_DE_TAREAS_PENDIENTES,
  MAXIMO_DE_TAREAS_REPETITIVAS,
  MINIMO_DE_DIAS_ENTRE_REPETICIONES,
  NOMBRES_DE_REPETICION_DE_TAREA,
  REPETICIONES_DE_TAREA,
} from "./tareas/constantes.ts";
export type { CuandoCaeUnaTarea } from "./tareas/cuando-cae.ts";
export {
  caeEnElDiaDeTarea,
  describirRepeticionDeTarea,
  ordenarDiasDeLaSemana,
  proximaOcurrenciaDeTarea,
} from "./tareas/cuando-cae.ts";
export type {
  DatosDeCategoriaDeTarea,
  DatosDeTarea,
  DatosDeTareaRepetitiva,
  EstadoDeTarea,
  FiltrosDeHistorial,
} from "./tareas/esquemas.ts";
export {
  ESTADOS_DE_TAREA,
  esquemaCategoriaDeTarea,
  esquemaCompletarTarea,
  esquemaFallarTarea,
  esquemaFiltrosDeHistorial,
  esquemaTarea,
  esquemaTareaRepetitiva,
  NOMBRES_DE_ESTADO_DE_TAREA,
} from "./tareas/esquemas.ts";

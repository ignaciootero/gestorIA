-- Los importes pasan de integer (32 bits, tope de unos 21 millones) a bigint: el tope
-- de un importe subió a 9.999.999.999 (IMPORTE_MAXIMO en packages/shared). Es un
-- ensanchamiento: ningún valor existente se altera ni se pierde.
ALTER TABLE "ajustes_de_saldo" ALTER COLUMN "saldo_indicado_centavos" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "ajustes_de_saldo" ALTER COLUMN "diferencia_centavos" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "cuentas_financieras" ALTER COLUMN "saldo_inicial_centavos" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "movimientos" ALTER COLUMN "importe_centavos" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "presupuestos" ALTER COLUMN "monto_centavos" SET DATA TYPE bigint;
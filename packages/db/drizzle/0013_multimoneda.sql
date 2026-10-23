-- Multimoneda: cada cuenta financiera tiene su moneda y cada movimiento guarda el
-- tipo de cambio con que se convirtió a la moneda base de la persona (o, en una
-- transferencia, a la moneda de la cuenta de destino) y el importe ya convertido.
--
-- Hasta ahora todo estaba en la moneda única de cada usuario
-- (`usuarios.moneda_por_defecto`), así que los datos existentes se migran sin
-- pérdida: cada cuenta toma esa moneda y cada movimiento queda con tipo de cambio 1
-- e importe convertido igual al importe. Por eso las columnas nuevas se agregan
-- primero sin NOT NULL, se completan y recién entonces se vuelven obligatorias.

CREATE TABLE "cotizaciones" (
	"fecha" date NOT NULL,
	"moneda" text NOT NULL,
	"unidades_por_dolar" numeric(24, 10) NOT NULL,
	"fecha_de_la_fuente" date NOT NULL,
	"obtenida_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cotizaciones_fecha_moneda_pk" PRIMARY KEY("fecha","moneda"),
	CONSTRAINT "cotizaciones_valor_positivo" CHECK ("cotizaciones"."unidades_por_dolar" > 0)
);
--> statement-breakpoint
ALTER TABLE "cuentas_financieras" ADD COLUMN "moneda" text;--> statement-breakpoint
UPDATE "cuentas_financieras" SET "moneda" = upper("usuarios"."moneda_por_defecto") FROM "usuarios" WHERE "usuarios"."id" = "cuentas_financieras"."user_id";--> statement-breakpoint
ALTER TABLE "cuentas_financieras" ALTER COLUMN "moneda" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "tipo_de_cambio" numeric(20, 8);--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "importe_convertido_centavos" bigint;--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "cambio_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "movimientos" SET "tipo_de_cambio" = 1, "importe_convertido_centavos" = "importe_centavos";--> statement-breakpoint
ALTER TABLE "movimientos" ALTER COLUMN "tipo_de_cambio" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ALTER COLUMN "importe_convertido_centavos" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cuentas_financieras" ADD CONSTRAINT "cuentas_financieras_moneda_valida" CHECK ("cuentas_financieras"."moneda" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_convertido_positivo" CHECK ("movimientos"."importe_convertido_centavos" > 0);--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_tipo_de_cambio_positivo" CHECK ("movimientos"."tipo_de_cambio" > 0);

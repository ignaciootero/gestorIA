CREATE TABLE "ajustes_de_saldo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"cuenta_financiera_id" uuid NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"saldo_indicado_centavos" integer NOT NULL,
	"diferencia_centavos" integer NOT NULL,
	CONSTRAINT "ajustes_de_saldo_con_diferencia" CHECK ("ajustes_de_saldo"."diferencia_centavos" <> 0)
);
--> statement-breakpoint
ALTER TABLE "cuentas_financieras" ADD COLUMN "oculta_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ajustes_de_saldo" ADD CONSTRAINT "ajustes_de_saldo_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes_de_saldo" ADD CONSTRAINT "ajustes_de_saldo_cuenta_financiera_id_cuentas_financieras_id_fk" FOREIGN KEY ("cuenta_financiera_id") REFERENCES "public"."cuentas_financieras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajustes_de_saldo_cuenta_idx" ON "ajustes_de_saldo" USING btree ("user_id","cuenta_financiera_id","fecha");
CREATE TABLE "deudas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"contacto_id" uuid NOT NULL,
	"sentido" text NOT NULL,
	"concepto" text NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"moneda" text NOT NULL,
	"fecha" date NOT NULL,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deudas_sentido_valido" CHECK ("deudas"."sentido" in ('me_deben', 'debo')),
	CONSTRAINT "deudas_monto_positivo" CHECK ("deudas"."monto_centavos" > 0),
	CONSTRAINT "deudas_moneda_valida" CHECK ("deudas"."moneda" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "pagos_de_deudas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"deuda_id" uuid NOT NULL,
	"monto_centavos" bigint NOT NULL,
	"fecha" date NOT NULL,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pagos_de_deudas_monto_positivo" CHECK ("pagos_de_deudas"."monto_centavos" > 0)
);
--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "contacto_id" uuid;--> statement-breakpoint
ALTER TABLE "deudas" ADD CONSTRAINT "deudas_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deudas" ADD CONSTRAINT "deudas_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_de_deudas" ADD CONSTRAINT "pagos_de_deudas_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_de_deudas" ADD CONSTRAINT "pagos_de_deudas_deuda_id_deudas_id_fk" FOREIGN KEY ("deuda_id") REFERENCES "public"."deudas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deudas_usuario_idx" ON "deudas" USING btree ("user_id","eliminado_en");--> statement-breakpoint
CREATE INDEX "deudas_contacto_idx" ON "deudas" USING btree ("contacto_id");--> statement-breakpoint
CREATE INDEX "pagos_de_deudas_deuda_idx" ON "pagos_de_deudas" USING btree ("deuda_id");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_usuario_contacto_idx" ON "movimientos" USING btree ("user_id","contacto_id") WHERE "movimientos"."contacto_id" is not null;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_contacto_no_en_transferencias" CHECK ("movimientos"."contacto_id" is null or "movimientos"."tipo" <> 'neutro');
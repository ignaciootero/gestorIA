CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"nombre" text NOT NULL,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuentas_financieras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"nombre" text NOT NULL,
	"saldo_inicial_centavos" integer DEFAULT 0 NOT NULL,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tipo" text NOT NULL,
	"importe_centavos" integer NOT NULL,
	"descripcion" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"cuenta_financiera_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimientos_tipo_valido" CHECK ("movimientos"."tipo" in ('ingreso', 'gasto')),
	CONSTRAINT "movimientos_importe_positivo" CHECK ("movimientos"."importe_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "presupuestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"monto_centavos" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presupuestos_monto_no_negativo" CHECK ("presupuestos"."monto_centavos" >= 0)
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_financieras" ADD CONSTRAINT "cuentas_financieras_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cuenta_financiera_id_cuentas_financieras_id_fk" FOREIGN KEY ("cuenta_financiera_id") REFERENCES "public"."cuentas_financieras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorias_usuario_idx" ON "categorias" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cuentas_financieras_usuario_idx" ON "cuentas_financieras" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "movimientos_usuario_fecha_idx" ON "movimientos" USING btree ("user_id","fecha");--> statement-breakpoint
CREATE INDEX "movimientos_usuario_categoria_idx" ON "movimientos" USING btree ("user_id","categoria_id");--> statement-breakpoint
CREATE INDEX "movimientos_usuario_cuenta_idx" ON "movimientos" USING btree ("user_id","cuenta_financiera_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presupuestos_usuario_categoria_unico" ON "presupuestos" USING btree ("user_id","categoria_id");
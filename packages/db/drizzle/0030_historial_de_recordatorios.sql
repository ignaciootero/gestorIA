CREATE TABLE "historial_de_recordatorios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"contacto_id" uuid NOT NULL,
	"recordatorio_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"repeticion" text NOT NULL,
	"dia" date NOT NULL,
	"hora" time,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historial_de_recordatorios_repeticion_valida" CHECK ("historial_de_recordatorios"."repeticion" in ('unica', 'diaria', 'semanal', 'mensual', 'anual'))
);
--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD COLUMN "historial_hasta" date DEFAULT (current_date - 1) NOT NULL;--> statement-breakpoint
ALTER TABLE "historial_de_recordatorios" ADD CONSTRAINT "historial_de_recordatorios_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_de_recordatorios" ADD CONSTRAINT "historial_de_recordatorios_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "historial_de_recordatorios_unico_idx" ON "historial_de_recordatorios" USING btree ("recordatorio_id","dia");--> statement-breakpoint
CREATE INDEX "historial_de_recordatorios_usuario_idx" ON "historial_de_recordatorios" USING btree ("user_id","dia");--> statement-breakpoint
CREATE INDEX "historial_de_recordatorios_contacto_idx" ON "historial_de_recordatorios" USING btree ("contacto_id");
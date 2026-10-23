CREATE TABLE "eventos_de_calendario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"titulo" text NOT NULL,
	"notas" text,
	"dia" date NOT NULL,
	"hora" time,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventos_de_calendario" ADD CONSTRAINT "eventos_de_calendario_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_de_calendario_usuario_dia_idx" ON "eventos_de_calendario" USING btree ("user_id","dia");--> statement-breakpoint
CREATE INDEX "eventos_de_calendario_eliminados_idx" ON "eventos_de_calendario" USING btree ("eliminado_en");
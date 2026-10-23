CREATE TABLE "tareas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"repetitiva_id" uuid,
	"titulo" text NOT NULL,
	"notas" text,
	"dia" date NOT NULL,
	"hora" time,
	"completada_en" timestamp with time zone,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tareas_repetitivas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"titulo" text NOT NULL,
	"notas" text,
	"repeticion" text NOT NULL,
	"dia_semana" smallint,
	"dia_del_mes" smallint,
	"mes" smallint,
	"hora" time,
	"desde" date NOT NULL,
	"generada_hasta" date,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tareas_repetitivas_repeticion_valida" CHECK ("tareas_repetitivas"."repeticion" in ('diaria', 'semanal', 'mensual', 'anual')),
	CONSTRAINT "tareas_repetitivas_campos_segun_repeticion" CHECK (("tareas_repetitivas"."repeticion" = 'diaria' and "tareas_repetitivas"."dia_semana" is null and "tareas_repetitivas"."dia_del_mes" is null and "tareas_repetitivas"."mes" is null)
        or ("tareas_repetitivas"."repeticion" = 'semanal' and "tareas_repetitivas"."dia_semana" is not null and "tareas_repetitivas"."dia_del_mes" is null and "tareas_repetitivas"."mes" is null)
        or ("tareas_repetitivas"."repeticion" = 'mensual' and "tareas_repetitivas"."dia_del_mes" is not null and "tareas_repetitivas"."dia_semana" is null and "tareas_repetitivas"."mes" is null)
        or ("tareas_repetitivas"."repeticion" = 'anual' and "tareas_repetitivas"."dia_del_mes" is not null and "tareas_repetitivas"."mes" is not null and "tareas_repetitivas"."dia_semana" is null)),
	CONSTRAINT "tareas_repetitivas_rangos" CHECK (("tareas_repetitivas"."dia_semana" is null or "tareas_repetitivas"."dia_semana" between 1 and 7)
        and ("tareas_repetitivas"."dia_del_mes" is null or "tareas_repetitivas"."dia_del_mes" between 1 and 31)
        and ("tareas_repetitivas"."mes" is null or "tareas_repetitivas"."mes" between 1 and 12))
);
--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_repetitiva_id_tareas_repetitivas_id_fk" FOREIGN KEY ("repetitiva_id") REFERENCES "public"."tareas_repetitivas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD CONSTRAINT "tareas_repetitivas_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tareas_usuario_dia_idx" ON "tareas" USING btree ("user_id","dia");--> statement-breakpoint
CREATE INDEX "tareas_pendientes_idx" ON "tareas" USING btree ("user_id","dia") WHERE "tareas"."completada_en" is null and "tareas"."eliminado_en" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tareas_una_por_repetitiva_y_dia" ON "tareas" USING btree ("repetitiva_id","dia") WHERE "tareas"."repetitiva_id" is not null;--> statement-breakpoint
CREATE INDEX "tareas_repetitivas_usuario_idx" ON "tareas_repetitivas" USING btree ("user_id","eliminado_en");
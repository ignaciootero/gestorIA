CREATE TABLE "filtros_del_calendario" (
	"user_id" text PRIMARY KEY NOT NULL,
	"origenes_ocultos" jsonb NOT NULL,
	"repeticiones_ocultas" jsonb NOT NULL,
	"estados_ocultos" jsonb NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "filtros_del_calendario" ADD CONSTRAINT "filtros_del_calendario_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;

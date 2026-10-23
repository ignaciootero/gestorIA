CREATE TABLE "categorias_de_tareas" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categorias_de_tareas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"nombre" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_de_tareas_color_valido" CHECK ("categorias_de_tareas"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "categorias_de_tareas_iniciales_creadas" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tareas" ADD COLUMN "categoria_id" integer;--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD COLUMN "categoria_id" integer;--> statement-breakpoint
ALTER TABLE "categorias_de_tareas" ADD CONSTRAINT "categorias_de_tareas_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_de_tareas_usuario_nombre_unico" ON "categorias_de_tareas" USING btree ("user_id",lower("nombre"));--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_categoria_id_categorias_de_tareas_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_de_tareas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD CONSTRAINT "tareas_repetitivas_categoria_id_categorias_de_tareas_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_de_tareas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tareas_categoria_idx" ON "tareas" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "tareas_repetitivas_categoria_idx" ON "tareas_repetitivas" USING btree ("categoria_id");
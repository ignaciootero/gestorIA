CREATE TABLE "contactos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tipo" text NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text,
	"fecha_nacimiento" date,
	"rubro" text,
	"sitio_web" text,
	"horario" text,
	"documento" text,
	"persona_de_contacto" text,
	"direccion" text,
	"notas" text,
	"favorito" boolean DEFAULT false NOT NULL,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contactos_tipo_valido" CHECK ("contactos"."tipo" in ('persona', 'empresa')),
	CONSTRAINT "contactos_campos_de_persona" CHECK ("contactos"."tipo" = 'persona' or ("contactos"."apellido" is null and "contactos"."fecha_nacimiento" is null)),
	CONSTRAINT "contactos_campos_de_empresa" CHECK ("contactos"."tipo" = 'empresa' or ("contactos"."rubro" is null and "contactos"."sitio_web" is null and "contactos"."horario" is null and "contactos"."documento" is null and "contactos"."persona_de_contacto" is null))
);
--> statement-breakpoint
CREATE TABLE "correos_de_contactos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contacto_id" uuid NOT NULL,
	"direccion" text NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etiquetas_de_contactos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "etiquetas_de_contactos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"nombre" text NOT NULL,
	"color" text DEFAULT '#64748b' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "etiquetas_de_contactos_color_valido" CHECK ("etiquetas_de_contactos"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "etiquetas_por_contacto" (
	"contacto_id" uuid NOT NULL,
	"etiqueta_id" integer NOT NULL,
	CONSTRAINT "etiquetas_por_contacto_contacto_id_etiqueta_id_pk" PRIMARY KEY("contacto_id","etiqueta_id")
);
--> statement-breakpoint
CREATE TABLE "recordatorios_de_contactos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"contacto_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"fecha" date NOT NULL,
	"repeticion" text NOT NULL,
	"eliminado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordatorios_de_contactos_repeticion_valida" CHECK ("recordatorios_de_contactos"."repeticion" in ('unica', 'diaria', 'semanal', 'mensual', 'anual'))
);
--> statement-breakpoint
CREATE TABLE "telefonos_de_contactos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contacto_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"tipo" text NOT NULL,
	"orden" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "telefonos_de_contactos_tipo_valido" CHECK ("telefonos_de_contactos"."tipo" in ('celular', 'fijo'))
);
--> statement-breakpoint
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correos_de_contactos" ADD CONSTRAINT "correos_de_contactos_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiquetas_de_contactos" ADD CONSTRAINT "etiquetas_de_contactos_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiquetas_por_contacto" ADD CONSTRAINT "etiquetas_por_contacto_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etiquetas_por_contacto" ADD CONSTRAINT "etiquetas_por_contacto_etiqueta_id_etiquetas_de_contactos_id_fk" FOREIGN KEY ("etiqueta_id") REFERENCES "public"."etiquetas_de_contactos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD CONSTRAINT "recordatorios_de_contactos_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD CONSTRAINT "recordatorios_de_contactos_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telefonos_de_contactos" ADD CONSTRAINT "telefonos_de_contactos_contacto_id_contactos_id_fk" FOREIGN KEY ("contacto_id") REFERENCES "public"."contactos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contactos_usuario_idx" ON "contactos" USING btree ("user_id","eliminado_en");--> statement-breakpoint
CREATE INDEX "contactos_eliminados_idx" ON "contactos" USING btree ("eliminado_en") WHERE "contactos"."eliminado_en" is not null;--> statement-breakpoint
CREATE INDEX "correos_de_contactos_contacto_idx" ON "correos_de_contactos" USING btree ("contacto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "etiquetas_de_contactos_usuario_nombre_unico" ON "etiquetas_de_contactos" USING btree ("user_id",lower("nombre"));--> statement-breakpoint
CREATE INDEX "etiquetas_por_contacto_etiqueta_idx" ON "etiquetas_por_contacto" USING btree ("etiqueta_id");--> statement-breakpoint
CREATE INDEX "recordatorios_de_contactos_usuario_idx" ON "recordatorios_de_contactos" USING btree ("user_id","eliminado_en");--> statement-breakpoint
CREATE INDEX "recordatorios_de_contactos_contacto_idx" ON "recordatorios_de_contactos" USING btree ("contacto_id");--> statement-breakpoint
CREATE INDEX "recordatorios_de_contactos_unicos_idx" ON "recordatorios_de_contactos" USING btree ("fecha") WHERE "recordatorios_de_contactos"."repeticion" = 'unica' and "recordatorios_de_contactos"."eliminado_en" is null;--> statement-breakpoint
CREATE INDEX "telefonos_de_contactos_contacto_idx" ON "telefonos_de_contactos" USING btree ("contacto_id");
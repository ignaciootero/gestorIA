CREATE TABLE "cuentas" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "limites_peticiones" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text,
	"count" integer,
	"last_request" bigint
);
--> statement-breakpoint
CREATE TABLE "sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text,
	"display_username" text,
	"role" text DEFAULT 'usuario' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"mensaje_registro" text,
	"zona_horaria" text DEFAULT 'America/Montevideo' NOT NULL,
	"moneda_por_defecto" text DEFAULT 'UYU' NOT NULL,
	"debe_cambiar_password" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificaciones" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cuentas_usuario_idx" ON "cuentas" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cuentas_proveedor_unico" ON "cuentas" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "limites_peticiones_key_idx" ON "limites_peticiones" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "sesiones_token_unico" ON "sesiones" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sesiones_usuario_idx" ON "sesiones" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_unico" ON "usuarios" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_username_unico" ON "usuarios" USING btree ("username");--> statement-breakpoint
CREATE INDEX "usuarios_estado_idx" ON "usuarios" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "verificaciones_identificador_idx" ON "verificaciones" USING btree ("identifier");
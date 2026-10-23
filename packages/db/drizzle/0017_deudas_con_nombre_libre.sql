ALTER TABLE "deudas" ALTER COLUMN "contacto_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deudas" ADD COLUMN "nombre_libre" text;--> statement-breakpoint
ALTER TABLE "deudas" ADD CONSTRAINT "deudas_con_quien" CHECK (num_nonnulls("deudas"."contacto_id", "deudas"."nombre_libre") = 1);
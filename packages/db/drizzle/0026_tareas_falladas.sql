DROP INDEX "tareas_pendientes_idx";--> statement-breakpoint
ALTER TABLE "tareas" ADD COLUMN "fallada_en" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tareas_pendientes_idx" ON "tareas" USING btree ("user_id","dia") WHERE "tareas"."completada_en" is null and "tareas"."fallada_en" is null and "tareas"."eliminado_en" is null;--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_completada_o_fallada" CHECK (not ("tareas"."completada_en" is not null and "tareas"."fallada_en" is not null));
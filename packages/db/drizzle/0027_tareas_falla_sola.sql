ALTER TABLE "tareas" ADD COLUMN "falla_sola" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD COLUMN "falla_sola" boolean DEFAULT false NOT NULL;
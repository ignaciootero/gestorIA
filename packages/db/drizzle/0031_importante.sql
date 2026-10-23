ALTER TABLE "historial_de_recordatorios" ADD COLUMN "importante" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD COLUMN "importante" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tareas" ADD COLUMN "importante" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD COLUMN "importante" boolean DEFAULT false NOT NULL;
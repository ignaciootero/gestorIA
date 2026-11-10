ALTER TABLE "tareas_repetitivas" ADD COLUMN "meta_centesimos" integer;--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD COLUMN "unidad" text;--> statement-breakpoint
ALTER TABLE "tareas" ADD COLUMN "meta_centesimos" integer;--> statement-breakpoint
ALTER TABLE "tareas" ADD COLUMN "unidad" text;--> statement-breakpoint
ALTER TABLE "tareas" ADD COLUMN "progreso_centesimos" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD CONSTRAINT "tareas_repetitivas_meta_valida" CHECK (("tareas_repetitivas"."meta_centesimos" is null and "tareas_repetitivas"."unidad" is null) or "tareas_repetitivas"."meta_centesimos" between 1 and 100000000);--> statement-breakpoint
ALTER TABLE "tareas" ADD CONSTRAINT "tareas_meta_valida" CHECK (("tareas"."meta_centesimos" is null and "tareas"."unidad" is null and "tareas"."progreso_centesimos" = 0)
        or ("tareas"."meta_centesimos" between 1 and 100000000 and "tareas"."progreso_centesimos" between 0 and 100000000));

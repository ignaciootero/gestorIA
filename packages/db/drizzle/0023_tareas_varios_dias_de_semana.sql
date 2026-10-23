ALTER TABLE "tareas_repetitivas" ADD COLUMN "dias_semana" smallint[];--> statement-breakpoint
-- Las repetitivas semanales que ya existen pasan a tener su único día en la lista nueva.
UPDATE "tareas_repetitivas" SET "dias_semana" = ARRAY["dia_semana"] WHERE "dia_semana" IS NOT NULL;
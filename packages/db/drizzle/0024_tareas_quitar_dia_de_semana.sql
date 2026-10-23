ALTER TABLE "tareas_repetitivas" DROP CONSTRAINT "tareas_repetitivas_campos_segun_repeticion";--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" DROP CONSTRAINT "tareas_repetitivas_rangos";--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" DROP COLUMN "dia_semana";--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD CONSTRAINT "tareas_repetitivas_campos_segun_repeticion" CHECK (("tareas_repetitivas"."repeticion" = 'diaria' and "tareas_repetitivas"."dias_semana" is null and "tareas_repetitivas"."dia_del_mes" is null and "tareas_repetitivas"."mes" is null)
        or ("tareas_repetitivas"."repeticion" = 'semanal' and cardinality("tareas_repetitivas"."dias_semana") between 1 and 7 and "tareas_repetitivas"."dia_del_mes" is null and "tareas_repetitivas"."mes" is null)
        or ("tareas_repetitivas"."repeticion" = 'mensual' and "tareas_repetitivas"."dia_del_mes" is not null and "tareas_repetitivas"."dias_semana" is null and "tareas_repetitivas"."mes" is null)
        or ("tareas_repetitivas"."repeticion" = 'anual' and "tareas_repetitivas"."dia_del_mes" is not null and "tareas_repetitivas"."mes" is not null and "tareas_repetitivas"."dias_semana" is null));--> statement-breakpoint
ALTER TABLE "tareas_repetitivas" ADD CONSTRAINT "tareas_repetitivas_rangos" CHECK (("tareas_repetitivas"."dias_semana" is null or "tareas_repetitivas"."dias_semana" <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
        and ("tareas_repetitivas"."dia_del_mes" is null or "tareas_repetitivas"."dia_del_mes" between 1 and 31)
        and ("tareas_repetitivas"."mes" is null or "tareas_repetitivas"."mes" between 1 and 12));
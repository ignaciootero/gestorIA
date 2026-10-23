ALTER TABLE "recordatorios_de_contactos" ALTER COLUMN "fecha" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD COLUMN "hora" time;--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD COLUMN "dia_semana" smallint;--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD COLUMN "dia_del_mes" smallint;--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD COLUMN "mes" smallint;--> statement-breakpoint
-- Los recordatorios que ya existían guardaban "el primer día": se pasan al campo propio de
-- cada repetición (los de una sola vez conservan su fecha). Los diarios no tenían hora y ahora
-- la necesitan: pasan a las 09:00. Hay que hacerlo antes de agregar los `check`, que exigen
-- exactamente los campos de cada repetición.
UPDATE "recordatorios_de_contactos" SET "dia_semana" = extract(isodow from "fecha")::smallint, "fecha" = NULL WHERE "repeticion" = 'semanal';--> statement-breakpoint
UPDATE "recordatorios_de_contactos" SET "dia_del_mes" = extract(day from "fecha")::smallint, "fecha" = NULL WHERE "repeticion" = 'mensual';--> statement-breakpoint
UPDATE "recordatorios_de_contactos" SET "dia_del_mes" = extract(day from "fecha")::smallint, "mes" = extract(month from "fecha")::smallint, "fecha" = NULL WHERE "repeticion" = 'anual';--> statement-breakpoint
UPDATE "recordatorios_de_contactos" SET "hora" = '09:00', "fecha" = NULL WHERE "repeticion" = 'diaria';--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD CONSTRAINT "recordatorios_de_contactos_campos_segun_repeticion" CHECK (("recordatorios_de_contactos"."repeticion" = 'unica' and "recordatorios_de_contactos"."fecha" is not null and "recordatorios_de_contactos"."dia_semana" is null and "recordatorios_de_contactos"."dia_del_mes" is null and "recordatorios_de_contactos"."mes" is null)
        or ("recordatorios_de_contactos"."repeticion" = 'diaria' and "recordatorios_de_contactos"."hora" is not null and "recordatorios_de_contactos"."fecha" is null and "recordatorios_de_contactos"."dia_semana" is null and "recordatorios_de_contactos"."dia_del_mes" is null and "recordatorios_de_contactos"."mes" is null)
        or ("recordatorios_de_contactos"."repeticion" = 'semanal' and "recordatorios_de_contactos"."dia_semana" is not null and "recordatorios_de_contactos"."fecha" is null and "recordatorios_de_contactos"."dia_del_mes" is null and "recordatorios_de_contactos"."mes" is null)
        or ("recordatorios_de_contactos"."repeticion" = 'mensual' and "recordatorios_de_contactos"."dia_del_mes" is not null and "recordatorios_de_contactos"."fecha" is null and "recordatorios_de_contactos"."dia_semana" is null and "recordatorios_de_contactos"."mes" is null)
        or ("recordatorios_de_contactos"."repeticion" = 'anual' and "recordatorios_de_contactos"."dia_del_mes" is not null and "recordatorios_de_contactos"."mes" is not null and "recordatorios_de_contactos"."fecha" is null and "recordatorios_de_contactos"."dia_semana" is null));--> statement-breakpoint
ALTER TABLE "recordatorios_de_contactos" ADD CONSTRAINT "recordatorios_de_contactos_rangos" CHECK (("recordatorios_de_contactos"."dia_semana" is null or "recordatorios_de_contactos"."dia_semana" between 1 and 7)
        and ("recordatorios_de_contactos"."dia_del_mes" is null or "recordatorios_de_contactos"."dia_del_mes" between 1 and 31)
        and ("recordatorios_de_contactos"."mes" is null or "recordatorios_de_contactos"."mes" between 1 and 12));
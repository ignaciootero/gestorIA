-- Períodos del módulo de ingresos y gastos.
--
-- Los movimientos pasan de tener un día (`date`) a tener fecha y hora, y cada
-- uno pertenece a un período. Como ya puede haber movimientos cargados, la
-- migración les arma períodos: uno por cada mes calendario (en la zona horaria
-- del usuario) con movimientos, y el del mes actual queda abierto. Un
-- movimiento con fecha posterior al mes actual se asigna al período abierto
-- (que no tiene cierre), para no dejar un período cerrado superpuesto a él.
-- Nada de esto se puede resolver con las sentencias que genera drizzle-kit
-- solas: por eso este archivo está retocado a mano.

CREATE TABLE "periodos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "periodos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"nombre" text NOT NULL,
	"apertura_en" timestamp with time zone NOT NULL,
	"cierre_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodos_cierre_posterior_a_apertura" CHECK ("periodos"."cierre_en" is null or "periodos"."cierre_en" > "periodos"."apertura_en")
);
--> statement-breakpoint
ALTER TABLE "periodos" ADD CONSTRAINT "periodos_user_id_usuarios_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "periodos_usuario_apertura_idx" ON "periodos" USING btree ("user_id","apertura_en");--> statement-breakpoint
CREATE UNIQUE INDEX "periodos_usuario_nombre_unico" ON "periodos" USING btree ("user_id",lower("nombre"));--> statement-breakpoint
CREATE UNIQUE INDEX "periodos_un_abierto_por_usuario" ON "periodos" USING btree ("user_id") WHERE "periodos"."cierre_en" is null;--> statement-breakpoint

-- `fecha`: de día a instante. Un movimiento viejo no tiene hora, así que se
-- toma el mediodía local del usuario (lejos de cualquier borde de día o de mes).
ALTER TABLE "movimientos" ADD COLUMN "fecha_hora" timestamp with time zone;--> statement-breakpoint
UPDATE "movimientos" AS m
SET "fecha_hora" = (m."fecha"::timestamp + interval '12 hours') AT TIME ZONE u."zona_horaria"
FROM "usuarios" AS u
WHERE u."id" = m."user_id";--> statement-breakpoint
ALTER TABLE "movimientos" DROP COLUMN "fecha";--> statement-breakpoint
ALTER TABLE "movimientos" RENAME COLUMN "fecha_hora" TO "fecha";--> statement-breakpoint
ALTER TABLE "movimientos" ALTER COLUMN "fecha" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "movimientos_usuario_fecha_idx" ON "movimientos" USING btree ("user_id","fecha");--> statement-breakpoint

-- Un período por usuario y mes con movimientos (incluidos los eliminados
-- lógicamente: también apuntan a un período). El mes actual queda abierto.
INSERT INTO "periodos" ("user_id", "nombre", "apertura_en", "cierre_en")
SELECT
	mes."user_id",
	(ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Setiembre','Octubre','Noviembre','Diciembre'])[extract(month FROM mes."inicio_local")::int]
		|| ' ' || extract(year FROM mes."inicio_local")::int,
	mes."inicio_local" AT TIME ZONE mes."zona",
	CASE
		WHEN mes."inicio_local" = date_trunc('month', now() AT TIME ZONE mes."zona") THEN NULL
		ELSE (mes."inicio_local" + interval '1 month') AT TIME ZONE mes."zona"
	END
FROM (
	SELECT DISTINCT
		m."user_id",
		u."zona_horaria" AS "zona",
		least(
			date_trunc('month', m."fecha" AT TIME ZONE u."zona_horaria"),
			date_trunc('month', now() AT TIME ZONE u."zona_horaria")
		) AS "inicio_local"
	FROM "movimientos" AS m
	JOIN "usuarios" AS u ON u."id" = m."user_id"
) AS mes;--> statement-breakpoint

ALTER TABLE "movimientos" ADD COLUMN "periodo_id" integer;--> statement-breakpoint
UPDATE "movimientos" AS m
SET "periodo_id" = p."id"
FROM "periodos" AS p
WHERE p."user_id" = m."user_id"
	AND m."fecha" >= p."apertura_en"
	AND (p."cierre_en" IS NULL OR m."fecha" < p."cierre_en");--> statement-breakpoint
ALTER TABLE "movimientos" ALTER COLUMN "periodo_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_periodo_id_periodos_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."periodos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_usuario_periodo_idx" ON "movimientos" USING btree ("user_id","periodo_id");

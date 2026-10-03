-- Categorías con id numérico, categoría especial del sistema y transferencias.
--
-- Qué cambia:
--   1. `categorias.id` pasa de uuid a un entero autogenerado. Los movimientos y
--      los presupuestos que la referencian se reescriben con el número nuevo, sin
--      perder ninguna relación.
--   2. El nombre de una categoría activa es único por usuario (sin distinguir
--      mayúsculas): antes solo lo comprobaba el servicio.
--   3. `categorias.sistema`: marca las categorías especiales (hoy, "transferencia").
--   4. `movimientos`: nuevo tipo "neutro" (transferencia entre cuentas) y
--      `cuenta_destino_id`, que solo tienen las transferencias.
--
-- Cambiar el tipo de una clave primaria con referencias no se puede resolver con
-- un ALTER TYPE (los valores no se convierten de uuid a número), así que se crea
-- la columna numérica al lado, se reescriben las referencias y se reemplaza la
-- vieja. Por eso este archivo está retocado a mano.

-- 0) Nombres repetidos entre categorías activas (el servicio ya lo impedía; esto
--    es solo por si hubiera alguno viejo): se desempata con un número, para que el
--    índice único de más abajo se pueda crear.
UPDATE "categorias" AS c
SET "nombre" = c."nombre" || ' (' || r."n" || ')'
FROM (
	SELECT "id", row_number() OVER (PARTITION BY "user_id", lower("nombre") ORDER BY "creado_en", "id") AS "n"
	FROM "categorias"
	WHERE "eliminado_en" IS NULL
) AS r
WHERE c."id" = r."id" AND r."n" > 1;--> statement-breakpoint

-- 1) Id numérico: la columna nueva se llena sola para las filas existentes.
ALTER TABLE "categorias" ADD COLUMN "id_numerico" integer GENERATED ALWAYS AS IDENTITY (sequence name "categorias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);--> statement-breakpoint

ALTER TABLE "movimientos" ADD COLUMN "categoria_id_numerico" integer;--> statement-breakpoint
UPDATE "movimientos" AS m
SET "categoria_id_numerico" = c."id_numerico"
FROM "categorias" AS c
WHERE c."id" = m."categoria_id";--> statement-breakpoint

ALTER TABLE "presupuestos" ADD COLUMN "categoria_id_numerico" integer;--> statement-breakpoint
UPDATE "presupuestos" AS p
SET "categoria_id_numerico" = c."id_numerico"
FROM "categorias" AS c
WHERE c."id" = p."categoria_id";--> statement-breakpoint

ALTER TABLE "movimientos" DROP CONSTRAINT "movimientos_categoria_id_categorias_id_fk";--> statement-breakpoint
ALTER TABLE "presupuestos" DROP CONSTRAINT "presupuestos_categoria_id_categorias_id_fk";--> statement-breakpoint
-- Al borrar las columnas viejas se borran también sus índices (se recrean abajo).
ALTER TABLE "movimientos" DROP COLUMN "categoria_id";--> statement-breakpoint
ALTER TABLE "presupuestos" DROP COLUMN "categoria_id";--> statement-breakpoint
ALTER TABLE "movimientos" RENAME COLUMN "categoria_id_numerico" TO "categoria_id";--> statement-breakpoint
ALTER TABLE "presupuestos" RENAME COLUMN "categoria_id_numerico" TO "categoria_id";--> statement-breakpoint
ALTER TABLE "movimientos" ALTER COLUMN "categoria_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "presupuestos" ALTER COLUMN "categoria_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "categorias" DROP CONSTRAINT "categorias_pkey";--> statement-breakpoint
ALTER TABLE "categorias" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "categorias" RENAME COLUMN "id_numerico" TO "id";--> statement-breakpoint
ALTER TABLE "categorias" ADD PRIMARY KEY ("id");--> statement-breakpoint

ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presupuestos" ADD CONSTRAINT "presupuestos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_usuario_categoria_idx" ON "movimientos" USING btree ("user_id","categoria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presupuestos_usuario_categoria_unico" ON "presupuestos" USING btree ("user_id","categoria_id");--> statement-breakpoint

-- 2) y 3) Nombre único por usuario entre las activas; categorías especiales.
ALTER TABLE "categorias" ADD COLUMN "sistema" text;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_usuario_nombre_unico" ON "categorias" USING btree ("user_id",lower("nombre")) WHERE "categorias"."eliminado_en" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_usuario_sistema_unico" ON "categorias" USING btree ("user_id","sistema") WHERE "categorias"."sistema" is not null;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_sistema_valido" CHECK ("categorias"."sistema" is null or "categorias"."sistema" in ('transferencia'));--> statement-breakpoint

-- 4) Transferencias entre cuentas.
ALTER TABLE "movimientos" DROP CONSTRAINT "movimientos_tipo_valido";--> statement-breakpoint
ALTER TABLE "movimientos" ADD COLUMN "cuenta_destino_id" uuid;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cuenta_destino_id_cuentas_financieras_id_fk" FOREIGN KEY ("cuenta_destino_id") REFERENCES "public"."cuentas_financieras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_destino_idx" ON "movimientos" USING btree ("user_id","cuenta_destino_id");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_tipo_valido" CHECK ("movimientos"."tipo" in ('ingreso', 'gasto', 'neutro'));--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_destino_solo_en_transferencias" CHECK (("movimientos"."tipo" = 'neutro') = ("movimientos"."cuenta_destino_id" is not null));--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_destino_distinto_del_origen" CHECK ("movimientos"."cuenta_destino_id" is null or "movimientos"."cuenta_destino_id" <> "movimientos"."cuenta_financiera_id");

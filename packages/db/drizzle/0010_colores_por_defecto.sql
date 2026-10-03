-- Colores nuevos para las categorías por defecto, en las cuentas que ya existen.
--
-- El set por defecto pasó a tener colores elegidos para ser lo más distintos
-- posible entre sí (y del amarillo de las transferencias; ver CATEGORIAS_POR_DEFECTO
-- en packages/shared). Las cuentas nuevas ya arrancan con ellos; acá se
-- actualizan las que ya existían, pero solo las categorías por defecto que nadie
-- tocó: mismo nombre Y todavía el color con el que se sembraron. Una categoría
-- que la persona renombró o recoloreó se deja como está.
UPDATE "categorias" AS c
SET "color" = n."color_nuevo"
FROM (VALUES
	('Alimentación',    '#f97316', '#cf5417'),
	('Transporte',      '#3b82f6', '#1717cf'),
	('Vivienda',        '#8b5cf6', '#d6a085'),
	('Servicios',       '#06b6d4', '#17b0cf'),
	('Salud',           '#ec4899', '#cf1754'),
	('Entretenimiento', '#eab308', '#cf17cf'),
	('Compras',         '#d946ef', '#bb85d6'),
	('Educación',       '#6366f1', '#333399'),
	('Ingresos',        '#22c55e', '#17cf54'),
	('Otros',           '#64748b', '#889933')
) AS n("nombre", "color_viejo", "color_nuevo")
WHERE c."nombre" = n."nombre"
	AND lower(c."color") = n."color_viejo"
	AND c."sistema" IS NULL;

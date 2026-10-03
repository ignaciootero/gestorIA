-- Categorías por defecto que nunca tuvieron un color propio.
--
-- Antes de que las categorías tuvieran color, todas quedaron con el gris por
-- defecto de la columna (#64748b). Mismo criterio que la migración anterior: si
-- la categoría sigue llamándose como una por defecto y sigue con ese gris, nadie
-- la tocó, y se le da el color del set nuevo para que se distinga de las demás.
UPDATE "categorias" AS c
SET "color" = n."color_nuevo"
FROM (VALUES
	('Alimentación',    '#cf5417'),
	('Transporte',      '#1717cf'),
	('Vivienda',        '#d6a085'),
	('Servicios',       '#17b0cf'),
	('Salud',           '#cf1754'),
	('Entretenimiento', '#cf17cf'),
	('Compras',         '#bb85d6'),
	('Educación',       '#333399'),
	('Ingresos',        '#17cf54')
) AS n("nombre", "color_nuevo")
WHERE c."nombre" = n."nombre"
	AND lower(c."color") = '#64748b'
	AND c."sistema" IS NULL;

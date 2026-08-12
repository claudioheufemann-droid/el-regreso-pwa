-- Carga de costos y precios reales, zona 'sur' (Valdivia / HORECA tradicional),
-- desde la planilla oficial de Claudio ("costos y precios.xlsx", hoja
-- "Costos y Precios", cargada 2026-08-12). Esta planilla queda como fuente
-- de verdad de costo/precio neto para todo el catálogo — reemplaza cualquier
-- valor cargado a mano antes (ej. Aguas Blancas tenía costo/precio
-- provisorios que no coincidían con la planilla).
--
-- Mapeo estilo (planilla) → producto (app): Kolsch→Arboretum, Red Ale→Mocho
-- English, Porter→Fisura, APA→La Barra APA, West Coast IPA→Descenso West
-- Coast IPA, Hazy IPA→Aguas Blancas (confirmado: los 6 coinciden exacto con
-- el precio bruto ya cargado en catalogo-productos.ts). El resto de las
-- cervezas y las 9 kombuchas usan el nombre de estilo/sabor directamente,
-- igual que ya estaban sembradas en costos_precios.
--
-- No se cargan zonas 'santiago' ni 'supermercados' — la planilla no trae
-- esos precios todavía.
--
-- Productos sin "Costos Lata" en la planilla (Ámbar Lager, Barley Wine,
-- Helles Colab): se carga solo precio_neto, costo_neto queda en 0 hasta
-- que se entregue el dato.
-- Productos sin barril en la planilla ("-" o vacío: Ámbar Lager, Barley
-- Wine, Cucumbeer Sour, Del Caribe Sour, Helles Colab): no se toca la fila
-- de barril, queda en 0/0 como estaba.
--
-- codigo: se completa desde stock_productos donde no existía. Cucumbeer
-- Sour queda sin código — en stock_productos su código (C-26) está
-- duplicado con Doble IPA (bug de carga de bodega, a corregir aparte); se
-- prefirió no heredar un código en conflicto.

with datos (producto, formato, costo_neto, precio_neto, codigo) as (
  values
    -- Cervezas
    ('Arboretum', 'lata', 972::numeric, 1690.611729::numeric, 'C-1'),
    ('Arboretum', 'barril', 36111, 63820, 'C-1'),
    ('Mocho English', 'lata', 1060, 1690.611729, 'C-8'),
    ('Mocho English', 'barril', 42066, 63820, 'C-8'),
    ('Fisura', 'lata', 1107, 1798.13861, 'C-9'),
    ('Fisura', 'barril', 45468, 68838, 'C-9'),
    ('La Barra APA', 'lata', 1095, 1798.13861, 'C-2'),
    ('La Barra APA', 'barril', 44924, 68838, 'C-2'),
    ('Descenso West Coast IPA', 'lata', 1258, 2156.561549, 'C-4'),
    ('Descenso West Coast IPA', 'barril', 54530, 83175, 'C-4'),
    ('Aguas Blancas', 'lata', 1350, 2335.773019, 'C-5'),
    ('Aguas Blancas', 'barril', 66690, 93928, 'C-5'),
    ('Ámbar Lager', 'lata', 0, 1798.13861, 'C-30'),
    ('Barley Wine', 'lata', 0, 2120.719255, 'C-13'),
    ('Carrot Cake Stout', 'lata', 1255, 2120.719255, 'ROT-2'),
    ('Carrot Cake Stout', 'barril', 55341, 86759, 'ROT-2'),
    ('Cucumbeer Sour', 'lata', 852, 1977.35008, null),
    ('Del Caribe Sour', 'lata', 852, 1977.35008, 'C-27'),
    ('Doble Hazy IPA', 'lata', 1507, 2479.142195, 'C-24'),
    ('Doble Hazy IPA', 'barril', 69725, 108265, 'C-24'),
    ('Doble IPA', 'lata', 1506, 2407.457607, 'C-26'),
    ('Doble IPA', 'barril', 72131, 101096, 'C-26'),
    ('Helles Colab', 'lata', 0, 1798.13861, 'C-16'),
    ('Imperial Stout', 'lata', 1282, 2049.034668, 'C-6'),
    ('Imperial Stout', 'barril', 56928, 92984, 'C-6'),
    ('Red IPA', 'lata', 1428, 2156.561549, 'C-11'),
    ('Red IPA', 'barril', 62614, 85148, 'C-11'),
    -- Kombuchas (sin ILA — aplica_ila ya es false para estas filas)
    ('Kombucha Maracuyá Cardamomo', 'lata', 769, 1344.537815, 'K-10'),
    ('Kombucha Maracuyá Cardamomo', 'barril', 38687, 58086, 'K-10'),
    ('Kombucha Lemon (Fresh)', 'lata', 708, 1344.537815, 'K-2'),
    ('Kombucha Lemon (Fresh)', 'barril', 34791, 58086, 'K-2'),
    ('Kombucha Berry Menta', 'lata', 750, 1344.537815, 'K-4'),
    ('Kombucha Berry Menta', 'barril', 38508, 58086, 'K-4'),
    ('Kombucha Maqui (Hop)', 'lata', 758, 1344.537815, 'K-6'),
    ('Kombucha Maqui (Hop)', 'barril', 39276, 58086, 'K-6'),
    ('Kombucha Detox', 'lata', 689, 1344.537815, 'K-22'),
    ('Kombucha Detox', 'barril', 34492, 58086, 'K-22'),
    ('Kombucha Mango', 'lata', 719, 1344.537815, 'K-11'),
    ('Kombucha Mango', 'barril', 36072, 58086, 'K-11'),
    ('Kombucha Experimental Piña Albahaca', 'lata', 719, 1344.537815, 'K-21'),
    ('Kombucha Experimental Piña Albahaca', 'barril', 36072, 58086, 'K-21'),
    ('Kombucha Lupulada', 'lata', 719, 1344.537815, 'K-30'),
    ('Kombucha Lupulada', 'barril', 36072, 58086, 'K-30'),
    ('Kombucha Natural', 'lata', 679, 1344.537815, 'K-1'),
    ('Kombucha Natural', 'barril', 32131, 58086, 'K-1')
)
update public.costos_precios cp
set costo_neto = d.costo_neto,
    precio_neto = d.precio_neto,
    codigo = coalesce(d.codigo, cp.codigo),
    updated_at = now()
from datos d
where cp.producto = d.producto and cp.formato = d.formato and cp.zona = 'sur';

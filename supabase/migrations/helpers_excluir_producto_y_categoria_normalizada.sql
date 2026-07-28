-- Pedido de Claudio: "Tour con Degustación" y similares no son ventas de
-- producto (litros=0, es un servicio/experiencia) y no deberian contar en
-- litros vendidos ni en ningun total de ventas del sistema. Mismo patron
-- que _excluir_cliente (array de substrings en minuscula), para poder
-- ampliar la lista despues sin tocar cada funcion que la usa.
CREATE OR REPLACE FUNCTION public._excluir_producto(producto text)
 RETURNS boolean
 LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT producto IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'tour',
      'degustaci'
    ]) AS patron
    WHERE position(patron IN lower(producto)) > 0
  )
$function$;

-- Fuente unica de verdad para clasificar un producto en Cerveza/Kombucha/
-- Otros. Antes cada funcion (ventas_dashboard_kpis, ventas_detalle_productos,
-- etc.) repetia su propio CASE sobre categoria_producto, y el ERP deja
-- categoria_producto = 'S/C' en notas de credito/ajustes de productos que
-- SI tienen categoria en sus filas de venta normales (por eso litros=0 en
-- esas filas: no afectan el total, solo el revenue). El problema real eran
-- productos que el ERP NUNCA tagea, aunque tengan litros reales: "Doble IPA"
-- y "Del Caribe Sour" son cerveza (confirmado por Claudio 2026-07-28) pero
-- categoria_producto siempre viene 'S/C'. "Sidra" y "Cold Brew" tambien
-- vienen sin categoria pero NO son cerveza ni kombucha (confirmado), asi
-- que quedan en 'Otros' por el fallback normal, sin necesitar excepcion.
CREATE OR REPLACE FUNCTION public._categoria_normalizada(producto text, categoria_producto text)
 RETURNS text
 LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN lower(coalesce(categoria_producto,'')) LIKE '%cerveza%' THEN 'Cerveza'
    WHEN lower(coalesce(categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
    WHEN producto ILIKE 'Doble IPA' OR producto ILIKE 'Del Caribe Sour' THEN 'Cerveza'
    ELSE 'Otros'
  END
$function$;

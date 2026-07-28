-- Pedido de Claudio, 27-jul:
-- 1) "Empaque y Distribución ..." son cargos de logística del ERP, no
--    productos reales vendidos (litros=0, montos positivos o negativos que
--    no representan una venta). Nunca deben aparecer en los listados de
--    detalle de productos. Se excluyen por prefijo -hay ~11 variantes
--    (KOMBUCHA ZONA CENTRAL, Barril 19L LOCAL, Lata CERVEZA LOCAL, etc.)
--    que comparten el mismo prefijo "Empaque y Distribución".
-- 2) Se agrega "unidades" (latas/barriles) a ambas funciones, mismo cálculo
--    que ya usa ventas_envases_periodo para la tarjeta "Latas y barriles".
--
-- Postgres no permite CREATE OR REPLACE cuando cambia el tipo de retorno
-- (columna nueva): hay que hacer DROP FUNCTION primero.
DROP FUNCTION IF EXISTS public.ventas_detalle_productos(date, date, text[], boolean);
DROP FUNCTION IF EXISTS public.ventas_detalle_cliente_productos(text, date, date, text[], boolean);

CREATE FUNCTION public.ventas_detalle_productos(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, pedidos bigint, clientes bigint, unidades numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(NULLIF(TRIM(v.producto), ''), 'Sin producto'),
    COALESCE(NULLIF(TRIM(v.envase), ''), '—'),
    CASE
      WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%cerveza%'  THEN 'Cerveza'
      WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
      ELSE 'Otros'
    END,
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    COUNT(DISTINCT v.nombre_fantasia),
    ROUND(SUM(
      CASE
        WHEN v.envase ILIKE '%barril%' THEN v.litros / 30.0
        WHEN v.envase ILIKE '%354%'    THEN v.litros / 0.354
        WHEN v.envase ILIKE '%473%'    THEN v.litros / 0.473
        ELSE 0
      END
    ))
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND v.producto NOT ILIKE 'Empaque y Distribución%'
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

CREATE FUNCTION public.ventas_detalle_cliente_productos(
  p_cliente text, p_ini date, p_fin date,
  p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, pedidos bigint, unidades numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(NULLIF(TRIM(v.producto), ''), 'Sin producto'),
    COALESCE(NULLIF(TRIM(v.envase), ''), '—'),
    CASE
      WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%cerveza%'  THEN 'Cerveza'
      WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
      ELSE 'Otros'
    END,
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    ROUND(SUM(
      CASE
        WHEN v.envase ILIKE '%barril%' THEN v.litros / 30.0
        WHEN v.envase ILIKE '%354%'    THEN v.litros / 0.354
        WHEN v.envase ILIKE '%473%'    THEN v.litros / 0.473
        ELSE 0
      END
    ))
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND NOT _excluir_cliente(v.nombre_fantasia)
    AND v.producto NOT ILIKE 'Empaque y Distribución%'
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

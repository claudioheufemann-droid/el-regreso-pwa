CREATE OR REPLACE FUNCTION public.ventas_dashboard_kpis(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(
   litros numeric, revenue numeric, clientes bigint, pedidos bigint,
   litros_cerveza numeric, litros_kombucha numeric, litros_otros numeric,
   revenue_cerveza numeric, revenue_kombucha numeric, revenue_otros numeric
 )
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.litros, v.total_sin_impuesto,
      _categoria_normalizada(v.producto, v.categoria_producto) AS categoria
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
  ),
  totales AS (SELECT COUNT(DISTINCT v.nombre_fantasia) AS clientes, COUNT(DISTINCT v.pedido) AS pedidos
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto))
  SELECT
    COALESCE(SUM(b.litros), 0),
    COALESCE(SUM(b.total_sin_impuesto), 0),
    t.clientes,
    t.pedidos,
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Cerveza'), 0),
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Kombucha'), 0),
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Otros'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Cerveza'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Kombucha'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Otros'), 0)
  FROM base b CROSS JOIN totales t
  GROUP BY t.clientes, t.pedidos;
$function$;

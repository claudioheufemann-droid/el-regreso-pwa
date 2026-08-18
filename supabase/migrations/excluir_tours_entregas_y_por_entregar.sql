CREATE OR REPLACE FUNCTION public.ventas_clientes_por_entregar(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    MAX(v.vendedor_actual),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(v.fecha_pedido)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_entregado_origen_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(litros_total numeric, revenue_total numeric, pedidos_total bigint, litros_backlog numeric, revenue_backlog numeric, pedidos_backlog bigint, litros_mismo_periodo numeric, revenue_mismo_periodo numeric, pedidos_mismo_periodo bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(SUM(v.litros), 0),
    COALESCE(SUM(v.total_sin_impuesto), 0),
    COUNT(DISTINCT v.pedido),
    COALESCE(SUM(v.litros) FILTER (WHERE v.fecha_pedido < p_ini), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.fecha_pedido < p_ini), 0),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.fecha_pedido < p_ini),
    COALESCE(SUM(v.litros) FILTER (WHERE v.fecha_pedido >= p_ini), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.fecha_pedido >= p_ini), 0),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.fecha_pedido >= p_ini)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto);
$function$;

CREATE OR REPLACE FUNCTION public.ventas_entregas_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(litros_entregados numeric, litros_por_entregar numeric, litros_sin_dato numeric, revenue_entregado numeric, revenue_por_entregar numeric, pedidos_entregados bigint, pedidos_por_entregar bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(SUM(v.litros) FILTER (WHERE v.entrega_informada AND v.entregado), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE v.entrega_informada AND NOT v.entregado), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE NOT v.entrega_informada), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.entrega_informada AND v.entregado), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.entrega_informada AND NOT v.entregado), 0),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.entrega_informada AND v.entregado),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.entrega_informada AND NOT v.entregado)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto);
$function$;

CREATE OR REPLACE FUNCTION public.ventas_entregas_por_vendedor(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(vendedor text, litros_por_entregar numeric, pedidos_por_entregar bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual,
         COALESCE(SUM(v.litros) FILTER (WHERE v.entrega_informada AND NOT v.entregado), 0),
         COUNT(DISTINCT v.pedido) FILTER (WHERE v.entrega_informada AND NOT v.entregado)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$function$;

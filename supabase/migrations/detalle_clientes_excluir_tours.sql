CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = v.nombre_fantasia
        AND v2.entrega_informada AND v2.fecha_entrega >= p_ini AND v2.fecha_entrega <= p_fin
      GROUP BY v2.vendedor_actual ORDER BY SUM(v2.litros) DESC LIMIT 1),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(v.fecha_entrega)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.nombre_fantasia
  ORDER BY 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = v.nombre_fantasia
        AND (CASE WHEN p_por_entrega THEN v2.entrega_informada AND v2.fecha_entrega >= p_ini AND v2.fecha_entrega <= p_fin
                  ELSE v2.fecha_pedido >= p_ini AND v2.fecha_pedido <= p_fin END)
      GROUP BY v2.vendedor_actual ORDER BY SUM(v2.litros) DESC LIMIT 1),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

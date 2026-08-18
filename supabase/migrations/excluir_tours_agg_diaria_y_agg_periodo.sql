CREATE OR REPLACE FUNCTION public.ventas_agg_diaria(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text)
 RETURNS TABLE(fecha date, vendedor text, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.fecha_pedido, v.vendedor_actual, SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.fecha_pedido, v.vendedor_actual ORDER BY v.fecha_pedido;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_agg_diaria(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(fecha date, vendedor text, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.fecha_pedido, v.vendedor_actual, SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.fecha_pedido, v.vendedor_actual ORDER BY v.fecha_pedido;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_agg_periodo(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text)
 RETURNS TABLE(vendedor text, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual, SUM(v.litros), SUM(v.total_sin_impuesto),
         COUNT(DISTINCT v.nombre_fantasia), COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_agg_periodo(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(vendedor text, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual, SUM(v.litros), SUM(v.total_sin_impuesto),
         COUNT(DISTINCT v.nombre_fantasia), COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_agg_periodo(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(vendedor text, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual, SUM(v.litros), SUM(v.total_sin_impuesto),
         COUNT(DISTINCT v.nombre_fantasia), COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$function$;

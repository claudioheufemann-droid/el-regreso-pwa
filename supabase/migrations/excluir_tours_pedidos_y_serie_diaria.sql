CREATE OR REPLACE FUNCTION public.ventas_pedidos_por_estado(p_ini date, p_fin date, p_entregado boolean, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(pedido text, cliente text, vendedor text, fecha_pedido date, fecha_entrega date, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.nombre_fantasia), MAX(v.vendedor_actual),
         MAX(v.fecha_pedido), MAX(v.fecha_entrega),
         SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND v.entregado = p_entregado
    AND v.pedido IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_pedidos_por_origen(p_ini date, p_fin date, p_backlog boolean, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(pedido text, cliente text, vendedor text, fecha_pedido date, fecha_entrega date, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.nombre_fantasia), MAX(v.vendedor_actual),
         MAX(v.fecha_pedido), MAX(v.fecha_entrega),
         SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (CASE WHEN p_backlog THEN v.fecha_pedido < p_ini ELSE v.fecha_pedido >= p_ini END)
    AND v.pedido IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) ASC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_serie_diaria(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(fecha date, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.fecha_entrega,
         COALESCE(SUM(v.litros), 0),
         COALESCE(SUM(v.total_sin_impuesto), 0),
         COUNT(DISTINCT v.nombre_fantasia),
         COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.fecha_entrega
  ORDER BY v.fecha_entrega;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_serie_diaria(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(fecha date, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT (CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END),
         COALESCE(SUM(v.litros), 0),
         COALESCE(SUM(v.total_sin_impuesto), 0),
         COUNT(DISTINCT v.nombre_fantasia),
         COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY 1
  ORDER BY 1;
$function$;

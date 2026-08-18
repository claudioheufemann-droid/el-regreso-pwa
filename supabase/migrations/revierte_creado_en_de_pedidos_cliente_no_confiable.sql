-- Revierte el creado_en (ventas.created_at) agregado en
-- pedidos_cliente_agrega_hora_ingreso_sistema.sql: resultó no ser
-- confiable como "hora del pedido" -ver
-- clientes_que_compraron_orden_por_fecha_real_no_sync.sql para el detalle
-- completo del hallazgo (el sync borra e reinserta filas completas, así
-- que created_at es "última vez que se tocó la fila", no "cuándo se hizo
-- el pedido"). Se saca para no dejar una columna que invite a reusarla
-- por error mas adelante.

DROP FUNCTION IF EXISTS public.ventas_pedidos_pendientes_cliente(text, date, date, text[]);
DROP FUNCTION IF EXISTS public.ventas_pedidos_entregados_cliente(text, date, date, text[], boolean);

CREATE FUNCTION public.ventas_pedidos_pendientes_cliente(
  p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[]
)
RETURNS TABLE(pedido text, fecha_pedido date, litros numeric, revenue numeric)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.fecha_pedido), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND p_fin >= CURRENT_DATE
    AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) DESC;
$function$;

CREATE FUNCTION public.ventas_pedidos_entregados_cliente(
  p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
RETURNS TABLE(
  pedido text, fecha_pedido date, fecha_entrega date, fecha_entrega_hora timestamp without time zone,
  litros numeric, revenue numeric
)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.fecha_pedido), MAX(v.fecha_entrega), MAX(v.fecha_entrega_hora), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND v.entrega_informada
    AND (CASE WHEN p_por_entrega THEN v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_entrega) DESC NULLS LAST, MAX(v.fecha_pedido) DESC;
$function$;

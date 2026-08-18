-- Litros pendientes de entrega por vendedor, para el ranking. Mismo criterio
-- que la tarjeta "Pedidos de este período": por fecha de PEDIDO (cuándo se
-- cerró la venta), no de entrega — responde "de lo que cerró este vendedor
-- en el período, cuánto sigue sin despachar".
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
  GROUP BY v.vendedor_actual;
$function$;

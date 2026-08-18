-- Agrega revenue_por_entregar a ventas_entregas_por_vendedor: el ranking de
-- vendedores mostraba litros pendientes de despacho pero no su monto en CLP
-- (pedido de Claudio, 29-jul-2026). Mismo patrón que litros_por_entregar.
DROP FUNCTION IF EXISTS public.ventas_entregas_por_vendedor(date, date, text[]);

CREATE FUNCTION public.ventas_entregas_por_vendedor(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(vendedor text, litros_por_entregar numeric, pedidos_por_entregar bigint, revenue_por_entregar numeric)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual,
         COALESCE(SUM(v.litros) FILTER (WHERE v.entrega_informada AND NOT v.entregado), 0),
         COUNT(DISTINCT v.pedido) FILTER (WHERE v.entrega_informada AND NOT v.entregado),
         COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.entrega_informada AND NOT v.entregado), 0)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$function$

-- Lista de pedidos individuales por estado de entrega, para el drill-down de
-- "Ya despachados" / "Pendientes de entrega". Por fecha de PEDIDO, mismo
-- criterio que ventas_entregas_periodo / ventas_entregas_por_vendedor.
-- Da visibilidad accionable: qué pedidos concretos siguen sin despachar.
CREATE OR REPLACE FUNCTION public.ventas_pedidos_por_estado(
  p_ini date, p_fin date, p_entregado boolean, p_provincias text[] DEFAULT NULL::text[]
)
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
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) DESC;
$function$;

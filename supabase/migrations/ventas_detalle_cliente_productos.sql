-- Detalle de productos comprados por UN cliente específico, en el rango dado.
-- Mismo criterio de fecha/región/exclusión que ventas_detalle_productos, sólo
-- que aquí se filtra a un solo nombre_fantasia. Usado por el drill-down
-- "Clientes que compraron" del dashboard de Ventas: al tocar un cliente se
-- despliega qué le vendieron.
CREATE OR REPLACE FUNCTION public.ventas_detalle_cliente_productos(
  p_cliente text, p_ini date, p_fin date,
  p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, pedidos bigint)
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
    COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

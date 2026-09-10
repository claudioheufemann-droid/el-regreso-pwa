-- Pedido de Claudio (10-sep-2026): "Clientes que compraron" (pestaña Clientes
-- de "Venta área comercial") ordenaba por fecha (sin hora) y desempataba por
-- litros -> dos clientes del mismo día salían en el orden equivocado (uno con
-- venta a las 08:49 antes que otro de las 09:14, sólo porque vendió más
-- litros). La pestaña "Pedidos" del mismo panel ya ordena por fecha + hora
-- (ver ventas_pedidos_periodo); acá se aplica el mismo criterio: fecha DESC,
-- hora real de entrega DESC (NULLS LAST -- sólo hay hora confiable cuando el
-- evento más reciente del cliente fue una entrega; fecha_pedido es un `date`
-- sin hora en el ERP, así que un cliente con sólo pedidos pendientes no tiene
-- hora que mostrar -- ver comentario en VentasHoyClient.tsx), litros como
-- último desempate.
CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date, ultima_compra_hora timestamp without time zone, litros_por_entregar numeric, revenue_por_entregar numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH entregado AS (
    SELECT
      v.nombre_fantasia AS cliente, MAX(v.localidad) AS localidad,
      SUM(v.litros) AS litros, SUM(v.total_sin_impuesto) AS revenue,
      COUNT(DISTINCT v.pedido) AS pedidos,
      MAX(CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END) AS ultima_compra,
      MAX(v.fecha_entrega_hora) AS ultima_hora
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
    GROUP BY v.nombre_fantasia
  ),
  pendiente AS (
    SELECT
      v.nombre_fantasia AS cliente, MAX(v.localidad) AS localidad,
      SUM(v.litros) AS litros_pend, SUM(v.total_sin_impuesto) AS revenue_pend,
      COUNT(DISTINCT v.pedido) AS pedidos_pend,
      MAX(v.fecha_pedido) AS ultima_compra_pend
    FROM ventas v
    WHERE p_fin >= CURRENT_DATE
      AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
      AND v.entrega_informada AND NOT v.entregado
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
    GROUP BY v.nombre_fantasia
  )
  SELECT
    COALESCE(e.cliente, p.cliente),
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = COALESCE(e.cliente, p.cliente)
      ORDER BY v2.fecha_pedido DESC LIMIT 1),
    COALESCE(e.localidad, p.localidad),
    COALESCE(e.litros, 0),
    COALESCE(e.revenue, 0),
    COALESCE(e.pedidos, 0) + COALESCE(p.pedidos_pend, 0),
    GREATEST(e.ultima_compra, p.ultima_compra_pend),
    CASE
      WHEN p.ultima_compra_pend IS NULL THEN e.ultima_hora
      WHEN e.ultima_compra IS NULL THEN NULL
      WHEN e.ultima_compra >= p.ultima_compra_pend THEN e.ultima_hora
      ELSE NULL
    END,
    COALESCE(p.litros_pend, 0),
    COALESCE(p.revenue_pend, 0)
  FROM entregado e
  FULL OUTER JOIN pendiente p ON p.cliente = e.cliente
  ORDER BY 7 DESC NULLS LAST, 8 DESC NULLS LAST, 4 DESC;
$function$;

DROP FUNCTION IF EXISTS public.ventas_detalle_clientes_por_vendedor(text[], date, date, text[], boolean);

-- Clientes de un vendedor/region especifico (ranking del dashboard de
-- Ventas): al tocar "Los Rios" en el ranking, que locales compraron y
-- cuanto de SU venta corresponde a esa cartera.
--
-- v2: la lista ahora es la UNION de clientes con algo entregado en el
-- rango Y clientes con pedidos pendientes de despacho (fecha_pedido en
-- el rango, entrega_informada=true, entregado=false) -antes un cliente
-- que solo tenia pedidos pendientes (nada entregado todavia) no
-- aparecia en absoluto en "LOCALES", aunque el total del vendedor arriba
-- si sumaba su litraje pendiente ("+X L por entregar"). Con FULL OUTER
-- JOIN entre "entregado" y "pendiente" todo cliente con actividad en el
-- periodo (entregada o no) aparece una sola vez.
CREATE FUNCTION public.ventas_detalle_clientes_por_vendedor(
  p_vendedores text[], p_ini date, p_fin date,
  p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date, litros_por_entregar numeric, revenue_por_entregar numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH entregado AS (
    SELECT
      v.nombre_fantasia AS cliente, MAX(v.localidad) AS localidad,
      SUM(v.litros) AS litros, SUM(v.total_sin_impuesto) AS revenue,
      COUNT(DISTINCT v.pedido) AS pedidos,
      MAX(CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END) AS ultima_compra
    FROM ventas v
    WHERE v.vendedor_actual = ANY(p_vendedores)
      AND (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    GROUP BY v.nombre_fantasia
  ),
  pendiente AS (
    SELECT
      v.nombre_fantasia AS cliente, MAX(v.localidad) AS localidad,
      SUM(v.litros) AS litros_pend, SUM(v.total_sin_impuesto) AS revenue_pend,
      COUNT(DISTINCT v.pedido) AS pedidos_pend,
      MAX(v.fecha_pedido) AS ultima_compra_pend
    FROM ventas v
    WHERE v.vendedor_actual = ANY(p_vendedores)
      AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
      AND v.entrega_informada AND NOT v.entregado
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    GROUP BY v.nombre_fantasia
  )
  SELECT
    COALESCE(e.cliente, p.cliente),
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = COALESCE(e.cliente, p.cliente) AND v2.vendedor_actual = ANY(p_vendedores)
      ORDER BY v2.fecha_pedido DESC LIMIT 1),
    COALESCE(e.localidad, p.localidad),
    COALESCE(e.litros, 0),
    COALESCE(e.revenue, 0),
    COALESCE(e.pedidos, 0) + COALESCE(p.pedidos_pend, 0),
    COALESCE(e.ultima_compra, p.ultima_compra_pend),
    COALESCE(p.litros_pend, 0),
    COALESCE(p.revenue_pend, 0)
  FROM entregado e
  FULL OUTER JOIN pendiente p ON p.cliente = e.cliente
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

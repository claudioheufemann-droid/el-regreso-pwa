-- Clientes que compraron UN producto especifico (drill-down de "Productos
-- vendidos" y "Latas y barriles" del dashboard de Ventas): al tocar un
-- producto, que locales lo compraron. Mismo shape y orden que
-- ventas_detalle_clientes (mas reciente primero).
--
-- Mismo prorrateo de Empaque y Distribucion que el resto de los detalles
-- de producto: por pedido, se reparte el monto de Empaque entre los
-- productos reales de ESE pedido segun su revenue, y aca se toma solo la
-- porcion que le toca al producto filtrado (por eso el join a
-- totales_pedido se calcula ANTES de filtrar por producto/envase -si no,
-- el prorrateo quedaria mal calculado usando solo el revenue de este
-- producto como si fuera el pedido completo).
--
-- p_producto/p_envase deben venir ya normalizados igual que los devuelve
-- ventas_detalle_productos (COALESCE(NULLIF(TRIM(...)), 'Sin producto'/'—')),
-- porque asi es como los recibe el frontend al tocar una fila de esa lista.
CREATE FUNCTION public.ventas_detalle_clientes_por_producto(
  p_producto text, p_envase text, p_ini date, p_fin date,
  p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.pedido, v.nombre_fantasia, v.vendedor_actual, v.localidad, v.litros, v.total_sin_impuesto,
           v.producto, v.envase, v.fecha_entrega, v.fecha_pedido,
           (v.producto ILIKE 'Empaque y Distribución%') AS es_empaque
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  ),
  totales_pedido AS (
    SELECT pedido,
      SUM(total_sin_impuesto) FILTER (WHERE es_empaque)     AS monto_empaque,
      SUM(total_sin_impuesto) FILTER (WHERE NOT es_empaque) AS monto_real
    FROM base GROUP BY pedido
  ),
  ajustado AS (
    SELECT
      b.nombre_fantasia, b.vendedor_actual, b.localidad, b.pedido, b.litros,
      b.total_sin_impuesto + COALESCE(b.total_sin_impuesto * COALESCE(tp.monto_empaque,0) / NULLIF(tp.monto_real,0), 0) AS revenue_ajustado,
      CASE WHEN p_por_entrega THEN b.fecha_entrega ELSE b.fecha_pedido END AS fecha_relevante
    FROM base b JOIN totales_pedido tp USING (pedido)
    WHERE NOT b.es_empaque
      AND COALESCE(NULLIF(TRIM(b.producto), ''), 'Sin producto') = p_producto
      AND COALESCE(NULLIF(TRIM(b.envase), ''), '—') = p_envase
  )
  SELECT
    nombre_fantasia,
    MAX(vendedor_actual),
    MAX(localidad),
    SUM(litros),
    SUM(revenue_ajustado),
    COUNT(DISTINCT pedido),
    MAX(fecha_relevante)
  FROM ajustado
  GROUP BY nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

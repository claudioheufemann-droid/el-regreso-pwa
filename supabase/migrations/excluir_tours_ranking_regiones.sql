CREATE OR REPLACE FUNCTION public.ranking_regiones(p_ini date, p_fin date)
 RETURNS TABLE(region text, vendedor text, litros numeric, revenue numeric, pedidos bigint, visitas bigint, visitas_con_venta bigint, meta numeric, pct_meta numeric, strike_rate numeric, drop_size numeric)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH reg AS (
    SELECT region, provincias FROM regiones_provincias
  ),
  vend AS (
    SELECT region, MIN(nombre) AS vendedor
    FROM users WHERE region IS NOT NULL AND NOT is_admin
    GROUP BY region
  ),
  v_reg AS (
    SELECT r.region,
      SUM(v.litros)                 AS litros,
      SUM(v.total_sin_impuesto)     AS revenue,
      COUNT(DISTINCT v.pedido)      AS pedidos
    FROM reg r
    JOIN ventas v ON v.provincia = ANY(r.provincias)
    WHERE v.entrega_informada AND v.fecha_entrega BETWEEN p_ini AND p_fin
      AND v.nombre_fantasia IS NOT NULL
      AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
    GROUP BY r.region
  ),
  vis_reg AS (
    SELECT u.region,
      COUNT(*)                                     AS visitas,
      COUNT(*) FILTER (WHERE vt.tiene_venta)       AS visitas_con_venta
    FROM visitas_terreno vt
    JOIN users u ON u.id = vt.vendedor_id
    WHERE vt.iniciada_at::date BETWEEN p_ini AND p_fin
      AND u.region IS NOT NULL
    GROUP BY u.region
  )
  SELECT
    r.region,
    COALESCE(vd.vendedor, r.region)                        AS vendedor,
    COALESCE(ve.litros, 0)                                 AS litros,
    COALESCE(ve.revenue, 0)                                AS revenue,
    COALESCE(ve.pedidos, 0)                                AS pedidos,
    COALESCE(vi.visitas, 0)                                AS visitas,
    COALESCE(vi.visitas_con_venta, 0)                      AS visitas_con_venta,
    3500::numeric                                          AS meta,
    ROUND(COALESCE(ve.litros, 0) / 3500.0 * 100, 1)        AS pct_meta,
    CASE WHEN COALESCE(vi.visitas, 0) > 0
      THEN ROUND(vi.visitas_con_venta::numeric / vi.visitas * 100, 1) END AS strike_rate,
    CASE WHEN COALESCE(ve.pedidos, 0) > 0
      THEN ROUND(COALESCE(ve.revenue, 0) / ve.pedidos)      END AS drop_size
  FROM reg r
  LEFT JOIN vend   vd ON vd.region = r.region
  LEFT JOIN v_reg  ve ON ve.region = r.region
  LEFT JOIN vis_reg vi ON vi.region = r.region
  ORDER BY pct_meta DESC;
$function$;

-- Cambio de criterio pedido por el usuario el 27-jul: "los litros del periodo
-- fueron los que se entregaron en el periodo". Antes todas estas funciones
-- filtraban por fecha_pedido (cuando se cerro la venta); ahora filtran por
-- fecha_entrega (cuando realmente salio de bodega), que es lo que tambien usa
-- el informe del ERP. Se excluyen las filas con entrega_informada = false
-- (datos historicos de antes del 26-jul sin fecha de entrega confiable): un
-- periodo viejo sin ese dato mostrara litros en 0/incompleto en vez de un
-- numero falso mezclando dos criterios.
--
-- Alcance: TODO el dashboard (Hoy/7D/30D/Periodo/Anio), ranking de vendedores
-- (ventas_agg_periodo y ranking_regiones) y avance de metas (se calcula
-- comparando contra ventas_dashboard_kpis). ventas_entregas_periodo NO
-- cambia: sigue filtrando por fecha_pedido a proposito, es el complemento que
-- responde "de lo vendido este periodo, cuanto ya se despacho" — ahora que el
-- KPI principal ya es por entrega, esa es la pregunta que sigue faltando.

CREATE OR REPLACE FUNCTION public.ventas_dashboard_kpis(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(litros numeric, revenue numeric, clientes bigint, pedidos bigint, litros_cerveza numeric, litros_kombucha numeric, litros_otros numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(SUM(v.litros), 0),
    COALESCE(SUM(v.total_sin_impuesto), 0),
    COUNT(DISTINCT v.nombre_fantasia),
    COUNT(DISTINCT v.pedido),
    COALESCE(SUM(v.litros) FILTER (WHERE lower(coalesce(v.categoria_producto,'')) LIKE '%cerveza%'), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE lower(coalesce(v.categoria_producto,'')) LIKE '%kombucha%'), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE lower(coalesce(v.categoria_producto,'')) NOT LIKE '%cerveza%'
                                     AND lower(coalesce(v.categoria_producto,'')) NOT LIKE '%kombucha%'), 0)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia);
$function$;

CREATE OR REPLACE FUNCTION public.ventas_agg_periodo(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(vendedor text, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual, SUM(v.litros), SUM(v.total_sin_impuesto),
         COUNT(DISTINCT v.nombre_fantasia), COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.vendedor_actual;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_envases_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(tipo text, unidades numeric, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    CASE
      WHEN v.envase ILIKE '%barril%'  THEN 'Barril 30L'
      WHEN v.envase ILIKE '%354%'     THEN 'Lata 354 ml'
      WHEN v.envase ILIKE '%473%'     THEN 'Lata 473 ml'
      ELSE 'Otros'
    END AS tipo,
    ROUND(SUM(
      CASE
        WHEN v.envase ILIKE '%barril%' THEN v.litros / 30.0
        WHEN v.envase ILIKE '%354%'    THEN v.litros / 0.354
        WHEN v.envase ILIKE '%473%'    THEN v.litros / 0.473
        ELSE 0
      END
    )) AS unidades,
    SUM(v.litros)             AS litros,
    SUM(v.total_sin_impuesto) AS revenue
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND v.envase IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1
  HAVING SUM(v.litros) <> 0
  ORDER BY 3 DESC;
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
  GROUP BY v.fecha_entrega
  ORDER BY v.fecha_entrega;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = v.nombre_fantasia
        AND v2.entrega_informada AND v2.fecha_entrega >= p_ini AND v2.fecha_entrega <= p_fin
      GROUP BY v2.vendedor_actual ORDER BY SUM(v2.litros) DESC LIMIT 1),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(v.fecha_entrega)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.nombre_fantasia
  ORDER BY 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_productos(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, pedidos bigint, clientes bigint)
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
    COUNT(DISTINCT v.pedido),
    COUNT(DISTINCT v.nombre_fantasia)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ranking_regiones(p_ini date, p_fin date)
 RETURNS TABLE(region text, vendedor text, litros numeric, revenue numeric, pedidos bigint, visitas bigint, visitas_con_venta bigint, meta numeric, pct_meta numeric, strike_rate numeric, drop_size numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
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

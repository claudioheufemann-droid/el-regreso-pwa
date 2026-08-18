-- Bug encontrado: la pestaña "Año" (acumulado desde 1-ene) quedó rota al
-- cambiar todo el dashboard a fecha_entrega. Sólo el 27% de las ventas del
-- año tienen entrega_informada = true (el resto es histórico previo al
-- 26-jul, cuando recién empezó a registrarse la fecha de entrega), así que
-- "Año" mostraba litros muy por debajo de lo real.
--
-- Fix: parámetro p_por_entrega (default true, mantiene el comportamiento
-- para Hoy/7D/30D/Período que sí caen dentro de la ventana con datos
-- confiables). "Año" lo pasa en false y vuelve a filtrar por fecha_pedido,
-- ya que necesariamente abarca meses sin dato de entrega.

CREATE OR REPLACE FUNCTION public.ventas_dashboard_kpis(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
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
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia);
$function$;

CREATE OR REPLACE FUNCTION public.ventas_agg_periodo(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(vendedor text, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual, SUM(v.litros), SUM(v.total_sin_impuesto),
         COUNT(DISTINCT v.nombre_fantasia), COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.vendedor_actual;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_envases_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
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
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND v.envase IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1
  HAVING SUM(v.litros) <> 0
  ORDER BY 3 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_serie_diaria(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(fecha date, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT (CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END),
         COALESCE(SUM(v.litros), 0),
         COALESCE(SUM(v.total_sin_impuesto), 0),
         COUNT(DISTINCT v.nombre_fantasia),
         COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1
  ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = v.nombre_fantasia
        AND (CASE WHEN p_por_entrega THEN v2.entrega_informada AND v2.fecha_entrega >= p_ini AND v2.fecha_entrega <= p_fin
                  ELSE v2.fecha_pedido >= p_ini AND v2.fecha_pedido <= p_fin END)
      GROUP BY v2.vendedor_actual ORDER BY SUM(v2.litros) DESC LIMIT 1),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.nombre_fantasia
  ORDER BY 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_productos(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
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
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

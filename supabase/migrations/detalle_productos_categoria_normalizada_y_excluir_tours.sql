CREATE OR REPLACE FUNCTION public.ventas_detalle_productos(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, pedidos bigint, clientes bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(NULLIF(TRIM(v.producto), ''), 'Sin producto'),
    COALESCE(NULLIF(TRIM(v.envase), ''), '—'),
    _categoria_normalizada(v.producto, v.categoria_producto),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    COUNT(DISTINCT v.nombre_fantasia)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_productos(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, pedidos bigint, clientes bigint, unidades numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.pedido, v.producto, v.envase, v.categoria_producto, v.litros, v.total_sin_impuesto, v.nombre_fantasia,
           (v.producto ILIKE 'Empaque y Distribución%') AS es_empaque
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
  ),
  totales_pedido AS (
    SELECT pedido,
      SUM(total_sin_impuesto) FILTER (WHERE es_empaque)     AS monto_empaque,
      SUM(total_sin_impuesto) FILTER (WHERE NOT es_empaque) AS monto_real
    FROM base GROUP BY pedido
  ),
  ajustado AS (
    SELECT
      b.producto, b.envase, b.categoria_producto, b.litros, b.pedido, b.nombre_fantasia,
      b.total_sin_impuesto + COALESCE(b.total_sin_impuesto * COALESCE(tp.monto_empaque,0) / NULLIF(tp.monto_real,0), 0) AS revenue_ajustado
    FROM base b JOIN totales_pedido tp USING (pedido)
    WHERE NOT b.es_empaque
  )
  SELECT
    COALESCE(NULLIF(TRIM(producto), ''), 'Sin producto'),
    COALESCE(NULLIF(TRIM(envase), ''), '—'),
    _categoria_normalizada(producto, categoria_producto),
    SUM(litros),
    SUM(revenue_ajustado),
    COUNT(DISTINCT pedido),
    COUNT(DISTINCT nombre_fantasia),
    ROUND(SUM(
      CASE
        WHEN envase ILIKE '%barril%' THEN litros / 30.0
        WHEN envase ILIKE '%354%'    THEN litros / 0.354
        WHEN envase ILIKE '%473%'    THEN litros / 0.473
        ELSE 0
      END
    ))
  FROM ajustado
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

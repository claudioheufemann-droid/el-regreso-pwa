-- ventas_pedido_productos NO excluye tours: es la vista de "que contiene
-- este pedido" para un pedido YA elegido por el usuario. Si ese pedido
-- tiene una linea de tour, tiene que verse igual que el resto de las
-- lineas -ocultarla haria que la suma de las lineas mostradas no calzara
-- con el total del pedido. La exclusion de tours es sobre que CUENTA como
-- venta (litros vendidos, KPIs, rankings), no sobre que se ve en un
-- recibo puntual.
CREATE OR REPLACE FUNCTION public.ventas_detalle_cliente_productos(p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, pedidos bigint, unidades numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.pedido, v.producto, v.envase, v.categoria_producto, v.litros, v.total_sin_impuesto,
           (v.producto ILIKE 'Empaque y Distribución%') AS es_empaque
    FROM ventas v
    WHERE v.nombre_fantasia = p_cliente
      AND (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND NOT _excluir_cliente(v.nombre_fantasia)
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
      b.producto, b.envase, b.categoria_producto, b.litros, b.pedido,
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

CREATE OR REPLACE FUNCTION public.ventas_pedido_productos(p_pedido text, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, unidades numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT producto, envase, categoria_producto, litros, total_sin_impuesto,
           (producto ILIKE 'Empaque y Distribución%') AS es_empaque
    FROM ventas
    WHERE pedido = p_pedido
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR provincia = ANY(p_provincias))
  ),
  totales AS (
    SELECT
      SUM(total_sin_impuesto) FILTER (WHERE es_empaque)     AS monto_empaque,
      SUM(total_sin_impuesto) FILTER (WHERE NOT es_empaque) AS monto_real
    FROM base
  )
  SELECT
    COALESCE(NULLIF(TRIM(b.producto), ''), 'Sin producto'),
    COALESCE(NULLIF(TRIM(b.envase), ''), '—'),
    _categoria_normalizada(b.producto, b.categoria_producto),
    SUM(b.litros),
    SUM(b.total_sin_impuesto + COALESCE(b.total_sin_impuesto * COALESCE(t.monto_empaque,0) / NULLIF(t.monto_real,0), 0)),
    ROUND(SUM(
      CASE
        WHEN b.envase ILIKE '%barril%' THEN b.litros / 30.0
        WHEN b.envase ILIKE '%354%'    THEN b.litros / 0.354
        WHEN b.envase ILIKE '%473%'    THEN b.litros / 0.473
        ELSE 0
      END
    ))
  FROM base b CROSS JOIN totales t
  WHERE NOT b.es_empaque
  GROUP BY 1, 2, 3
  ORDER BY 5 DESC;
$function$;

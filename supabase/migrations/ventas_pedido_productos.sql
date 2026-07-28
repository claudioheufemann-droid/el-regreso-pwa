-- Detalle de productos de UN pedido especifico (drill-down de "Ya
-- despachados" / "Pendientes de entrega" en el dashboard de Ventas): al
-- tocar un pedido de esas listas, que se pidio exactamente.
-- Mismo prorrateo de Empaque y Distribucion que ventas_detalle_productos
-- y ventas_detalle_cliente_productos, pero simplificado porque ya esta
-- acotado a un solo pedido (no hace falta agrupar por pedido primero).
-- p_provincias por seguridad: un pedido solo se muestra si su provincia
-- cae dentro del scope geografico del usuario (igual que el resto del
-- endpoint) -sin esto, cualquiera con el numero de pedido podria consultar
-- el detalle de una venta fuera de su region.
CREATE FUNCTION public.ventas_pedido_productos(p_pedido text, p_provincias text[] DEFAULT NULL::text[])
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
    CASE
      WHEN lower(coalesce(b.categoria_producto,'')) LIKE '%cerveza%'  THEN 'Cerveza'
      WHEN lower(coalesce(b.categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
      ELSE 'Otros'
    END,
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

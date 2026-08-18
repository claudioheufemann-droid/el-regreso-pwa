-- Pedido de Claudio, 27-jul (correccion al fix anterior): los renglones
-- "Empaque y Distribucion ..." SI son plata real de la venta (confirmado:
-- para el pedido 00052069 de La Rotonda suman $151.260, no se cancelan a
-- cero). El fix anterior los excluia del desglose por producto sin más,
-- lo que dejaba la suma del detalle ($102.890) sin cuadrar contra el total
-- real de esa venta ($254.150, que SI incluye Empaque porque
-- ventas_detalle_clientes y los KPIs del dashboard nunca lo excluyeron).
--
-- Ahora se prorratea: por cada PEDIDO, el monto total de sus renglones
-- "Empaque y Distribucion" se reparte entre los renglones de producto real
-- del MISMO pedido, proporcional al revenue de cada uno. "La venta" en el
-- pedido de Claudio = un pedido individual, no el periodo completo -de ahi
-- que el prorrateo sea por pedido y no por cliente/rango de fechas: cada
-- venta absorbe solo su propio cargo de empaque, no el de otras ventas del
-- mismo cliente en el mes.
--
-- Verificado con el pedido 00052069: suma de revenue_ajustado por producto
-- = $254.150,00 exacto, igual al total ya mostrado para ese cliente.
--
-- Litros no se toca: Empaque siempre tiene litros=0, así que unidades
-- (latas/barriles, calculadas desde litros) tampoco cambia.
--
-- Caso borde: si el revenue real de un pedido suma exactamente $0 (no
-- debería pasar en la práctica), COALESCE(...,0) evita que la division
-- por cero deje el revenue en NULL -ese pedido simplemente no absorbe
-- prorrateo ese caso puntual, no rompe el resto.
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
    CASE
      WHEN lower(coalesce(categoria_producto,'')) LIKE '%cerveza%'  THEN 'Cerveza'
      WHEN lower(coalesce(categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
      ELSE 'Otros'
    END,
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

CREATE OR REPLACE FUNCTION public.ventas_detalle_cliente_productos(
  p_cliente text, p_ini date, p_fin date,
  p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
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
    CASE
      WHEN lower(coalesce(categoria_producto,'')) LIKE '%cerveza%'  THEN 'Cerveza'
      WHEN lower(coalesce(categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
      ELSE 'Otros'
    END,
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

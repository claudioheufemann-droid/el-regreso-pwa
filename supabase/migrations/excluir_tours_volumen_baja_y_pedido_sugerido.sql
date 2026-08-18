CREATE OR REPLACE FUNCTION public.get_clientes_volumen_baja(p_vendedor text DEFAULT NULL::text, p_umbral numeric DEFAULT 0.25)
 RETURNS TABLE(nombre_fantasia text, vendedor_actual text, segmento text, litros_reciente numeric, litros_baseline numeric, caida_pct numeric, pedidos_totales bigint, dias_sin_compra integer, telefono text)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH pedidos AS (
    SELECT v.nombre_fantasia, v.vendedor_actual, v.pedido,
           MAX(v.fecha_pedido) AS fecha, SUM(v.litros) AS litros
    FROM ventas v
    WHERE v.nombre_fantasia IS NOT NULL AND v.pedido IS NOT NULL
      AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
      AND NOT EXISTS (SELECT 1 FROM deudores d WHERE d.nombre_fantasia=v.nombre_fantasia AND d.tipo_cliente='Incobrable')
      AND NOT EXISTS (SELECT 1 FROM clientes_estado ce WHERE ce.nombre_fantasia=v.nombre_fantasia AND ce.estado='inactivo')
    GROUP BY v.nombre_fantasia, v.vendedor_actual, v.pedido
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY nombre_fantasia ORDER BY fecha DESC) AS rn,
              COUNT(*) OVER (PARTITION BY nombre_fantasia) AS n
    FROM pedidos
  ),
  agg AS (
    SELECT nombre_fantasia, vendedor_actual,
      AVG(litros) FILTER (WHERE rn <= 3) AS litros_reciente,
      AVG(litros) FILTER (WHERE rn >  3) AS litros_baseline,
      MAX(n) AS pedidos_totales,
      (CURRENT_DATE - MAX(fecha))::int AS dias_sin_compra
    FROM ranked GROUP BY nombre_fantasia, vendedor_actual
  )
  SELECT a.nombre_fantasia, a.vendedor_actual, cs.segmento,
    ROUND(a.litros_reciente,1), ROUND(a.litros_baseline,1),
    ROUND((1 - a.litros_reciente / NULLIF(a.litros_baseline,0)) * 100),
    a.pedidos_totales, a.dias_sin_compra, c.telefono
  FROM agg a
  LEFT JOIN client_scores cs ON cs.nombre_fantasia = a.nombre_fantasia
  LEFT JOIN clientes c ON c.nombre_fantasia = a.nombre_fantasia
  WHERE a.pedidos_totales >= 5 AND a.litros_baseline > 0
    AND a.litros_reciente < a.litros_baseline * (1 - p_umbral)
    AND COALESCE(cs.tipo_cliente,'activo') = 'activo'
    AND (p_vendedor IS NULL OR a.vendedor_actual = p_vendedor)
  ORDER BY 6 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_pedido_sugerido(p_vendedor text DEFAULT NULL::text)
 RETURNS TABLE(nombre_fantasia text, producto text, envase text, litros_tipico numeric, frecuencia bigint, rank bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH ultimos_pedidos AS (
    SELECT nombre_fantasia, pedido FROM (
      SELECT DISTINCT v.nombre_fantasia, v.pedido,
             DENSE_RANK() OVER (PARTITION BY v.nombre_fantasia ORDER BY v.fecha_pedido DESC) AS pr
      FROM ventas v
      WHERE v.pedido IS NOT NULL AND v.nombre_fantasia IS NOT NULL
        AND NOT _excluir_cliente(v.nombre_fantasia)
        AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    ) s WHERE pr <= 6
  ),
  lineas AS (
    SELECT v.nombre_fantasia, up.pedido, v.producto, v.envase, SUM(v.litros) AS litros
    FROM ventas v
    JOIN ultimos_pedidos up ON up.nombre_fantasia = v.nombre_fantasia AND up.pedido = v.pedido
    WHERE v.producto IS NOT NULL AND NOT _excluir_producto(v.producto)
    GROUP BY v.nombre_fantasia, up.pedido, v.producto, v.envase
  ),
  agg AS (
    SELECT nombre_fantasia, producto, envase,
           ROUND(AVG(litros),1) AS litros_tipico, COUNT(DISTINCT pedido) AS frecuencia
    FROM lineas GROUP BY nombre_fantasia, producto, envase
  ),
  ranked AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY nombre_fantasia ORDER BY frecuencia DESC, litros_tipico DESC) AS rank
    FROM agg
  )
  SELECT nombre_fantasia, producto, envase, litros_tipico, frecuencia, rank
  FROM ranked WHERE rank <= 3 ORDER BY nombre_fantasia, rank;
$function$;

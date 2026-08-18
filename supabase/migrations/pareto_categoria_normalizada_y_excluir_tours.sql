CREATE OR REPLACE FUNCTION public.ventas_pareto(p_anio integer, p_canal text DEFAULT NULL::text, p_linea text DEFAULT NULL::text)
 RETURNS TABLE(cliente text, revenue numeric, litros numeric, pct_acum numeric, es_a boolean)
 LANGUAGE sql STABLE
AS $function$
  WITH base AS (
    SELECT v.nombre_fantasia AS cliente,
           SUM(v.total_sin_impuesto) AS revenue,
           SUM(v.litros) AS litros
    FROM ventas v
    WHERE v.nombre_fantasia IS NOT NULL
      AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
      AND date_part('year', v.fecha_pedido)::int = p_anio
      AND (p_canal IS NULL OR v.categoria_negocio = p_canal)
      AND (p_linea IS NULL OR _categoria_normalizada(v.producto, v.categoria_producto) = p_linea)
    GROUP BY v.nombre_fantasia
    HAVING SUM(v.total_sin_impuesto) > 0
  ),
  total AS (SELECT SUM(revenue) AS rev_total FROM base),
  acum AS (
    SELECT cliente, revenue, litros,
      SUM(revenue) OVER (ORDER BY revenue DESC) AS rev_acum,
      (SELECT rev_total FROM total) AS rev_total
    FROM base
  )
  SELECT cliente, revenue, litros,
    ROUND(rev_acum / NULLIF(rev_total,0) * 100, 1) AS pct_acum,
    (rev_acum - revenue) / NULLIF(rev_total,0) < 0.8 AS es_a
  FROM acum
  ORDER BY revenue DESC;
$function$;

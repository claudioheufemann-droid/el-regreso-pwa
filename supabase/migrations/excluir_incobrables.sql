-- =============================================================================
-- EXCLUIR INCOBRABLES DE MISIONES / ALERTAS / SCORES
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Estrategia: agregar exclusión de incobrables directamente en
-- client_raw_metrics (base de todo el sistema de scoring).
-- La exclusión se propaga automáticamente a client_scores,
-- get_client_scores() y get_pending_call_alerts().
-- =============================================================================

CREATE OR REPLACE VIEW client_raw_metrics AS
WITH order_dates AS (
  SELECT DISTINCT v.nombre_fantasia, v.vendedor_actual, v.fecha_pedido
  FROM ventas v
  WHERE v.nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(v.nombre_fantasia)
    -- Excluir clientes marcados como incobrables en la tabla deudores
    AND NOT EXISTS (
      SELECT 1 FROM deudores d
      WHERE d.nombre_fantasia = v.nombre_fantasia
        AND d.tipo_cliente = 'Incobrable'
    )
),
gaps AS (
  SELECT
    nombre_fantasia,
    (fecha_pedido - LAG(fecha_pedido) OVER (
      PARTITION BY nombre_fantasia ORDER BY fecha_pedido
    ))::int AS gap_dias
  FROM order_dates
),
gap_stats AS (
  SELECT
    nombre_fantasia,
    ROUND(AVG(gap_dias))::int AS ciclo_promedio_dias,
    MIN(gap_dias)             AS ciclo_minimo_dias,
    MAX(gap_dias)             AS ciclo_maximo_dias,
    ROUND(STDDEV(gap_dias)::numeric, 1) AS ciclo_std_dias
  FROM gaps
  WHERE gap_dias IS NOT NULL
  GROUP BY nombre_fantasia
),
aggregated AS (
  SELECT
    od.nombre_fantasia,
    od.vendedor_actual,
    COUNT(*)                                    AS total_pedidos,
    SUM(v.litros)                               AS litros_totales,
    SUM(v.total_sin_impuesto)                   AS revenue_total,
    MIN(od.fecha_pedido)                        AS primera_compra,
    MAX(od.fecha_pedido)                        AS ultima_compra,
    (CURRENT_DATE - MAX(od.fecha_pedido))::int  AS dias_sin_compra,
    GREATEST(1,
      ROUND((MAX(od.fecha_pedido) - MIN(od.fecha_pedido))::float / 30.4375)
    )                                           AS meses_activo
  FROM order_dates od
  JOIN ventas v
    ON v.nombre_fantasia = od.nombre_fantasia
   AND v.fecha_pedido    = od.fecha_pedido
   AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY od.nombre_fantasia, od.vendedor_actual
)
SELECT
  a.nombre_fantasia,
  a.vendedor_actual,
  a.total_pedidos,
  a.litros_totales,
  a.revenue_total,
  a.primera_compra,
  a.ultima_compra,
  a.dias_sin_compra,
  a.meses_activo,
  ROUND((a.total_pedidos::float / a.meses_activo)::numeric, 2)  AS pedidos_por_mes,
  ROUND((a.litros_totales / a.total_pedidos)::numeric, 2)       AS litros_por_pedido,
  ROUND((a.revenue_total  / a.total_pedidos)::numeric, 0)       AS revenue_por_pedido,
  g.ciclo_promedio_dias,
  g.ciclo_minimo_dias,
  g.ciclo_maximo_dias,
  g.ciclo_std_dias,
  GREATEST(0, COALESCE(g.ciclo_promedio_dias, 30) - a.dias_sin_compra) AS dias_para_siguiente,
  (a.ultima_compra + (COALESCE(g.ciclo_promedio_dias, 30) || ' days')::interval)::date
    AS siguiente_compra_estimada
FROM aggregated a
LEFT JOIN gap_stats g ON g.nombre_fantasia = a.nombre_fantasia;

-- Restaurar permisos (CREATE OR REPLACE VIEW los resetea)
GRANT SELECT ON client_raw_metrics TO anon, authenticated;

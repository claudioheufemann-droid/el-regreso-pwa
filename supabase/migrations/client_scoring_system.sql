-- =============================================================================
-- CLIENT INTELLIGENCE SYSTEM — El Regreso Beer Co.
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
-- =============================================================================

-- Clientes internos a excluir de todos los cálculos
CREATE OR REPLACE FUNCTION _excluir_cliente(nombre text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT nombre = ANY(ARRAY[
    'Cliente Ventas (Javier)',
    'Cliente Ventas (Charly)',
    'Cliente Ventas (Carlos)',
    'Cliente PDV',
    'Cliente Merma PDV'
  ])
$$;

-- =============================================================================
-- 1. VIEW: client_raw_metrics
--    Métricas base agregadas por cliente (sin normalizar).
-- =============================================================================
CREATE OR REPLACE VIEW client_raw_metrics AS
WITH order_dates AS (
  SELECT DISTINCT nombre_fantasia, vendedor_actual, fecha_pedido
  FROM ventas
  WHERE nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(nombre_fantasia)
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

-- =============================================================================
-- 2. VIEW: client_scores
--    Score 0-100 con modelo RFM ponderado + recency penalty.
--
--    Pesos: Volumen 35% | Frecuencia 30% | Revenue 35%
--    Normalización: PERCENT_RANK (robusto ante outliers)
--    Penalización: -10% crítico | -5% vencido
-- =============================================================================
CREATE OR REPLACE VIEW client_scores AS
WITH ranked AS (
  SELECT
    *,
    PERCENT_RANK() OVER (ORDER BY litros_totales)   AS pct_volumen,
    PERCENT_RANK() OVER (ORDER BY pedidos_por_mes)  AS pct_frecuencia,
    PERCENT_RANK() OVER (ORDER BY revenue_total)    AS pct_revenue,
    CASE
      WHEN ciclo_promedio_dias IS NULL                              THEN 'sin_historial'
      WHEN dias_sin_compra >= ROUND(ciclo_promedio_dias * 1.5)     THEN 'critico'
      WHEN dias_sin_compra >= ciclo_promedio_dias                  THEN 'vencido'
      WHEN dias_sin_compra >= ROUND(ciclo_promedio_dias * 0.8)     THEN 'proximo'
      ELSE                                                              'ok'
    END AS alert_level
  FROM client_raw_metrics
),
scored AS (
  SELECT *,
    (0.35 * pct_volumen + 0.30 * pct_frecuencia + 0.35 * pct_revenue) AS score_raw,
    CASE alert_level
      WHEN 'critico' THEN 0.90
      WHEN 'vencido' THEN 0.95
      ELSE 1.00
    END AS recency_factor,
    CASE
      WHEN total_pedidos >= 12 THEN 'alta'
      WHEN total_pedidos >= 4  THEN 'media'
      ELSE 'baja'
    END AS confianza_score
  FROM ranked
)
SELECT
  nombre_fantasia,
  vendedor_actual,
  -- Score final 0-100
  LEAST(100, GREATEST(0,
    ROUND((score_raw * recency_factor * 100)::numeric, 1)
  ))::numeric(5,1)                                              AS score,
  -- Componentes individuales
  ROUND((pct_volumen    * 100)::numeric, 1)                    AS score_volumen,
  ROUND((pct_frecuencia * 100)::numeric, 1)                    AS score_frecuencia,
  ROUND((pct_revenue    * 100)::numeric, 1)                    AS score_revenue,
  recency_factor,
  confianza_score,
  -- Segmento A-E
  CASE
    WHEN ROUND(score_raw * recency_factor * 100) >= 80 THEN 'A'
    WHEN ROUND(score_raw * recency_factor * 100) >= 60 THEN 'B'
    WHEN ROUND(score_raw * recency_factor * 100) >= 40 THEN 'C'
    WHEN ROUND(score_raw * recency_factor * 100) >= 20 THEN 'D'
    ELSE                                                    'E'
  END                                                          AS segmento,
  -- Métricas históricas
  litros_totales, revenue_total, total_pedidos,
  litros_por_pedido, revenue_por_pedido, pedidos_por_mes,
  meses_activo, primera_compra, ultima_compra,
  -- Sistema de alertas
  alert_level, dias_sin_compra, ciclo_promedio_dias,
  ciclo_std_dias, dias_para_siguiente, siguiente_compra_estimada
FROM scored
ORDER BY score DESC;

-- =============================================================================
-- 3. FUNCTION: get_client_scores(vendedor, min_score, min_segmento)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_client_scores(
  p_vendedor     text    DEFAULT NULL,
  p_min_score    numeric DEFAULT 0,
  p_min_segmento text    DEFAULT NULL
)
RETURNS TABLE (
  nombre_fantasia text, vendedor_actual text, score numeric, segmento text,
  alert_level text, confianza_score text, litros_totales numeric,
  revenue_total numeric, total_pedidos bigint, pedidos_por_mes numeric,
  ciclo_promedio_dias int, dias_sin_compra int, siguiente_compra_estimada date
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nombre_fantasia, vendedor_actual, score, segmento, alert_level,
         confianza_score, litros_totales, revenue_total, total_pedidos,
         pedidos_por_mes, ciclo_promedio_dias, dias_sin_compra, siguiente_compra_estimada
  FROM client_scores
  WHERE (p_vendedor IS NULL OR vendedor_actual = p_vendedor)
    AND score >= p_min_score
    AND (p_min_segmento IS NULL OR segmento <= p_min_segmento)
  ORDER BY score DESC;
$$;

-- =============================================================================
-- 4. FUNCTION: get_pending_call_alerts(vendedor, nivel_minimo)
--    Clientes a contactar, ordenados por urgencia + valor.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_pending_call_alerts(
  p_vendedor     text DEFAULT NULL,
  p_nivel_minimo text DEFAULT 'proximo'
)
RETURNS TABLE (
  nombre_fantasia text, vendedor_actual text, score numeric, segmento text,
  alert_level text, dias_sin_compra int, ciclo_promedio_dias int,
  porcentaje_ciclo_vencido numeric, dias_vencido int,
  siguiente_compra_estimada date, revenue_total numeric, litros_totales numeric
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    nombre_fantasia, vendedor_actual, score, segmento, alert_level,
    dias_sin_compra, ciclo_promedio_dias,
    ROUND((dias_sin_compra::float / NULLIF(ciclo_promedio_dias,0) * 100)::numeric, 1)
      AS porcentaje_ciclo_vencido,
    GREATEST(0, dias_sin_compra - COALESCE(ciclo_promedio_dias, 0)) AS dias_vencido,
    siguiente_compra_estimada, revenue_total, litros_totales
  FROM client_scores
  WHERE (p_vendedor IS NULL OR vendedor_actual = p_vendedor)
    AND alert_level = ANY(
      CASE p_nivel_minimo
        WHEN 'critico' THEN ARRAY['critico']
        WHEN 'vencido' THEN ARRAY['vencido', 'critico']
        ELSE                ARRAY['proximo', 'vencido', 'critico']
      END
    )
  ORDER BY
    CASE alert_level WHEN 'critico' THEN 1 WHEN 'vencido' THEN 2 ELSE 3 END,
    score DESC;
$$;

-- =============================================================================
-- 5. FUNCTION: get_portfolio_summary(vendedor)
--    Resumen ejecutivo de la cartera.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_portfolio_summary(
  p_vendedor text DEFAULT NULL
)
RETURNS TABLE (
  vendedor_actual text, total_clientes bigint, score_promedio numeric,
  clientes_segmento_a bigint, clientes_segmento_b bigint, clientes_segmento_c bigint,
  clientes_en_riesgo bigint, clientes_criticos bigint,
  litros_totales numeric, revenue_total numeric, ciclo_promedio_cartera numeric
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    vendedor_actual,
    COUNT(*)                                                     AS total_clientes,
    ROUND(AVG(score), 1)                                         AS score_promedio,
    COUNT(*) FILTER (WHERE segmento = 'A')                       AS clientes_segmento_a,
    COUNT(*) FILTER (WHERE segmento = 'B')                       AS clientes_segmento_b,
    COUNT(*) FILTER (WHERE segmento = 'C')                       AS clientes_segmento_c,
    COUNT(*) FILTER (WHERE alert_level IN ('vencido','critico')) AS clientes_en_riesgo,
    COUNT(*) FILTER (WHERE alert_level = 'critico')              AS clientes_criticos,
    ROUND(SUM(litros_totales), 1)                                AS litros_totales,
    ROUND(SUM(revenue_total),  0)                                AS revenue_total,
    ROUND(SUM(ciclo_promedio_dias * score) / NULLIF(SUM(score),0), 1)
                                                                 AS ciclo_promedio_cartera
  FROM client_scores
  WHERE (p_vendedor IS NULL OR vendedor_actual = p_vendedor)
    AND ciclo_promedio_dias IS NOT NULL
  GROUP BY vendedor_actual
  ORDER BY revenue_total DESC;
$$;

-- Permisos
GRANT SELECT ON client_raw_metrics TO anon, authenticated;
GRANT SELECT ON client_scores       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_client_scores       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_pending_call_alerts TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_portfolio_summary   TO anon, authenticated;

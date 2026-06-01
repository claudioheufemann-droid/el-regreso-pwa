-- =============================================================================
-- MISIONES V2 — Frecuencia ponderada + filtro de inactivos + tipo_cliente
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Consolida:
--   1. client_raw_metrics: ciclo PONDERADO (pedidos recientes pesan más)
--      + exclusión de inactivos (clientes_estado) e incobrables (deudores)
--   2. client_scores: tipo_cliente (activo/inactivo/temporal/nuevo)
--   3. get_pending_call_alerts: RESTAURA filtro de inactivos + expone tipo_cliente
--   4. get_client_scores: expone tipo_cliente
-- Seguro de re-ejecutar.
-- =============================================================================

DROP FUNCTION IF EXISTS get_pending_call_alerts(text, text);
DROP FUNCTION IF EXISTS get_client_scores(text, numeric, text);

-- ── 1. client_raw_metrics con ciclo PONDERADO por recencia ────────────────────
CREATE OR REPLACE VIEW client_raw_metrics AS
WITH order_dates AS (
  SELECT DISTINCT v.nombre_fantasia, v.vendedor_actual, v.fecha_pedido
  FROM ventas v
  WHERE v.nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT EXISTS (
      SELECT 1 FROM deudores d
      WHERE d.nombre_fantasia = v.nombre_fantasia
        AND d.tipo_cliente = 'Incobrable'
    )
    AND NOT EXISTS (
      SELECT 1 FROM clientes_estado ce
      WHERE ce.nombre_fantasia = v.nombre_fantasia
        AND ce.estado = 'inactivo'
    )
),
gaps AS (
  SELECT
    nombre_fantasia,
    fecha_pedido,
    (fecha_pedido - LAG(fecha_pedido) OVER (
      PARTITION BY nombre_fantasia ORDER BY fecha_pedido
    ))::int AS gap_dias
  FROM order_dates
),
gaps_pos AS (
  -- pos = posición cronológica (más reciente = mayor) → mayor peso
  SELECT
    nombre_fantasia,
    gap_dias,
    ROW_NUMBER() OVER (PARTITION BY nombre_fantasia ORDER BY fecha_pedido) AS pos
  FROM gaps
  WHERE gap_dias IS NOT NULL
),
gap_stats AS (
  SELECT
    nombre_fantasia,
    -- Promedio PONDERADO: los gaps recientes pesan proporcionalmente más.
    -- ciclo = Σ(gap·peso) / Σ(peso), peso = posición cronológica.
    GREATEST(1, ROUND(
      SUM(gap_dias::numeric * pos) / NULLIF(SUM(pos), 0)
    ))::int                                       AS ciclo_promedio_dias,
    MIN(gap_dias)                                 AS ciclo_minimo_dias,
    MAX(gap_dias)                                 AS ciclo_maximo_dias,
    ROUND(STDDEV(gap_dias)::numeric, 1)           AS ciclo_std_dias
  FROM gaps_pos
  GROUP BY nombre_fantasia
),
aggregated AS (
  SELECT
    od.nombre_fantasia,
    od.vendedor_actual,
    COUNT(*)                                     AS total_pedidos,
    SUM(v.litros)                                AS litros_totales,
    SUM(v.total_sin_impuesto)                    AS revenue_total,
    MIN(od.fecha_pedido)                         AS primera_compra,
    MAX(od.fecha_pedido)                         AS ultima_compra,
    (CURRENT_DATE - MAX(od.fecha_pedido))::int   AS dias_sin_compra,
    GREATEST(1,
      ROUND((MAX(od.fecha_pedido) - MIN(od.fecha_pedido))::float / 30.4375)
    )                                            AS meses_activo
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
  ROUND((a.total_pedidos::float / a.meses_activo)::numeric, 2)   AS pedidos_por_mes,
  ROUND((a.litros_totales / a.total_pedidos)::numeric, 2)        AS litros_por_pedido,
  ROUND((a.revenue_total  / a.total_pedidos)::numeric, 0)        AS revenue_por_pedido,
  g.ciclo_promedio_dias,
  g.ciclo_minimo_dias,
  g.ciclo_maximo_dias,
  g.ciclo_std_dias,
  GREATEST(0, COALESCE(g.ciclo_promedio_dias, 30) - a.dias_sin_compra) AS dias_para_siguiente,
  (a.ultima_compra + (COALESCE(g.ciclo_promedio_dias, 30) || ' days')::interval)::date
    AS siguiente_compra_estimada
FROM aggregated a
LEFT JOIN gap_stats g ON g.nombre_fantasia = a.nombre_fantasia;

GRANT SELECT ON client_raw_metrics TO anon, authenticated;


-- ── 2. client_scores con tipo_cliente ─────────────────────────────────────────
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
  LEAST(100, GREATEST(0,
    ROUND((score_raw * recency_factor * 100)::numeric, 1)
  ))::numeric(5,1)                                              AS score,
  ROUND((pct_volumen    * 100)::numeric, 1)                    AS score_volumen,
  ROUND((pct_frecuencia * 100)::numeric, 1)                    AS score_frecuencia,
  ROUND((pct_revenue    * 100)::numeric, 1)                    AS score_revenue,
  recency_factor,
  confianza_score,
  CASE
    WHEN ROUND(score_raw * recency_factor * 100) >= 80 THEN 'A'
    WHEN ROUND(score_raw * recency_factor * 100) >= 60 THEN 'B'
    WHEN ROUND(score_raw * recency_factor * 100) >= 40 THEN 'C'
    WHEN ROUND(score_raw * recency_factor * 100) >= 20 THEN 'D'
    ELSE                                                    'E'
  END                                                          AS segmento,
  litros_totales, revenue_total, total_pedidos,
  litros_por_pedido, revenue_por_pedido, pedidos_por_mes,
  meses_activo, primera_compra, ultima_compra,
  alert_level, dias_sin_compra, ciclo_promedio_dias,
  ciclo_std_dias, dias_para_siguiente, siguiente_compra_estimada,
  CASE
    WHEN total_pedidos <= 2
      AND primera_compra >= CURRENT_DATE - INTERVAL '90 days'  THEN 'nuevo'
    WHEN total_pedidos < 4                                     THEN 'temporal'
    WHEN dias_sin_compra > GREATEST(
      COALESCE(ciclo_promedio_dias, 60)::numeric * 2.5, 120)   THEN 'inactivo'
    ELSE 'activo'
  END                                                          AS tipo_cliente
FROM scored
ORDER BY score DESC;

GRANT SELECT ON client_scores TO anon, authenticated;


-- ── 3. get_pending_call_alerts: filtro de inactivos + tipo_cliente ────────────
CREATE FUNCTION get_pending_call_alerts(
  p_vendedor     text DEFAULT NULL,
  p_nivel_minimo text DEFAULT 'proximo'
)
RETURNS TABLE (
  nombre_fantasia           text,
  vendedor_actual           text,
  score                     numeric,
  segmento                  text,
  alert_level               text,
  dias_sin_compra           int,
  ciclo_promedio_dias       int,
  porcentaje_ciclo_vencido  numeric,
  dias_vencido              int,
  siguiente_compra_estimada date,
  revenue_total             numeric,
  litros_totales            numeric,
  total_pedidos             bigint,
  confianza_score           text,
  estado_cliente            text,
  tipo_cliente              text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    cs.nombre_fantasia,
    cs.vendedor_actual,
    cs.score,
    cs.segmento,
    cs.alert_level,
    cs.dias_sin_compra,
    cs.ciclo_promedio_dias,
    ROUND((cs.dias_sin_compra::float / NULLIF(cs.ciclo_promedio_dias, 0) * 100)::numeric, 1),
    GREATEST(0, cs.dias_sin_compra - COALESCE(cs.ciclo_promedio_dias, 0)),
    cs.siguiente_compra_estimada,
    cs.revenue_total,
    cs.litros_totales,
    cs.total_pedidos,
    cs.confianza_score,
    COALESCE(ce.estado, 'activo') AS estado_cliente,
    cs.tipo_cliente
  FROM client_scores cs
  LEFT JOIN clientes_estado ce ON ce.nombre_fantasia = cs.nombre_fantasia
  WHERE
    (p_vendedor IS NULL OR cs.vendedor_actual = p_vendedor)
    AND cs.alert_level = ANY(
      CASE p_nivel_minimo
        WHEN 'critico' THEN ARRAY['critico']
        WHEN 'vencido' THEN ARRAY['vencido', 'critico']
        ELSE                ARRAY['proximo', 'vencido', 'critico']
      END
    )
    -- Solo clientes con historial confiable
    AND cs.total_pedidos >= 3
    AND cs.ciclo_promedio_dias IS NOT NULL
    -- Excluir inactivos: tanto los derivados (>2.5× ciclo) como los marcados a mano
    AND cs.tipo_cliente <> 'inactivo'
    AND COALESCE(ce.estado, 'activo') <> 'inactivo'
  ORDER BY
    CASE COALESCE(ce.estado, 'activo') WHEN 'estacional' THEN 1 ELSE 0 END,
    CASE cs.alert_level WHEN 'critico' THEN 1 WHEN 'vencido' THEN 2 ELSE 3 END,
    cs.score DESC;
$$;

GRANT EXECUTE ON FUNCTION get_pending_call_alerts TO anon, authenticated;


-- ── 4. get_client_scores con tipo_cliente ─────────────────────────────────────
CREATE FUNCTION get_client_scores(
  p_vendedor     text    DEFAULT NULL,
  p_min_score    numeric DEFAULT 0,
  p_min_segmento text    DEFAULT NULL
)
RETURNS TABLE (
  nombre_fantasia text, vendedor_actual text, score numeric, segmento text,
  alert_level text, confianza_score text, litros_totales numeric,
  revenue_total numeric, total_pedidos bigint, pedidos_por_mes numeric,
  ciclo_promedio_dias int, dias_sin_compra int, siguiente_compra_estimada date,
  tipo_cliente text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nombre_fantasia, vendedor_actual, score, segmento, alert_level,
         confianza_score, litros_totales, revenue_total, total_pedidos,
         pedidos_por_mes, ciclo_promedio_dias, dias_sin_compra,
         siguiente_compra_estimada, tipo_cliente
  FROM client_scores
  WHERE (p_vendedor IS NULL OR vendedor_actual = p_vendedor)
    AND score >= p_min_score
    AND (p_min_segmento IS NULL OR segmento <= p_min_segmento)
  ORDER BY score DESC;
$$;

GRANT EXECUTE ON FUNCTION get_client_scores TO anon, authenticated;


-- ── 5. NUEVA función: calendario mensual de pedidos esperados ─────────────────
--    Proyecta las fechas de pedido esperadas de cada cliente activo dentro
--    de un rango, repitiendo según su ciclo. Para la línea de tiempo mensual.
CREATE OR REPLACE FUNCTION get_calendario_pedidos(
  p_vendedor text DEFAULT NULL,
  p_desde    date DEFAULT CURRENT_DATE,
  p_hasta    date DEFAULT (CURRENT_DATE + INTERVAL '31 days')::date
)
RETURNS TABLE (
  nombre_fantasia text,
  vendedor_actual text,
  segmento text,
  tipo_cliente text,
  ciclo_promedio_dias int,
  litros_por_pedido numeric,
  fecha_esperada date,
  es_primera boolean
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH base AS (
    SELECT cs.nombre_fantasia, cs.vendedor_actual, cs.segmento, cs.tipo_cliente,
           cs.ciclo_promedio_dias, cs.litros_por_pedido, cs.siguiente_compra_estimada
    FROM client_scores cs
    LEFT JOIN clientes_estado ce ON ce.nombre_fantasia = cs.nombre_fantasia
    WHERE (p_vendedor IS NULL OR cs.vendedor_actual = p_vendedor)
      AND cs.ciclo_promedio_dias IS NOT NULL
      AND cs.total_pedidos >= 3
      AND cs.tipo_cliente <> 'inactivo'
      AND COALESCE(ce.estado, 'activo') <> 'inactivo'
      AND cs.siguiente_compra_estimada IS NOT NULL
  ),
  proyeccion AS (
    SELECT b.*,
      -- Generar fechas: desde la siguiente compra estimada, repetir cada ciclo
      generate_series(
        GREATEST(b.siguiente_compra_estimada, p_desde - (b.ciclo_promedio_dias || ' days')::interval)::date,
        p_hasta,
        (b.ciclo_promedio_dias || ' days')::interval
      )::date AS fecha_esperada
    FROM base b
  )
  SELECT
    nombre_fantasia, vendedor_actual, segmento, tipo_cliente,
    ciclo_promedio_dias, litros_por_pedido, fecha_esperada,
    (fecha_esperada = MIN(fecha_esperada) OVER (PARTITION BY nombre_fantasia)) AS es_primera
  FROM proyeccion
  WHERE fecha_esperada >= p_desde AND fecha_esperada <= p_hasta
  ORDER BY fecha_esperada, nombre_fantasia;
$$;

GRANT EXECUTE ON FUNCTION get_calendario_pedidos TO anon, authenticated;


-- ── Verificación ──────────────────────────────────────────────────────────────
SELECT tipo_cliente, COUNT(*) FROM client_scores GROUP BY tipo_cliente ORDER BY 2 DESC;

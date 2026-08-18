-- =============================================================================
-- TIPO CLIENTE — Segmentación: activo | inactivo | temporal | nuevo
-- Agrega tipo_cliente a la VIEW client_scores y lo expone en funciones.
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
-- Seguro de re-ejecutar (CREATE OR REPLACE).
-- =============================================================================

-- ── 1. Actualizar VIEW client_scores con tipo_cliente ─────────────────────────
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

  -- ── NUEVO CAMPO: tipo_cliente ──────────────────────────────────────────────
  -- Lógica de clasificación:
  --   nuevo    : 1-2 pedidos + se incorporó hace ≤90 días
  --   temporal : <4 pedidos en total (no ha establecido patrón regular)
  --   inactivo : ≥4 pedidos pero lleva >2.5× su ciclo sin comprar (o >120d si sin ciclo)
  --   activo   : todo lo demás (comprador regular dentro de su ciclo)
  CASE
    WHEN total_pedidos <= 2
      AND primera_compra >= CURRENT_DATE - INTERVAL '90 days'
      THEN 'nuevo'
    WHEN total_pedidos < 4
      THEN 'temporal'
    WHEN dias_sin_compra > GREATEST(
      COALESCE(ciclo_promedio_dias, 60)::numeric * 2.5,
      120
    ) THEN 'inactivo'
    ELSE 'activo'
  END                                                          AS tipo_cliente

FROM scored
ORDER BY score DESC;

-- Mantener permisos
GRANT SELECT ON client_scores TO anon, authenticated;


-- ── 2. Actualizar get_pending_call_alerts para exponer tipo_cliente ───────────
CREATE OR REPLACE FUNCTION get_pending_call_alerts(
  p_vendedor     text DEFAULT NULL,
  p_nivel_minimo text DEFAULT 'proximo'
)
RETURNS TABLE (
  nombre_fantasia text, vendedor_actual text, score numeric, segmento text,
  alert_level text, dias_sin_compra int, ciclo_promedio_dias int,
  porcentaje_ciclo_vencido numeric, dias_vencido int,
  siguiente_compra_estimada date, revenue_total numeric, litros_totales numeric,
  tipo_cliente text   -- ← campo nuevo
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    nombre_fantasia, vendedor_actual, score, segmento, alert_level,
    dias_sin_compra, ciclo_promedio_dias,
    ROUND((dias_sin_compra::float / NULLIF(ciclo_promedio_dias,0) * 100)::numeric, 1)
      AS porcentaje_ciclo_vencido,
    GREATEST(0, dias_sin_compra - COALESCE(ciclo_promedio_dias, 0)) AS dias_vencido,
    siguiente_compra_estimada, revenue_total, litros_totales,
    tipo_cliente
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

GRANT EXECUTE ON FUNCTION get_pending_call_alerts TO anon, authenticated;


-- ── 3. Actualizar get_client_scores para exponer tipo_cliente ─────────────────
CREATE OR REPLACE FUNCTION get_client_scores(
  p_vendedor     text    DEFAULT NULL,
  p_min_score    numeric DEFAULT 0,
  p_min_segmento text    DEFAULT NULL
)
RETURNS TABLE (
  nombre_fantasia text, vendedor_actual text, score numeric, segmento text,
  alert_level text, confianza_score text, litros_totales numeric,
  revenue_total numeric, total_pedidos bigint, pedidos_por_mes numeric,
  ciclo_promedio_dias int, dias_sin_compra int, siguiente_compra_estimada date,
  tipo_cliente text   -- ← campo nuevo
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


-- ── Verificación rápida ───────────────────────────────────────────────────────
-- Ejecuta esto para ver la distribución de tipos:
SELECT tipo_cliente, COUNT(*) AS clientes
FROM client_scores
GROUP BY tipo_cliente
ORDER BY clientes DESC;

-- =============================================================================
-- MISIONES V3 — "Activo" = compró en los últimos 3 meses (90 días)
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- CAMBIO CENTRAL:
--   Antes:  activo/inactivo se derivaba del ciclo (dias_sin_compra > ciclo×2.5)
--   Ahora:  REGLA DE NEGOCIO simple y explícita →
--             • inactivo  = no compra hace MÁS de 90 días (3 meses)
--             • activo    = compró dentro de los últimos 90 días
--   Las misiones ya filtran tipo_cliente <> 'inactivo', así que con este
--   cambio las misiones SOLO apuntan a clientes vivos (rotación reciente).
--
-- Solo se reemplaza la VIEW client_scores (mismas columnas, misma estructura),
-- por lo que NO hace falta tocar funciones. Seguro de re-ejecutar.
-- =============================================================================

-- Umbral de actividad, en días. 90 = 3 meses. Cámbialo aquí si algún día
-- quieres 60 o 120; todo lo demás lo hereda automáticamente.
-- (Postgres no permite variables en una VIEW, así que va escrito como 90.)

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

  -- ── tipo_cliente — REGLA DE 3 MESES ────────────────────────────────────────
  --   inactivo : última compra hace MÁS de 90 días  → fuera de misiones
  --   nuevo    : 1-2 pedidos y se incorporó hace ≤90 días (compró reciente)
  --   temporal : <4 pedidos pero compró dentro de 90 días (patrón aún no fijo)
  --   activo   : compró dentro de 90 días y ya tiene historial regular
  CASE
    WHEN dias_sin_compra > 90                                  THEN 'inactivo'
    WHEN total_pedidos <= 2
      AND primera_compra >= CURRENT_DATE - INTERVAL '90 days'  THEN 'nuevo'
    WHEN total_pedidos < 4                                     THEN 'temporal'
    ELSE                                                            'activo'
  END                                                          AS tipo_cliente
FROM scored
ORDER BY score DESC;

GRANT SELECT ON client_scores TO anon, authenticated;


-- ── Verificación: distribución antes/después ──────────────────────────────────
SELECT tipo_cliente, COUNT(*) AS clientes
FROM client_scores
GROUP BY tipo_cliente
ORDER BY clientes DESC;

-- Cuántos clientes saldrán de misiones por la regla de 90 días:
SELECT COUNT(*) AS inactivos_por_90d
FROM client_scores
WHERE dias_sin_compra > 90;

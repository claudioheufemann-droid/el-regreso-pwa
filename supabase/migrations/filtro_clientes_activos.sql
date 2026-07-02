-- =============================================================================
-- FILTRO DE CLIENTES ACTIVOS EN MISIONES Y ALERTAS
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Problema anterior: get_pending_call_alerts incluía clientes que llevan
-- meses sin comprar y ya están perdidos, mezclándolos con clientes activos.
--
-- Criterios de "cliente activo con misión":
--   1. total_pedidos >= 3  → necesitamos al menos 2 gaps para tener un ciclo
--                            confiable (confianza_score != 'baja')
--   2. ciclo_promedio_dias IS NOT NULL → tiene patrón de compra calculable
--   3. dias_sin_compra <= ciclo_promedio_dias * 3 → no superó 3 ciclos completos
--      sin comprar; más allá de eso el cliente probablemente se fue y necesita
--      una estrategia de reactivación distinta, no una misión de contacto normal
-- =============================================================================

CREATE OR REPLACE FUNCTION get_pending_call_alerts(
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
  confianza_score           text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    nombre_fantasia,
    vendedor_actual,
    score,
    segmento,
    alert_level,
    dias_sin_compra,
    ciclo_promedio_dias,
    ROUND((dias_sin_compra::float / NULLIF(ciclo_promedio_dias, 0) * 100)::numeric, 1)
      AS porcentaje_ciclo_vencido,
    GREATEST(0, dias_sin_compra - COALESCE(ciclo_promedio_dias, 0))
      AS dias_vencido,
    siguiente_compra_estimada,
    revenue_total,
    litros_totales,
    total_pedidos,
    confianza_score
  FROM client_scores
  WHERE
    -- Filtro por vendedor
    (p_vendedor IS NULL OR vendedor_actual = p_vendedor)

    -- Solo niveles solicitados
    AND alert_level = ANY(
      CASE p_nivel_minimo
        WHEN 'critico' THEN ARRAY['critico']
        WHEN 'vencido' THEN ARRAY['vencido', 'critico']
        ELSE                ARRAY['proximo', 'vencido', 'critico']
      END
    )

    -- ── CLIENTES ACTIVOS ─────────────────────────────────────────────────────
    -- 1. Historial mínimo para ciclo confiable (≥3 pedidos = 2 gaps)
    AND total_pedidos >= 3

    -- 2. Tiene ciclo de compra definido
    AND ciclo_promedio_dias IS NOT NULL

    -- 3. No superó 3 ciclos completos sin comprar (más allá → cliente perdido)
    --    Ej: ciclo 30d → excluir si lleva >90d; ciclo 60d → excluir si >180d
    AND dias_sin_compra <= ciclo_promedio_dias * 3
    -- ─────────────────────────────────────────────────────────────────────────

  ORDER BY
    -- Primero por urgencia
    CASE alert_level
      WHEN 'critico' THEN 1
      WHEN 'vencido' THEN 2
      ELSE 3
    END,
    -- Dentro de cada nivel: los de mayor valor primero
    score DESC;
$$;

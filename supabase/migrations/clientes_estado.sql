-- =============================================================================
-- ESTADO DE CLIENTES: activo | inactivo | estacional
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
-- =============================================================================

-- 1. Tabla de estado
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes_estado (
  nombre_fantasia  text        PRIMARY KEY,
  estado           text        NOT NULL DEFAULT 'activo'
                               CHECK (estado IN ('activo','inactivo','estacional')),
  nota             text,
  updated_at       timestamptz DEFAULT now(),
  updated_by       text
);

ALTER TABLE clientes_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON clientes_estado
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON clientes_estado TO authenticated;


-- 2. Excluir inactivos de client_raw_metrics
--    (Los estacionales SÍ se incluyen — tienen historial real)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW client_raw_metrics AS
WITH order_dates AS (
  SELECT DISTINCT v.nombre_fantasia, v.vendedor_actual, v.fecha_pedido
  FROM ventas v
  WHERE v.nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(v.nombre_fantasia)
    -- Excluir incobrables
    AND NOT EXISTS (
      SELECT 1 FROM deudores d
      WHERE d.nombre_fantasia = v.nombre_fantasia
        AND d.tipo_cliente = 'Incobrable'
    )
    -- Excluir clientes marcados como inactivos
    AND NOT EXISTS (
      SELECT 1 FROM clientes_estado ce
      WHERE ce.nombre_fantasia = v.nombre_fantasia
        AND ce.estado = 'inactivo'
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
    ROUND(AVG(gap_dias))::int                    AS ciclo_promedio_dias,
    MIN(gap_dias)                                AS ciclo_minimo_dias,
    MAX(gap_dias)                                AS ciclo_maximo_dias,
    ROUND(STDDEV(gap_dias)::numeric, 1)          AS ciclo_std_dias
  FROM gaps
  WHERE gap_dias IS NOT NULL
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


-- 3. Actualizar get_pending_call_alerts
--    Excluir inactivos + estacionales de las alertas de contacto.
--    Criterios de cliente activo (misma lógica que filtro_clientes_activos.sql):
--      - total_pedidos >= 3
--      - ciclo_promedio_dias IS NOT NULL
--      - dias_sin_compra <= ciclo_promedio_dias * 3
--    Ahora además:
--      - No está marcado como 'inactivo' (ya excluido en client_raw_metrics)
--      - Si está marcado como 'estacional', se incluye pero con flag
-- -----------------------------------------------------------------------------
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
  confianza_score           text,
  estado_cliente            text    -- 'activo' | 'estacional' | NULL
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
    ROUND((cs.dias_sin_compra::float / NULLIF(cs.ciclo_promedio_dias, 0) * 100)::numeric, 1)
      AS porcentaje_ciclo_vencido,
    GREATEST(0, cs.dias_sin_compra - COALESCE(cs.ciclo_promedio_dias, 0))
      AS dias_vencido,
    cs.siguiente_compra_estimada,
    cs.revenue_total,
    cs.litros_totales,
    cs.total_pedidos,
    cs.confianza_score,
    COALESCE(ce.estado, 'activo') AS estado_cliente
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

    -- Solo clientes activos con historial confiable
    AND cs.total_pedidos >= 3
    AND cs.ciclo_promedio_dias IS NOT NULL
    AND cs.dias_sin_compra <= cs.ciclo_promedio_dias * 3

    -- Excluir explícitamente inactivos (doble seguridad)
    AND COALESCE(ce.estado, 'activo') <> 'inactivo'

  ORDER BY
    -- Estacionales al final dentro de cada nivel
    CASE COALESCE(ce.estado, 'activo') WHEN 'estacional' THEN 1 ELSE 0 END,
    CASE cs.alert_level WHEN 'critico' THEN 1 WHEN 'vencido' THEN 2 ELSE 3 END,
    cs.score DESC;
$$;

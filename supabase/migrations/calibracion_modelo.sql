-- =============================================================================
-- CALIBRACIÓN DEL MODELO DE CICLO — el bucle de mejora continua
-- Aplicar DESPUÉS de ciclo_estacional_v2.sql y ciclo_estacional_auto.sql.
--
-- Este archivo contiene:
--   1. calibracion_modelo      — factor global vigente + historial de ajustes
--   2. recalibrar_modelo()     — recalcula el factor con predicciones cerradas
--   3. client_raw_metrics      — definición FINAL (incluye estacionalidad
--                                automática + calibración)
--   4. client_scores + RPCs    — recreados tras el DROP CASCADE
--
-- ── Por qué hace falta calibrar ───────────────────────────────────────────────
-- La mediana de gaps es sistemáticamente MÁS CORTA que el gap real promedio:
-- la distribución tiene cola larga a la derecha (muchos ciclos cortos, algunos
-- muy largos). Backtest sobre 4.243 predicciones reales (2024-2026):
--
--   Método            Error abs.   Sesgo     Dentro de 7d
--   viejo (promedio)    11,33 d    -1,67 d      52,7 %
--   nuevo (mediana)     10,71 d    -3,65 d      55,2 %
--
-- El nuevo acierta más, pero se queda corto casi 4 días → avisaría "quiebre de
-- stock" antes de tiempo. Real 23,74 d vs predicho 20,10 d ⇒ factor 1,1814.
-- =============================================================================

CREATE TABLE IF NOT EXISTS calibracion_modelo (
  id           bigserial PRIMARY KEY,
  factor       numeric(6,4) NOT NULL,
  origen       text NOT NULL CHECK (origen IN ('backtest','produccion','manual')),
  n_muestras   int,
  sesgo_previo numeric(6,2),
  activo       boolean NOT NULL DEFAULT true,
  creado_at    timestamptz NOT NULL DEFAULT now(),
  nota         text
);

-- Sólo una calibración activa a la vez (el índice parcial lo garantiza).
CREATE UNIQUE INDEX IF NOT EXISTS idx_calibracion_activa
  ON calibracion_modelo (activo) WHERE activo;

ALTER TABLE calibracion_modelo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON calibracion_modelo;
CREATE POLICY "authenticated_all" ON calibracion_modelo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON calibracion_modelo TO authenticated;
GRANT SELECT ON calibracion_modelo TO anon;
GRANT USAGE, SELECT ON SEQUENCE calibracion_modelo_id_seq TO authenticated;

INSERT INTO calibracion_modelo (factor, origen, n_muestras, sesgo_previo, nota)
SELECT 1.1814, 'backtest', 4243, -3.65,
       'Semilla inicial: backtest 2024-2026 sobre gaps reales. Real 23,74d vs predicho 20,10d.'
WHERE NOT EXISTS (SELECT 1 FROM calibracion_modelo WHERE activo);

CREATE OR REPLACE FUNCTION _factor_calibracion() RETURNS numeric
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE((SELECT factor FROM calibracion_modelo WHERE activo LIMIT 1), 1.0);
$$;
GRANT EXECUTE ON FUNCTION _factor_calibracion TO anon, authenticated;


-- Recalibra desde datos de PRODUCCIÓN. Seguro de llamar en cualquier momento:
-- si no hay muestras suficientes no toca nada y explica por qué.
DROP FUNCTION IF EXISTS recalibrar_modelo(int);
DROP FUNCTION IF EXISTS recalibrar_modelo(int, boolean);

CREATE FUNCTION recalibrar_modelo(
  p_min_muestras int     DEFAULT 100,
  p_forzar       boolean DEFAULT false
)
RETURNS TABLE (aplicado boolean, factor_nuevo numeric, n int, sesgo numeric, motivo text)
LANGUAGE plpgsql AS $$
DECLARE
  v_n int; v_sesgo numeric; v_factor_ahora numeric;
  v_ajuste numeric; v_nuevo numeric; v_ciclo_prom numeric; v_edad interval;
BEGIN
  SELECT now() - creado_at INTO v_edad FROM calibracion_modelo WHERE activo LIMIT 1;

  -- El sync del ERP corre cada 15 min y llama a esta funcion. Sin este guard el
  -- factor se recalcularia 96 veces al dia sobre casi los mismos datos.
  IF NOT p_forzar AND v_edad IS NOT NULL AND v_edad < INTERVAL '7 days' THEN
    RETURN QUERY SELECT false, _factor_calibracion(), 0, NULL::numeric,
      format('Calibracion vigente tiene %s; se reajusta semanalmente.',
             CASE WHEN v_edad < INTERVAL '1 day'
                  THEN EXTRACT(HOUR FROM v_edad)::int::text || ' h'
                  ELSE EXTRACT(DAY FROM v_edad)::int::text || ' d' END);
    RETURN;
  END IF;

  SELECT COUNT(*), AVG(error_dias), AVG(ciclo_usado)
    INTO v_n, v_sesgo, v_ciclo_prom
  FROM predicciones_compra
  WHERE fecha_real IS NOT NULL
    -- Solo lo reciente: recalibrar con 2 anos de historia haria que el modelo
    -- deje de reaccionar a cambios de comportamiento de la cartera.
    AND cerrada_at >= now() - INTERVAL '180 days';

  IF v_n IS NULL OR v_n < p_min_muestras THEN
    RETURN QUERY SELECT false, _factor_calibracion(), COALESCE(v_n,0), v_sesgo,
      format('Solo %s predicciones cerradas (se necesitan %s)', COALESCE(v_n,0), p_min_muestras);
    RETURN;
  END IF;

  v_factor_ahora := _factor_calibracion();
  -- sesgo > 0 = compraron DESPUES de lo previsto -> alargar el ciclo.
  v_ajuste := 1 + (v_sesgo / NULLIF(v_ciclo_prom, 0));
  -- Promediar con el factor actual amortigua el ajuste: evita que un mes raro
  -- (una feria, un corte de produccion) sobrecorrija el modelo de golpe.
  v_nuevo  := ROUND(GREATEST(0.7, LEAST(1.6, (v_factor_ahora * v_ajuste + v_factor_ahora) / 2))::numeric, 4);

  IF ABS(v_nuevo - v_factor_ahora) < 0.01 THEN
    RETURN QUERY SELECT false, v_factor_ahora, v_n, ROUND(v_sesgo,2),
      'El factor vigente ya esta dentro del 1% del optimo; sin cambios.';
    RETURN;
  END IF;

  UPDATE calibracion_modelo SET activo = false WHERE activo;
  INSERT INTO calibracion_modelo (factor, origen, n_muestras, sesgo_previo, nota)
  VALUES (v_nuevo, 'produccion', v_n, ROUND(v_sesgo,2),
          format('Recalibrado desde %s predicciones cerradas (sesgo %s d, ciclo prom %s d)',
                 v_n, ROUND(v_sesgo,2), ROUND(v_ciclo_prom,1)));

  RETURN QUERY SELECT true, v_nuevo, v_n, ROUND(v_sesgo,2), 'Factor actualizado.'::text;
END;
$$;
GRANT EXECUTE ON FUNCTION recalibrar_modelo(int, boolean) TO authenticated, service_role;


-- =============================================================================
-- DEFINICIÓN FINAL de client_raw_metrics
-- ciclo final = mediana(últimos 8 gaps desestacionalizados)
--               × factor del mes proyectado
--               × factor de calibración global
-- =============================================================================
DROP VIEW IF EXISTS client_raw_metrics CASCADE;

CREATE VIEW client_raw_metrics AS
WITH order_dates AS (
  SELECT DISTINCT v.nombre_fantasia, v.vendedor_actual, v.fecha_pedido
  FROM ventas v
  WHERE v.nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT EXISTS (SELECT 1 FROM deudores d
                    WHERE d.nombre_fantasia = v.nombre_fantasia AND d.tipo_cliente = 'Incobrable')
    AND NOT EXISTS (SELECT 1 FROM clientes_estado ce
                    WHERE ce.nombre_fantasia = v.nombre_fantasia AND ce.estado = 'inactivo')
),
gaps AS (
  SELECT nombre_fantasia, fecha_pedido,
    EXTRACT(MONTH FROM fecha_pedido)::int AS mes,
    (fecha_pedido - LAG(fecha_pedido) OVER (
      PARTITION BY nombre_fantasia ORDER BY fecha_pedido))::int AS gap_dias
  FROM order_dates
),
gaps_validos AS (
  SELECT g.*, ROW_NUMBER() OVER (PARTITION BY g.nombre_fantasia ORDER BY g.fecha_pedido DESC) AS rn
  FROM gaps g WHERE g.gap_dias BETWEEN 1 AND 180
),
gaps_norm AS (
  SELECT gv.nombre_fantasia, gv.gap_dias, gv.rn,
         gv.gap_dias / COALESCE(ec.factor_ciclo, 1.0) AS gap_norm
  FROM gaps_validos gv
  LEFT JOIN estacionalidad_ciclo ec ON ec.mes = gv.mes
),
gap_stats AS (
  SELECT nombre_fantasia,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_norm) FILTER (WHERE rn <= 8))::int AS ciclo_base_dias,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_norm))::int AS ciclo_mediana_historica,
    ROUND(AVG(gap_dias))::int           AS ciclo_promedio_legacy,
    MIN(gap_dias)                       AS ciclo_minimo_dias,
    MAX(gap_dias)                       AS ciclo_maximo_dias,
    ROUND(STDDEV(gap_dias)::numeric, 1) AS ciclo_std_dias,
    COUNT(*) FILTER (WHERE rn <= 8)     AS gaps_recientes,
    COUNT(*)                            AS gaps_totales
  FROM gaps_norm GROUP BY nombre_fantasia
),
aggregated AS (
  SELECT od.nombre_fantasia, od.vendedor_actual,
    COUNT(*) AS total_pedidos, SUM(v.litros) AS litros_totales,
    SUM(v.total_sin_impuesto) AS revenue_total,
    MIN(od.fecha_pedido) AS primera_compra, MAX(od.fecha_pedido) AS ultima_compra,
    (CURRENT_DATE - MAX(od.fecha_pedido))::int AS dias_sin_compra,
    GREATEST(1, ROUND((MAX(od.fecha_pedido) - MIN(od.fecha_pedido))::float / 30.4375)) AS meses_activo
  FROM order_dates od
  JOIN ventas v ON v.nombre_fantasia = od.nombre_fantasia
               AND v.fecha_pedido    = od.fecha_pedido
               AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY od.nombre_fantasia, od.vendedor_actual
),
base AS (
  SELECT a.*,
    g.ciclo_base_dias, g.ciclo_mediana_historica, g.ciclo_promedio_legacy,
    g.ciclo_minimo_dias, g.ciclo_maximo_dias, g.ciclo_std_dias,
    g.gaps_recientes, g.gaps_totales,
    -- El marcado manual del vendedor manda sobre la detección automática.
    CASE WHEN ce.estado = 'estacional' THEN true
         WHEN ce.estado IS NOT NULL    THEN false
         ELSE COALESCE(ea.es_estacional_auto, false) END       AS es_estacional,
    (ce.estado = 'estacional')                                 AS estacional_manual,
    COALESCE(g.ciclo_base_dias, g.ciclo_mediana_historica, 30) AS ciclo_base_efectivo
  FROM aggregated a
  LEFT JOIN gap_stats g                     ON g.nombre_fantasia  = a.nombre_fantasia
  LEFT JOIN clientes_estado ce              ON ce.nombre_fantasia = a.nombre_fantasia
  LEFT JOIN clientes_estacionalidad_auto ea ON ea.nombre_fantasia = a.nombre_fantasia
),
proyectado AS (
  SELECT b.*,
    -- Mes en que caería la próxima compra sin estacionalidad. Una sola
    -- iteración basta para elegir el factor correcto salvo en el borde de mes.
    EXTRACT(MONTH FROM (b.ultima_compra + (b.ciclo_base_efectivo || ' days')::interval))::int AS mes_proyectado
  FROM base b
),
final AS (
  SELECT p.*,
    -- Para clientes de temporada se DUPLICA la amplitud estacional: su ciclo
    -- se estira/encoge el doble que el del cliente promedio.
    CASE WHEN p.es_estacional
      THEN GREATEST(0.5, LEAST(2.0, 1 + (COALESCE(ec.factor_ciclo, 1.0) - 1) * 2.0))
      ELSE COALESCE(ec.factor_ciclo, 1.0) END AS factor_estacional,
    _factor_calibracion()                     AS factor_calibracion
  FROM proyectado p
  LEFT JOIN estacionalidad_ciclo ec ON ec.mes = p.mes_proyectado
),
ciclo AS (
  SELECT f.*,
    GREATEST(1, ROUND(f.ciclo_base_efectivo * f.factor_estacional * f.factor_calibracion))::int AS ciclo_final
  FROM final f
)
SELECT
  c.nombre_fantasia, c.vendedor_actual, c.total_pedidos, c.litros_totales,
  c.revenue_total, c.primera_compra, c.ultima_compra, c.dias_sin_compra, c.meses_activo,
  ROUND((c.total_pedidos::float / c.meses_activo)::numeric, 2) AS pedidos_por_mes,
  ROUND((c.litros_totales / c.total_pedidos)::numeric, 2)      AS litros_por_pedido,
  ROUND((c.revenue_total  / c.total_pedidos)::numeric, 0)      AS revenue_por_pedido,
  -- Nombre conservado por compatibilidad: ya NO es un promedio simple.
  c.ciclo_final                                                AS ciclo_promedio_dias,
  c.ciclo_base_efectivo                                        AS ciclo_base_dias,
  c.ciclo_promedio_legacy, c.ciclo_minimo_dias, c.ciclo_maximo_dias, c.ciclo_std_dias,
  c.gaps_recientes, c.gaps_totales,
  ROUND(c.factor_estacional, 3)                                AS factor_estacional,
  ROUND(c.factor_calibracion, 4)                               AS factor_calibracion,
  c.es_estacional,
  COALESCE(c.estacional_manual, false)                         AS estacional_manual,
  -- SOLO para clientes de temporada (ver ciclo_estacional_auto.sql).
  (c.es_estacional AND c.factor_estacional > 1.15)             AS temporada_baja,
  GREATEST(0, c.ciclo_final - c.dias_sin_compra)               AS dias_para_siguiente,
  (c.ultima_compra + (c.ciclo_final || ' days')::interval)::date AS siguiente_compra_estimada
FROM ciclo c;

GRANT SELECT ON client_raw_metrics TO anon, authenticated;


-- =============================================================================
-- client_scores + RPCs (recreados tras el DROP CASCADE de arriba)
-- =============================================================================
DROP VIEW IF EXISTS client_scores CASCADE;

CREATE VIEW client_scores AS
WITH ranked AS (
  SELECT *,
    PERCENT_RANK() OVER (ORDER BY litros_totales)   AS pct_volumen,
    PERCENT_RANK() OVER (ORDER BY pedidos_por_mes)  AS pct_frecuencia,
    PERCENT_RANK() OVER (ORDER BY revenue_total)    AS pct_revenue,
    CASE
      WHEN ciclo_promedio_dias IS NULL THEN 'sin_historial'
      -- Un cliente de temporada, fuera de temporada, no escala a 'critico':
      -- que no compre ahora es su patrón normal, no una urgencia.
      WHEN dias_sin_compra >= ROUND(ciclo_promedio_dias * 1.5)
        THEN CASE WHEN temporada_baja THEN 'vencido' ELSE 'critico' END
      WHEN dias_sin_compra >= ciclo_promedio_dias              THEN 'vencido'
      WHEN dias_sin_compra >= ROUND(ciclo_promedio_dias * 0.8) THEN 'proximo'
      ELSE 'ok'
    END AS alert_level
  FROM client_raw_metrics
),
scored AS (
  SELECT *,
    (0.35 * pct_volumen + 0.30 * pct_frecuencia + 0.35 * pct_revenue) AS score_raw,
    CASE alert_level WHEN 'critico' THEN 0.90 WHEN 'vencido' THEN 0.95 ELSE 1.00 END AS recency_factor,
    CASE WHEN total_pedidos >= 12 THEN 'alta' WHEN total_pedidos >= 4 THEN 'media' ELSE 'baja' END AS confianza_score
  FROM ranked
)
SELECT
  nombre_fantasia, vendedor_actual,
  LEAST(100, GREATEST(0, ROUND((score_raw * recency_factor * 100)::numeric, 1)))::numeric(5,1) AS score,
  ROUND((pct_volumen    * 100)::numeric, 1) AS score_volumen,
  ROUND((pct_frecuencia * 100)::numeric, 1) AS score_frecuencia,
  ROUND((pct_revenue    * 100)::numeric, 1) AS score_revenue,
  recency_factor, confianza_score,
  CASE
    WHEN ROUND(score_raw * recency_factor * 100) >= 80 THEN 'A'
    WHEN ROUND(score_raw * recency_factor * 100) >= 60 THEN 'B'
    WHEN ROUND(score_raw * recency_factor * 100) >= 40 THEN 'C'
    WHEN ROUND(score_raw * recency_factor * 100) >= 20 THEN 'D'
    ELSE 'E'
  END AS segmento,
  litros_totales, revenue_total, total_pedidos,
  litros_por_pedido, revenue_por_pedido, pedidos_por_mes,
  meses_activo, primera_compra, ultima_compra,
  alert_level, dias_sin_compra, ciclo_promedio_dias,
  ciclo_base_dias, ciclo_promedio_legacy, factor_estacional, factor_calibracion,
  es_estacional, estacional_manual, temporada_baja, gaps_recientes,
  ciclo_std_dias, dias_para_siguiente, siguiente_compra_estimada
FROM scored
ORDER BY score DESC;

GRANT SELECT ON client_scores TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_client_scores(
  p_vendedor text DEFAULT NULL, p_min_score numeric DEFAULT 0, p_min_segmento text DEFAULT NULL
)
RETURNS TABLE (
  nombre_fantasia text, vendedor_actual text, score numeric, segmento text,
  alert_level text, confianza_score text, litros_totales numeric,
  revenue_total numeric, total_pedidos bigint, pedidos_por_mes numeric,
  ciclo_promedio_dias int, dias_sin_compra int, siguiente_compra_estimada date,
  ultima_compra date, es_estacional boolean, temporada_baja boolean,
  factor_estacional numeric, ciclo_base_dias int
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nombre_fantasia, vendedor_actual, score, segmento, alert_level,
         confianza_score, litros_totales, revenue_total, total_pedidos,
         pedidos_por_mes, ciclo_promedio_dias, dias_sin_compra, siguiente_compra_estimada,
         ultima_compra, es_estacional, temporada_baja, factor_estacional, ciclo_base_dias
  FROM client_scores
  WHERE (p_vendedor IS NULL OR vendedor_actual = p_vendedor)
    AND score >= p_min_score
    AND (p_min_segmento IS NULL OR segmento <= p_min_segmento)
  ORDER BY score DESC;
$$;

CREATE OR REPLACE FUNCTION get_pending_call_alerts(
  p_vendedor text DEFAULT NULL, p_nivel_minimo text DEFAULT 'proximo'
)
RETURNS TABLE (
  nombre_fantasia text, vendedor_actual text, score numeric, segmento text,
  alert_level text, dias_sin_compra int, ciclo_promedio_dias int,
  porcentaje_ciclo_vencido numeric, dias_vencido int,
  siguiente_compra_estimada date, revenue_total numeric, litros_totales numeric,
  total_pedidos bigint, confianza_score text, estado_cliente text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT cs.nombre_fantasia, cs.vendedor_actual, cs.score, cs.segmento, cs.alert_level,
    cs.dias_sin_compra, cs.ciclo_promedio_dias,
    ROUND((cs.dias_sin_compra::float / NULLIF(cs.ciclo_promedio_dias, 0) * 100)::numeric, 1),
    GREATEST(0, cs.dias_sin_compra - COALESCE(cs.ciclo_promedio_dias, 0)),
    cs.siguiente_compra_estimada, cs.revenue_total, cs.litros_totales,
    cs.total_pedidos, cs.confianza_score, COALESCE(ce.estado, 'activo')
  FROM client_scores cs
  LEFT JOIN clientes_estado ce ON ce.nombre_fantasia = cs.nombre_fantasia
  WHERE (p_vendedor IS NULL OR cs.vendedor_actual = p_vendedor)
    AND cs.alert_level = ANY(
      CASE p_nivel_minimo
        WHEN 'critico' THEN ARRAY['critico']
        WHEN 'vencido' THEN ARRAY['vencido', 'critico']
        ELSE                ARRAY['proximo', 'vencido', 'critico'] END)
    AND cs.total_pedidos >= 3
    AND cs.ciclo_promedio_dias IS NOT NULL
    AND cs.dias_sin_compra <= cs.ciclo_promedio_dias * 3
    AND COALESCE(ce.estado, 'activo') <> 'inactivo'
    -- Un cliente fuera de su temporada no es una urgencia de contacto.
    AND NOT cs.temporada_baja
  ORDER BY
    CASE COALESCE(ce.estado, 'activo') WHEN 'estacional' THEN 1 ELSE 0 END,
    CASE cs.alert_level WHEN 'critico' THEN 1 WHEN 'vencido' THEN 2 ELSE 3 END,
    cs.score DESC;
$$;

CREATE OR REPLACE FUNCTION get_portfolio_summary(p_vendedor text DEFAULT NULL)
RETURNS TABLE (
  vendedor_actual text, total_clientes bigint, score_promedio numeric,
  clientes_segmento_a bigint, clientes_segmento_b bigint, clientes_segmento_c bigint,
  clientes_en_riesgo bigint, clientes_criticos bigint,
  litros_totales numeric, revenue_total numeric, ciclo_promedio_cartera numeric
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT cs.vendedor_actual, COUNT(*), ROUND(AVG(cs.score), 1),
    COUNT(*) FILTER (WHERE cs.segmento = 'A'),
    COUNT(*) FILTER (WHERE cs.segmento = 'B'),
    COUNT(*) FILTER (WHERE cs.segmento = 'C'),
    COUNT(*) FILTER (WHERE cs.alert_level IN ('vencido','critico')),
    COUNT(*) FILTER (WHERE cs.alert_level = 'critico'),
    ROUND(SUM(cs.litros_totales), 1), ROUND(SUM(cs.revenue_total), 0),
    ROUND(SUM(cs.ciclo_promedio_dias * cs.score) / NULLIF(SUM(cs.score),0), 1)
  FROM client_scores cs
  WHERE (p_vendedor IS NULL OR cs.vendedor_actual = p_vendedor)
    AND cs.ciclo_promedio_dias IS NOT NULL
  GROUP BY cs.vendedor_actual ORDER BY 10 DESC;
$$;

GRANT EXECUTE ON FUNCTION get_client_scores       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_pending_call_alerts TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_portfolio_summary   TO anon, authenticated;

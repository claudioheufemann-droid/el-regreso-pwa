-- NOTA (26-ago-2026): este archivo es la PRIMERA version de la migracion.
-- Lo efectivamente aplicado en produccion incluye tres cambios posteriores,
-- en los archivos hermanos de esta carpeta:
--   * ciclo_estacional_auto.sql        -> deteccion automatica de clientes de
--     temporada (clientes_estacionalidad_auto) + temporada_baja acotado SOLO a
--     ellos (con el criterio original se marcaban 487 de 765 clientes en
--     temporada baja y se vaciaba la lista de llamados del vendedor).
--   * calibracion_modelo.sql           -> tabla calibracion_modelo + funcion
--     recalibrar_modelo(): corrige el sesgo del modelo (-3,65 dias) y se
--     reajusta sola con las predicciones ya cerradas.
-- El orden de aplicacion correcto es: este archivo, luego los dos anteriores.

-- =============================================================================
-- CICLO DE COMPRA v2 — mediana reciente + ajuste estacional + tracking
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Reemplaza el cálculo de `ciclo_promedio_dias` que usaba AVG() sobre TODO el
-- historial. Tres problemas que corrige (medidos sobre datos reales, ago 2026):
--
--   a) AVG se iba a las nubes con una sola pausa larga (vacaciones, cierre
--      temporal). Promedio global 21d vs mediana 15d: ~40% inflado.
--   b) Un pedido de hace 2 años pesaba igual que el del mes pasado, así que
--      un cambio de ritmo tardaba años en reflejarse.
--   c) Ignoraba la estacionalidad, que en cerveza es fuerte: enero 32.771 L
--      vs septiembre 11.592 L (2,8x). El ciclo medido en verano (mediana 15d)
--      se aplicaba también en invierno (mediana real 21d), así que los
--      clientes de temporada aparecían en rojo por simplemente estar en su
--      temporada baja.
--
-- Estrategia: desestacionalizar cada gap con el índice del mes en que ocurrió,
-- sacar la MEDIANA de los últimos 8 gaps (robusta + reciente), y re-estacionalizar
-- con el índice del mes en que caerá la próxima compra.
-- =============================================================================


-- =============================================================================
-- 1. VIEW: estacionalidad_ciclo
--    Índice mensual del CICLO de compra (no del volumen: son cosas distintas —
--    en temporada alta se compra más seguido Y más cantidad, y acá sólo
--    interesa la frecuencia).
--
--    factor_ciclo > 1  → en ese mes se compra MÁS ESPACIADO que el promedio
--    factor_ciclo < 1  → en ese mes se compra MÁS SEGUIDO
-- =============================================================================
CREATE OR REPLACE VIEW estacionalidad_ciclo AS
WITH od AS (
  SELECT DISTINCT nombre_fantasia, fecha_pedido
  FROM ventas
  WHERE nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(nombre_fantasia)
    -- 3 años: suficiente para promediar el ciclo estacional sin arrastrar
    -- épocas con un mix de clientes completamente distinto.
    AND fecha_pedido >= CURRENT_DATE - INTERVAL '3 years'
),
g AS (
  SELECT
    EXTRACT(MONTH FROM fecha_pedido)::int AS mes,
    (fecha_pedido - LAG(fecha_pedido) OVER (
      PARTITION BY nombre_fantasia ORDER BY fecha_pedido
    ))::int AS gap
  FROM od
),
validos AS (
  -- >180d no es "ciclo", es una reactivación tras dormancia.
  SELECT mes, gap FROM g WHERE gap BETWEEN 1 AND 180
),
global AS (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) AS mediana_global FROM validos
),
por_mes AS (
  SELECT mes,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) AS mediana_mes,
         COUNT(*) AS n
  FROM validos GROUP BY mes
)
SELECT
  m.mes,
  m.n                                       AS observaciones,
  ROUND(m.mediana_mes::numeric, 1)          AS mediana_gap_mes,
  ROUND(gl.mediana_global::numeric, 1)      AS mediana_gap_global,
  -- Con <30 observaciones el mes no es estadísticamente confiable → factor
  -- neutro (1.0) en vez de un número inventado con 3 datos.
  -- Cota [0.6, 1.6]: evita que un mes raro distorsione todas las proyecciones.
  CASE
    WHEN m.n < 30 THEN 1.000
    ELSE ROUND(LEAST(1.6, GREATEST(0.6, m.mediana_mes / NULLIF(gl.mediana_global, 0)))::numeric, 3)
  END                                       AS factor_ciclo
FROM por_mes m CROSS JOIN global gl
ORDER BY m.mes;

GRANT SELECT ON estacionalidad_ciclo TO anon, authenticated;


-- =============================================================================
-- 2. VIEW: client_raw_metrics (reemplaza la versión de clientes_estado.sql)
--    Mantiene las mismas exclusiones (incobrables + inactivos) y las mismas
--    columnas de salida, para no romper nada aguas abajo. `ciclo_promedio_dias`
--    ahora expone el CICLO AJUSTADO (el que hay que usar para proyectar); el
--    valor viejo queda disponible como `ciclo_promedio_legacy` para comparar.
-- =============================================================================
CREATE OR REPLACE VIEW client_raw_metrics AS
WITH order_dates AS (
  SELECT DISTINCT v.nombre_fantasia, v.vendedor_actual, v.fecha_pedido
  FROM ventas v
  WHERE v.nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT EXISTS (
      SELECT 1 FROM deudores d
      WHERE d.nombre_fantasia = v.nombre_fantasia AND d.tipo_cliente = 'Incobrable'
    )
    AND NOT EXISTS (
      SELECT 1 FROM clientes_estado ce
      WHERE ce.nombre_fantasia = v.nombre_fantasia AND ce.estado = 'inactivo'
    )
),
gaps AS (
  SELECT
    nombre_fantasia,
    fecha_pedido,
    EXTRACT(MONTH FROM fecha_pedido)::int AS mes,
    (fecha_pedido - LAG(fecha_pedido) OVER (
      PARTITION BY nombre_fantasia ORDER BY fecha_pedido
    ))::int AS gap_dias
  FROM order_dates
),
gaps_validos AS (
  SELECT g.*,
         ROW_NUMBER() OVER (PARTITION BY g.nombre_fantasia ORDER BY g.fecha_pedido DESC) AS rn
  FROM gaps g
  WHERE g.gap_dias BETWEEN 1 AND 180
),
gaps_norm AS (
  SELECT
    gv.nombre_fantasia, gv.gap_dias, gv.rn,
    -- Desestacionalizado: lo que ese gap "habría sido" en un mes promedio.
    -- Así los gaps de enero y de septiembre son comparables entre sí.
    gv.gap_dias / COALESCE(ec.factor_ciclo, 1.0) AS gap_norm
  FROM gaps_validos gv
  LEFT JOIN estacionalidad_ciclo ec ON ec.mes = gv.mes
),
gap_stats AS (
  SELECT
    nombre_fantasia,
    -- Ciclo base: MEDIANA de los últimos 8 gaps desestacionalizados.
    -- Mediana (no promedio) = inmune a un outlier; últimos 8 = sigue el ritmo
    -- actual del cliente en vez de todo su historial.
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_norm)
          FILTER (WHERE rn <= 8))::int                        AS ciclo_base_dias,
    ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_norm))::int AS ciclo_mediana_historica,
    ROUND(AVG(gap_dias))::int                                 AS ciclo_promedio_legacy,
    MIN(gap_dias)                                             AS ciclo_minimo_dias,
    MAX(gap_dias)                                             AS ciclo_maximo_dias,
    ROUND(STDDEV(gap_dias)::numeric, 1)                       AS ciclo_std_dias,
    COUNT(*) FILTER (WHERE rn <= 8)                           AS gaps_recientes,
    COUNT(*)                                                  AS gaps_totales
  FROM gaps_norm
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
),
base AS (
  SELECT
    a.*,
    g.ciclo_base_dias, g.ciclo_mediana_historica, g.ciclo_promedio_legacy,
    g.ciclo_minimo_dias, g.ciclo_maximo_dias, g.ciclo_std_dias,
    g.gaps_recientes, g.gaps_totales,
    COALESCE(ce.estado, 'activo') = 'estacional'                   AS es_estacional,
    -- Ciclo base efectivo: últimos 8 gaps → mediana histórica → 30d por defecto
    COALESCE(g.ciclo_base_dias, g.ciclo_mediana_historica, 30)     AS ciclo_base_efectivo
  FROM aggregated a
  LEFT JOIN gap_stats g       ON g.nombre_fantasia  = a.nombre_fantasia
  LEFT JOIN clientes_estado ce ON ce.nombre_fantasia = a.nombre_fantasia
),
proyectado AS (
  SELECT
    b.*,
    -- Mes en que caería la próxima compra si no hubiera estacionalidad.
    -- Una sola iteración: basta para elegir el factor correcto salvo en el
    -- borde exacto de mes, donde el error es de días.
    EXTRACT(MONTH FROM (b.ultima_compra + (b.ciclo_base_efectivo || ' days')::interval))::int AS mes_proyectado
  FROM base b
),
final AS (
  SELECT
    p.*,
    -- Factor a aplicar. Para clientes marcados 'estacional' se DUPLICA la
    -- amplitud: su ciclo se estira/encoge el doble que el del cliente
    -- promedio, que es justamente lo que significa ser de temporada.
    CASE
      WHEN p.es_estacional
        THEN GREATEST(0.5, LEAST(2.0, 1 + (COALESCE(ec.factor_ciclo, 1.0) - 1) * 2.0))
      ELSE COALESCE(ec.factor_ciclo, 1.0)
    END AS factor_estacional
  FROM proyectado p
  LEFT JOIN estacionalidad_ciclo ec ON ec.mes = p.mes_proyectado
)
SELECT
  f.nombre_fantasia,
  f.vendedor_actual,
  f.total_pedidos,
  f.litros_totales,
  f.revenue_total,
  f.primera_compra,
  f.ultima_compra,
  f.dias_sin_compra,
  f.meses_activo,
  ROUND((f.total_pedidos::float / f.meses_activo)::numeric, 2)   AS pedidos_por_mes,
  ROUND((f.litros_totales / f.total_pedidos)::numeric, 2)        AS litros_por_pedido,
  ROUND((f.revenue_total  / f.total_pedidos)::numeric, 0)        AS revenue_por_pedido,
  -- ── Ciclo ────────────────────────────────────────────────────────────────
  -- ciclo_promedio_dias = ciclo AJUSTADO (nombre conservado: lo consumen
  -- misiones, ranking, alertas y la app; cambiarlo rompería todo eso).
  GREATEST(1, ROUND(f.ciclo_base_efectivo * f.factor_estacional))::int AS ciclo_promedio_dias,
  f.ciclo_base_efectivo                                          AS ciclo_base_dias,
  f.ciclo_promedio_legacy,
  f.ciclo_minimo_dias,
  f.ciclo_maximo_dias,
  f.ciclo_std_dias,
  f.gaps_recientes,
  f.gaps_totales,
  ROUND(f.factor_estacional, 3)                                  AS factor_estacional,
  f.es_estacional,
  -- Temporada baja: el mes proyectado alarga el ciclo >15%. La app lo usa para
  -- NO pintar en rojo a un cliente que simplemente está fuera de temporada.
  (f.factor_estacional > 1.15)                                   AS temporada_baja,
  GREATEST(0, GREATEST(1, ROUND(f.ciclo_base_efectivo * f.factor_estacional))::int - f.dias_sin_compra)
                                                                 AS dias_para_siguiente,
  (f.ultima_compra + (GREATEST(1, ROUND(f.ciclo_base_efectivo * f.factor_estacional))::int || ' days')::interval)::date
                                                                 AS siguiente_compra_estimada
FROM final f;

GRANT SELECT ON client_raw_metrics TO anon, authenticated;


-- =============================================================================
-- 3. VIEW: client_scores — se re-crea para exponer las columnas nuevas.
--    Único cambio de lógica: un cliente en TEMPORADA BAJA no escala a
--    'critico'; se queda en 'vencido' como mucho. Antes, estar fuera de
--    temporada bastaba para que apareciera como crítico y contaminara las
--    listas de urgencia del vendedor.
-- =============================================================================
DROP VIEW IF EXISTS client_scores CASCADE;
CREATE VIEW client_scores AS
WITH ranked AS (
  SELECT
    *,
    PERCENT_RANK() OVER (ORDER BY litros_totales)   AS pct_volumen,
    PERCENT_RANK() OVER (ORDER BY pedidos_por_mes)  AS pct_frecuencia,
    PERCENT_RANK() OVER (ORDER BY revenue_total)    AS pct_revenue,
    CASE
      WHEN ciclo_promedio_dias IS NULL                          THEN 'sin_historial'
      WHEN dias_sin_compra >= ROUND(ciclo_promedio_dias * 1.5)
        THEN CASE WHEN temporada_baja THEN 'vencido' ELSE 'critico' END
      WHEN dias_sin_compra >= ciclo_promedio_dias               THEN 'vencido'
      WHEN dias_sin_compra >= ROUND(ciclo_promedio_dias * 0.8)  THEN 'proximo'
      ELSE                                                           'ok'
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
  LEAST(100, GREATEST(0, ROUND((score_raw * recency_factor * 100)::numeric, 1)))::numeric(5,1) AS score,
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
  ciclo_base_dias, ciclo_promedio_legacy, factor_estacional,
  es_estacional, temporada_baja, gaps_recientes,
  ciclo_std_dias, dias_para_siguiente, siguiente_compra_estimada
FROM scored
ORDER BY score DESC;

GRANT SELECT ON client_scores TO anon, authenticated;


-- =============================================================================
-- 4. FUNCTIONS que dependían de client_scores (recreadas tras el DROP CASCADE)
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
  estado_cliente            text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    cs.nombre_fantasia, cs.vendedor_actual, cs.score, cs.segmento, cs.alert_level,
    cs.dias_sin_compra, cs.ciclo_promedio_dias,
    ROUND((cs.dias_sin_compra::float / NULLIF(cs.ciclo_promedio_dias, 0) * 100)::numeric, 1),
    GREATEST(0, cs.dias_sin_compra - COALESCE(cs.ciclo_promedio_dias, 0)),
    cs.siguiente_compra_estimada, cs.revenue_total, cs.litros_totales,
    cs.total_pedidos, cs.confianza_score,
    COALESCE(ce.estado, 'activo')
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
    AND cs.total_pedidos >= 3
    AND cs.ciclo_promedio_dias IS NOT NULL
    AND cs.dias_sin_compra <= cs.ciclo_promedio_dias * 3
    AND COALESCE(ce.estado, 'activo') <> 'inactivo'
    -- Un cliente fuera de temporada no es una urgencia de contacto.
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
  SELECT
    vendedor_actual,
    COUNT(*), ROUND(AVG(score), 1),
    COUNT(*) FILTER (WHERE segmento = 'A'),
    COUNT(*) FILTER (WHERE segmento = 'B'),
    COUNT(*) FILTER (WHERE segmento = 'C'),
    COUNT(*) FILTER (WHERE alert_level IN ('vencido','critico')),
    COUNT(*) FILTER (WHERE alert_level = 'critico'),
    ROUND(SUM(litros_totales), 1), ROUND(SUM(revenue_total), 0),
    ROUND(SUM(ciclo_promedio_dias * score) / NULLIF(SUM(score),0), 1)
  FROM client_scores
  WHERE (p_vendedor IS NULL OR vendedor_actual = p_vendedor)
    AND ciclo_promedio_dias IS NOT NULL
  GROUP BY vendedor_actual
  ORDER BY 10 DESC;
$$;

GRANT EXECUTE ON FUNCTION get_client_scores       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_pending_call_alerts TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_portfolio_summary   TO anon, authenticated;


-- =============================================================================
-- 5. TABLA: predicciones_compra — memoria del algoritmo
--    Sin esto no hay forma de saber si el modelo mejora o empeora: las vistas
--    se recalculan en cada consulta y no dejan rastro de qué se predijo ayer.
--    Se registra la predicción del día, y cuando el cliente efectivamente
--    compra se cierra con la fecha real y el error en días.
-- =============================================================================
CREATE TABLE IF NOT EXISTS predicciones_compra (
  id                bigserial PRIMARY KEY,
  nombre_fantasia   text NOT NULL,
  fecha_prediccion  date NOT NULL DEFAULT CURRENT_DATE,  -- cuándo se predijo
  fecha_estimada    date NOT NULL,                       -- para cuándo se predijo
  ultima_compra     date,
  ciclo_usado       int,
  ciclo_base        int,
  factor_estacional numeric(5,3),
  es_estacional     boolean DEFAULT false,
  -- Se rellenan al cerrar
  fecha_real        date,
  error_dias        int,          -- + = compró después de lo previsto
  cerrada_at        timestamptz,
  UNIQUE (nombre_fantasia, fecha_prediccion)
);

CREATE INDEX IF NOT EXISTS idx_predicciones_abiertas
  ON predicciones_compra (nombre_fantasia, fecha_estimada) WHERE fecha_real IS NULL;

ALTER TABLE predicciones_compra ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON predicciones_compra;
CREATE POLICY "authenticated_all" ON predicciones_compra
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON predicciones_compra TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE predicciones_compra_id_seq TO authenticated;


-- =============================================================================
-- 6. FUNCTION: actualizar_predicciones()
--    Idempotente — se puede llamar en cada sync del ERP (cada 15 min) sin
--    duplicar: una predicción por cliente por día (UNIQUE), y el cierre sólo
--    toca las que siguen abiertas.
-- =============================================================================
CREATE OR REPLACE FUNCTION actualizar_predicciones()
RETURNS TABLE (nuevas int, cerradas int)
LANGUAGE plpgsql AS $$
DECLARE
  v_nuevas  int := 0;
  v_cerradas int := 0;
BEGIN
  -- a) Cerrar las predicciones cuyo cliente ya compró después de haberla hecho.
  WITH abiertas AS (
    SELECT p.id, p.nombre_fantasia, p.fecha_prediccion, p.fecha_estimada
    FROM predicciones_compra p
    WHERE p.fecha_real IS NULL
  ),
  compras AS (
    SELECT a.id, a.fecha_estimada, MIN(v.fecha_pedido) AS primera_compra_post
    FROM abiertas a
    JOIN ventas v
      ON v.nombre_fantasia = a.nombre_fantasia
     AND v.fecha_pedido    > a.fecha_prediccion
    WHERE NOT _excluir_cliente(v.nombre_fantasia)
    GROUP BY a.id, a.fecha_estimada
  )
  UPDATE predicciones_compra p
  SET fecha_real  = c.primera_compra_post,
      error_dias  = (c.primera_compra_post - c.fecha_estimada)::int,
      cerrada_at  = now()
  FROM compras c
  WHERE p.id = c.id;
  GET DIAGNOSTICS v_cerradas = ROW_COUNT;

  -- b) Registrar la predicción vigente de hoy para cada cliente con historial.
  INSERT INTO predicciones_compra (
    nombre_fantasia, fecha_prediccion, fecha_estimada, ultima_compra,
    ciclo_usado, ciclo_base, factor_estacional, es_estacional
  )
  SELECT
    cs.nombre_fantasia, CURRENT_DATE, cs.siguiente_compra_estimada, cs.ultima_compra,
    cs.ciclo_promedio_dias, cs.ciclo_base_dias, cs.factor_estacional, cs.es_estacional
  FROM client_scores cs
  WHERE cs.siguiente_compra_estimada IS NOT NULL
    AND cs.ciclo_promedio_dias IS NOT NULL
    -- Sólo clientes con historial suficiente: predecir con 1-2 pedidos es ruido.
    AND cs.total_pedidos >= 3
  ON CONFLICT (nombre_fantasia, fecha_prediccion) DO NOTHING;
  GET DIAGNOSTICS v_nuevas = ROW_COUNT;

  RETURN QUERY SELECT v_nuevas, v_cerradas;
END;
$$;

GRANT EXECUTE ON FUNCTION actualizar_predicciones TO authenticated, service_role;


-- =============================================================================
-- 7. VIEW: precision_predicciones — el termómetro del algoritmo
--    error_dias > 0  → el cliente compró DESPUÉS de lo previsto (predecimos
--                      demasiado corto → la app grita "quiebre" antes de tiempo)
--    error_dias < 0  → compró ANTES (predecimos largo → llegamos tarde)
-- =============================================================================
CREATE OR REPLACE VIEW precision_predicciones AS
SELECT
  DATE_TRUNC('month', fecha_prediccion)::date            AS mes,
  es_estacional,
  COUNT(*)                                               AS n,
  ROUND(AVG(error_dias)::numeric, 1)                     AS sesgo_dias,
  ROUND(AVG(ABS(error_dias))::numeric, 1)                AS error_absoluto_dias,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ABS(error_dias))::numeric, 1)
                                                         AS error_mediano_dias,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(error_dias) <= 3)  / COUNT(*), 1) AS pct_dentro_3d,
  ROUND(100.0 * COUNT(*) FILTER (WHERE ABS(error_dias) <= 7)  / COUNT(*), 1) AS pct_dentro_7d
FROM predicciones_compra
WHERE fecha_real IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

GRANT SELECT ON precision_predicciones TO anon, authenticated;

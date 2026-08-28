-- ═══════════════════════════════════════════════════════════════════════════
-- client_raw_metrics: dejar de recalcularla en cada carga de pantalla
-- 2026-08-26
--
-- ⚠️ NO APLICADA TODAVÍA — pendiente del visto bueno de Claudio.
--
-- ─── El problema, medido ───────────────────────────────────────────────────
-- `client_scores` (que alimenta /ventas y /ventas/clientes) es una VIEW sobre
-- otra VIEW (`client_raw_metrics`), así que se recalcula ENTERA en cada carga
-- de pantalla. Medido contra esta base el 2026-08-26:
--
--     SELECT * FROM client_scores          →  3.759 ms   (766 filas)
--     SELECT * FROM estacionalidad_ciclo   →    813 ms   ( 12 filas)
--
-- Y `estacionalidad_ciclo` —12 filas, un factor por mes— se consulta DOS veces
-- dentro de client_raw_metrics (join por `gv.mes` y por `p.mes_proyectado`),
-- así que ~1,6 s de los 3,7 s son la misma tabla de 12 filas calculada dos
-- veces. El resto es el auto-join de `ventas` (51.000 filas) más un sort que
-- se va a disco.
--
-- La capa de scoring NO es el problema: medido con el resultado ya calculado,
-- los tres PERCENT_RANK sobre 766 filas son gratis.
--
-- ─── Por qué esto es urgente, no cosmético ─────────────────────────────────
-- Timeouts por rol en este proyecto:
--     anon           statement_timeout = 3s
--     authenticated  statement_timeout = 8s
--
-- Con 3,7 s de ejecución:
--   · Con el login DESACTIVADO (rol anon) la consulta SIEMPRE falla con
--     "canceling statement due to statement timeout". El código hace
--     `scoresRes.data ?? []`, así que el fallo es SILENCIOSO: las alertas de
--     /ventas ("N clientes llevan más de 30 días sin comprar", "N en riesgo")
--     simplemente no aparecen nunca, y nada avisa que se cayeron.
--   · Con el login activo (rol authenticated) sí alcanza, pero quedan ~4 s de
--     margen antes del timeout — y el costo crece con la tabla de ventas.
--
-- ─── La solución ──────────────────────────────────────────────────────────
-- Materializar la parte cara y CONSERVAR VIVA la parte que depende del día.
-- Es la distinción importante: `dias_sin_compra` cambia todos los días aunque
-- no haya ventas nuevas (es CURRENT_DATE - ultima_compra), así que materializar
-- client_raw_metrics entera congelaría justo el número que manda las alertas.
--
-- Acá se materializan las 25 columnas estables (agregados, ciclos, factores)
-- y las 2 que dependen de la fecha se derivan en vivo sobre el caché:
--     dias_sin_compra      = CURRENT_DATE - ultima_compra
--     dias_para_siguiente  = GREATEST(0, ciclo_promedio_dias - dias_sin_compra)
--
-- Resultado: `alert_level` y las alertas siguen siendo del día de hoy, exactas,
-- pero se leen de 766 filas ya calculadas en vez de reagregar 51.000.
--
-- La lógica de negocio NO se toca ni se transcribe: `client_metrics_calc` es
-- una copia literal del cuerpo actual de client_raw_metrics, tomada con
-- pg_get_viewdef(). Si mañana hay que cambiar una regla de ciclo o
-- estacionalidad, se cambia ahí, igual que antes.
--
-- ─── Cómo revertir ────────────────────────────────────────────────────────
--     CREATE OR REPLACE VIEW public.client_raw_metrics AS
--       SELECT * FROM public.client_metrics_calc;
--     DROP MATERIALIZED VIEW public.client_metrics_cache;
--     DROP VIEW public.client_metrics_calc;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Copia literal de la lógica actual, bajo otro nombre ────────────────
-- Cuerpo tomado tal cual de pg_get_viewdef('client_raw_metrics') el
-- 2026-08-26. No se cambió una sola regla.
CREATE VIEW public.client_metrics_calc AS
 WITH order_dates AS (
         SELECT DISTINCT v.nombre_fantasia,
            v.vendedor_actual,
            v.fecha_pedido
           FROM ventas v
          WHERE v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia) AND NOT (EXISTS ( SELECT 1
                   FROM deudores d
                  WHERE d.nombre_fantasia = v.nombre_fantasia AND d.tipo_cliente = 'Incobrable'::text)) AND NOT (EXISTS ( SELECT 1
                   FROM clientes_estado ce
                  WHERE ce.nombre_fantasia = v.nombre_fantasia AND ce.estado = 'inactivo'::text))
        ), gaps AS (
         SELECT order_dates.nombre_fantasia,
            order_dates.fecha_pedido,
            EXTRACT(month FROM order_dates.fecha_pedido)::integer AS mes,
            order_dates.fecha_pedido - lag(order_dates.fecha_pedido) OVER (PARTITION BY order_dates.nombre_fantasia ORDER BY order_dates.fecha_pedido) AS gap_dias
           FROM order_dates
        ), gaps_validos AS (
         SELECT g.nombre_fantasia,
            g.fecha_pedido,
            g.mes,
            g.gap_dias,
            row_number() OVER (PARTITION BY g.nombre_fantasia ORDER BY g.fecha_pedido DESC) AS rn
           FROM gaps g
          WHERE g.gap_dias >= 1 AND g.gap_dias <= 180
        ), gaps_norm AS (
         SELECT gv.nombre_fantasia,
            gv.gap_dias,
            gv.rn,
            gv.gap_dias::numeric / COALESCE(ec.factor_ciclo, 1.0) AS gap_norm
           FROM gaps_validos gv
             LEFT JOIN estacionalidad_ciclo ec ON ec.mes = gv.mes
        ), gap_stats AS (
         SELECT gaps_norm.nombre_fantasia,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (gaps_norm.gap_norm::double precision)) FILTER (WHERE gaps_norm.rn <= 8))::integer AS ciclo_base_dias,
            round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (gaps_norm.gap_norm::double precision)))::integer AS ciclo_mediana_historica,
            round(avg(gaps_norm.gap_dias))::integer AS ciclo_promedio_legacy,
            min(gaps_norm.gap_dias) AS ciclo_minimo_dias,
            max(gaps_norm.gap_dias) AS ciclo_maximo_dias,
            round(stddev(gaps_norm.gap_dias), 1) AS ciclo_std_dias,
            count(*) FILTER (WHERE gaps_norm.rn <= 8) AS gaps_recientes,
            count(*) AS gaps_totales
           FROM gaps_norm
          GROUP BY gaps_norm.nombre_fantasia
        ), aggregated AS (
         SELECT od.nombre_fantasia,
            od.vendedor_actual,
            count(*) AS total_pedidos,
            sum(v.litros) AS litros_totales,
            sum(v.total_sin_impuesto) AS revenue_total,
            min(od.fecha_pedido) AS primera_compra,
            max(od.fecha_pedido) AS ultima_compra,
            CURRENT_DATE - max(od.fecha_pedido) AS dias_sin_compra,
            GREATEST(1::double precision, round((max(od.fecha_pedido) - min(od.fecha_pedido))::double precision / 30.4375::double precision)) AS meses_activo
           FROM order_dates od
             JOIN ventas v ON v.nombre_fantasia = od.nombre_fantasia AND v.fecha_pedido = od.fecha_pedido AND NOT _excluir_cliente(v.nombre_fantasia)
          GROUP BY od.nombre_fantasia, od.vendedor_actual
        ), base AS (
         SELECT a.nombre_fantasia,
            a.vendedor_actual,
            a.total_pedidos,
            a.litros_totales,
            a.revenue_total,
            a.primera_compra,
            a.ultima_compra,
            a.dias_sin_compra,
            a.meses_activo,
            g.ciclo_base_dias,
            g.ciclo_mediana_historica,
            g.ciclo_promedio_legacy,
            g.ciclo_minimo_dias,
            g.ciclo_maximo_dias,
            g.ciclo_std_dias,
            g.gaps_recientes,
            g.gaps_totales,
                CASE
                    WHEN ce.estado = 'estacional'::text THEN true
                    WHEN ce.estado IS NOT NULL THEN false
                    ELSE COALESCE(ea.es_estacional_auto, false)
                END AS es_estacional,
            ce.estado = 'estacional'::text AS estacional_manual,
            COALESCE(g.ciclo_base_dias, g.ciclo_mediana_historica, 30) AS ciclo_base_efectivo
           FROM aggregated a
             LEFT JOIN gap_stats g ON g.nombre_fantasia = a.nombre_fantasia
             LEFT JOIN clientes_estado ce ON ce.nombre_fantasia = a.nombre_fantasia
             LEFT JOIN clientes_estacionalidad_auto ea ON ea.nombre_fantasia = a.nombre_fantasia
        ), proyectado AS (
         SELECT b.nombre_fantasia,
            b.vendedor_actual,
            b.total_pedidos,
            b.litros_totales,
            b.revenue_total,
            b.primera_compra,
            b.ultima_compra,
            b.dias_sin_compra,
            b.meses_activo,
            b.ciclo_base_dias,
            b.ciclo_mediana_historica,
            b.ciclo_promedio_legacy,
            b.ciclo_minimo_dias,
            b.ciclo_maximo_dias,
            b.ciclo_std_dias,
            b.gaps_recientes,
            b.gaps_totales,
            b.es_estacional,
            b.estacional_manual,
            b.ciclo_base_efectivo,
            EXTRACT(month FROM b.ultima_compra + ((b.ciclo_base_efectivo || ' days'::text)::interval))::integer AS mes_proyectado
           FROM base b
        ), final AS (
         SELECT p.nombre_fantasia,
            p.vendedor_actual,
            p.total_pedidos,
            p.litros_totales,
            p.revenue_total,
            p.primera_compra,
            p.ultima_compra,
            p.dias_sin_compra,
            p.meses_activo,
            p.ciclo_base_dias,
            p.ciclo_mediana_historica,
            p.ciclo_promedio_legacy,
            p.ciclo_minimo_dias,
            p.ciclo_maximo_dias,
            p.ciclo_std_dias,
            p.gaps_recientes,
            p.gaps_totales,
            p.es_estacional,
            p.estacional_manual,
            p.ciclo_base_efectivo,
            p.mes_proyectado,
                CASE
                    WHEN p.es_estacional THEN GREATEST(0.5, LEAST(2.0, 1::numeric + (COALESCE(ec.factor_ciclo, 1.0) - 1::numeric) * 2.0))
                    ELSE COALESCE(ec.factor_ciclo, 1.0)
                END AS factor_estacional,
            _factor_calibracion() AS factor_calibracion
           FROM proyectado p
             LEFT JOIN estacionalidad_ciclo ec ON ec.mes = p.mes_proyectado
        ), ciclo AS (
         SELECT f.nombre_fantasia,
            f.vendedor_actual,
            f.total_pedidos,
            f.litros_totales,
            f.revenue_total,
            f.primera_compra,
            f.ultima_compra,
            f.dias_sin_compra,
            f.meses_activo,
            f.ciclo_base_dias,
            f.ciclo_mediana_historica,
            f.ciclo_promedio_legacy,
            f.ciclo_minimo_dias,
            f.ciclo_maximo_dias,
            f.ciclo_std_dias,
            f.gaps_recientes,
            f.gaps_totales,
            f.es_estacional,
            f.estacional_manual,
            f.ciclo_base_efectivo,
            f.mes_proyectado,
            f.factor_estacional,
            f.factor_calibracion,
            GREATEST(1::numeric, round(f.ciclo_base_efectivo::numeric * f.factor_estacional * f.factor_calibracion))::integer AS ciclo_final
           FROM final f
        )
 SELECT nombre_fantasia,
    vendedor_actual,
    total_pedidos,
    litros_totales,
    revenue_total,
    primera_compra,
    ultima_compra,
    dias_sin_compra,
    meses_activo,
    round((total_pedidos::double precision / meses_activo)::numeric, 2) AS pedidos_por_mes,
    round(litros_totales / total_pedidos::numeric, 2) AS litros_por_pedido,
    round(revenue_total / total_pedidos::numeric, 0) AS revenue_por_pedido,
    ciclo_final AS ciclo_promedio_dias,
    ciclo_base_efectivo AS ciclo_base_dias,
    ciclo_promedio_legacy,
    ciclo_minimo_dias,
    ciclo_maximo_dias,
    ciclo_std_dias,
    gaps_recientes,
    gaps_totales,
    round(factor_estacional, 3) AS factor_estacional,
    round(factor_calibracion, 4) AS factor_calibracion,
    es_estacional,
    COALESCE(estacional_manual, false) AS estacional_manual,
    es_estacional AND factor_estacional > 1.15 AS temporada_baja,
    GREATEST(0, ciclo_final - dias_sin_compra) AS dias_para_siguiente,
    (ultima_compra + ((ciclo_final || ' days'::text)::interval))::date AS siguiente_compra_estimada
   FROM ciclo c;


-- ─── 2. Caché materializado: las 25 columnas ESTABLES ──────────────────────
-- Se omiten a propósito `dias_sin_compra` y `dias_para_siguiente`: son las
-- dos únicas que dependen de CURRENT_DATE y se derivan en vivo en el paso 3.
CREATE MATERIALIZED VIEW public.client_metrics_cache AS
SELECT
  nombre_fantasia, vendedor_actual, total_pedidos, litros_totales, revenue_total,
  primera_compra, ultima_compra, meses_activo, pedidos_por_mes, litros_por_pedido,
  revenue_por_pedido, ciclo_promedio_dias, ciclo_base_dias, ciclo_promedio_legacy,
  ciclo_minimo_dias, ciclo_maximo_dias, ciclo_std_dias, gaps_recientes, gaps_totales,
  factor_estacional, factor_calibracion, es_estacional, estacional_manual,
  temporada_baja, siguiente_compra_estimada
FROM public.client_metrics_calc;

-- Índice único: requisito de REFRESH ... CONCURRENTLY, que permite refrescar
-- sin bloquear las lecturas de la app.
CREATE UNIQUE INDEX client_metrics_cache_pk
  ON public.client_metrics_cache (nombre_fantasia, vendedor_actual);

-- Para los filtros de /ventas/clientes
CREATE INDEX client_metrics_cache_vendedor
  ON public.client_metrics_cache (vendedor_actual);


-- ─── 3. client_raw_metrics: misma firma, ahora sobre el caché ──────────────
-- Mismos 27 nombres, mismos tipos, mismo orden que la vista original, así que
-- `client_scores` y todo lo que la consume siguen funcionando sin cambios.
CREATE OR REPLACE VIEW public.client_raw_metrics AS
SELECT
  nombre_fantasia,
  vendedor_actual,
  total_pedidos,
  litros_totales,
  revenue_total,
  primera_compra,
  ultima_compra,
  -- VIVO: cambia cada día aunque no entren ventas nuevas. Es el número que
  -- decide alert_level, así que no puede venir congelado del caché.
  (CURRENT_DATE - ultima_compra)::integer AS dias_sin_compra,
  meses_activo,
  pedidos_por_mes,
  litros_por_pedido,
  revenue_por_pedido,
  ciclo_promedio_dias,
  ciclo_base_dias,
  ciclo_promedio_legacy,
  ciclo_minimo_dias,
  ciclo_maximo_dias,
  ciclo_std_dias,
  gaps_recientes,
  gaps_totales,
  factor_estacional,
  factor_calibracion,
  es_estacional,
  estacional_manual,
  temporada_baja,
  -- VIVO: se deriva del anterior.
  GREATEST(0, ciclo_promedio_dias - (CURRENT_DATE - ultima_compra))::integer AS dias_para_siguiente,
  siguiente_compra_estimada
FROM public.client_metrics_cache;


-- ─── 4. Refresco ──────────────────────────────────────────────────────────
-- CONCURRENTLY: la app puede seguir leyendo mientras se refresca.
CREATE OR REPLACE FUNCTION public.refrescar_client_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.client_metrics_cache;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refrescar_client_metrics() TO authenticated;

GRANT SELECT ON public.client_metrics_cache TO anon, authenticated;
GRANT SELECT ON public.client_metrics_calc  TO anon, authenticated;

COMMENT ON MATERIALIZED VIEW public.client_metrics_cache IS
  'Caché de client_metrics_calc. Refrescar con refrescar_client_metrics() '
  'después de cada carga de ventas del ERP, y una vez al día por las dudas. '
  'dias_sin_compra NO vive acá: se calcula en vivo en client_raw_metrics.';

COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN — correr DESPUÉS de aplicar. Las dos deben dar 0 filas.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- a) La vista nueva devuelve exactamente lo mismo que la lógica original:
--
--   SELECT * FROM (
--     (TABLE client_metrics_calc EXCEPT ALL TABLE client_raw_metrics)
--     UNION ALL
--     (TABLE client_raw_metrics EXCEPT ALL TABLE client_metrics_calc)
--   ) diferencias;
--
-- b) Cuánto más rápido:
--
--   EXPLAIN ANALYZE SELECT * FROM client_scores;   -- esperado: pocos ms
--
-- ═══════════════════════════════════════════════════════════════════════════

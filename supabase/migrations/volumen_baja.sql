-- =============================================================================
-- ALERTA DE CAÍDA DE VOLUMEN — señal temprana de fuga
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Detecta clientes ACTIVOS (siguen comprando) cuyo volumen por pedido de los
-- últimos 3 pedidos cayó significativamente vs su baseline histórico.
-- Esto avisa ANTES de que el cliente se venza/inactive.
-- Seguro de re-ejecutar.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_clientes_volumen_baja(
  p_vendedor text    DEFAULT NULL,
  p_umbral   numeric DEFAULT 0.25   -- caída mínima para alertar (25%)
)
RETURNS TABLE (
  nombre_fantasia  text,
  vendedor_actual  text,
  segmento         text,
  litros_reciente  numeric,   -- promedio litros/pedido últimos 3
  litros_baseline  numeric,   -- promedio litros/pedido pedidos anteriores
  caida_pct        numeric,   -- % de caída (0-100)
  pedidos_totales  bigint,
  dias_sin_compra  int,
  telefono         text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH pedidos AS (
    -- Litros por pedido (suma de líneas), excluyendo internos/incobrables/inactivos
    SELECT v.nombre_fantasia, v.vendedor_actual, v.pedido,
           MAX(v.fecha_pedido) AS fecha,
           SUM(v.litros)       AS litros
    FROM ventas v
    WHERE v.nombre_fantasia IS NOT NULL
      AND v.pedido IS NOT NULL
      AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT EXISTS (
        SELECT 1 FROM deudores d
        WHERE d.nombre_fantasia = v.nombre_fantasia AND d.tipo_cliente = 'Incobrable')
      AND NOT EXISTS (
        SELECT 1 FROM clientes_estado ce
        WHERE ce.nombre_fantasia = v.nombre_fantasia AND ce.estado = 'inactivo')
    GROUP BY v.nombre_fantasia, v.vendedor_actual, v.pedido
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY nombre_fantasia ORDER BY fecha DESC) AS rn,
      COUNT(*)     OVER (PARTITION BY nombre_fantasia)                     AS n
    FROM pedidos
  ),
  agg AS (
    SELECT nombre_fantasia, vendedor_actual,
      AVG(litros) FILTER (WHERE rn <= 3) AS litros_reciente,
      AVG(litros) FILTER (WHERE rn >  3) AS litros_baseline,
      MAX(n)                             AS pedidos_totales,
      (CURRENT_DATE - MAX(fecha))::int   AS dias_sin_compra
    FROM ranked
    GROUP BY nombre_fantasia, vendedor_actual
  )
  SELECT
    a.nombre_fantasia,
    a.vendedor_actual,
    cs.segmento,
    ROUND(a.litros_reciente, 1)                                          AS litros_reciente,
    ROUND(a.litros_baseline, 1)                                          AS litros_baseline,
    ROUND((1 - a.litros_reciente / NULLIF(a.litros_baseline, 0)) * 100)  AS caida_pct,
    a.pedidos_totales,
    a.dias_sin_compra,
    c.telefono
  FROM agg a
  LEFT JOIN client_scores  cs ON cs.nombre_fantasia = a.nombre_fantasia
  LEFT JOIN clientes       c  ON c.nombre_fantasia  = a.nombre_fantasia
  WHERE a.pedidos_totales >= 5                                  -- baseline confiable (≥2 pedidos viejos)
    AND a.litros_baseline > 0
    AND a.litros_reciente < a.litros_baseline * (1 - p_umbral)  -- cayó ≥ umbral
    AND COALESCE(cs.tipo_cliente, 'activo') = 'activo'          -- aún activo = señal TEMPRANA
    AND (p_vendedor IS NULL OR a.vendedor_actual = p_vendedor)
  ORDER BY caida_pct DESC;
$$;

GRANT EXECUTE ON FUNCTION get_clientes_volumen_baja TO anon, authenticated;

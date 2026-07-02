-- =============================================================================
-- PERFORMANCE — Índices en ventas + agregación en Postgres
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Problema: cada página del CRM traía miles de filas crudas de `ventas` y las
-- sumaba en JS. Esto:
--   1. Agrega los índices que faltan para los scans por fecha/vendedor/cliente.
--   2. Crea RPCs que agregan EN la base → el dashboard transfiere ~60 filas
--      en vez de miles.
-- Seguro de re-ejecutar.
-- =============================================================================

-- ── 1. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ventas_fecha          ON ventas (fecha_pedido);
CREATE INDEX IF NOT EXISTS idx_ventas_vend_fecha      ON ventas (vendedor_actual, fecha_pedido);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente_fecha   ON ventas (nombre_fantasia, fecha_pedido);
CREATE INDEX IF NOT EXISTS idx_ventas_pedido          ON ventas (pedido);

ANALYZE ventas;

-- ── 2. Agregación diaria por vendedor (para gráfico de evolución) ─────────────
CREATE OR REPLACE FUNCTION ventas_agg_diaria(
  p_ini      date,
  p_fin      date,
  p_vendedor text DEFAULT NULL
)
RETURNS TABLE (fecha date, vendedor text, litros numeric, revenue numeric)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    v.fecha_pedido                  AS fecha,
    v.vendedor_actual               AS vendedor,
    SUM(v.litros)                   AS litros,
    SUM(v.total_sin_impuesto)       AS revenue
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini
    AND v.fecha_pedido <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND v.nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.fecha_pedido, v.vendedor_actual
  ORDER BY v.fecha_pedido;
$$;

GRANT EXECUTE ON FUNCTION ventas_agg_diaria TO anon, authenticated;

-- ── 3. Resumen del período por vendedor (litros, revenue, clientes únicos) ────
CREATE OR REPLACE FUNCTION ventas_agg_periodo(
  p_ini      date,
  p_fin      date,
  p_vendedor text DEFAULT NULL
)
RETURNS TABLE (vendedor text, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    v.vendedor_actual                       AS vendedor,
    SUM(v.litros)                           AS litros,
    SUM(v.total_sin_impuesto)               AS revenue,
    COUNT(DISTINCT v.nombre_fantasia)       AS clientes,
    COUNT(DISTINCT v.pedido)                AS pedidos
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini
    AND v.fecha_pedido <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND v.nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.vendedor_actual;
$$;

GRANT EXECUTE ON FUNCTION ventas_agg_periodo TO anon, authenticated;

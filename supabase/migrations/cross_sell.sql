-- =============================================================================
-- CROSS-SELL — oportunidades de venta por penetración de categoría
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Lógica: para cada tipo de negocio (categoria_negocio) calcula qué % de sus
-- clientes compra cada categoría de producto. Luego, para cada cliente ACTIVO,
-- devuelve las categorías que sus pares compran (>= umbral) pero él NO.
-- Ej: "70% de los bares compran Kombucha, este bar no" → cross-sell.
-- Seguro de re-ejecutar.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_cross_sell(
  p_vendedor        text    DEFAULT NULL,
  p_min_penetracion numeric DEFAULT 0.4   -- % mínimo de pares que la compran
)
RETURNS TABLE (
  nombre_fantasia    text,
  vendedor_actual    text,
  categoria_negocio  text,
  categoria_sugerida text,
  peers_pct          numeric,   -- % de pares (mismo negocio) que SÍ la compran
  telefono           text
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH activos AS (
    -- Clientes ACTIVOS con su tipo de negocio + vendedor
    SELECT v.nombre_fantasia,
           MAX(v.vendedor_actual)                                   AS vendedor_actual,
           COALESCE(NULLIF(MAX(v.categoria_negocio), '-'), 'Otros') AS categoria_negocio
    FROM ventas v
    JOIN client_scores cs
      ON cs.nombre_fantasia = v.nombre_fantasia AND cs.tipo_cliente = 'activo'
    WHERE v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    GROUP BY v.nombre_fantasia
  ),
  compra AS (
    -- (cliente, categoría de producto) que SÍ compra
    SELECT DISTINCT v.nombre_fantasia, v.categoria_producto
    FROM ventas v
    WHERE v.categoria_producto IS NOT NULL
      AND v.nombre_fantasia IS NOT NULL
      AND NOT _excluir_cliente(v.nombre_fantasia)
  ),
  negocio_size AS (
    SELECT categoria_negocio, COUNT(*) AS n_clientes
    FROM activos GROUP BY categoria_negocio
  ),
  penetracion AS (
    SELECT a.categoria_negocio, c.categoria_producto,
           COUNT(DISTINCT a.nombre_fantasia) AS n_compran
    FROM activos a
    JOIN compra c ON c.nombre_fantasia = a.nombre_fantasia
    GROUP BY a.categoria_negocio, c.categoria_producto
  ),
  pen_pct AS (
    SELECT p.categoria_negocio, p.categoria_producto,
           p.n_compran::numeric / ns.n_clientes AS pct
    FROM penetracion p
    JOIN negocio_size ns USING (categoria_negocio)
    WHERE ns.n_clientes >= 3   -- negocio con suficientes pares para inferir
  )
  SELECT
    a.nombre_fantasia,
    a.vendedor_actual,
    a.categoria_negocio,
    pp.categoria_producto                  AS categoria_sugerida,
    ROUND(pp.pct * 100)                    AS peers_pct,
    cl.telefono
  FROM activos a
  JOIN pen_pct pp
    ON pp.categoria_negocio = a.categoria_negocio AND pp.pct >= p_min_penetracion
  LEFT JOIN compra c
    ON c.nombre_fantasia = a.nombre_fantasia AND c.categoria_producto = pp.categoria_producto
  LEFT JOIN clientes cl ON cl.nombre_fantasia = a.nombre_fantasia
  WHERE c.nombre_fantasia IS NULL          -- el cliente NO compra esa categoría
    AND (p_vendedor IS NULL OR a.vendedor_actual = p_vendedor)
  ORDER BY 5 DESC, a.nombre_fantasia;       -- columna 5 = peers_pct
$$;

GRANT EXECUTE ON FUNCTION get_cross_sell TO anon, authenticated;

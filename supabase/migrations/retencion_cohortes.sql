-- =============================================================================
-- RETENCIÓN POR COHORTE — ¿los clientes nuevos repiten y se quedan?
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Agrupa clientes por el mes de su PRIMERA compra (cohorte) y mide:
--   - % que repitió (>= 2 pedidos)
--   - % que sigue activo hoy
--   - pedidos y litros promedio
-- Lee de client_scores (ya calculado). Seguro de re-ejecutar.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_retencion_cohortes()
RETURNS TABLE (
  cohorte       text,     -- 'YYYY-MM' del mes de primera compra
  clientes      bigint,
  repitieron    bigint,   -- con >= 2 pedidos
  repeat_pct    numeric,
  activos       bigint,   -- tipo_cliente = 'activo' hoy
  activos_pct   numeric,
  pedidos_prom  numeric,
  litros_prom   numeric
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT
    to_char(primera_compra, 'YYYY-MM')                                          AS cohorte,
    COUNT(*)                                                                    AS clientes,
    COUNT(*) FILTER (WHERE total_pedidos >= 2)                                  AS repitieron,
    ROUND(COUNT(*) FILTER (WHERE total_pedidos >= 2)::numeric / COUNT(*) * 100) AS repeat_pct,
    COUNT(*) FILTER (WHERE tipo_cliente = 'activo')                             AS activos,
    ROUND(COUNT(*) FILTER (WHERE tipo_cliente = 'activo')::numeric / COUNT(*) * 100) AS activos_pct,
    ROUND(AVG(total_pedidos), 1)                                                AS pedidos_prom,
    ROUND(AVG(litros_totales), 0)                                               AS litros_prom
  FROM client_scores
  WHERE primera_compra IS NOT NULL
  GROUP BY 1
  ORDER BY 1 DESC
  LIMIT 12;   -- últimos 12 meses de cohortes
$$;

GRANT EXECUTE ON FUNCTION get_retencion_cohortes TO anon, authenticated;

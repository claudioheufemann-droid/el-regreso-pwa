-- =============================================================================
-- PEDIDO SUGERIDO — composición habitual del cliente para proponer la recompra
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- Para cada cliente, mira sus ÚLTIMOS 6 pedidos y devuelve sus 3 productos más
-- frecuentes con el volumen típico por pedido → "pedido sugerido" listo.
-- Seguro de re-ejecutar.
-- =============================================================================

CREATE OR REPLACE FUNCTION get_pedido_sugerido(
  p_vendedor text DEFAULT NULL
)
RETURNS TABLE (
  nombre_fantasia text,
  producto        text,
  envase          text,
  litros_tipico   numeric,   -- litros promedio por pedido de ese producto
  frecuencia      bigint,    -- en cuántos de sus últimos pedidos aparece
  rank            bigint
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH ultimos_pedidos AS (
    SELECT nombre_fantasia, pedido
    FROM (
      SELECT DISTINCT v.nombre_fantasia, v.pedido,
             DENSE_RANK() OVER (PARTITION BY v.nombre_fantasia ORDER BY v.fecha_pedido DESC) AS pr
      FROM ventas v
      WHERE v.pedido IS NOT NULL AND v.nombre_fantasia IS NOT NULL
        AND NOT _excluir_cliente(v.nombre_fantasia)
        AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    ) s
    WHERE pr <= 6
  ),
  lineas AS (
    SELECT v.nombre_fantasia, up.pedido, v.producto, v.envase, SUM(v.litros) AS litros
    FROM ventas v
    JOIN ultimos_pedidos up
      ON up.nombre_fantasia = v.nombre_fantasia AND up.pedido = v.pedido
    WHERE v.producto IS NOT NULL
    GROUP BY v.nombre_fantasia, up.pedido, v.producto, v.envase
  ),
  agg AS (
    SELECT nombre_fantasia, producto, envase,
           ROUND(AVG(litros), 1)   AS litros_tipico,
           COUNT(DISTINCT pedido)  AS frecuencia
    FROM lineas
    GROUP BY nombre_fantasia, producto, envase
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY nombre_fantasia ORDER BY frecuencia DESC, litros_tipico DESC
      ) AS rank
    FROM agg
  )
  SELECT nombre_fantasia, producto, envase, litros_tipico, frecuencia, rank
  FROM ranked
  WHERE rank <= 3
  ORDER BY nombre_fantasia, rank;
$$;

GRANT EXECUTE ON FUNCTION get_pedido_sugerido TO anon, authenticated;

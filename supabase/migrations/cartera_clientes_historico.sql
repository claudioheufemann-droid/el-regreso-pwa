-- Cartera de clientes (/ventas/clientes) — historial de compra completo por
-- cliente, para responder "¿cuántos clientes activos tengo en X?", "¿cuándo
-- fue la última vez que me compró y qué?" y "¿cada cuánto compra?".
--
-- Activo = compró en los últimos 2 años (decisión de Claudio, 2026-10-30).
-- Excluye clientes internos y productos excluidos con las mismas columnas que
-- ya usan los demás RPC de ventas (cliente_excluido / producto_excluido).

CREATE OR REPLACE FUNCTION public.cartera_clientes_resumen()
RETURNS TABLE(
  nombre_fantasia text,
  primera_compra date,
  ultima_compra date,
  dias_con_compra bigint,
  pedidos bigint,
  litros numeric,
  monto numeric,
  litros_12m numeric,
  monto_12m numeric,
  ultimo_vendedor text,
  localidad text,
  provincia text
)
LANGUAGE sql
STABLE
AS $function$
  -- Vendedor/localidad del pedido MÁS RECIENTE vía array_agg ordenado: evita
  -- un segundo DISTINCT ON sobre las ~60.000 líneas (bajó de ~1,4 s).
  SELECT v.nombre_fantasia,
         MIN(v.fecha_pedido)::date,
         MAX(v.fecha_pedido)::date,
         COUNT(DISTINCT v.fecha_pedido),
         COUNT(DISTINCT v.pedido),
         ROUND(COALESCE(SUM(v.litros), 0)::numeric, 1),
         ROUND(COALESCE(SUM(v.total_sin_impuesto), 0)::numeric, 0),
         ROUND(COALESCE(SUM(v.litros) FILTER (WHERE v.fecha_pedido >= CURRENT_DATE - 365), 0)::numeric, 1),
         ROUND(COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.fecha_pedido >= CURRENT_DATE - 365), 0)::numeric, 0),
         (array_agg(v.vendedor_actual ORDER BY v.fecha_pedido DESC))[1],
         (array_agg(v.localidad ORDER BY v.fecha_pedido DESC))[1],
         (array_agg(v.provincia ORDER BY v.fecha_pedido DESC))[1]
  FROM ventas v
  WHERE v.nombre_fantasia IS NOT NULL
    AND NOT v.cliente_excluido
    AND NOT v.producto_excluido
  GROUP BY v.nombre_fantasia;
$function$;

-- Ficha de compras de UN cliente: totales por año, productos que más compra y
-- sus últimas compras con el detalle de qué llevó.
--
-- Todo se agrupa por DÍA de compra, no por N° de pedido: el ERP suele partir
-- una misma compra en varios pedidos el mismo día (ej. Duck Market, 22-sep-2026:
-- 3 pedidos), y contarlos aparte mostraba la misma fecha repetida y una
-- cantidad de "pedidos" que no calzaba con la frecuencia real.
CREATE OR REPLACE FUNCTION public.cartera_cliente_detalle(p_nombre text)
RETURNS json
LANGUAGE sql
STABLE
AS $function$
  WITH base AS (
    SELECT v.fecha_pedido::date AS fecha, v.pedido, v.producto, v.envase,
           COALESCE(v.litros, 0) AS litros, COALESCE(v.total_sin_impuesto, 0) AS monto
    FROM ventas v
    WHERE v.nombre_fantasia = p_nombre
      AND NOT v.cliente_excluido
      AND NOT v.producto_excluido
  ),
  ult_dias AS (
    SELECT DISTINCT fecha FROM base ORDER BY fecha DESC LIMIT 6
  )
  SELECT json_build_object(
    'anios', COALESCE((
      SELECT json_agg(a ORDER BY a.anio)
      FROM (
        SELECT date_part('year', fecha)::int AS anio,
               ROUND(SUM(litros)::numeric, 1) AS litros,
               ROUND(SUM(monto)::numeric, 0) AS monto,
               COUNT(DISTINCT fecha) AS compras
        FROM base GROUP BY 1
      ) a
    ), '[]'::json),
    'productos', COALESCE((
      SELECT json_agg(p ORDER BY p.litros DESC)
      FROM (
        SELECT producto,
               ROUND(SUM(litros)::numeric, 1) AS litros,
               ROUND(SUM(monto)::numeric, 0) AS monto,
               COUNT(DISTINCT fecha) AS veces,
               MAX(fecha) AS ultima
        FROM base
        WHERE litros > 0 AND producto IS NOT NULL
        GROUP BY producto
        ORDER BY SUM(litros) DESC
        LIMIT 8
      ) p
    ), '[]'::json),
    'compras', COALESCE((
      SELECT json_agg(o ORDER BY o.fecha DESC)
      FROM (
        SELECT d.fecha,
               (SELECT string_agg(DISTINCT ltrim(b2.pedido, '0'), ', ') FROM base b2 WHERE b2.fecha = d.fecha) AS pedidos,
               ROUND((SELECT SUM(b2.litros) FROM base b2 WHERE b2.fecha = d.fecha)::numeric, 1) AS litros,
               ROUND((SELECT SUM(b2.monto) FROM base b2 WHERE b2.fecha = d.fecha)::numeric, 0) AS monto,
               (SELECT json_agg(i ORDER BY i.litros DESC, i.monto DESC) FROM (
                  SELECT b2.producto, b2.envase,
                         ROUND(SUM(b2.litros)::numeric, 1) AS litros,
                         ROUND(SUM(b2.monto)::numeric, 0) AS monto
                  FROM base b2 WHERE b2.fecha = d.fecha
                  GROUP BY b2.producto, b2.envase
               ) i) AS items
        FROM ult_dias d
      ) o
    ), '[]'::json)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.cartera_clientes_resumen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cartera_cliente_detalle(text) TO authenticated;
-- La página lo cachea con unstable_cache (cliente anon, sin cookies), igual
-- que lib/misionesCache.ts. `ventas` ya es de lectura pública por RLS.
GRANT EXECUTE ON FUNCTION public.cartera_clientes_resumen() TO anon;
GRANT EXECUTE ON FUNCTION public.cartera_cliente_detalle(text) TO anon;

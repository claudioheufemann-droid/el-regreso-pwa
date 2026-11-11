-- Cartera de clientes: las devoluciones y los pedidos en $0 NO son compras
-- (2026-11-11). El ERP carga las devoluciones con pedido = 'Devolución',
-- litros negativos y $0: La Birra Esquina devolvió 30 L el 10-nov y la
-- cartera la mostraba "compró ayer" cuando su última compra real fue el
-- 20-ago. Lo mismo con pedidos sin valor (arriendo de cilindro CO2, barril
-- vacío, letreros regalados): no son compras.
--
-- Regla: un día cuenta como compra sólo si tiene alguna línea vendida
-- (litros > 0 o neto > 0) que no sea devolución. Los litros/montos excluyen
-- las devoluciones (igual que Metas: sólo lo vendido; el neto no cambia porque
-- vienen en $0). Las líneas de descuento del mismo pedido siguen restando.

CREATE OR REPLACE FUNCTION public.cartera_clientes_resumen()
 RETURNS TABLE(nombre_fantasia text, primera_compra date, ultima_compra date, dias_con_compra bigint, pedidos bigint, litros numeric, monto numeric, litros_12m numeric, monto_12m numeric, ultimo_vendedor text, localidad text, provincia text)
 LANGUAGE sql
 STABLE
 SET work_mem TO '32MB'
AS $function$
  WITH b AS MATERIALIZED (
    SELECT v.nombre_fantasia, v.fecha_pedido, v.pedido, v.litros, v.total_sin_impuesto,
           v.vendedor_actual, v.localidad, v.provincia,
           (COALESCE(v.litros, 0) > 0 OR COALESCE(v.total_sin_impuesto, 0) > 0) AS es_compra
    FROM ventas v
    WHERE v.nombre_fantasia IS NOT NULL
      AND NOT v.cliente_excluido
      AND NOT v.producto_excluido
      AND v.pedido IS DISTINCT FROM 'Devolución'
  ),
  agg AS (
    SELECT b.nombre_fantasia,
           MIN(b.fecha_pedido) FILTER (WHERE b.es_compra)::date AS primera_compra,
           MAX(b.fecha_pedido) FILTER (WHERE b.es_compra)::date AS ultima_compra,
           COUNT(DISTINCT b.fecha_pedido) FILTER (WHERE b.es_compra) AS dias_con_compra,
           COUNT(DISTINCT b.pedido) FILTER (WHERE b.es_compra) AS pedidos,
           ROUND(COALESCE(SUM(b.litros), 0)::numeric, 1) AS litros,
           ROUND(COALESCE(SUM(b.total_sin_impuesto), 0)::numeric, 0) AS monto,
           ROUND(COALESCE(SUM(b.litros) FILTER (WHERE b.fecha_pedido >= CURRENT_DATE - 365), 0)::numeric, 1) AS litros_12m,
           ROUND(COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.fecha_pedido >= CURRENT_DATE - 365), 0)::numeric, 0) AS monto_12m
    FROM b GROUP BY b.nombre_fantasia
    HAVING bool_or(b.es_compra)
  ),
  ult AS (
    SELECT DISTINCT ON (b.nombre_fantasia) b.nombre_fantasia, b.vendedor_actual, b.localidad, b.provincia
    FROM b WHERE b.es_compra
    ORDER BY b.nombre_fantasia, b.fecha_pedido DESC
  )
  SELECT a.nombre_fantasia, a.primera_compra, a.ultima_compra, a.dias_con_compra, a.pedidos,
         a.litros, a.monto, a.litros_12m, a.monto_12m,
         u.vendedor_actual, u.localidad, u.provincia
  FROM agg a JOIN ult u USING (nombre_fantasia);
$function$;

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
      AND v.pedido IS DISTINCT FROM 'Devolución'
  ),
  dias_compra AS (
    SELECT DISTINCT fecha FROM base WHERE litros > 0 OR monto > 0
  ),
  ult_dias AS (
    SELECT fecha FROM dias_compra ORDER BY fecha DESC LIMIT 6
  )
  SELECT json_build_object(
    'anios', COALESCE((
      SELECT json_agg(a ORDER BY a.anio)
      FROM (
        SELECT date_part('year', b.fecha)::int AS anio,
               ROUND(SUM(b.litros)::numeric, 1) AS litros,
               ROUND(SUM(b.monto)::numeric, 0) AS monto,
               COUNT(DISTINCT b.fecha) FILTER (WHERE b.fecha IN (SELECT fecha FROM dias_compra)) AS compras
        FROM base b GROUP BY 1
        HAVING bool_or(b.litros > 0 OR b.monto > 0)
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

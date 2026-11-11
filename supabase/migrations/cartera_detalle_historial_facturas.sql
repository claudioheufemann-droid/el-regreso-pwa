-- Ficha de la cartera: historial completo de compras con N° de factura
-- (pedido de Claudio, 2026-11-11). Nuevo campo `historial`: TODAS las compras
-- (una por día, misma regla que cartera_sin_devoluciones.sql), cada una con sus
-- documentos (factura; si aún no tiene, el N° de pedido) y el detalle de
-- productos de cada documento. Un pedido nunca tiene dos facturas, pero una
-- factura puede juntar varios pedidos del mismo día: se agrupa por factura.
-- `compras` (últimos 6 días) se mantiene igual para la app ya instalada.
CREATE OR REPLACE FUNCTION public.cartera_cliente_detalle(p_nombre text)
 RETURNS json
 LANGUAGE sql
 STABLE
AS $function$
  WITH base AS (
    SELECT v.fecha_pedido::date AS fecha, v.pedido, v.producto, v.envase,
           NULLIF(btrim(v.numero_factura), '') AS factura,
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
  ),
  b2 AS (
    SELECT b.*, COALESCE(b.factura, 'P' || COALESCE(b.pedido, '')) AS doc
    FROM base b JOIN dias_compra d USING (fecha)
  ),
  items AS (
    SELECT fecha, doc, producto, envase,
           ROUND(SUM(litros)::numeric, 1) AS litros,
           ROUND(SUM(monto)::numeric, 0) AS monto
    FROM b2 GROUP BY fecha, doc, producto, envase
  ),
  docs AS (
    SELECT d.fecha, d.doc, d.factura, d.pedidos, d.litros, d.monto,
           (SELECT json_agg(json_build_object('producto', i.producto, 'envase', i.envase, 'litros', i.litros, 'monto', i.monto)
                            ORDER BY i.litros DESC, i.monto DESC)
            FROM items i WHERE i.fecha = d.fecha AND i.doc = d.doc) AS items
    FROM (
      SELECT fecha, doc, MAX(factura) AS factura,
             string_agg(DISTINCT ltrim(pedido, '0'), ', ') AS pedidos,
             ROUND(SUM(litros)::numeric, 1) AS litros,
             ROUND(SUM(monto)::numeric, 0) AS monto
      FROM b2 GROUP BY fecha, doc
    ) d
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
    'historial', COALESCE((
      SELECT json_agg(h ORDER BY h.fecha DESC)
      FROM (
        SELECT fecha,
               SUM(litros) AS litros,
               SUM(monto) AS monto,
               json_agg(json_build_object('factura', factura, 'pedidos', pedidos, 'litros', litros, 'monto', monto, 'items', items)
                        ORDER BY factura NULLS LAST, pedidos) AS docs
        FROM docs GROUP BY fecha
      ) h
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

-- Detalle que se abre al tocar las tarjetas del dashboard de Ventas
-- (/api/ventas/detalle). Se cargan bajo demanda, no con el resto de la vista,
-- porque son listas largas que sólo se miran al hacer drill-down.
--
-- Aplican la misma exclusión de clientes internos (_excluir_cliente) que
-- ventas_dashboard_kpis, así los totales del detalle cuadran con la tarjeta.

-- Qué se vendió en el rango (tarjeta "Pedidos")
CREATE OR REPLACE FUNCTION public.ventas_detalle_productos(
  p_ini date,
  p_fin date,
  p_provincias text[] DEFAULT NULL
)
RETURNS TABLE(
  producto text, envase text, categoria text,
  litros numeric, revenue numeric, pedidos bigint, clientes bigint
)
LANGUAGE sql
STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(NULLIF(TRIM(v.producto), ''), 'Sin producto'),
    COALESCE(NULLIF(TRIM(v.envase), ''), '—'),
    CASE
      WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%cerveza%'  THEN 'Cerveza'
      WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
      ELSE 'Otros'
    END,
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    COUNT(DISTINCT v.nombre_fantasia)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

-- Quién compró en el rango (tarjeta "Clientes")
CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes(
  p_ini date,
  p_fin date,
  p_provincias text[] DEFAULT NULL
)
RETURNS TABLE(
  cliente text, vendedor text, localidad text,
  litros numeric, revenue numeric, pedidos bigint, ultima_compra date
)
LANGUAGE sql
STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    -- El vendedor que más le vendió en el rango (un cliente puede tener varios)
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = v.nombre_fantasia
        AND v2.fecha_pedido >= p_ini AND v2.fecha_pedido <= p_fin
      GROUP BY v2.vendedor_actual ORDER BY SUM(v2.litros) DESC LIMIT 1),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(v.fecha_pedido)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.nombre_fantasia
  ORDER BY 4 DESC;
$function$;

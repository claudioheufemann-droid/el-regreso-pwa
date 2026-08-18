-- RPCs para el dashboard de Ventas (pestaña "Hoy").
--
-- Objetivo: que las pestañas de rango (Hoy / 7D / 30D / Mes / Año) cambien de
-- forma instantánea. Se precalculan los 5 rangos en el servidor (más su período
-- de comparación) y el cliente sólo alterna entre sets ya listos, en vez de
-- pedir datos en cada click.
--
-- Ambas respetan la misma exclusión de clientes internos que ventas_agg_periodo
-- (_excluir_cliente), así los litros cuadran con el resto de las vistas.

-- Mix de producto por rango (usado también fuera del dashboard).
CREATE OR REPLACE FUNCTION public.ventas_mix_periodo(
  p_ini date,
  p_fin date,
  p_vendedor text DEFAULT NULL,
  p_provincias text[] DEFAULT NULL
)
RETURNS TABLE(categoria text, litros numeric, revenue numeric)
LANGUAGE sql
STABLE PARALLEL SAFE
AS $function$
  SELECT
    CASE
      WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%cerveza%'  THEN 'Cerveza'
      WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
      ELSE 'Otros'
    END AS categoria,
    SUM(v.litros)             AS litros,
    SUM(v.total_sin_impuesto) AS revenue
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1;
$function$;

-- KPIs completos de un rango en UNA fila: evita llamar 3-4 RPC por cada pestaña
-- y su período de comparación.
CREATE OR REPLACE FUNCTION public.ventas_dashboard_kpis(
  p_ini date,
  p_fin date,
  p_provincias text[] DEFAULT NULL
)
RETURNS TABLE(
  litros numeric, revenue numeric, clientes bigint, pedidos bigint,
  litros_cerveza numeric, litros_kombucha numeric, litros_otros numeric
)
LANGUAGE sql
STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(SUM(v.litros), 0),
    COALESCE(SUM(v.total_sin_impuesto), 0),
    COUNT(DISTINCT v.nombre_fantasia),
    COUNT(DISTINCT v.pedido),
    COALESCE(SUM(v.litros) FILTER (WHERE lower(coalesce(v.categoria_producto,'')) LIKE '%cerveza%'), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE lower(coalesce(v.categoria_producto,'')) LIKE '%kombucha%'), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE lower(coalesce(v.categoria_producto,'')) NOT LIKE '%cerveza%'
                                     AND lower(coalesce(v.categoria_producto,'')) NOT LIKE '%kombucha%'), 0)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia);
$function$;

-- Serie diaria para los sparklines de los KPI cards.
-- OJO: clientes/pedidos acá son POR DÍA, no el distinct del rango completo (un
-- cliente que compra 3 días cuenta 3 veces si se suman). Para el número grande
-- de la tarjeta usar ventas_dashboard_kpis; esto es sólo la forma de la curva.
CREATE OR REPLACE FUNCTION public.ventas_serie_diaria(
  p_ini date,
  p_fin date,
  p_provincias text[] DEFAULT NULL
)
RETURNS TABLE(fecha date, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
LANGUAGE sql
STABLE PARALLEL SAFE
AS $function$
  SELECT v.fecha_pedido,
         COALESCE(SUM(v.litros), 0),
         COALESCE(SUM(v.total_sin_impuesto), 0),
         COUNT(DISTINCT v.nombre_fantasia),
         COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.fecha_pedido
  ORDER BY v.fecha_pedido;
$function$;

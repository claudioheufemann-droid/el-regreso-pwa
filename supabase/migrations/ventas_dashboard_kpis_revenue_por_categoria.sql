-- Pedido de Claudio: agregar plata por categoria (cerveza/kombucha/otros)
-- a la tarjeta principal del dashboard, junto a los litros que ya existian.
--
-- De paso se corrige un bug preexistente encontrado al verificar los
-- numeros nuevos: categoria_producto puede venir como "Cerveza, Kombucha"
-- (string compuesto del ERP), y los FILTER WHERE ... LIKE '%cerveza%' /
-- LIKE '%kombucha%' independientes (la version vieja de esta funcion)
-- contaban esas filas en AMBOS baldes -litros_cerveza + litros_kombucha +
-- litros_otros NO sumaba litros_total, ya en produccion, no solo en el
-- revenue nuevo-. Se reemplaza por una sola clasificacion por fila (CASE,
-- cerveza gana empate sobre kombucha si el string trae ambas palabras),
-- igual al patron ya usado en ventas_detalle_productos: mutuamente
-- excluyente por construccion, la suma de las 3 categorias siempre da el
-- total.
CREATE OR REPLACE FUNCTION public.ventas_dashboard_kpis(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(
   litros numeric, revenue numeric, clientes bigint, pedidos bigint,
   litros_cerveza numeric, litros_kombucha numeric, litros_otros numeric,
   revenue_cerveza numeric, revenue_kombucha numeric, revenue_otros numeric
 )
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.litros, v.total_sin_impuesto,
      CASE
        WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%cerveza%'  THEN 'Cerveza'
        WHEN lower(coalesce(v.categoria_producto,'')) LIKE '%kombucha%' THEN 'Kombucha'
        ELSE 'Otros'
      END AS categoria
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  ),
  totales AS (SELECT COUNT(DISTINCT v.nombre_fantasia) AS clientes, COUNT(DISTINCT v.pedido) AS pedidos
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia))
  SELECT
    COALESCE(SUM(b.litros), 0),
    COALESCE(SUM(b.total_sin_impuesto), 0),
    t.clientes,
    t.pedidos,
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Cerveza'), 0),
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Kombucha'), 0),
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Otros'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Cerveza'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Kombucha'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Otros'), 0)
  FROM base b CROSS JOIN totales t
  GROUP BY t.clientes, t.pedidos;
$function$;

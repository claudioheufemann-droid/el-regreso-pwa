-- Mismo bug que el resto de misiones: p_vendedor comparaba contra el nombre
-- del ERP, y el unico llamador (app/api/misiones/calendario) le pasaba
-- user.nombre (nombre de login), que nunca calza. Un vendedor no-admin veia
-- el calendario de pedidos siempre vacio.
--
-- Se cambia a un arreglo (un usuario puede tener mas de un nombre en el ERP,
-- ver users.vendedores_erp).
DROP FUNCTION IF EXISTS public.get_calendario_pedidos(text, date, date);

CREATE FUNCTION public.get_calendario_pedidos(
  p_vendedores text[] DEFAULT NULL::text[], p_desde date DEFAULT CURRENT_DATE, p_hasta date DEFAULT (CURRENT_DATE + 31)
)
 RETURNS TABLE(nombre_fantasia text, vendedor_actual text, segmento text, tipo_cliente text, ciclo_promedio_dias integer, litros_por_pedido numeric, fecha_esperada date, es_primera boolean)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT cs.nombre_fantasia, cs.vendedor_actual, cs.segmento, cs.tipo_cliente,
           cs.ciclo_promedio_dias, cs.litros_por_pedido, cs.siguiente_compra_estimada
    FROM client_scores cs
    LEFT JOIN clientes_estado ce ON ce.nombre_fantasia = cs.nombre_fantasia
    WHERE (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR cs.vendedor_actual = ANY(p_vendedores))
      AND cs.ciclo_promedio_dias IS NOT NULL
      AND cs.ciclo_promedio_dias > 0
      AND cs.total_pedidos >= 3
      AND cs.tipo_cliente <> 'inactivo'
      AND COALESCE(ce.estado, 'activo') <> 'inactivo'
      AND cs.siguiente_compra_estimada IS NOT NULL
  ),
  proyeccion AS (
    SELECT
      b.nombre_fantasia, b.vendedor_actual, b.segmento, b.tipo_cliente,
      b.ciclo_promedio_dias, b.litros_por_pedido,
      gs::date AS fecha_esperada
    FROM base b
    CROSS JOIN LATERAL generate_series(
      b.siguiente_compra_estimada::timestamp,
      p_hasta::timestamp,
      make_interval(days => b.ciclo_promedio_dias)
    ) AS gs
  )
  SELECT
    nombre_fantasia, vendedor_actual, segmento, tipo_cliente,
    ciclo_promedio_dias, litros_por_pedido, fecha_esperada,
    (fecha_esperada = MIN(fecha_esperada) OVER (PARTITION BY nombre_fantasia)) AS es_primera
  FROM proyeccion
  WHERE fecha_esperada >= p_desde AND fecha_esperada <= p_hasta
  ORDER BY fecha_esperada, nombre_fantasia;
$function$;

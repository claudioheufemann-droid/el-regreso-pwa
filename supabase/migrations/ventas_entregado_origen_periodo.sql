-- Rediseno de la tarjeta "Pedidos de este periodo" (decision de Claudio,
-- 27-jul): la version anterior filtraba por fecha de PEDIDO y confundia,
-- porque usaba palabras ("despachado"/"entregado") que parecian referirse
-- al mismo numero que la tarjeta principal (que SI filtra por fecha de
-- ENTREGA) y casi nunca coincidian.
--
-- Regla de Claudio, explicita: el periodo lo define la fecha de ENTREGA,
-- sin importar cuando se tomo el pedido. Esta funcion usa exactamente el
-- mismo WHERE que ventas_dashboard_kpis (misma poblacion que el numero de
-- arriba, "litros_total" tiene que dar identico), y la separa segun si el
-- pedido se tomo ANTES de este periodo (backlog que se puso al dia) o
-- DENTRO de este periodo (se pidio y se entrego en el mismo ciclo).
--
-- No excluye "Empaque y Distribucion" a proposito: ventas_dashboard_kpis
-- tampoco lo hace, y litros_total/revenue_total tienen que calzar exacto
-- con esa tarjeta.
CREATE FUNCTION public.ventas_entregado_origen_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(
   litros_total numeric, revenue_total numeric, pedidos_total bigint,
   litros_backlog numeric, revenue_backlog numeric, pedidos_backlog bigint,
   litros_mismo_periodo numeric, revenue_mismo_periodo numeric, pedidos_mismo_periodo bigint
 )
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(SUM(v.litros), 0),
    COALESCE(SUM(v.total_sin_impuesto), 0),
    COUNT(DISTINCT v.pedido),
    COALESCE(SUM(v.litros) FILTER (WHERE v.fecha_pedido < p_ini), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.fecha_pedido < p_ini), 0),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.fecha_pedido < p_ini),
    COALESCE(SUM(v.litros) FILTER (WHERE v.fecha_pedido >= p_ini), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.fecha_pedido >= p_ini), 0),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.fecha_pedido >= p_ini)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia);
$function$;

-- Listado de pedidos para el drill-down de cada bucket de la tarjeta de
-- arriba. Mismo shape que ventas_pedidos_por_estado (que queda intacta,
-- la sigue usando ventas_entregas_por_vendedor / el badge "+X por
-- entregar" de cada vendedor en el ranking -eso no cambio).
CREATE FUNCTION public.ventas_pedidos_por_origen(p_ini date, p_fin date, p_backlog boolean, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(pedido text, cliente text, vendedor text, fecha_pedido date, fecha_entrega date, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.nombre_fantasia), MAX(v.vendedor_actual),
         MAX(v.fecha_pedido), MAX(v.fecha_entrega),
         SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (CASE WHEN p_backlog THEN v.fecha_pedido < p_ini ELSE v.fecha_pedido >= p_ini END)
    AND v.pedido IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) ASC;
$function$;

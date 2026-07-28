-- Pedido de Claudio: el listado "Clientes que compraron" debe venir ordenado
-- por fecha de compra, de la más reciente a la más antigua (antes salía por
-- litros descendente). Se ordena por ultima_compra DESC; empate en la misma
-- fecha se desempata por litros para que el más relevante del día vaya primero.
-- NULLS LAST protege el caso de un cliente sin fecha (no debería pasar con el
-- filtro de rango, pero si pasa que no encabece la lista).
--
-- Sólo se toca la sobrecarga de 4 parámetros (con p_por_entrega): es la que
-- usa /api/ventas/detalle. La de 3 parámetros queda como está.
CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = v.nombre_fantasia
        AND (CASE WHEN p_por_entrega THEN v2.entrega_informada AND v2.fecha_entrega >= p_ini AND v2.fecha_entrega <= p_fin
                  ELSE v2.fecha_pedido >= p_ini AND v2.fecha_pedido <= p_fin END)
      GROUP BY v2.vendedor_actual ORDER BY SUM(v2.litros) DESC LIMIT 1),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

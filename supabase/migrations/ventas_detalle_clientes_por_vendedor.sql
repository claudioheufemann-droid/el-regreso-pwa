-- Clientes de un vendedor/region especifico (ranking del dashboard de
-- Ventas): al tocar "Los Rios" en el ranking, que locales compraron y
-- cuanto de SU venta corresponde a esa cartera. Mismo shape y orden que
-- ventas_detalle_clientes (mas reciente primero), filtrado por
-- vendedor_actual = ANY(p_vendedores) -la app pasa todos los nombres ERP
-- historicos que resuelven al nombre vigente via nombresErpDe(), para no
-- perder ventas viejas registradas bajo un nombre que el ERP ya no usa.
CREATE FUNCTION public.ventas_detalle_clientes_por_vendedor(
  p_vendedores text[], p_ini date, p_fin date,
  p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = v.nombre_fantasia
        AND v2.vendedor_actual = ANY(p_vendedores)
        AND (CASE WHEN p_por_entrega THEN v2.entrega_informada AND v2.fecha_entrega >= p_ini AND v2.fecha_entrega <= p_fin
                  ELSE v2.fecha_pedido >= p_ini AND v2.fecha_pedido <= p_fin END)
      GROUP BY v2.vendedor_actual ORDER BY SUM(v2.litros) DESC LIMIT 1),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END)
  FROM ventas v
  WHERE v.vendedor_actual = ANY(p_vendedores)
    AND (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

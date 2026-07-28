-- Overload legacy de 3 argumentos (sin p_por_entrega), sin uso conocido en
-- el frontend actual (todo llama a la version de 4 args), pero se corrige
-- igual por si algo mas la invoca directamente.
CREATE OR REPLACE FUNCTION public.ventas_dashboard_kpis(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(litros numeric, revenue numeric, clientes bigint, pedidos bigint, litros_cerveza numeric, litros_kombucha numeric, litros_otros numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(SUM(v.litros), 0),
    COALESCE(SUM(v.total_sin_impuesto), 0),
    COUNT(DISTINCT v.nombre_fantasia),
    COUNT(DISTINCT v.pedido),
    COALESCE(SUM(v.litros) FILTER (WHERE _categoria_normalizada(v.producto, v.categoria_producto) = 'Cerveza'), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE _categoria_normalizada(v.producto, v.categoria_producto) = 'Kombucha'), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE _categoria_normalizada(v.producto, v.categoria_producto) = 'Otros'), 0)
  FROM ventas v
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto);
$function$;

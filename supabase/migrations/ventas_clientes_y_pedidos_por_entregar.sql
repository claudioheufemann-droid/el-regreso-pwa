-- Drill-down de la nueva tarjeta "Venta por entregar" del dashboard de
-- Ventas: clientes con pedidos tomados en el periodo que aun no se
-- despachan (mismo criterio que ya usaba EntregasRango/el "+X por
-- entregar" de la tarjeta principal: fecha_pedido en el rango,
-- entrega_informada=true, entregado=false). No lleva p_por_entrega -este
-- concepto siempre es por fecha de pedido, nunca de entrega, por
-- definicion (todavia no hay fecha de entrega).
--
-- No se prorratea Empaque y Distribucion aca: al ser totales POR PEDIDO
-- (no por producto), sumar todas las filas del pedido -incluido Empaque-
-- ya da el monto real correcto, sin necesitar el prorrateo que si hace
-- falta cuando se desglosa por producto.
CREATE FUNCTION public.ventas_clientes_por_entregar(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    v.nombre_fantasia,
    MAX(v.vendedor_actual),
    MAX(v.localidad),
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido),
    MAX(v.fecha_pedido)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY v.nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

-- Pedidos pendientes de UN cliente especifico (al tocar su fila en la lista
-- de arriba): numero de pedido, fecha, litros, monto total. El precio por
-- litro ("el unitario") se calcula en el frontend (revenue/litros) porque
-- un pedido mezcla productos/envases distintos, no tiene un "unitario"
-- unico de fabrica como si lo tiene una lata o un barril.
CREATE FUNCTION public.ventas_pedidos_pendientes_cliente(p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(pedido text, fecha_pedido date, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.fecha_pedido), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) DESC;
$function$;

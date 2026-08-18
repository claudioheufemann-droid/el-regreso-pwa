-- Pedidos de un cliente que el ERP aún no informó con estado de entrega
-- (entrega_informada = false: sin fecha_entrega, ni pendiente ni entregado).
--
-- Bug real detectado el 2026-08-03: ventas_detalle_clientes con p_por_entrega=false
-- (rangos anchos tipo "Año", que filtran por fecha_pedido) cuenta estos pedidos
-- dentro del bucket "entregado" -su CASE sólo mira fecha_pedido, no
-- entrega_informada- así que el cliente aparece con "2 pedidos" en el listado.
-- Pero ventas_pedidos_pendientes_cliente y ventas_pedidos_entregados_cliente
-- exigen entrega_informada=true en TODOS los casos, así que al tocar el
-- cliente esos pedidos no aparecían en ninguna de las dos listas: "Sin
-- pedidos en este rango" pese al conteo. Afectaba 6.822 pedidos de 388
-- clientes (verificado en producción).
--
-- Esta función cierra el hueco: se pide además de las otras dos, sólo cuando
-- p_por_entrega=false (con p_por_entrega=true estos pedidos nunca se cuentan,
-- porque no tienen fecha_entrega -ver VentasHoyClient.tsx).
CREATE OR REPLACE FUNCTION public.ventas_pedidos_sin_informar_cliente(
  p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[]
)
 RETURNS TABLE(pedido text, fecha_pedido date, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.fecha_pedido), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND NOT v.entrega_informada
    AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) DESC;
$function$;

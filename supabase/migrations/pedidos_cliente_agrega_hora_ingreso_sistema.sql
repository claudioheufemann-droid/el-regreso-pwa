-- Pedido de Claudio: además de la hora de entrega, quiere ver la hora en
-- que el pedido "entró al sistema". El ERP (Gestión Cervecera) nunca
-- reporta la hora real en que el vendedor tomó el pedido -sólo la fecha-,
-- así que se usa `ventas.created_at`: el momento en que nuestro propio
-- sync (corre cada 15 min) insertó la fila. Es una aproximación -puede ir
-- hasta ~15 min despues del pedido real, o más si el sync estuvo caído-
-- pero es el único dato real disponible, y es exactamente "la hora en que
-- el sistema registró el pedido" que Claudio pidió antes.

DROP FUNCTION IF EXISTS public.ventas_pedidos_pendientes_cliente(text, date, date, text[]);
DROP FUNCTION IF EXISTS public.ventas_pedidos_entregados_cliente(text, date, date, text[], boolean);

CREATE FUNCTION public.ventas_pedidos_pendientes_cliente(
  p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[]
)
RETURNS TABLE(pedido text, fecha_pedido date, creado_en timestamptz, litros numeric, revenue numeric)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.fecha_pedido), MIN(v.created_at), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND p_fin >= CURRENT_DATE
    AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) DESC;
$function$;

CREATE FUNCTION public.ventas_pedidos_entregados_cliente(
  p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
RETURNS TABLE(
  pedido text, fecha_pedido date, creado_en timestamptz,
  fecha_entrega date, fecha_entrega_hora timestamp without time zone,
  litros numeric, revenue numeric
)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.fecha_pedido), MIN(v.created_at), MAX(v.fecha_entrega), MAX(v.fecha_entrega_hora), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND v.entrega_informada
    AND (CASE WHEN p_por_entrega THEN v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_entrega) DESC NULLS LAST, MAX(v.fecha_pedido) DESC;
$function$;

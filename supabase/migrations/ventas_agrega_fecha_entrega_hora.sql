-- La hora exacta de entrega SÍ viene en el reporte del ERP (Gestión
-- Cervecera), a diferencia de la hora de pedido, que el ERP nunca reporta.
-- Se guarda sin zona horaria: es la hora literal que muestra el ERP
-- (hora de Chile), sin intentar adivinar el offset UTC/DST.
-- Pedido de Claudio, 29-jul-2026: quiere ver a qué hora se marcó cada
-- pedido como entregado dentro del detalle del ranking de vendedores.
ALTER TABLE public.ventas ADD COLUMN IF NOT EXISTS fecha_entrega_hora timestamp without time zone;

CREATE FUNCTION public.ventas_pedidos_entregados_cliente(p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(pedido text, fecha_pedido date, fecha_entrega date, fecha_entrega_hora timestamp, litros numeric, revenue numeric)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.fecha_pedido), MAX(v.fecha_entrega), MAX(v.fecha_entrega_hora), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND v.entrega_informada
    AND (CASE WHEN p_por_entrega THEN v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_entrega) DESC NULLS LAST, MAX(v.fecha_pedido) DESC;
$function$

-- Corrige el intento anterior (clientes_que_compraron_incluye_pendientes_orden_por_hora):
-- usar ventas.created_at para ordenar por "hora del pedido" resultó estar mal
-- fundamentado. El proceso de sync (app/api/upload-ventas) borra e
-- reinserta filas completas por pedido en cada corrida -no hace UPDATE-,
-- así que created_at es "la última vez que el sync tocó esta fila", no
-- "cuándo se hizo el pedido". Verificado contra la base: la corrida de
-- las 18:00 UTC de hoy (29-jul) puso el MISMO created_at a 1763 filas
-- cuyo fecha_pedido va desde el 18-jun hasta el 29-jul -mismo timestamp
-- para un pedido de hace 6 semanas y uno de hoy-. Usarlo para ordenar
-- daba resultados incorrectos (ej. un pedido de ayer podía "ganarle" por
-- una fracción de segundo a uno de hoy, si ambos cayeron en el mismo lote
-- de resync).
--
-- La corrección real: ordenar por la FECHA real más reciente del cliente
-- (GREATEST entre fecha de entrega y fecha de pedido pendiente, ambas
-- columnas DATE que sí vienen del ERP) — así un pedido de HOY (aunque
-- pendiente) le gana a una entrega de AYER, sin depender del sync.
--
-- La hora sólo se muestra cuando es real: fecha_entrega_hora (que el ERP
-- sí reporta) cuando el evento más reciente del cliente fue una entrega.
-- Si el evento más reciente es un pedido aún pendiente, no hay hora real
-- disponible -el ERP nunca la reporta- así que no se inventa una.

DROP FUNCTION IF EXISTS public.ventas_detalle_clientes(date, date, text[], boolean);

CREATE FUNCTION public.ventas_detalle_clientes(
  p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
RETURNS TABLE(
  cliente text, vendedor text, localidad text, litros numeric, revenue numeric,
  pedidos bigint, ultima_compra date, ultima_compra_hora timestamp without time zone,
  litros_por_entregar numeric, revenue_por_entregar numeric
)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH entregado AS (
    SELECT
      v.nombre_fantasia AS cliente, MAX(v.localidad) AS localidad,
      SUM(v.litros) AS litros, SUM(v.total_sin_impuesto) AS revenue,
      COUNT(DISTINCT v.pedido) AS pedidos,
      MAX(CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END) AS ultima_compra,
      MAX(v.fecha_entrega_hora) AS ultima_hora
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
    GROUP BY v.nombre_fantasia
  ),
  pendiente AS (
    SELECT
      v.nombre_fantasia AS cliente, MAX(v.localidad) AS localidad,
      SUM(v.litros) AS litros_pend, SUM(v.total_sin_impuesto) AS revenue_pend,
      COUNT(DISTINCT v.pedido) AS pedidos_pend,
      MAX(v.fecha_pedido) AS ultima_compra_pend
    FROM ventas v
    WHERE p_fin >= CURRENT_DATE
      AND v.fecha_pedido <= p_fin
      AND v.entrega_informada AND NOT v.entregado
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
    GROUP BY v.nombre_fantasia
  )
  SELECT
    COALESCE(e.cliente, p.cliente),
    (SELECT v2.vendedor_actual FROM ventas v2
      WHERE v2.nombre_fantasia = COALESCE(e.cliente, p.cliente)
      ORDER BY v2.fecha_pedido DESC LIMIT 1),
    COALESCE(e.localidad, p.localidad),
    COALESCE(e.litros, 0),
    COALESCE(e.revenue, 0),
    COALESCE(e.pedidos, 0) + COALESCE(p.pedidos_pend, 0),
    GREATEST(e.ultima_compra, p.ultima_compra_pend),
    CASE
      WHEN p.ultima_compra_pend IS NULL THEN e.ultima_hora
      WHEN e.ultima_compra IS NULL THEN NULL
      WHEN e.ultima_compra >= p.ultima_compra_pend THEN e.ultima_hora
      ELSE NULL
    END,
    COALESCE(p.litros_pend, 0),
    COALESCE(p.revenue_pend, 0)
  FROM entregado e
  FULL OUTER JOIN pendiente p ON p.cliente = e.cliente
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

-- Estado de entrega de cada venta (entregado / por entregar / sin dato).
--
-- Por qué: el informe del ERP filtra por FECHA DE ENTREGA, no de pedido, y esa
-- fecha no se guardaba. Sin ella era imposible distinguir en la app lo ya
-- despachado de lo que sigue pendiente, y llevó a creer que "faltaban ventas"
-- cuando en realidad eran pedidos tomados pero aún no entregados.

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS fecha_entrega           date,
  ADD COLUMN IF NOT EXISTS fecha_entrega_estimada  date;

ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS entregado boolean
  GENERATED ALWAYS AS (fecha_entrega IS NOT NULL) STORED;

-- fecha_entrega NULL es ambiguo: puede ser un pedido pendiente o una fila
-- cargada antes de guardar la columna. Ejemplo real: 1.079 filas de junio bajo
-- 'Equipo Ventas' (carga manual del 16-jun); el ERP ya no reporta ese nombre,
-- así que nunca van a recibir fecha de entrega. Mostrarlas como "por entregar"
-- diría que hay 5.657 L sin despachar de hace dos meses, que es falso.
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS entrega_informada boolean NOT NULL DEFAULT false;

UPDATE ventas SET entrega_informada = true WHERE created_at >= '2026-07-26 20:45:00+00';

CREATE INDEX IF NOT EXISTS idx_ventas_fecha_entrega     ON ventas (fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_ventas_entregado         ON ventas (entregado);
CREATE INDEX IF NOT EXISTS idx_ventas_entrega_informada ON ventas (entrega_informada);

COMMENT ON COLUMN ventas.fecha_entrega IS
  'Fecha real de entrega segun el ERP. NULL = pedido aun no entregado.';
COMMENT ON COLUMN ventas.entregado IS
  'Derivada de fecha_entrega. Leer solo si entrega_informada = true.';
COMMENT ON COLUMN ventas.entrega_informada IS
  'true = el archivo del ERP traia el estado de entrega de esta fila.';

-- Desglose en TRES estados para el dashboard.
DROP FUNCTION IF EXISTS public.ventas_entregas_periodo(date, date, text[]);

CREATE FUNCTION public.ventas_entregas_periodo(
  p_ini date, p_fin date, p_provincias text[] DEFAULT NULL
)
RETURNS TABLE(
  litros_entregados numeric, litros_por_entregar numeric, litros_sin_dato numeric,
  revenue_entregado numeric, revenue_por_entregar numeric,
  pedidos_entregados bigint, pedidos_por_entregar bigint
)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(SUM(v.litros) FILTER (WHERE v.entrega_informada AND v.entregado), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE v.entrega_informada AND NOT v.entregado), 0),
    COALESCE(SUM(v.litros) FILTER (WHERE NOT v.entrega_informada), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.entrega_informada AND v.entregado), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.entrega_informada AND NOT v.entregado), 0),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.entrega_informada AND v.entregado),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.entrega_informada AND NOT v.entregado)
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia);
$function$;

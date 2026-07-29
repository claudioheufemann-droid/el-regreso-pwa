-- Corrige el criterio de "pendiente de entrega" para que un pedido no
-- entregado NO quede atrapado en el período 24->23 en que fue tomado.
--
-- Antes: estas funciones filtraban por `fecha_pedido BETWEEN p_ini AND
-- p_fin`, así que un pedido tomado el 21-jul (período Julio) que sigue sin
-- entregarse sólo aparecía como "pendiente" mientras se mirara el período
-- Julio. Al pasar a Agosto (24-jul en adelante), ese pedido simplemente
-- desaparecía de la vista -no se "perdía" en la base, pero sí en el
-- dashboard, que es donde se hace seguimiento- porque Agosto sólo mostraba
-- pendientes con fecha_pedido dentro de Agosto.
--
-- Ahora: el pedido pendiente se "traslada" automáticamente al período
-- VIGENTE (el que contiene hoy) para efectos de seguimiento, sin importar
-- en qué período 24->23 fue tomado originalmente. Un período ya CERRADO
-- (p_fin < hoy) siempre da 0 pendientes -ese backlog ya vive en el período
-- vigente, no se duplica en el cerrado-. La condición `p_fin >= CURRENT_DATE`
-- es lo que distingue "período vigente" (incluye hoy) de "período cerrado".
--
-- La venta y la comisión en sí (ventas_dashboard_kpis, ventas_agg_periodo,
-- etc.) NO cambian con esta migración: ya se contabilizan por fecha_entrega
-- cuando el período es reciente (p_por_entrega=true), es decir, ya sólo
-- suman al período en que el pedido fue efectivamente entregado. Lo único
-- que faltaba corregir era que el pedido pendiente no se perdiera de vista
-- mientras tanto.

CREATE OR REPLACE FUNCTION public.ventas_entregas_periodo(
  p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  litros_entregados numeric, litros_por_entregar numeric, litros_sin_dato numeric,
  revenue_entregado numeric, revenue_por_entregar numeric,
  pedidos_entregados bigint, pedidos_por_entregar bigint
)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.litros, v.total_sin_impuesto, v.pedido, v.entrega_informada, v.entregado
    FROM ventas v
    WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
  ),
  pendiente AS (
    SELECT v.litros, v.total_sin_impuesto, v.pedido
    FROM ventas v
    WHERE p_fin >= CURRENT_DATE
      AND v.fecha_pedido <= p_fin
      AND v.entrega_informada AND NOT v.entregado
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
  )
  SELECT
    COALESCE((SELECT SUM(b.litros) FROM base b WHERE b.entrega_informada AND b.entregado), 0),
    COALESCE((SELECT SUM(p.litros) FROM pendiente p), 0),
    COALESCE((SELECT SUM(b.litros) FROM base b WHERE NOT b.entrega_informada), 0),
    COALESCE((SELECT SUM(b.total_sin_impuesto) FROM base b WHERE b.entrega_informada AND b.entregado), 0),
    COALESCE((SELECT SUM(p.total_sin_impuesto) FROM pendiente p), 0),
    COALESCE((SELECT COUNT(DISTINCT b.pedido) FROM base b WHERE b.entrega_informada AND b.entregado), 0),
    COALESCE((SELECT COUNT(DISTINCT p.pedido) FROM pendiente p), 0);
$function$;

CREATE OR REPLACE FUNCTION public.ventas_entregas_por_vendedor(
  p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[]
)
RETURNS TABLE(vendedor text, litros_por_entregar numeric, pedidos_por_entregar bigint, revenue_por_entregar numeric)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual,
         COALESCE(SUM(v.litros), 0),
         COUNT(DISTINCT v.pedido),
         COALESCE(SUM(v.total_sin_impuesto), 0)
  FROM ventas v
  WHERE p_fin >= CURRENT_DATE
    AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_clientes_por_entregar(
  p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[]
)
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
  WHERE p_fin >= CURRENT_DATE
    AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_pedidos_pendientes_cliente(
  p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[]
)
RETURNS TABLE(pedido text, fecha_pedido date, litros numeric, revenue numeric)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.fecha_pedido), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND p_fin >= CURRENT_DATE
    AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes_por_vendedor(
  p_vendedores text[], p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
RETURNS TABLE(
  cliente text, vendedor text, localidad text, litros numeric, revenue numeric,
  pedidos bigint, ultima_compra date, litros_por_entregar numeric, revenue_por_entregar numeric
)
LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH entregado AS (
    SELECT
      v.nombre_fantasia AS cliente, MAX(v.localidad) AS localidad,
      SUM(v.litros) AS litros, SUM(v.total_sin_impuesto) AS revenue,
      COUNT(DISTINCT v.pedido) AS pedidos,
      MAX(CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END) AS ultima_compra
    FROM ventas v
    WHERE v.vendedor_actual = ANY(p_vendedores)
      AND (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
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
    WHERE v.vendedor_actual = ANY(p_vendedores)
      AND p_fin >= CURRENT_DATE
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
      WHERE v2.nombre_fantasia = COALESCE(e.cliente, p.cliente) AND v2.vendedor_actual = ANY(p_vendedores)
      ORDER BY v2.fecha_pedido DESC LIMIT 1),
    COALESCE(e.localidad, p.localidad),
    COALESCE(e.litros, 0),
    COALESCE(e.revenue, 0),
    COALESCE(e.pedidos, 0) + COALESCE(p.pedidos_pend, 0),
    COALESCE(e.ultima_compra, p.ultima_compra_pend),
    COALESCE(p.litros_pend, 0),
    COALESCE(p.revenue_pend, 0)
  FROM entregado e
  FULL OUTER JOIN pendiente p ON p.cliente = e.cliente
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

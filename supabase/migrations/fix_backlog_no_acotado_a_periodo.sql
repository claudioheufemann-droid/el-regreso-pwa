-- =============================================================================
-- FIX (28-ago-2026): "por entregar" / backlog pendiente sin piso de fecha
-- =============================================================================
-- Detectado en una auditoría: la tarjeta de Ventas > Período mostraba
-- "Entregado 896,6 L + Por entregar 700,7 L = Total 1.597,3 L", pero el ERP
-- real del período daba 1.520,3 L. Los 77 L de más eran pedidos PENDIENTES
-- de ANTES del período (backlog viejo) que igual se contaban como "de este
-- período" porque la condición de "pendiente" solo tenía `fecha_pedido <=
-- p_fin`, sin el piso `>= p_ini` que sí tenían las mismas funciones para la
-- parte "entregado".
--
-- Afectaba 7 funciones — la más grave, `comision_gerente_por_entregar`,
-- podía estar inflando el pago de comisión del gerente con pedidos viejos
-- (bajó de $2.148.684/700,7 L a $1.310.943/445,2 L al corregirlo).
--
-- Decisión del usuario (28-ago-2026): "por entregar" del período debe
-- mostrar SOLO pedidos hechos DENTRO de ese período y aún no despachados —
-- no el backlog total sin importar cuándo se pidió. Si en el futuro se
-- necesita ver el backlog completo, debe pedirse como métrica aparte y
-- nunca sumarse a "litros del período" sin dejarlo explícito en la UI.
--
-- Patrón para detectar este bug en el futuro: buscar `fecha_pedido <= p_fin`
-- sin un `fecha_pedido >= p_ini` que lo acompañe en la MISMA condición.
-- =============================================================================

CREATE OR REPLACE FUNCTION ventas_entregas_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
RETURNS TABLE(litros_entregados numeric, litros_por_entregar numeric, litros_sin_dato numeric, revenue_entregado numeric, revenue_por_entregar numeric, pedidos_entregados bigint, pedidos_por_entregar bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
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
      AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
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
$$;

CREATE OR REPLACE FUNCTION ventas_entregas_por_vendedor(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
RETURNS TABLE(vendedor text, litros_por_entregar numeric, pedidos_por_entregar bigint, revenue_por_entregar numeric)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT v.vendedor_actual,
         COALESCE(SUM(v.litros), 0),
         COUNT(DISTINCT v.pedido),
         COALESCE(SUM(v.total_sin_impuesto), 0)
  FROM ventas v
  WHERE p_fin >= CURRENT_DATE
    AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$$;

CREATE OR REPLACE FUNCTION comision_gerente_por_entregar(p_ini date, p_fin date, p_vendedores text[])
RETURNS TABLE(venta_neta numeric, litros numeric, pedidos bigint)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  select
    coalesce(sum(v.total_sin_impuesto), 0),
    coalesce(sum(v.litros), 0),
    coalesce(count(distinct v.pedido), 0)
  from ventas v
  where p_fin >= current_date
    and v.fecha_pedido >= p_ini and v.fecha_pedido <= p_fin
    and v.entrega_informada and not v.entregado
    and v.vendedor_actual = any(p_vendedores)
    and v.nombre_fantasia is not null
    and not _excluir_cliente(v.nombre_fantasia)
    and not _excluir_producto(v.producto);
$$;

CREATE OR REPLACE FUNCTION ventas_clientes_por_entregar(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
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
    AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$$;

CREATE OR REPLACE FUNCTION ventas_pedidos_pendientes_cliente(p_cliente text, p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
RETURNS TABLE(pedido text, fecha_pedido date, litros numeric, revenue numeric)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT v.pedido, MAX(v.fecha_pedido), SUM(v.litros), SUM(v.total_sin_impuesto)
  FROM ventas v
  WHERE v.nombre_fantasia = p_cliente
    AND p_fin >= CURRENT_DATE
    AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) DESC;
$$;

CREATE OR REPLACE FUNCTION ventas_detalle_clientes(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date, ultima_compra_hora timestamp without time zone, litros_por_entregar numeric, revenue_por_entregar numeric)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
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
      AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
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
$$;

CREATE OR REPLACE FUNCTION ventas_detalle_clientes_por_vendedor(p_vendedores text[], p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date, litros_por_entregar numeric, revenue_por_entregar numeric)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
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
      AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
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
$$;

CREATE OR REPLACE FUNCTION ventas_pedidos_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
RETURNS TABLE(pedido text, cliente text, vendedor text, localidad text, fecha_pedido date, fecha_entrega date, fecha_entrega_hora timestamp without time zone, litros numeric, revenue numeric, entregado boolean)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  with base as (
    select v.pedido, v.nombre_fantasia, v.vendedor_actual, v.localidad,
           v.fecha_pedido, v.fecha_entrega, v.fecha_entrega_hora,
           v.litros, v.total_sin_impuesto, v.entregado
    from ventas v
    where v.pedido is not null
      and (
        (case when p_por_entrega
              then v.entrega_informada and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
              else v.fecha_pedido >= p_ini and v.fecha_pedido <= p_fin end)
        or (p_fin >= current_date and v.fecha_pedido >= p_ini and v.fecha_pedido <= p_fin
            and v.entrega_informada and not v.entregado)
      )
      and (p_provincias is null or cardinality(p_provincias) = 0 or v.provincia = any(p_provincias))
      and v.nombre_fantasia is not null and not _excluir_cliente(v.nombre_fantasia)
      and not _excluir_producto(v.producto)
  )
  select b.pedido,
         max(b.nombre_fantasia),
         max(b.vendedor_actual),
         max(b.localidad),
         max(b.fecha_pedido),
         max(b.fecha_entrega),
         max(b.fecha_entrega_hora),
         sum(b.litros),
         sum(b.total_sin_impuesto),
         bool_and(coalesce(b.entregado, false))
  from base b
  group by b.pedido
  order by greatest(max(b.fecha_entrega), max(b.fecha_pedido)) desc nulls last,
           max(b.fecha_entrega_hora) desc nulls last;
$$;

-- ventas_pedidos_por_origen NO se toca: ya tiene su propio flag explícito
-- `p_backlog` (fecha_pedido < p_ini vs >= p_ini) — diseño correcto desde el
-- principio, no es el mismo bug.

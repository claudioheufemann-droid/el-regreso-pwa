-- Pedido de Claudio (10-sep-2026): "en el área de ventas solo hay que ver la
-- venta de los vendedores Yadro, Marcelo, Marion, Nicol y Claudio" (+ OnLine,
-- confirmado aparte). Hoy el dashboard de /ventas suma TODOS los vendedor_actual
-- (incluye CERVECERÍA, Rodrigo Solis, Incobrables, No indica), mientras que el
-- ranking de vendedores (armarVendedores en hoyData.ts) ya los excluye vía un
-- blocklist en TS -> los totales de arriba no calzaban con la suma del ranking
-- de abajo.
--
-- Se agrega p_vendedores a cada RPC del dashboard/área comercial que hoy no lo
-- tiene, como una NUEVA sobrecarga (incluir un parámetro nuevo con DEFAULT NULL
-- crea una firma distinta en Postgres; no reemplaza la función existente, así
-- que cualquier otro caller que no lo pase sigue funcionando exactamente igual).
-- Mismo patrón que p_provincias en todo el archivo: NULL o vacío = sin filtro.
--
-- p_vendedores se arma en la app con `erpNamesDeGrupo` (lib/types.ts) sobre
-- VENDEDORES_AREA_VENTAS (nombres CANÓNICOS) — no se hardcodea una lista de
-- nombres crudos del ERP: así un futuro renombre (como pasó con "Los Rios" y
-- con "Marion" sin apellido, ver VENDEDOR_ALIAS) sólo necesita un alias nuevo
-- ahí, no tocar cada función SQL de nuevo.
--
-- NO se toca ventas_consumo_interno_periodo (PDV/Ferias/BaseCamp): es consumo
-- interno/regalos, no venta de un vendedor de terreno — es una métrica aparte.

CREATE OR REPLACE FUNCTION public.ventas_dashboard_kpis(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(litros numeric, revenue numeric, clientes bigint, pedidos bigint, litros_cerveza numeric, litros_kombucha numeric, litros_otros numeric, revenue_cerveza numeric, revenue_kombucha numeric, revenue_otros numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.litros, v.total_sin_impuesto,
      _categoria_normalizada(v.producto, v.categoria_producto) AS categoria
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
  ),
  totales AS (SELECT COUNT(DISTINCT v.nombre_fantasia) AS clientes, COUNT(DISTINCT v.pedido) AS pedidos
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto))
  SELECT
    COALESCE(SUM(b.litros), 0),
    COALESCE(SUM(b.total_sin_impuesto), 0),
    t.clientes,
    t.pedidos,
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Cerveza'), 0),
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Kombucha'), 0),
    COALESCE(SUM(b.litros) FILTER (WHERE b.categoria = 'Otros'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Cerveza'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Kombucha'), 0),
    COALESCE(SUM(b.total_sin_impuesto) FILTER (WHERE b.categoria = 'Otros'), 0)
  FROM base b CROSS JOIN totales t
  GROUP BY t.clientes, t.pedidos;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_agg_periodo(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(vendedor text, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual, SUM(v.litros), SUM(v.total_sin_impuesto),
         COUNT(DISTINCT v.nombre_fantasia), COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_envases_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(tipo text, unidades numeric, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    CASE
      WHEN v.envase ILIKE '%barril%' AND _categoria_normalizada(v.producto, v.categoria_producto) = 'Cerveza'  THEN 'Barril Cerveza'
      WHEN v.envase ILIKE '%barril%' AND _categoria_normalizada(v.producto, v.categoria_producto) = 'Kombucha' THEN 'Barril Kombucha'
      WHEN (v.envase ILIKE '%lata%' OR v.envase ILIKE '%354%' OR v.envase ILIKE '%473%') AND _categoria_normalizada(v.producto, v.categoria_producto) = 'Cerveza'  THEN 'Lata Cerveza'
      WHEN (v.envase ILIKE '%lata%' OR v.envase ILIKE '%354%' OR v.envase ILIKE '%473%') AND _categoria_normalizada(v.producto, v.categoria_producto) = 'Kombucha' THEN 'Lata Kombucha'
      ELSE 'Otros'
    END AS tipo,
    ROUND(SUM(
      CASE
        WHEN v.envase ILIKE '%barril%' THEN v.litros / 30.0
        WHEN v.envase ILIKE '%354%'    THEN v.litros / 0.354
        WHEN v.envase ILIKE '%473%'    THEN v.litros / 0.473
        ELSE 0
      END
    )) AS unidades,
    SUM(v.litros)             AS litros,
    SUM(v.total_sin_impuesto) AS revenue
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND v.envase IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY 1
  HAVING SUM(v.litros) <> 0
  ORDER BY 3 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_entregas_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(litros_entregados numeric, litros_por_entregar numeric, litros_sin_dato numeric, revenue_entregado numeric, revenue_por_entregar numeric, pedidos_entregados bigint, pedidos_por_entregar bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.litros, v.total_sin_impuesto, v.pedido, v.entrega_informada, v.entregado
    FROM ventas v
    WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
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
      AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
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

CREATE OR REPLACE FUNCTION public.ventas_entregado_origen_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(litros_total numeric, revenue_total numeric, pedidos_total bigint, litros_backlog numeric, revenue_backlog numeric, pedidos_backlog bigint, litros_mismo_periodo numeric, revenue_mismo_periodo numeric, pedidos_mismo_periodo bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    COALESCE(SUM(v.litros), 0),
    COALESCE(SUM(v.total_sin_impuesto), 0),
    COUNT(DISTINCT v.pedido),
    COALESCE(SUM(v.litros) FILTER (WHERE v.fecha_pedido < p_ini), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.fecha_pedido < p_ini), 0),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.fecha_pedido < p_ini),
    COALESCE(SUM(v.litros) FILTER (WHERE v.fecha_pedido >= p_ini), 0),
    COALESCE(SUM(v.total_sin_impuesto) FILTER (WHERE v.fecha_pedido >= p_ini), 0),
    COUNT(DISTINCT v.pedido) FILTER (WHERE v.fecha_pedido >= p_ini)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto);
$function$;

CREATE OR REPLACE FUNCTION public.ventas_entregas_por_vendedor(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(vendedor text, litros_por_entregar numeric, pedidos_por_entregar bigint, revenue_por_entregar numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.vendedor_actual,
         COALESCE(SUM(v.litros), 0),
         COUNT(DISTINCT v.pedido),
         COALESCE(SUM(v.total_sin_impuesto), 0)
  FROM ventas v
  WHERE p_fin >= CURRENT_DATE
    AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.vendedor_actual;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_serie_diaria(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(fecha date, litros numeric, revenue numeric, clientes bigint, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT (CASE WHEN p_por_entrega THEN v.fecha_entrega ELSE v.fecha_pedido END),
         COALESCE(SUM(v.litros), 0),
         COALESCE(SUM(v.total_sin_impuesto), 0),
         COUNT(DISTINCT v.nombre_fantasia),
         COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY 1
  ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_clientes(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(cliente text, vendedor text, localidad text, litros numeric, revenue numeric, pedidos bigint, ultima_compra date, ultima_compra_hora timestamp without time zone, litros_por_entregar numeric, revenue_por_entregar numeric)
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
      AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
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
      AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
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
  ORDER BY 7 DESC NULLS LAST, 8 DESC NULLS LAST, 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_detalle_productos(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(producto text, envase text, categoria text, litros numeric, revenue numeric, pedidos bigint, clientes bigint, unidades numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  WITH base AS (
    SELECT v.pedido, v.producto, v.envase, v.categoria_producto, v.litros, v.total_sin_impuesto, v.nombre_fantasia,
           (v.producto ILIKE 'Empaque y Distribución%') AS es_empaque
    FROM ventas v
    WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
                ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
      AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
      AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
      AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
      AND NOT _excluir_producto(v.producto)
  ),
  totales_pedido AS (
    SELECT pedido,
      SUM(total_sin_impuesto) FILTER (WHERE es_empaque)     AS monto_empaque,
      SUM(total_sin_impuesto) FILTER (WHERE NOT es_empaque) AS monto_real
    FROM base GROUP BY pedido
  ),
  ajustado AS (
    SELECT
      b.producto, b.envase, b.categoria_producto, b.litros, b.pedido, b.nombre_fantasia,
      b.total_sin_impuesto + COALESCE(b.total_sin_impuesto * COALESCE(tp.monto_empaque,0) / NULLIF(tp.monto_real,0), 0) AS revenue_ajustado
    FROM base b JOIN totales_pedido tp USING (pedido)
    WHERE NOT b.es_empaque
  )
  SELECT
    COALESCE(NULLIF(TRIM(producto), ''), 'Sin producto'),
    COALESCE(NULLIF(TRIM(envase), ''), '—'),
    _categoria_normalizada(producto, categoria_producto),
    SUM(litros),
    SUM(revenue_ajustado),
    COUNT(DISTINCT pedido),
    COUNT(DISTINCT nombre_fantasia),
    ROUND(SUM(
      CASE
        WHEN envase ILIKE '%barril%' THEN litros / 30.0
        WHEN envase ILIKE '%354%'    THEN litros / 0.354
        WHEN envase ILIKE '%473%'    THEN litros / 0.473
        ELSE 0
      END
    ))
  FROM ajustado
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_pedidos_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(pedido text, cliente text, vendedor text, localidad text, fecha_pedido date, fecha_entrega date, fecha_entrega_hora timestamp without time zone, litros numeric, revenue numeric, entregado boolean, numero_factura text)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  with base as (
    select v.pedido, v.nombre_fantasia, v.vendedor_actual, v.localidad,
           v.fecha_pedido, v.fecha_entrega, v.fecha_entrega_hora,
           v.litros, v.total_sin_impuesto, v.entregado, v.numero_factura
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
      and (p_vendedores is null or cardinality(p_vendedores) = 0 or v.vendedor_actual = any(p_vendedores))
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
         bool_and(coalesce(b.entregado, false)),
         max(b.numero_factura)
  from base b
  group by b.pedido
  order by greatest(max(b.fecha_entrega), max(b.fecha_pedido)) desc nulls last,
           max(b.fecha_entrega_hora) desc nulls last;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_pedidos_por_origen(p_ini date, p_fin date, p_backlog boolean, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true, p_vendedores text[] DEFAULT NULL::text[])
 RETURNS TABLE(pedido text, cliente text, vendedor text, fecha_pedido date, fecha_entrega date, litros numeric, revenue numeric, numero_factura text)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT v.pedido, MAX(v.nombre_fantasia), MAX(v.vendedor_actual),
         MAX(v.fecha_pedido), MAX(v.fecha_entrega),
         SUM(v.litros), SUM(v.total_sin_impuesto), MAX(v.numero_factura)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (CASE WHEN p_backlog THEN v.fecha_pedido < p_ini ELSE v.fecha_pedido >= p_ini END)
    AND v.pedido IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.pedido
  ORDER BY MAX(v.fecha_pedido) ASC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_clientes_por_entregar(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_vendedores text[] DEFAULT NULL::text[])
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
    AND v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.entrega_informada AND NOT v.entregado
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND (p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY v.nombre_fantasia
  ORDER BY 7 DESC NULLS LAST, 4 DESC;
$function$;

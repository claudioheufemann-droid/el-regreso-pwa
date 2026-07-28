CREATE OR REPLACE FUNCTION public.ventas_envases_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(tipo text, unidades numeric, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    CASE
      WHEN v.envase ILIKE '%barril%'  THEN 'Barril 30L'
      WHEN v.envase ILIKE '%354%'     THEN 'Lata 354 ml'
      WHEN v.envase ILIKE '%473%'     THEN 'Lata 473 ml'
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
  WHERE v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
    AND v.envase IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY 1
  HAVING SUM(v.litros) <> 0
  ORDER BY 3 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_envases_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true)
 RETURNS TABLE(tipo text, unidades numeric, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    CASE
      WHEN v.envase ILIKE '%barril%'  THEN 'Barril 30L'
      WHEN v.envase ILIKE '%354%'     THEN 'Lata 354 ml'
      WHEN v.envase ILIKE '%473%'     THEN 'Lata 473 ml'
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
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY 1
  HAVING SUM(v.litros) <> 0
  ORDER BY 3 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.ventas_mix_periodo(p_ini date, p_fin date, p_vendedor text DEFAULT NULL::text, p_provincias text[] DEFAULT NULL::text[])
 RETURNS TABLE(categoria text, litros numeric, revenue numeric)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    _categoria_normalizada(v.producto, v.categoria_producto) AS categoria,
    SUM(v.litros)             AS litros,
    SUM(v.total_sin_impuesto) AS revenue
  FROM ventas v
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND (p_vendedor IS NULL OR v.vendedor_actual = p_vendedor)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY 1;
$function$;

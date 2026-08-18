-- Pedido de Claudio: el tipo de envase (Lata/Barril) NO define la categoria
-- del producto -hay latas de cerveza de 354ml y latas de kombucha de 473ml,
-- ademas de barriles de ambas categorias (verificado con datos reales:
-- 600L de cerveza en latas de 354ml, 110L de kombucha en latas de 473ml).
-- Antes se agrupaba por tamaño de envase asumiendo que 354ml=Kombucha y
-- 473ml=Cerveza, lo que mezclaba productos de categorias distintas bajo
-- una misma tarjeta. Ahora se agrupa por (tipo de envase x categoria real
-- del producto): "Lata Cerveza", "Lata Kombucha", "Barril Cerveza",
-- "Barril Kombucha". El calculo de unidades sigue siendo por fila segun
-- el tamaño real de ESE envase (354/473/barril), solo cambia el bucket
-- en el que se agrupan las filas.
CREATE OR REPLACE FUNCTION public.ventas_envases_periodo(p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[])
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
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
  GROUP BY 1
  HAVING SUM(v.litros) <> 0
  ORDER BY 3 DESC;
$function$;

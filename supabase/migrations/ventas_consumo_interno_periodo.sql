-- Litros de PDV (degustaciones en punto de venta), Ferias y BaseCamp — hoy
-- excluidos de "litros vendidos" por no ser clientes reales (ver
-- _excluir_cliente), pero el usuario pidio verlos aparte porque tambien son
-- volumen relevante de mostrar (marketing/consumo promocional).
--
-- A proposito NO se suman a ventas_dashboard_kpis: mezclarlos ahi volveria a
-- inflar litros/clientes/ranking de vendedores con cuentas internas, el
-- mismo problema que motivo excluirlas originalmente. Se muestran en una
-- tarjeta separada del dashboard.
CREATE OR REPLACE FUNCTION public.ventas_consumo_interno_periodo(
  p_ini date, p_fin date, p_provincias text[] DEFAULT NULL::text[], p_por_entrega boolean DEFAULT true
)
 RETURNS TABLE(categoria text, litros numeric, revenue numeric, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  SELECT
    CASE
      WHEN lower(v.nombre_fantasia) LIKE '%cliente pdv%'   THEN 'PDV'
      WHEN lower(v.nombre_fantasia) LIKE '%cliente feria%' THEN 'Ferias'
      WHEN lower(v.nombre_fantasia) LIKE '%basecamp%'
        OR lower(v.nombre_fantasia) LIKE '%base camp%'     THEN 'BaseCamp'
    END AS categoria,
    SUM(v.litros),
    SUM(v.total_sin_impuesto),
    COUNT(DISTINCT v.pedido)
  FROM ventas v
  WHERE (CASE WHEN p_por_entrega THEN v.entrega_informada AND v.fecha_entrega >= p_ini AND v.fecha_entrega <= p_fin
              ELSE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin END)
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND (
      lower(v.nombre_fantasia) LIKE '%cliente pdv%'
      OR lower(v.nombre_fantasia) LIKE '%cliente feria%'
      OR lower(v.nombre_fantasia) LIKE '%basecamp%'
      OR lower(v.nombre_fantasia) LIKE '%base camp%'
    )
  GROUP BY 1
  HAVING SUM(v.litros) <> 0
  ORDER BY 2 DESC;
$function$;

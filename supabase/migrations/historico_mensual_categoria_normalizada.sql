-- Antes filtraba por v.categoria_producto = p_linea (string crudo del ERP).
-- El filtro "línea" del front solo ofrece 'Cerveza'/'Kombucha' (ver LINEAS
-- en app/ventas/historico/page.tsx), asi que productos reales sin
-- categoria del ERP -Doble IPA, Del Caribe Sour, y cualquier fila de nota
-- de credito con categoria_producto='S/C'- quedaban afuera al filtrar por
-- linea, subcontando Cerveza/Kombucha en el historico. Con
-- _categoria_normalizada() el filtro usa la misma clasificacion que el
-- resto del sistema.
CREATE OR REPLACE FUNCTION public.ventas_historico_mensual(p_canal text DEFAULT NULL::text, p_linea text DEFAULT NULL::text)
 RETURNS TABLE(anio integer, mes integer, litros numeric, revenue numeric)
 LANGUAGE sql STABLE
AS $function$
  SELECT
    date_part('year', v.fecha_pedido)::int  AS anio,
    date_part('month', v.fecha_pedido)::int AS mes,
    SUM(v.litros)                            AS litros,
    SUM(v.total_sin_impuesto)                AS revenue
  FROM ventas v
  WHERE v.nombre_fantasia IS NOT NULL
    AND NOT _excluir_cliente(v.nombre_fantasia)
    AND NOT _excluir_producto(v.producto)
    AND (p_canal IS NULL OR v.categoria_negocio = p_canal)
    AND (p_linea IS NULL OR _categoria_normalizada(v.producto, v.categoria_producto) = p_linea)
  GROUP BY 1, 2
  ORDER BY 1, 2;
$function$;

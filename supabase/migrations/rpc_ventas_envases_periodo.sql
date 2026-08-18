-- Unidades vendidas por tipo de envase (latas y barriles) en un rango.
-- Alimenta la sección "Latas y barriles" del dashboard de Ventas.
--
-- La tabla `ventas` no trae la cantidad de unidades, sólo litros, así que se
-- derivan del volumen del envase:
--   Lata (354 ml) → litros / 0.354
--   Lata (473 ml) → litros / 0.473
--   Barril        → litros / 30      (verificado contra los datos del ERP: todos
--                                     los valores son múltiplos de 30, incluidas
--                                     las devoluciones de -30)
-- Los litros negativos se conservan a propósito: restan unidades, que es lo
-- correcto para contar lo efectivamente vendido en el período.
CREATE OR REPLACE FUNCTION public.ventas_envases_periodo(
  p_ini date,
  p_fin date,
  p_provincias text[] DEFAULT NULL
)
RETURNS TABLE(tipo text, unidades numeric, litros numeric, revenue numeric)
LANGUAGE sql
STABLE PARALLEL SAFE
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
  WHERE v.fecha_pedido >= p_ini AND v.fecha_pedido <= p_fin
    AND v.envase IS NOT NULL
    AND (p_provincias IS NULL OR cardinality(p_provincias) = 0 OR v.provincia = ANY(p_provincias))
    AND v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
  GROUP BY 1
  HAVING SUM(v.litros) <> 0
  ORDER BY 3 DESC;
$function$;

-- Dos internos más que aparecían como venta real, detectados al validar la
-- lista de clientes del período contra la BD:
--   'Cliente Douglas Koenig'  → consumo de gerencia
--   'Cliente Metas Base Camp' → consumo interno
-- Mantener sincronizado con CLIENTES_EXCLUIR en lib/types.ts.
CREATE OR REPLACE FUNCTION public._excluir_cliente(nombre text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT nombre IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'cliente ventas (',
      'cliente pdv',
      'cliente merma pdv',
      'cliente mermas producto terminado',
      'cliente muestras',
      'cliente feria',
      'cliente marketing',
      'cliente calidad reclamos',
      'cliente control calidad',
      'cliente copas/medallas',
      'basecamp el regreso',
      'cliente consumos base camp',
      'cliente metas base camp',
      'cliente douglas koenig',
      'beneficios clientes'
    ]) AS patron
    WHERE position(patron IN lower(nombre)) > 0
  )
$function$;

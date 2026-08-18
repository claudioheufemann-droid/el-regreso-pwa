-- EWU Ginger Beer (Niebla Fermentos SPA) es un servicio de enlatado/co-packing
-- a terceros, no una venta de cerveza propia (0 litros, monto real). Se agrega
-- a _excluir_cliente() para que no infle los KPIs de ventas del dashboard.
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
      'beneficios clientes',
      'ewu ginger beer'
    ]) AS patron
    WHERE position(patron IN lower(nombre)) > 0
  )
$function$;

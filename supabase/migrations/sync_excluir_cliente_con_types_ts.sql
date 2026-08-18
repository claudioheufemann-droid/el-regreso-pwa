-- Sincroniza _excluir_cliente() con CLIENTES_EXCLUIR de lib/types.ts.
--
-- Problema: existían DOS listas de clientes internos desincronizadas —
--   1. lib/types.ts  → 13 patrones, comparación includes() case-insensitive
--   2. _excluir_cliente() → solo 5 nombres, igualdad exacta case-sensitive
-- Las vistas del dashboard agregan litros con ventas_agg_periodo/diaria, que
-- usan la versión SQL, así que se colaban como venta real:
--   'Cliente ventas (Benja)'      26 filas  23.7 L
--   'Cliente muestras Marcelo'    15 filas  19.8 L
--   'Cliente Control Calidad'      1 fila   14.5 L
--   'Cliente Consumos Base Camp'   3 filas   0.0 L
-- Total 58 L inflados en las métricas.
--
-- Se dejan FUERA a propósito los 'Cliente Directo X' (Douglas, Charly,
-- Benjamín, Javier): son ventas reales, no consumo interno.
--
-- Si se edita CLIENTES_EXCLUIR en lib/types.ts, actualizar también esta función.

CREATE OR REPLACE FUNCTION public._excluir_cliente(nombre text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT nombre IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'cliente ventas (',                  -- movimientos de personal (javier/charly/carlos/benja/...)
      'cliente pdv',
      'cliente merma pdv',
      'cliente mermas producto terminado',
      'cliente muestras',                  -- 'Cliente muestras Marcelo' y variantes por vendedor
      'cliente feria',
      'cliente marketing',
      'cliente calidad reclamos',
      'cliente control calidad',
      'cliente copas/medallas',
      'basecamp el regreso',
      'cliente consumos base camp',
      'beneficios clientes'
    ]) AS patron
    WHERE position(patron IN lower(nombre)) > 0
  )
$function$;

-- Pedido de Claudio (24-sep-2026): "vamos a considerar a Cliente Birra, La
-- Confluencia, en este ciclo como litros vendidos". Ambos clientes quedan
-- fuera del filtro por vendedor del área de ventas (ver
-- ventas_area_ventas_scope_vendedores.sql) porque el ERP los tiene bajo
-- CERVECERÍA y Douglas Koenig, que no son vendedores del equipo.
--
-- En vez de meter a CERVECERÍA/Douglas al área (arrastraría PDV-like, Marketing,
-- etc.), se agrega una lista explícita de CLIENTES que cuentan igual, cada uno
-- con su fecha de inicio: desde el ciclo Septiembre 2026 (24-ago) en adelante,
-- sin reescribir los períodos anteriores (ya cerrados y comisionados).
--
-- Cómo se activa: la app agrega el marcador '@area_ventas' a p_vendedores
-- (VENDEDORES_AREA_VENTAS_ERP en lib/types.ts). Sólo con ese marcador aplica la
-- excepción, así que las consultas de UN vendedor (su detalle, su comisión) no
-- se ven afectadas: nunca llevan el marcador.
--
-- Los clientes se suman a los TOTALES del área; en el ranking no aparecen
-- porque sus vendedores (CERVECERÍA, Douglas) ya están en VENDEDORES_FUERA_RANKING.

CREATE TABLE IF NOT EXISTS public.ventas_clientes_extra_area (
  nombre_fantasia text PRIMARY KEY,
  desde date NOT NULL,
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ventas_clientes_extra_area ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lectura autenticados" ON public.ventas_clientes_extra_area;
CREATE POLICY "lectura autenticados" ON public.ventas_clientes_extra_area
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.ventas_clientes_extra_area (nombre_fantasia, desde, nota) VALUES
  ('Cliente Birra',      '2026-08-24', 'ERP: vendedor CERVECERÍA. Pedido de Claudio 24-sep-2026.'),
  ('La Confluencia SUP', '2026-08-24', 'ERP: vendedor Douglas Koenig. Pedido de Claudio 24-sep-2026.')
ON CONFLICT (nombre_fantasia) DO UPDATE SET desde = EXCLUDED.desde, nota = EXCLUDED.nota;

-- Comparación sin mayúsculas/espacios: el ERP ya cambió nombres antes.
CREATE OR REPLACE FUNCTION public._cliente_extra_area(p_cliente text, p_fecha date)
 RETURNS boolean
 LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_cliente IS NOT NULL AND EXISTS (
    SELECT 1 FROM ventas_clientes_extra_area e
    WHERE lower(trim(e.nombre_fantasia)) = lower(trim(p_cliente))
      AND p_fecha >= e.desde
  )
$function$;

-- Todas las funciones de /ventas que filtran por p_vendedores comparten el mismo
-- fragmento; se le agrega la excepción en su lugar (sin reescribir el resto del
-- cuerpo a mano). No se tocan comision_* ni get_calendario_pedidos ni
-- ventas_detalle_clientes_por_vendedor (detalle de UN vendedor).
DO $$
DECLARE
  f record;
  def text;
  nuevo text;
BEGIN
  FOR f IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname IN (
        'ventas_agg_periodo', 'ventas_clientes_por_entregar', 'ventas_dashboard_kpis',
        'ventas_detalle_clientes', 'ventas_detalle_productos', 'ventas_entregado_origen_periodo',
        'ventas_entregas_periodo', 'ventas_entregas_por_vendedor', 'ventas_envases_periodo',
        'ventas_pedidos_periodo', 'ventas_pedidos_por_origen', 'ventas_serie_diaria')
      AND p.prosrc ILIKE '%p_vendedores%'
  LOOP
    def := pg_get_functiondef(f.oid);
    nuevo := regexp_replace(def,
      '\(p_vendedores IS NULL OR cardinality\(p_vendedores\) = 0 OR v\.vendedor_actual = ANY\(p_vendedores\)\)',
      '(p_vendedores IS NULL OR cardinality(p_vendedores) = 0 OR v.vendedor_actual = ANY(p_vendedores) OR (''@area_ventas'' = ANY(p_vendedores) AND _cliente_extra_area(v.nombre_fantasia, COALESCE(v.fecha_entrega, v.fecha_pedido))))',
      'gi');
    IF nuevo = def THEN
      RAISE EXCEPTION 'No se encontró el filtro p_vendedores en %', f.oid::regprocedure;
    END IF;
    EXECUTE nuevo;
  END LOOP;
END $$;

-- Aplicada en producción el 5-oct-2026.
-- client_scores se rehízo (client_metrics_cache_materializado) sin la columna tipo_cliente
-- que agregó misiones_v2_frecuencia_inactivos, y tres funciones quedaron fallando:
-- get_clientes_volumen_baja, get_cross_sell y get_calendario_pedidos (Misiones y el
-- reporte semanal de ventas). Se recalcula con la MISMA regla original.
create or replace function public._tipo_cliente(cs public.client_scores)
returns text
language sql
stable
as $$
  select case
    when cs.total_pedidos <= 2 and cs.primera_compra >= current_date - interval '90 days' then 'nuevo'
    when cs.total_pedidos < 4 then 'temporal'
    when cs.dias_sin_compra > greatest(coalesce(cs.ciclo_promedio_dias, 60)::numeric * 2.5, 120) then 'inactivo'
    else 'activo'
  end
$$;
comment on function public._tipo_cliente(public.client_scores) is
  'Regla original de misiones_v2_frecuencia_inactivos (nuevo/temporal/inactivo/activo). client_scores se rehízo sin esa columna; las funciones que la usaban la calculan con esto.';

do $$
declare f record; def text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('get_clientes_volumen_baja', 'get_cross_sell', 'get_calendario_pedidos')
      and p.prosrc ilike '%cs.tipo_cliente%'
  loop
    def := pg_get_functiondef(f.oid);
    -- get_calendario_pedidos: en la lista del SELECT conserva el nombre de columna (la usan los CTE de afuera)
    def := replace(def, 'cs.segmento, cs.tipo_cliente,', 'cs.segmento, public._tipo_cliente(cs) AS tipo_cliente,');
    def := replace(def, 'cs.tipo_cliente', 'public._tipo_cliente(cs)');
    execute def;
  end loop;
end $$;

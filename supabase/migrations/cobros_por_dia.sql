-- Pagos recibidos agregados por DÍA y tipo, para el calendario semanal de entradas de Administración.
-- tipo 'pdv' = mostrador (mismo criterio que cobro_mostrador_semanal: cliente ilike '%pdv%'); 'credito' = el resto
-- (clientes con cuenta corriente). Sirve para dos cosas: lo que YA entró en los días pasados de la semana, y el
-- patrón por día de la semana con el que se reparte el promedio semanal del mostrador.
create or replace function public.cobros_por_dia(p_desde date)
returns table (fecha date, tipo text, monto numeric, pagos bigint)
language sql stable as $$
  select c.fecha,
         case when c.cliente ilike '%pdv%' then 'pdv' else 'credito' end as tipo,
         sum(c.monto) as monto,
         count(*) as pagos
  from cobros_erp c
  where c.fecha >= p_desde
  group by 1, 2
  order by 1, 2
$$;
revoke all on function public.cobros_por_dia(date) from public, anon, authenticated;
grant execute on function public.cobros_por_dia(date) to service_role;

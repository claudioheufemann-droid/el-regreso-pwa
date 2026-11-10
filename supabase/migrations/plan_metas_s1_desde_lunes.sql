-- S1 de la temporada 2026-27 va de lunes 5 a domingo 11 oct (Claudio, 2026-11-10):
-- el plan partía el jueves 8, pero toda semana es lunes a domingo. La meta de S1
-- no cambia ($4.150.000) ni la de Octubre (todos sus días caen en el 24 sep–23 oct).
-- El calendario de futuros planes también arranca su primera semana el lunes,
-- sin retroceder más allá del día 24 que abre el período.

create or replace function public.semanas_comerciales(p_desde date, p_hasta date)
returns table (semana int, fecha_inicio date, fecha_fin date)
language sql immutable as $$
  with ini as (
    select greatest(date_trunc('week', p_desde)::date,
                    (periodo_comercial(p_desde) - interval '1 month' + interval '23 days')::date) as desde
  ), d as (
    select g::date as dia from ini, generate_series(ini.desde, p_hasta, interval '1 day') g
  ), m as (
    select dia,
           sum(case when dia = (select desde from ini) or extract(isodow from dia) = 1 or extract(day from dia) = 24
                    then 1 else 0 end) over (order by dia) as grp
    from d
  )
  select grp::int, min(dia), max(dia) from m group by grp order by grp
$$;

update public.plan_metas_semanales
   set fecha_inicio = '2026-10-05', updated_at = now()
 where temporada = '2026-2027' and semana = 1 and fecha_inicio = '2026-10-08';

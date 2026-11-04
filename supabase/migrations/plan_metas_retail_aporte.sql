-- Metas temporada: aporte del Retail a las metas (pedido de Claudio, 2026-11-04).
-- Las metas del plan son sólo de los 4 vendedores y el Retail (cartera ERP
-- 'Claudio Heufemann') NO entra en ellas — debe seguir así. Pero la estrategia
-- es que el Retail sea el colchón cuando el equipo no llega, y gerencia
-- necesita ver cuánto suma semana a semana SIN que los vendedores lo vean.
--
-- Por eso es una función SECURITY DEFINER que sólo responde a admins
-- (users.is_admin), en vez de una vista: ventas tiene RLS por vendedor y una
-- vista security_invoker no le mostraría el Retail a nadie más que a Claudio,
-- y una vista normal se la mostraría a todos. Mismos criterios que
-- plan_metas_avance: fecha_pedido (incluye lo no entregado), sin clientes ni
-- productos excluidos, devoluciones con litros 0.
--
-- Devuelve una fila por semana del plan y una por período 24→23 (mismas
-- fechas que plan_metas_periodo_avance: el 24→23 completo).

create or replace function public.plan_metas_retail_aporte(p_temporada text)
returns table (
  tipo text,
  n int,
  fecha_inicio date,
  fecha_fin date,
  neto numeric,
  neto_por_entregar numeric,
  litros numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from users u
    where u.is_admin
      and (u.id = auth.uid() or lower(u.email) = lower(auth.jwt() ->> 'email'))
  ) then
    return;
  end if;

  return query
  with base as (
    select v.fecha_pedido, v.total_sin_impuesto, v.fecha_entrega,
           case when v.pedido = 'Devolución' or v.litros < 0 then 0::numeric
                else coalesce(v.litros, 0::numeric) end as litros
    from ventas v
    where v.vendedor_actual = 'Claudio Heufemann'
      and not coalesce(v.cliente_excluido, false)
      and not coalesce(v.producto_excluido, false)
  ), semanas as (
    select distinct 'semana'::text as tipo, m.semana as n, m.fecha_inicio, m.fecha_fin
    from plan_metas_semanales m
    where m.temporada = p_temporada
  ), meses as (
    select distinct 'periodo'::text as tipo, p.periodo as n, p.fecha_inicio, p.fecha_fin
    from plan_metas_periodo_avance p
    where p.temporada = p_temporada
  ), cortes as (
    select * from semanas union all select * from meses
  )
  select c.tipo, c.n, c.fecha_inicio, c.fecha_fin,
         coalesce(sum(b.total_sin_impuesto), 0::numeric),
         coalesce(sum(b.total_sin_impuesto) filter (where b.fecha_entrega is null), 0::numeric),
         round(coalesce(sum(b.litros), 0::numeric), 1)
  from cortes c
  left join base b on b.fecha_pedido >= c.fecha_inicio and b.fecha_pedido <= c.fecha_fin
  group by c.tipo, c.n, c.fecha_inicio, c.fecha_fin
  order by c.tipo, c.n;
end;
$$;

revoke all on function public.plan_metas_retail_aporte(text) from public, anon;
grant execute on function public.plan_metas_retail_aporte(text) to authenticated;

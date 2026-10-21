-- Metas temporada: cuánto de la venta real todavía no se entrega.
-- Pedido de Claudio (2026-10-21): la venta de Metas cuenta el pedido completo
-- aunque no se haya entregado, porque la entrega ya es responsabilidad de
-- logística y no del vendedor. real_neto YA incluía esos pedidos (las vistas
-- nunca filtraron por fecha_entrega); esta columna sólo separa el monto para
-- que la pantalla lo muestre ("incluye $X por entregar") y no parezca que falta.
-- fecha_entrega NULL = pedido pendiente o listo para entregar en el ERP
-- (ver /api/upload-ventas). Va al FINAL de cada vista: create or replace view
-- sólo admite columnas nuevas al final.

create or replace view public.plan_metas_avance
with (security_invoker = true) as
with base as (
  select v.vendedor_actual, v.fecha_pedido, v.nombre_fantasia, v.pedido,
         v.total_sin_impuesto, coalesce(v.litros, 0::numeric) as litros, v.envase, v.categoria_norm,
         v.fecha_entrega
  from ventas v
  where not coalesce(v.cliente_excluido, false) and not coalesce(v.producto_excluido, false)
), pedidos_cliente as (
  select base.nombre_fantasia as cliente, base.vendedor_actual as vendedor, base.pedido,
         min(base.fecha_pedido) as fecha
  from base
  where base.nombre_fantasia is not null
  group by base.nombre_fantasia, base.vendedor_actual, base.pedido
), aperturas as (
  select x.cliente, x.vendedor, x.fecha
  from (
    select p.cliente, p.vendedor, p.pedido, p.fecha,
           lag(p.fecha) over (partition by p.cliente order by p.fecha, p.pedido) as fecha_anterior
    from pedidos_cliente p
  ) x
  where x.fecha >= '2026-10-01'::date and (x.fecha_anterior is null or (x.fecha - x.fecha_anterior) > 730)
)
select
  m.id, m.temporada, m.territorio, m.user_id, u.nombre as vendedor,
  m.semana, m.fecha_inicio, m.fecha_fin,
  m.meta_neto, m.meta_litros, m.meta_clientes_nuevos,
  m.meta_cajas_kombucha, m.meta_cajas_cerveza, m.meta_barriles,
  coalesce(r.neto, 0::numeric) as real_neto,
  coalesce(r.litros, 0::numeric) as real_litros,
  coalesce(r.cajas_k, 0::numeric) as real_cajas_kombucha,
  coalesce(r.cajas_c, 0::numeric) as real_cajas_cerveza,
  coalesce(r.barriles, 0::numeric) as real_barriles,
  coalesce(a.nuevos, 0::bigint) as real_clientes_nuevos,
  round(100::numeric * coalesce(r.neto, 0::numeric) / nullif(m.meta_neto, 0::numeric), 1) as pct_neto,
  round(100::numeric * coalesce(r.litros, 0::numeric) / nullif(m.meta_litros, 0::numeric), 1) as pct_litros,
  round(100::numeric * coalesce(a.nuevos, 0::bigint)::numeric / nullif(m.meta_clientes_nuevos, 0)::numeric, 1) as pct_clientes,
  case
    when current_date < m.fecha_inicio then 'futura'::text
    when current_date > m.fecha_fin then 'cerrada'::text
    else 'en_curso'::text
  end as estado_semana,
  case
    when current_date < m.fecha_inicio then null::text
    when coalesce(r.neto, 0::numeric) >= 0.95 * m.meta_neto then 'verde'::text
    when coalesce(r.neto, 0::numeric) >= 0.80 * m.meta_neto then 'amarillo'::text
    else 'rojo'::text
  end as semaforo,
  coalesce(r.neto_por_entregar, 0::numeric) as real_neto_por_entregar
from plan_metas_semanales m
join users u on u.id = m.user_id
left join lateral (
  select sum(b.total_sin_impuesto) as neto,
         sum(b.total_sin_impuesto) filter (where b.fecha_entrega is null) as neto_por_entregar,
         round(sum(b.litros), 1) as litros,
         round(sum(b.litros) filter (where b.categoria_norm = 'Kombucha'::text and b.envase ~~* 'Lata%'::text) / (24::numeric * 0.354), 1) as cajas_k,
         round(sum(b.litros) filter (where b.categoria_norm = 'Cerveza'::text and b.envase ~~* 'Lata%'::text) / (24::numeric * 0.473), 1) as cajas_c,
         round(sum(b.litros) filter (where b.envase = 'Barril'::text and b.categoria_norm = 'Cerveza'::text) / 30::numeric, 1) as barriles
  from base b
  where b.vendedor_actual = any (u.vendedores_erp) and b.fecha_pedido >= m.fecha_inicio and b.fecha_pedido <= m.fecha_fin
) r on true
left join lateral (
  select count(distinct ap.cliente) as nuevos
  from aperturas ap
  where ap.vendedor = any (u.vendedores_erp) and ap.fecha >= m.fecha_inicio and ap.fecha <= m.fecha_fin
) a on true;

create or replace view public.plan_metas_periodo_avance
with (security_invoker = true) as
with base as (
  select v.vendedor_actual, v.fecha_pedido, v.nombre_fantasia, v.pedido,
         v.total_sin_impuesto, coalesce(v.litros, 0::numeric) as litros, v.envase, v.categoria_norm,
         v.fecha_entrega
  from ventas v
  where not coalesce(v.cliente_excluido, false) and not coalesce(v.producto_excluido, false)
), pedidos_cliente as (
  select base.nombre_fantasia as cliente, base.vendedor_actual as vendedor, base.pedido,
         min(base.fecha_pedido) as fecha
  from base
  where base.nombre_fantasia is not null
  group by base.nombre_fantasia, base.vendedor_actual, base.pedido
), aperturas as (
  select x.cliente, x.vendedor, x.fecha
  from (
    select p.cliente, p.vendedor, p.pedido, p.fecha,
           lag(p.fecha) over (partition by p.cliente order by p.fecha, p.pedido) as fecha_anterior
    from pedidos_cliente p
  ) x
  where x.fecha >= '2026-09-24'::date and (x.fecha_anterior is null or (x.fecha - x.fecha_anterior) > 730)
), dias as (
  select m.temporada, m.territorio, m.user_id, d.dia::date as dia,
         (m.fecha_fin - m.fecha_inicio + 1)::numeric as n,
         m.meta_neto, m.meta_litros, m.meta_clientes_nuevos,
         m.meta_cajas_kombucha, m.meta_cajas_cerveza, m.meta_barriles,
         (case when extract(day from d.dia) >= 24
               then date_trunc('month', d.dia) + interval '1 month'
               else date_trunc('month', d.dia) end)::date as mes
  from plan_metas_semanales m
  cross join lateral generate_series(m.fecha_inicio::timestamp, m.fecha_fin::timestamp, interval '1 day') as d(dia)
), per as (
  select temporada, territorio, user_id, mes,
         (mes - interval '1 month' + interval '23 days')::date as fecha_inicio,
         (mes + interval '22 days')::date as fecha_fin,
         round(sum(meta_neto / n)) as meta_neto,
         round(sum(meta_litros / n), 1) as meta_litros,
         round(sum(meta_clientes_nuevos / n), 1) as meta_clientes_nuevos,
         round(sum(meta_cajas_kombucha / n), 1) as meta_cajas_kombucha,
         round(sum(meta_cajas_cerveza / n), 1) as meta_cajas_cerveza,
         round(sum(meta_barriles / n), 1) as meta_barriles
  from dias
  group by temporada, territorio, user_id, mes
)
select
  row_number() over (order by p.temporada, p.territorio, p.mes) as id,
  p.temporada, p.territorio, p.user_id, u.nombre as vendedor,
  dense_rank() over (partition by p.temporada order by p.mes)::int as periodo,
  p.mes,
  (p.mes - interval '1 month' + interval '23 days')::date as periodo_inicio,
  (p.mes + interval '22 days')::date as periodo_fin,
  p.fecha_inicio, p.fecha_fin,
  p.meta_neto, p.meta_litros, p.meta_clientes_nuevos,
  p.meta_cajas_kombucha, p.meta_cajas_cerveza, p.meta_barriles,
  coalesce(r.neto, 0::numeric) as real_neto,
  coalesce(r.litros, 0::numeric) as real_litros,
  coalesce(r.cajas_k, 0::numeric) as real_cajas_kombucha,
  coalesce(r.cajas_c, 0::numeric) as real_cajas_cerveza,
  coalesce(r.barriles, 0::numeric) as real_barriles,
  coalesce(a.nuevos, 0::bigint) as real_clientes_nuevos,
  round(100::numeric * coalesce(r.neto, 0::numeric) / nullif(p.meta_neto, 0::numeric), 1) as pct_neto,
  round(100::numeric * coalesce(r.litros, 0::numeric) / nullif(p.meta_litros, 0::numeric), 1) as pct_litros,
  round(100::numeric * coalesce(a.nuevos, 0::bigint)::numeric / nullif(p.meta_clientes_nuevos, 0::numeric), 1) as pct_clientes,
  case
    when current_date < p.fecha_inicio then 'futura'::text
    when current_date > p.fecha_fin then 'cerrada'::text
    else 'en_curso'::text
  end as estado_semana,
  case
    when current_date < p.fecha_inicio then null::text
    when coalesce(r.neto, 0::numeric) >= 0.95 * p.meta_neto then 'verde'::text
    when coalesce(r.neto, 0::numeric) >= 0.80 * p.meta_neto then 'amarillo'::text
    else 'rojo'::text
  end as semaforo,
  coalesce(r.neto_por_entregar, 0::numeric) as real_neto_por_entregar
from per p
join users u on u.id = p.user_id
left join lateral (
  select sum(b.total_sin_impuesto) as neto,
         sum(b.total_sin_impuesto) filter (where b.fecha_entrega is null) as neto_por_entregar,
         round(sum(b.litros), 1) as litros,
         round(sum(b.litros) filter (where b.categoria_norm = 'Kombucha'::text and b.envase ~~* 'Lata%'::text) / (24::numeric * 0.354), 1) as cajas_k,
         round(sum(b.litros) filter (where b.categoria_norm = 'Cerveza'::text and b.envase ~~* 'Lata%'::text) / (24::numeric * 0.473), 1) as cajas_c,
         round(sum(b.litros) filter (where b.envase = 'Barril'::text and b.categoria_norm = 'Cerveza'::text) / 30::numeric, 1) as barriles
  from base b
  where b.vendedor_actual = any (u.vendedores_erp) and b.fecha_pedido >= p.fecha_inicio and b.fecha_pedido <= p.fecha_fin
) r on true
left join lateral (
  select count(distinct ap.cliente) as nuevos
  from aperturas ap
  where ap.vendedor = any (u.vendedores_erp) and ap.fecha >= p.fecha_inicio and ap.fecha <= p.fecha_fin
) a on true;

grant select on public.plan_metas_avance to authenticated, agente_lector;
grant select on public.plan_metas_periodo_avance to authenticated, agente_lector;

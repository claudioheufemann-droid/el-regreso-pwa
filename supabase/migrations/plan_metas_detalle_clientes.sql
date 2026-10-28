-- Detalle por cliente de la venta de Metas (pedido de Claudio, 2026-10-28):
-- al tocar una región en "Ranking por vendedor" se ve a quién le vendió y
-- cuál es el cliente nuevo. Mismas reglas que plan_metas_avance /
-- plan_metas_periodo_avance: excluidos fuera, venta por fecha_pedido (incluye
-- lo no entregado), cliente nuevo = primer pedido del cliente o primero tras
-- más de 730 días sin pedidos (con cualquier vendedor), abierto por este vendedor.
create or replace function public.plan_metas_detalle_clientes(p_user_id uuid, p_desde date, p_hasta date)
returns table (
  cliente text, neto numeric, neto_por_entregar numeric, litros numeric,
  pedidos bigint, ultima_fecha date, es_nuevo boolean, fecha_apertura date
)
language sql stable security invoker set search_path = public as $$
  with u as (
    select vendedores_erp from users where id = p_user_id
  ), base as (
    select v.vendedor_actual, v.fecha_pedido, v.nombre_fantasia, v.pedido,
           v.total_sin_impuesto, coalesce(v.litros, 0::numeric) as litros, v.fecha_entrega
    from ventas v
    where not coalesce(v.cliente_excluido, false) and not coalesce(v.producto_excluido, false)
  ), pedidos_cliente as (
    select b.nombre_fantasia as cliente, b.vendedor_actual as vendedor, b.pedido, min(b.fecha_pedido) as fecha
    from base b
    where b.nombre_fantasia is not null
    group by b.nombre_fantasia, b.vendedor_actual, b.pedido
  ), aperturas as (
    select x.cliente, min(x.fecha) as fecha
    from (
      select p.cliente, p.vendedor, p.fecha,
             lag(p.fecha) over (partition by p.cliente order by p.fecha, p.pedido) as fecha_anterior
      from pedidos_cliente p
    ) x, u
    where x.fecha >= p_desde and x.fecha <= p_hasta
      and (x.fecha_anterior is null or (x.fecha - x.fecha_anterior) > 730)
      and x.vendedor = any (u.vendedores_erp)
    group by x.cliente
  ), venta as (
    select coalesce(b.nombre_fantasia, 'Sin nombre') as cliente,
           sum(b.total_sin_impuesto) as neto,
           coalesce(sum(b.total_sin_impuesto) filter (where b.fecha_entrega is null), 0) as neto_por_entregar,
           round(sum(b.litros), 1) as litros,
           count(distinct b.pedido) as pedidos,
           max(b.fecha_pedido) as ultima_fecha
    from base b, u
    where b.vendedor_actual = any (u.vendedores_erp) and b.fecha_pedido >= p_desde and b.fecha_pedido <= p_hasta
    group by 1
  )
  select v.cliente, v.neto, v.neto_por_entregar, v.litros, v.pedidos, v.ultima_fecha,
         a.cliente is not null as es_nuevo, a.fecha as fecha_apertura
  from venta v left join aperturas a on a.cliente = v.cliente
  order by (a.cliente is not null) desc, v.neto desc;
$$;

grant execute on function public.plan_metas_detalle_clientes(uuid, date, date) to authenticated, agente_lector;

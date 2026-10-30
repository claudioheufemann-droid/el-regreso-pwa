-- Metas: qué le vendió a cada cliente (Claudio, 2026-10-30). Al desplegar un
-- mes o una semana se ven los clientes, el nuevo y, al tocar un cliente, sus
-- productos. Se agregan a plan_metas_detalle_clientes:
--   · cajas_kombucha / cajas_cerveza / barriles: mismas fórmulas que las vistas
--     de avance (así lo de cada cliente suma a "Vendido" de la meta por producto).
--   · productos: jsonb [{producto, envase, categoria, litros, neto}] ordenado por neto.
-- Cambia el tipo de retorno → drop + create (y se reponen los grants).
drop function if exists public.plan_metas_detalle_clientes(uuid, date, date);

create function public.plan_metas_detalle_clientes(p_user_id uuid, p_desde date, p_hasta date)
returns table(
  cliente text, neto numeric, neto_por_entregar numeric, litros numeric, pedidos bigint,
  ultima_fecha date, es_nuevo boolean, fecha_apertura date,
  cajas_kombucha numeric, cajas_cerveza numeric, barriles numeric, productos jsonb
)
language sql
stable
set search_path to 'public'
as $$
  with u as (
    select vendedores_erp from users where id = p_user_id
  ), base as (
    select v.vendedor_actual, v.fecha_pedido, v.nombre_fantasia, v.pedido, v.producto, v.envase, v.categoria_norm,
           v.total_sin_impuesto,
           case when v.pedido = 'Devolución' or v.litros < 0 then 0::numeric else coalesce(v.litros, 0::numeric) end as litros,
           v.fecha_entrega
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
      and x.fecha_anterior is null
      and x.vendedor = any (u.vendedores_erp)
    group by x.cliente
  ), periodo as (
    select coalesce(b.nombre_fantasia, 'Sin nombre') as cliente, b.*
    from base b, u
    where b.vendedor_actual = any (u.vendedores_erp) and b.fecha_pedido >= p_desde and b.fecha_pedido <= p_hasta
      and b.pedido is distinct from 'Devolución'
  ), venta as (
    select p.cliente,
           sum(p.total_sin_impuesto) as neto,
           coalesce(sum(p.total_sin_impuesto) filter (where p.fecha_entrega is null), 0) as neto_por_entregar,
           round(sum(p.litros), 1) as litros,
           count(distinct p.pedido) as pedidos,
           max(p.fecha_pedido) as ultima_fecha,
           coalesce(round(sum(p.litros) filter (where p.categoria_norm = 'Kombucha' and p.envase ilike 'Lata%') / (24 * 0.354), 1), 0) as cajas_kombucha,
           coalesce(round(sum(p.litros) filter (where p.categoria_norm = 'Cerveza' and p.envase ilike 'Lata%') / (24 * 0.473), 1), 0) as cajas_cerveza,
           coalesce(round(sum(p.litros) filter (where p.envase = 'Barril' and p.categoria_norm = 'Cerveza') / 30, 1), 0) as barriles
    from periodo p
    group by 1
  ), por_producto as (
    select p.cliente, coalesce(p.producto, 'Sin producto') as producto, p.envase, p.categoria_norm as categoria,
           round(sum(p.litros), 1) as litros, sum(p.total_sin_impuesto) as neto
    from periodo p
    group by 1, 2, 3, 4
    having round(sum(p.litros), 1) <> 0 or coalesce(sum(p.total_sin_impuesto), 0) <> 0
  ), productos as (
    select pp.cliente,
           jsonb_agg(jsonb_build_object(
             'producto', pp.producto, 'envase', pp.envase, 'categoria', pp.categoria,
             'litros', pp.litros, 'neto', pp.neto
           ) order by pp.neto desc nulls last, pp.litros desc) as productos
    from por_producto pp
    group by 1
  )
  select v.cliente, v.neto, v.neto_por_entregar, v.litros, v.pedidos, v.ultima_fecha,
         a.cliente is not null as es_nuevo, a.fecha as fecha_apertura,
         v.cajas_kombucha, v.cajas_cerveza, v.barriles,
         coalesce(pr.productos, '[]'::jsonb) as productos
  from venta v
  left join aperturas a on a.cliente = v.cliente
  left join productos pr on pr.cliente = v.cliente
  order by (a.cliente is not null) desc, v.neto desc;
$$;

grant execute on function public.plan_metas_detalle_clientes(uuid, date, date) to authenticated, agente_lector;

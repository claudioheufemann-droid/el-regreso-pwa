-- 2026-09-24 — La comisión del Gerente Comercial usa EXACTAMENTE la misma
-- base que el total "Venta completa" de /ventas: vendedores del área (todos
-- sus alias ERP, ver VENDEDORES_AREA_VENTAS_ERP en lib/types.ts) + clientes
-- de ventas_clientes_extra_area (marcador '@area_ventas').
--
-- Antes eran dos listas distintas: en Sep-2026 la comisión se calculaba
-- sobre $22.223.846 mientras la tarjeta de Ventas mostraba $31.148.112
-- (faltaban 'Nicol Delgado' tras un renombre del ERP y Cliente Birra /
-- La Confluencia SUP). Aplicada en producción con apply_migration.

CREATE OR REPLACE FUNCTION public._en_area_comision(p_vendedor text, p_cliente text, p_fecha date, p_vendedores text[])
 RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT p_vendedor = ANY(p_vendedores)
      OR ('@area_ventas' = ANY(p_vendedores) AND _cliente_extra_area(p_cliente, p_fecha))
$$;

CREATE OR REPLACE FUNCTION public.comision_gerente_por_cliente(p_ini date, p_fin date, p_vendedores text[])
 RETURNS TABLE(cliente text, vendedor text, venta_neta numeric, litros numeric, pedidos bigint, deuda_vencida numeric, saldo_total numeric, comisiona boolean)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  with base as (
    select v.nombre_fantasia as cliente, v.vendedor_actual as vendedor,
           v.total_sin_impuesto, v.litros, v.pedido
    from ventas v
    where v.entrega_informada
      and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
      and _en_area_comision(v.vendedor_actual, v.nombre_fantasia, coalesce(v.fecha_entrega, v.fecha_pedido), p_vendedores)
      and v.nombre_fantasia is not null
      and not _excluir_cliente(v.nombre_fantasia)
      and not _excluir_producto(v.producto)
  ),
  deuda as (
    select lower(trim(nombre_fantasia)) as k,
           sum(coalesce(deuda_vencida, 0)) as vencida,
           sum(coalesce(saldo_total, 0))   as saldo
    from deudores where nombre_fantasia is not null group by 1
  )
  select b.cliente, max(b.vendedor), sum(b.total_sin_impuesto), sum(b.litros),
         count(distinct b.pedido), coalesce(max(d.vencida), 0), coalesce(max(d.saldo), 0),
         coalesce(max(d.vencida), 0) = 0
  from base b
  left join deuda d on d.k = lower(trim(b.cliente))
  group by b.cliente
  order by sum(b.total_sin_impuesto) desc;
$function$;

CREATE OR REPLACE FUNCTION public.comision_gerente_por_producto(p_ini date, p_fin date, p_vendedores text[])
 RETURNS TABLE(producto text, envase text, categoria text, venta_neta numeric, litros numeric, clientes bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  select v.producto, v.envase,
         _categoria_normalizada(v.producto, v.categoria_producto) as categoria,
         sum(v.total_sin_impuesto), sum(v.litros), count(distinct v.nombre_fantasia)
  from ventas v
  where v.entrega_informada
    and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
    and _en_area_comision(v.vendedor_actual, v.nombre_fantasia, coalesce(v.fecha_entrega, v.fecha_pedido), p_vendedores)
    and v.nombre_fantasia is not null
    and not _excluir_cliente(v.nombre_fantasia)
    and not _excluir_producto(v.producto)
  group by v.producto, v.envase, _categoria_normalizada(v.producto, v.categoria_producto)
  order by 4 desc;
$function$;

CREATE OR REPLACE FUNCTION public.comision_gerente_cartera(p_ini date, p_fin date, p_vendedores text[])
 RETURNS TABLE(clientes_con_venta bigint, clientes_al_dia bigint, clientes_cartera bigint, clientes_activos bigint, interacciones bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  with deuda as (
    select lower(trim(nombre_fantasia)) as k, sum(coalesce(deuda_vencida, 0)) as vencida
    from deudores where nombre_fantasia is not null group by 1
  ),
  ventas_periodo as (
    select v.nombre_fantasia as cliente, count(distinct v.pedido) as pedidos
    from ventas v
    where v.entrega_informada
      and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
      and _en_area_comision(v.vendedor_actual, v.nombre_fantasia, coalesce(v.fecha_entrega, v.fecha_pedido), p_vendedores)
      and v.nombre_fantasia is not null
      and not _excluir_cliente(v.nombre_fantasia)
      and not _excluir_producto(v.producto)
    group by 1
  ),
  cartera as (
    select distinct c.nombre_fantasia as cliente
    from clientes c
    where c.nombre_fantasia is not null
      and not _excluir_cliente(c.nombre_fantasia)
      and (c.vendedor is null or _en_area_comision(c.vendedor, c.nombre_fantasia, p_fin, p_vendedores))
  ),
  crm as (
    select vt.cliente_nombre as cliente, count(*) as interacciones
    from visitas_terreno vt
    where vt.iniciada_at >= p_ini::timestamptz
      and vt.iniciada_at < (p_fin + 1)::timestamptz
      and vt.estado <> 'cancelada'
    group by 1
  )
  select
    (select count(*) from ventas_periodo),
    (select count(*) from ventas_periodo vp
       left join deuda d on d.k = lower(trim(vp.cliente))
      where coalesce(d.vencida, 0) = 0),
    (select count(*) from cartera),
    (select count(*) from cartera ca
       join crm on lower(trim(crm.cliente)) = lower(trim(ca.cliente))
       join ventas_periodo vp on lower(trim(vp.cliente)) = lower(trim(ca.cliente))
      where crm.interacciones >= 2 and vp.pedidos >= 1),
    (select coalesce(sum(interacciones), 0) from crm);
$function$;

CREATE OR REPLACE FUNCTION public.comision_gerente_por_entregar(p_ini date, p_fin date, p_vendedores text[])
 RETURNS TABLE(venta_neta numeric, litros numeric, pedidos bigint)
 LANGUAGE sql STABLE PARALLEL SAFE
AS $function$
  select coalesce(sum(v.total_sin_impuesto), 0), coalesce(sum(v.litros), 0), coalesce(count(distinct v.pedido), 0)
  from ventas v
  where p_fin >= current_date
    and v.fecha_pedido >= p_ini and v.fecha_pedido <= p_fin
    and v.entrega_informada and not v.entregado
    and _en_area_comision(v.vendedor_actual, v.nombre_fantasia, coalesce(v.fecha_entrega, v.fecha_pedido), p_vendedores)
    and v.nombre_fantasia is not null
    and not _excluir_cliente(v.nombre_fantasia)
    and not _excluir_producto(v.producto);
$function$;

-- Usuarios: Nicol y Marion también con sus alias ERP vigentes (sus pantallas
-- de clientes/deudores/misiones filtran por vendedores_erp).
update users set vendedores_erp = array(select distinct unnest(vendedores_erp || array['Nicol Delgado'])) where email='nicol.delgado@elregresobeer.com';
update users set vendedores_erp = array(select distinct unnest(vendedores_erp || array['Marion','Marion Meza'])) where email='marion.meza@elregresobeer.com';

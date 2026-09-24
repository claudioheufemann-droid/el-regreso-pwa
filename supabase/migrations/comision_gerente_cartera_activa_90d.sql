-- 2026-09-24 — Bono activación de cartera: la "cartera" (denominador del %)
-- pasa a ser la cartera ACTIVA del área — clientes con vendedor del área que
-- compraron en los 90 días previos al cierre del período. Fuera: canal
-- OnLine (no se visita), clientes sin vendedor y clientes dormidos.
-- Sep-2026: antes 681 clientes (0,9%), ahora 263 (2,3%). Decisión de Claudio
-- (opción recomendada). "Interacción" sigue siendo sólo visita registrada en
-- Terreno (lectura literal del contrato). Aplicada con apply_migration.
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
  compraron_90d as (
    select distinct lower(trim(v.nombre_fantasia)) as k
    from ventas v
    where v.entrega_informada
      and v.fecha_entrega > p_fin - 90 and v.fecha_entrega <= p_fin
      and v.nombre_fantasia is not null
  ),
  cartera as (
    select distinct c.nombre_fantasia as cliente
    from clientes c
    where c.nombre_fantasia is not null
      and not _excluir_cliente(c.nombre_fantasia)
      and c.vendedor is not null
      and c.vendedor <> 'OnLine'
      and _en_area_comision(c.vendedor, c.nombre_fantasia, p_fin, p_vendedores)
      and lower(trim(c.nombre_fantasia)) in (select k from compraron_90d)
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

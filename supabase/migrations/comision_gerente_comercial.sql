-- Comisiones del Gerente Comercial (contrato Claudio Heufemann, 04-05-2026).
--
-- Cláusula NOVENA: 1% de la venta neta mensual de los canales a su cargo.
-- Decisiones de negocio tomadas con Claudio el 2026-08-06, porque el contrato
-- no se puede traducir a SQL sin ellas:
--
--  · Qué ventas cuentan: las del EQUIPO COMERCIAL, identificado por
--    vendedor_actual (la base no tiene campo "canal": lo más cercano es
--    categoria_negocio, que es rubro del local, no canal de venta). La lista
--    de vendedores vive en lib/comisiones.ts y se pasa por parámetro, para
--    poder ajustarla sin migrar la base.
--  · "Venta neta que cumple políticas de cobranza" = venta de clientes SIN
--    deuda vencida al día de hoy. No existe registro de pagos por venta en la
--    base (sólo `deudores`, que es una foto del saldo actual por cliente), así
--    que ésta es la aproximación más fiel posible: si el cliente está al día,
--    su venta comisiona.
--  · Período: el 24→23 de la app, igual que el resto del dashboard.
--
-- Ojo: `deudores` es un snapshot del momento, no una serie histórica. Si un
-- cliente se pone al día, su venta pasa a comisionar de forma retroactiva
-- dentro del período. Es consistente con "comisiona cuando el cliente paga".

-- Acceso: sólo quien tenga el permiso ve su propia comisión.
alter table public.users
  add column if not exists ve_comision_gerente boolean not null default false;

update public.users
  set ve_comision_gerente = true
  where id = '7c8f5399-4b32-42cf-9500-7473f9140a27'; -- Claudio H.

-- Detalle por cliente: base de todo lo demás.
create or replace function public.comision_gerente_por_cliente(
  p_ini date,
  p_fin date,
  p_vendedores text[]
)
returns table(
  cliente text,
  vendedor text,
  venta_neta numeric,
  litros numeric,
  pedidos bigint,
  deuda_vencida numeric,
  saldo_total numeric,
  comisiona boolean
)
language sql
stable parallel safe
as $function$
  with base as (
    select v.nombre_fantasia as cliente,
           v.vendedor_actual as vendedor,
           v.total_sin_impuesto,
           v.litros,
           v.pedido
    from ventas v
    where v.entrega_informada
      and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
      and v.vendedor_actual = any(p_vendedores)
      and v.nombre_fantasia is not null
      and not _excluir_cliente(v.nombre_fantasia)
      and not _excluir_producto(v.producto)
  ),
  -- `deudores` puede traer el mismo local más de una vez; se consolida.
  deuda as (
    select lower(trim(nombre_fantasia)) as k,
           sum(coalesce(deuda_vencida, 0)) as vencida,
           sum(coalesce(saldo_total, 0))   as saldo
    from deudores
    where nombre_fantasia is not null
    group by 1
  )
  select b.cliente,
         max(b.vendedor),
         sum(b.total_sin_impuesto),
         sum(b.litros),
         count(distinct b.pedido),
         coalesce(max(d.vencida), 0),
         coalesce(max(d.saldo), 0),
         coalesce(max(d.vencida), 0) = 0
  from base b
  left join deuda d on d.k = lower(trim(b.cliente))
  group by b.cliente
  order by sum(b.total_sin_impuesto) desc;
$function$;

-- Detalle por producto, arrastrando si el cliente comisiona o no.
create or replace function public.comision_gerente_por_producto(
  p_ini date,
  p_fin date,
  p_vendedores text[]
)
returns table(
  producto text,
  envase text,
  categoria text,
  venta_neta numeric,
  venta_comisionable numeric,
  litros numeric,
  litros_comisionable numeric,
  clientes bigint
)
language sql
stable parallel safe
as $function$
  with deuda as (
    select lower(trim(nombre_fantasia)) as k,
           sum(coalesce(deuda_vencida, 0)) as vencida
    from deudores
    where nombre_fantasia is not null
    group by 1
  ),
  base as (
    select v.producto,
           v.envase,
           _categoria_normalizada(v.producto, v.categoria_producto) as categoria,
           v.total_sin_impuesto,
           v.litros,
           v.nombre_fantasia,
           coalesce(d.vencida, 0) = 0 as comisiona
    from ventas v
    left join deuda d on d.k = lower(trim(v.nombre_fantasia))
    where v.entrega_informada
      and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
      and v.vendedor_actual = any(p_vendedores)
      and v.nombre_fantasia is not null
      and not _excluir_cliente(v.nombre_fantasia)
      and not _excluir_producto(v.producto)
  )
  select b.producto,
         b.envase,
         b.categoria,
         sum(b.total_sin_impuesto),
         coalesce(sum(b.total_sin_impuesto) filter (where b.comisiona), 0),
         sum(b.litros),
         coalesce(sum(b.litros) filter (where b.comisiona), 0),
         count(distinct b.nombre_fantasia)
  from base b
  group by b.producto, b.envase, b.categoria
  order by 5 desc;
$function$;

-- Salud de cartera para los bonos de gestión (cláusula NOVENA):
--  · Comportamiento de pago: % de clientes del equipo sin deuda vencida.
--  · Activación CRM: cliente activo = >=2 interacciones registradas y >=1
--    pedido en el período. Las interacciones salen de visitas_terreno, que
--    es el CRM real de la app.
create or replace function public.comision_gerente_cartera(
  p_ini date,
  p_fin date,
  p_vendedores text[]
)
returns table(
  clientes_con_venta bigint,
  clientes_al_dia bigint,
  clientes_cartera bigint,
  clientes_activos bigint,
  interacciones bigint
)
language sql
stable parallel safe
as $function$
  with deuda as (
    select lower(trim(nombre_fantasia)) as k,
           sum(coalesce(deuda_vencida, 0)) as vencida
    from deudores
    where nombre_fantasia is not null
    group by 1
  ),
  ventas_periodo as (
    select v.nombre_fantasia as cliente, count(distinct v.pedido) as pedidos
    from ventas v
    where v.entrega_informada
      and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
      and v.vendedor_actual = any(p_vendedores)
      and v.nombre_fantasia is not null
      and not _excluir_cliente(v.nombre_fantasia)
      and not _excluir_producto(v.producto)
    group by 1
  ),
  -- Cartera = todos los clientes asignados a los vendedores del equipo,
  -- hayan comprado o no en el período (la activación se mide sobre eso).
  cartera as (
    select distinct c.nombre_fantasia as cliente
    from clientes c
    where c.nombre_fantasia is not null
      and not _excluir_cliente(c.nombre_fantasia)
      and (c.vendedor = any(p_vendedores) or c.vendedor is null)
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
       join crm     on lower(trim(crm.cliente)) = lower(trim(ca.cliente))
       join ventas_periodo vp on lower(trim(vp.cliente)) = lower(trim(ca.cliente))
      where crm.interacciones >= 2 and vp.pedidos >= 1),
    (select coalesce(sum(interacciones), 0) from crm);
$function$;

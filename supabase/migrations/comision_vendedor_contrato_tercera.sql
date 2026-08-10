-- Comisiones de vendedores de terreno bajo cláusula TERCERA (Yadro
-- Fabijancic y Marcelo Diaz, contratos 13-07-2026). Misma cláusula,
-- misma tabla de tasas y bonos en ambos contratos — se calcula una sola
-- vez y se resuelve el vendedor en runtime según la sesión.
--
-- Estructura de la cláusula TERCERA:
--  · Comisión escalonada: el TOTAL de venta neta mensual del vendedor
--    determina el tramo; dentro del tramo, cada canal tiene su propia
--    tasa (HORECA+Tradicional más alta que Retail+Distribuidor).
--  · Bono Apertura: primera venta a cliente nuevo (o sin compra hace
--    2 años calendario), tramos por monto de esa venta.
--  · Bono Recompra: si el cliente que gatilló un Bono Apertura vuelve a
--    comprar dentro de 30 días, tramos por el monto de esa 2ª compra.
--  · Bono Cobranza y Bono Retención de cartera: reutilizan
--    comision_gerente_cartera (misma definición de "al día" y "activo"
--    que ya usa el contrato de Claudio) — no hace falta función nueva.
--
-- Decisión de negocio 2026-08-07 (confirmada con Claudio, igual que el
-- resto de comisiones.ts: el contrato no se puede calcular sin ella):
-- la base no tiene campo "canal", el más cercano es
-- `ventas.categoria_negocio` (rubro del local). Mapeo acordado:
--   HORECA + Tradicional → Bar, Restaurante, Cafetería, Botillería,
--     Minimarket, Almacén, Actividades Turísticas, y cualquier
--     categoría no reconocida (incluyendo null) — por defecto a la
--     tasa alta, nunca a la baja.
--   Retail + Distribuidor → Supermercado, Distribuidor.

-- Venta neta entregada del período, partida por canal comercial.
create or replace function public.comision_vendedor_por_canal(
  p_ini date,
  p_fin date,
  p_vendedores text[]
)
returns table(
  canal text,
  venta_neta numeric,
  litros numeric,
  pedidos bigint
)
language sql
stable parallel safe
as $function$
  select
    case when v.categoria_negocio in ('Supermercado', 'Distribuidor')
         then 'retail_distribuidor'
         else 'horeca_tradicional'
    end as canal,
    sum(v.total_sin_impuesto),
    sum(v.litros),
    count(distinct v.pedido)
  from ventas v
  where v.entrega_informada
    and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
    and v.vendedor_actual = any(p_vendedores)
    and v.nombre_fantasia is not null
    and not _excluir_cliente(v.nombre_fantasia)
    and not _excluir_producto(v.producto)
  group by 1;
$function$;

-- Eventos de Apertura y Recompra dentro del período.
--
-- "Apertura" = un pedido entregado a un cliente que no tiene ningún otro
-- pedido entregado en los 730 días anteriores (cubre tanto "cliente
-- nunca compró" como "no compra hace 2 años calendario").
--
-- "Recompra" = el primer pedido siguiente del mismo cliente dentro de
-- los 30 días después de una Apertura — se paga en el período en que
-- OCURRE la recompra, no en el de la apertura (así lo dice el
-- contrato: "se pagará... al mes siguiente en que se efectúe la
-- segunda compra").
--
-- OJO: el historial para decidir si un cliente es "nuevo" se calcula
-- sobre TODA la empresa (cualquier vendedor), no solo sobre
-- p_vendedores. Yadro y Marcelo entraron el 13-07-2026 heredando
-- carteras que ya vendían otros vendedores (ej. "Transición 2"); si el
-- lookback sólo mirara sus propias ventas, cada cliente heredado se
-- vería como "cliente nuevo" el día en que aparece bajo su nombre y
-- pagaría Bono Apertura de forma indebida. El filtro por p_vendedores
-- se aplica sólo al final, sobre quién entregó el pedido que gatilla el
-- bono — así el bono se paga a quien hizo la venta, pero "es nuevo" se
-- decide contra la realidad completa del cliente.
create or replace function public.comision_vendedor_aperturas(
  p_ini date,
  p_fin date,
  p_vendedores text[]
)
returns table(
  tipo text,
  cliente text,
  fecha date,
  monto numeric
)
language sql
stable parallel safe
as $function$
  with entregas_todas as (
    select v.nombre_fantasia as cliente,
           v.pedido,
           v.vendedor_actual as vendedor,
           v.fecha_entrega as fecha,
           sum(v.total_sin_impuesto) as monto
    from ventas v
    where v.entrega_informada
      and v.nombre_fantasia is not null
      and not _excluir_cliente(v.nombre_fantasia)
      and not _excluir_producto(v.producto)
    group by 1, 2, 3, 4
  ),
  marcadas as (
    select e.*,
           lag(e.fecha) over (partition by e.cliente order by e.fecha, e.pedido) as fecha_anterior
    from entregas_todas e
  ),
  aperturas as (
    select cliente, pedido, vendedor, fecha, monto
    from marcadas
    where fecha_anterior is null or fecha - fecha_anterior > 730
  ),
  recompras as (
    select distinct on (a.cliente, a.pedido)
           a.cliente, b.vendedor, b.fecha as fecha_recompra, b.monto as monto_recompra
    from aperturas a
    join entregas_todas b
      on b.cliente = a.cliente
     and b.fecha > a.fecha
     and b.fecha <= a.fecha + 30
    order by a.cliente, a.pedido, b.fecha
  )
  select 'apertura', cliente, fecha, monto
  from aperturas
  where fecha >= p_ini and fecha <= p_fin
    and vendedor = any(p_vendedores)
  union all
  select 'recompra', cliente, fecha_recompra, monto_recompra
  from recompras
  where fecha_recompra >= p_ini and fecha_recompra <= p_fin
    and vendedor = any(p_vendedores);
$function$;

-- Acceso: mismo mecanismo que ve_comision_gerente, pero automático por
-- `vendedores_erp` en vez de un flag manual — cualquier usuario cuyo
-- vendedores_erp intersecte esta lista ve SU propia comisión (route.ts
-- nunca acepta un vendedor por parámetro, siempre lo deriva de la
-- sesión, así que un vendedor no puede pedir la comisión del otro).
-- Salud de cartera para el Bono Cobranza y el Bono Retención (cláusula
-- TERCERA). Calcada de comision_gerente_cartera, con dos diferencias
-- deliberadas:
--
--  1. La cartera NO incluye clientes con vendedor = null. Esa inclusión
--     tiene sentido en comision_gerente_cartera porque ahí representa
--     la vista del Gerente Comercial sobre TODO el equipo (un cliente
--     sin vendedor asignado igual es responsabilidad suya). Para un
--     vendedor individual no aplica: hay 36 clientes con vendedor null
--     en la base, y si se reutilizara la función tal cual, esos 36 se
--     sumarían a la cartera de Yadro Y de Marcelo AL MISMO TIEMPO,
--     inflando el denominador de ambos con clientes que ninguno de los
--     dos gestiona — haciendo el 80% del Bono Retención más difícil de
--     alcanzar por un motivo que no depende de su trabajo.
--  2. `interacciones` se acota a la cartera del vendedor. En
--     comision_gerente_cartera ese número suma TODAS las visitas de
--     Terreno del período sin filtrar por cartera — daba lo mismo
--     porque ahí es una cifra de contexto, no algo que se compare
--     entre personas. Acá el mismo número se muestra en la tarjeta
--     personal de cada vendedor: sin acotar, Yadro y Marcelo verían
--     literalmente el mismo total (el de toda la empresa), lo que se
--     confirmó al probar ambas cifras y salir idénticas (128 y 128).
create or replace function public.comision_vendedor_cartera(
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
  cartera as (
    select distinct c.nombre_fantasia as cliente
    from clientes c
    where c.nombre_fantasia is not null
      and not _excluir_cliente(c.nombre_fantasia)
      and c.vendedor = any(p_vendedores)
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
    (select coalesce(sum(crm.interacciones), 0)
       from cartera ca
       join crm on lower(trim(crm.cliente)) = lower(trim(ca.cliente)));
$function$;

comment on function public.comision_vendedor_por_canal is
  'Comisión cláusula TERCERA (Yadro/Marcelo): venta neta entregada por canal comercial.';
comment on function public.comision_vendedor_aperturas is
  'Comisión cláusula TERCERA (Yadro/Marcelo): eventos de Bono Apertura y Bono Recompra.';
comment on function public.comision_vendedor_cartera is
  'Comisión cláusula TERCERA (Yadro/Marcelo): salud de cartera propia (sin clientes vendedor=null).';

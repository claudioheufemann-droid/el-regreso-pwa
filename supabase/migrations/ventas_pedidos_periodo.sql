-- Todos los pedidos del período en una sola lista, para el drill-down de
-- "Venta área comercial" (vista Pedidos). Las funciones que ya existían
-- devuelven pedidos partidos por origen (backlog vs mismo período) o los de
-- un cliente puntual — ninguna da la lista completa del período.
--
-- Incluye la MISMA población que ventas_detalle_clientes: lo entregado dentro
-- del rango + lo que sigue pendiente de despacho. Así el total de la vista
-- Pedidos calza exacto con el de las vistas Clientes y Productos y con las
-- tarjetas de arriba — que no calcen dos números del mismo período es
-- justamente lo que se quiere evitar acá.
--
-- Orden: lo más reciente primero (fecha real del evento — entrega si ya se
-- entregó, pedido si sigue pendiente), con la hora del ERP como desempate.
create or replace function public.ventas_pedidos_periodo(
  p_ini date,
  p_fin date,
  p_provincias text[] default null::text[],
  p_por_entrega boolean default true
)
returns table(
  pedido text,
  cliente text,
  vendedor text,
  localidad text,
  fecha_pedido date,
  fecha_entrega date,
  fecha_entrega_hora timestamp without time zone,
  litros numeric,
  revenue numeric,
  entregado boolean
)
language sql
stable parallel safe
as $function$
  with base as (
    select v.pedido, v.nombre_fantasia, v.vendedor_actual, v.localidad,
           v.fecha_pedido, v.fecha_entrega, v.fecha_entrega_hora,
           v.litros, v.total_sin_impuesto, v.entregado
    from ventas v
    where v.pedido is not null
      and (
        (case when p_por_entrega
              then v.entrega_informada and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
              else v.fecha_pedido >= p_ini and v.fecha_pedido <= p_fin end)
        -- Pendientes: mismo criterio que ventas_detalle_clientes — sólo se
        -- suman al período VIGENTE (el que contiene hoy), nunca a uno cerrado.
        or (p_fin >= current_date and v.fecha_pedido <= p_fin
            and v.entrega_informada and not v.entregado)
      )
      and (p_provincias is null or cardinality(p_provincias) = 0 or v.provincia = any(p_provincias))
      and v.nombre_fantasia is not null and not _excluir_cliente(v.nombre_fantasia)
      and not _excluir_producto(v.producto)
  )
  select b.pedido,
         max(b.nombre_fantasia),
         max(b.vendedor_actual),
         max(b.localidad),
         max(b.fecha_pedido),
         max(b.fecha_entrega),
         max(b.fecha_entrega_hora),
         sum(b.litros),
         sum(b.total_sin_impuesto),
         bool_and(coalesce(b.entregado, false))
  from base b
  group by b.pedido
  order by greatest(max(b.fecha_entrega), max(b.fecha_pedido)) desc nulls last,
           max(b.fecha_entrega_hora) desc nulls last;
$function$;

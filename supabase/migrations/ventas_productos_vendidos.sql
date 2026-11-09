-- Explorador "Productos vendidos" de /ventas (pedido de Claudio, 2026-11-09):
-- ver por semana o por período qué productos se vendieron, quién los vendió,
-- en qué región y a qué local, con filtros y buscador en el cliente.
--
-- Devuelve el rango ya agregado a nivel cliente × vendedor × producto ×
-- envase (unos 2.000 renglones por período, ~400 por semana): el cliente
-- filtra y reagrupa sin volver a consultar. Mismas reglas que el resto del
-- dashboard:
--   · fecha de ENTREGA (p_por_entrega) o de pedido para rangos antiguos
--   · sin clientes internos/excluidos ni productos excluidos
--   · sólo área comercial (p_vendedores, incluye '@area_ventas')
--   · el monto de "Empaque y Distribución" se reparte entre los productos
--     del pedido (igual que ventas_detalle_clientes_por_producto)
--   · sólo líneas con litros (cervezas y kombuchas; no merchandising).
--     Las negativas (devoluciones) se restan, igual que en "Litros vendidos"
create or replace function public.ventas_productos_vendidos(
  p_ini date,
  p_fin date,
  p_provincias text[] default null,
  p_por_entrega boolean default true,
  p_vendedores text[] default null
)
returns table(
  cliente text, vendedor text, provincia text, localidad text,
  producto text, envase text, categoria text,
  litros numeric, revenue numeric, unidades numeric, pedidos bigint, ultima_compra date
)
language sql
stable parallel safe
as $function$
  with base as (
    select v.pedido, v.nombre_fantasia, v.vendedor_actual, v.provincia, v.localidad,
           v.producto, v.envase, v.categoria_producto, v.litros, v.total_sin_impuesto,
           case when p_por_entrega then v.fecha_entrega else v.fecha_pedido end as fecha_relevante,
           (v.producto ilike 'Empaque y Distribución%') as es_empaque
    from ventas v
    where (case when p_por_entrega then v.entrega_informada and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
                else v.fecha_pedido >= p_ini and v.fecha_pedido <= p_fin end)
      and (p_provincias is null or cardinality(p_provincias) = 0 or v.provincia = any(p_provincias))
      and (p_vendedores is null or cardinality(p_vendedores) = 0 or v.vendedor_actual = any(p_vendedores)
           or ('@area_ventas' = any(p_vendedores) and _cliente_extra_area(v.nombre_fantasia, coalesce(v.fecha_entrega, v.fecha_pedido))))
      and v.nombre_fantasia is not null and not v.cliente_excluido
      and not v.producto_excluido
  ),
  totales_pedido as (
    select pedido,
      sum(total_sin_impuesto) filter (where es_empaque)     as monto_empaque,
      sum(total_sin_impuesto) filter (where not es_empaque) as monto_real
    from base group by pedido
  ),
  ajustado as (
    select b.*,
      b.total_sin_impuesto + coalesce(b.total_sin_impuesto * coalesce(tp.monto_empaque, 0) / nullif(tp.monto_real, 0), 0) as revenue_ajustado
    from base b join totales_pedido tp using (pedido)
    where not b.es_empaque and coalesce(b.litros, 0) <> 0
  )
  select
    nombre_fantasia,
    max(vendedor_actual),
    max(provincia),
    max(localidad),
    coalesce(nullif(trim(producto), ''), 'Sin producto'),
    coalesce(nullif(trim(envase), ''), '—'),
    _categoria_normalizada(producto, categoria_producto),
    sum(litros),
    sum(revenue_ajustado),
    round(sum(
      case
        when envase ilike '%barril%' then litros / 30.0
        when envase ilike '%354%'    then litros / 0.354
        when envase ilike '%473%'    then litros / 0.473
        when envase ilike '%500%'    then litros / 0.5
        when envase ilike '%330%'    then litros / 0.33
        else 0
      end
    )),
    count(distinct pedido),
    max(fecha_relevante)
  from ajustado
  -- vendedor_actual crudo del ERP: el cliente lo pasa por vendedorCanonico
  -- (nombre viejo y nuevo del mismo vendedor quedan juntos al reagrupar).
  group by nombre_fantasia, vendedor_actual,
           coalesce(nullif(trim(producto), ''), 'Sin producto'),
           coalesce(nullif(trim(envase), ''), '—'),
           _categoria_normalizada(producto, categoria_producto)
  having sum(litros) <> 0;
$function$;

grant execute on function public.ventas_productos_vendidos(date, date, text[], boolean, text[]) to authenticated;

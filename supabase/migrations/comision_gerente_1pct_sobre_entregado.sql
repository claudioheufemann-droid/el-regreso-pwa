-- Corrección 2026-08-06: el 1% de la cláusula novena es sobre TODA la venta
-- neta entregada, no sólo la de clientes sin deuda vencida. La primera
-- versión (comision_gerente_comercial.sql) restaba esa parte de la
-- comisión ($50.168 sobre $10,86M en vez de $109.103); Claudio la corrigió
-- explícitamente: "si he entregado 10.910.290 el bono debería ser el 1% de
-- ese monto". La deuda vencida queda como alerta informativa en
-- comision_gerente_por_cliente (columna `comisiona`), ya no descuenta nada.
--
-- Simplifica comision_gerente_por_producto: ya no hace falta separar
-- venta_comisionable/litros_comisionable, todo comisiona por igual.
-- DROP primero porque cambia el tipo de retorno (columnas de menos).
drop function if exists public.comision_gerente_por_producto(date, date, text[]);

create function public.comision_gerente_por_producto(
  p_ini date,
  p_fin date,
  p_vendedores text[]
)
returns table(
  producto text,
  envase text,
  categoria text,
  venta_neta numeric,
  litros numeric,
  clientes bigint
)
language sql
stable parallel safe
as $function$
  select v.producto,
         v.envase,
         _categoria_normalizada(v.producto, v.categoria_producto) as categoria,
         sum(v.total_sin_impuesto),
         sum(v.litros),
         count(distinct v.nombre_fantasia)
  from ventas v
  where v.entrega_informada
    and v.fecha_entrega >= p_ini and v.fecha_entrega <= p_fin
    and v.vendedor_actual = any(p_vendedores)
    and v.nombre_fantasia is not null
    and not _excluir_cliente(v.nombre_fantasia)
    and not _excluir_producto(v.producto)
  group by v.producto, v.envase, _categoria_normalizada(v.producto, v.categoria_producto)
  order by 4 desc;
$function$;

-- Complemento a comisión_gerente_comercial.sql: separa lo ENTREGADO (base de
-- la comisión, cláusula NOVENA) de lo POR ENTREGAR (pedidos tomados por el
-- equipo aún sin despachar). Pedido explícito de Claudio 2026-08-06: la
-- comisión SIEMPRE se calcula sobre lo entregado — lo por entregar es sólo
-- informativo, "lo que podría tener" cuando se despache.
--
-- Mismo criterio que ventas_entregas_periodo (usado en el resto del
-- dashboard) para que el número calce exacto con el resto de la app: sólo
-- cuenta pendientes cuando p_fin >= hoy (el pendiente se traslada al período
-- vigente, un período ya cerrado siempre da 0 pendientes).
create or replace function public.comision_gerente_por_entregar(
  p_ini date,
  p_fin date,
  p_vendedores text[]
)
returns table(
  venta_neta numeric,
  litros numeric,
  pedidos bigint
)
language sql
stable parallel safe
as $function$
  select
    coalesce(sum(v.total_sin_impuesto), 0),
    coalesce(sum(v.litros), 0),
    coalesce(count(distinct v.pedido), 0)
  from ventas v
  where p_fin >= current_date
    and v.fecha_pedido <= p_fin
    and v.entrega_informada and not v.entregado
    and v.vendedor_actual = any(p_vendedores)
    and v.nombre_fantasia is not null
    and not _excluir_cliente(v.nombre_fantasia)
    and not _excluir_producto(v.producto);
$function$;

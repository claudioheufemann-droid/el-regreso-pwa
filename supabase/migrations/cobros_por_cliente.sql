-- Caja real cobrada: lo cobrado por cliente en un rango [p_desde, p_hasta], para separar en
-- TypeScript los clientes a crédito (esClienteCredito) de las cuentas propias. cobros_por_dia
-- marca como 'credito' todo lo que no es PDV, incluido BaseCamp El Regreso y cuentas internas.
-- Aplicada en producción el 2-oct-2026.
create or replace function public.cobros_por_cliente(p_desde date, p_hasta date default null)
returns table(cliente text, monto numeric, pagos bigint)
language sql stable as $$
  select c.cliente, sum(c.monto)::numeric, count(*)::bigint
  from cobros_erp c
  where c.fecha >= p_desde and (p_hasta is null or c.fecha <= p_hasta) and c.monto > 0
  group by c.cliente;
$$;

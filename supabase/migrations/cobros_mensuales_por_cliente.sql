-- Caja real cobrada / escenarios: cobrado por mes calendario y cliente desde p_desde. Sirve para el
-- ritmo de EWU (enlatado facturado fuera del informe de ventas) y el mismo mes del año anterior.
-- Aplicada en producción el 2-oct-2026.
create or replace function public.cobros_mensuales_por_cliente(p_desde date)
returns table(mes date, cliente text, monto numeric)
language sql stable as $$
  select date_trunc('month', c.fecha)::date, c.cliente, sum(c.monto)::numeric
  from cobros_erp c
  where c.fecha >= p_desde and c.monto > 0
  group by 1, 2;
$$;

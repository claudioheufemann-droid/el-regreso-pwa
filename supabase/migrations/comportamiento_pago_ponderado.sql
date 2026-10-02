-- Caja real cobrada (Administración): días reales de pago por cliente PONDERADOS POR MONTO
-- en una ventana (12 meses por defecto). dias_pago de cobros_erp = fecha de pago - fecha de la
-- guía/factura, así que desvío vs. vencimiento = dias_ponderado - plazo pactado (eso se resta en
-- TypeScript con clientes.dias_pago). Distinta de comportamiento_pago_clientes, que es promedio
-- simple sobre todo el historial y alimenta la proyección de "Plata que entró".
-- Aplicada en producción el 2-oct-2026.
create or replace function public.comportamiento_pago_ponderado(p_desde date)
returns table(cliente text, pagos bigint, monto numeric, dias_ponderado numeric)
language sql stable as $$
  select c.cliente, count(*)::bigint, sum(c.monto)::numeric,
         (sum(c.dias_pago * c.monto) / nullif(sum(c.monto), 0))::numeric
  from cobros_erp c
  where c.dias_pago is not null and c.fecha >= p_desde and c.monto > 0
  group by c.cliente;
$$;

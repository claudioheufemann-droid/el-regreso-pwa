-- Litros pagados: cada pago de cobros_erp convertido a los litros de la factura que paga
-- (pestaña "Litros" de Administración y Finanzas, 27-oct-2026).
--
--   · Con factura: litros de la factura × (monto pagado ÷ bruto de la factura), tope 1, para
--     que un abono parcial no cuente la factura entera. ciclo_origen = ciclo 24→23 de la
--     ENTREGA, así se ve cuánto de lo pagado viene arrastrado de ciclos anteriores.
--   · Sin factura (o con una que no está en ventas): estimado = monto ÷ bruto por litro del
--     cliente en sus ventas del último año. ciclo_origen = null, estimado = true. Si el
--     cliente no tiene ventas, litros = null y TypeScript usa el bruto por litro de la cartera.
--   · Bruto = neto × (1 + IVA 19% + ILA 20,5% en cerveza), la misma regla que brutoLinea()
--     en lib/cobranza.ts: sin ILA la kombucha y "Empaque y Distribución".
-- Las cuentas propias (PDV, BaseCamp, ferias…) se filtran en TypeScript con
-- esClienteCredito, igual que la Caja: así hay una sola lista de exclusiones.
create or replace function public.litros_pagados_por_pago(p_desde date, p_hasta date default null)
returns table(fecha date, cliente text, vendedor text, ciclo_origen date, estimado boolean, monto numeric, litros numeric)
language sql stable as $$
  with lineas as (
    select
      ve.numero_factura,
      lower(trim(ve.nombre_fantasia)) as clave,
      ve.fecha_entrega,
      ve.fecha_pedido,
      coalesce(nullif(trim(ve.vendedor_actual), ''), 'Sin vendedor') as vendedor,
      coalesce(ve.litros, 0) as litros,
      coalesce(ve.total_sin_impuesto, 0) * (1.19 +
        case when coalesce(ve.producto, '') ~* 'empaque\s*y\s*distrib|kombucha'
               or (coalesce(ve.categoria_producto, '') ~* 'kombucha' and coalesce(ve.categoria_producto, '') !~* 'cerveza')
             then 0 else 0.205 end) as bruto
    from ventas ve
    where ve.fecha_pedido >= p_desde - 400
      and lower(coalesce(ve.producto, '')) not like '%tour%'
      and lower(coalesce(ve.producto, '')) not like '%degustaci%'
  ),
  fact as (
    select numero_factura, max(fecha_entrega) as fecha_entrega, min(vendedor) as vendedor,
           sum(litros) as litros, sum(bruto) as bruto
    from lineas
    where numero_factura is not null and fecha_entrega is not null
    group by 1
  ),
  precio as (
    select clave, sum(bruto) / nullif(sum(litros), 0) as bruto_litro
    from lineas
    where fecha_entrega is not null and litros > 0 and bruto > 0 and fecha_pedido >= current_date - 365
    group by 1
  ),
  vend as (
    select distinct on (clave) clave, vendedor from lineas order by clave, fecha_pedido desc
  ),
  p as (
    select c.fecha, c.cliente, c.monto, f.fecha_entrega, f.vendedor, f.litros, f.bruto
    from cobros_erp c
    left join fact f on f.numero_factura = c.factura
    where c.fecha >= p_desde and (p_hasta is null or c.fecha <= p_hasta) and c.monto > 0
  )
  select
    p.fecha,
    p.cliente,
    coalesce(p.vendedor, v.vendedor, 'Sin vendedor') as vendedor,
    case when p.bruto > 0 then
      (date_trunc('month', p.fecha_entrega)
        + case when extract(day from p.fecha_entrega) >= 24 then interval '1 month' else interval '0' end)::date
    end as ciclo_origen,
    not coalesce(p.bruto > 0, false) as estimado,
    sum(p.monto)::numeric as monto,
    round(sum(case when p.bruto > 0 then p.litros * least(1, p.monto / p.bruto)
                   else p.monto / nullif(pr.bruto_litro, 0) end), 2) as litros
  from p
  left join vend v on v.clave = lower(trim(p.cliente))
  left join precio pr on pr.clave = lower(trim(p.cliente))
  group by 1, 2, 3, 4, 5;
$$;

-- Litros entregados por ciclo (24→23, por FECHA DE ENTREGA) separados en
-- pagados / vencidos / en plazo / sin plazo, por vendedor y cliente.
-- Lo usa la tabla "¿Qué parte de lo entregado ya se pagó?" de la pestaña
-- Cobranza (5-oct-2026). Sólo facturas: PDV y BaseCamp no pasan por cobranza
-- y se filtran del lado de Next con esClienteExcluido (misma regla que Ventas).
--
-- Una factura cuenta como pagada si tiene CUALQUIER pago en cobros_erp (hay
-- pocos pagos parciales). Vencida = fecha_entrega + dias_pago de la ficha del
-- cliente ya pasó. Sin dias_pago en la ficha → 'sin_plazo'.
create or replace function public.pagado_por_ciclo(p_desde date)
returns table(ciclo date, vendedor text, cliente text, estado text, facturas int, litros numeric, neto numeric)
language sql
stable
as $$
  with v as (
    select
      ve.numero_factura,
      ve.nombre_fantasia,
      coalesce(nullif(trim(ve.vendedor_actual), ''), 'Sin vendedor') as vendedor,
      ve.fecha_entrega,
      coalesce(ve.litros, 0) as litros,
      coalesce(ve.total_sin_impuesto, 0) as neto,
      -- etiqueta del ciclo: del 24 en adelante es el ciclo del mes siguiente
      (date_trunc('month', ve.fecha_entrega)
        + case when extract(day from ve.fecha_entrega) >= 24 then interval '1 month' else interval '0' end)::date as ciclo,
      (select c.dias_pago from clientes c
        where lower(trim(c.nombre_fantasia)) = lower(trim(ve.nombre_fantasia)) limit 1) as dias_pago,
      exists (select 1 from cobros_erp p where p.factura = ve.numero_factura) as pagada
    from ventas ve
    where ve.fecha_entrega >= p_desde
      and ve.numero_factura is not null
      and lower(coalesce(ve.producto, '')) not like '%tour%'
      and lower(coalesce(ve.producto, '')) not like '%degustaci%'
  )
  select
    ciclo,
    vendedor,
    nombre_fantasia as cliente,
    case
      when pagada then 'pagada'
      when dias_pago is null then 'sin_plazo'
      when fecha_entrega + dias_pago < current_date then 'vencida'
      else 'en_plazo'
    end as estado,
    count(distinct numero_factura)::int as facturas,
    round(sum(litros), 1) as litros,
    round(sum(neto)) as neto
  from v
  group by 1, 2, 3, 4;
$$;

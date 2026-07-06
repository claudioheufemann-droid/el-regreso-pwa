-- Registro de forma de pago al cerrar una visita con venta efectiva —
-- necesario para poder avisarle al vendedor cuándo cobrarle a cada cliente
-- (antes no quedaba ningún dato de si la venta fue al contado o a crédito).
alter table public.visitas_terreno
  add column if not exists metodo_pago text check (metodo_pago in ('efectivo', 'transferencia', 'credito')),
  add column if not exists dias_credito integer check (dias_credito is null or dias_credito > 0),
  add column if not exists fecha_pago_estimada date;

comment on column public.visitas_terreno.metodo_pago is 'Forma de pago acordada al cerrar la visita (solo si tiene_venta = true)';
comment on column public.visitas_terreno.dias_credito is 'Días de plazo acordados con el cliente cuando metodo_pago = credito';
comment on column public.visitas_terreno.fecha_pago_estimada is 'completada_at + dias_credito — fecha en la que se debe cobrar';

create index if not exists idx_visitas_terreno_cobranza
  on public.visitas_terreno (vendedor_id, fecha_pago_estimada)
  where metodo_pago = 'credito';

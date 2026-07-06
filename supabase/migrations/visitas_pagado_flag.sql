-- Permite marcar una venta a crédito como cobrada, para que la lista de
-- "cobros pendientes" en /terreno no crezca para siempre.
alter table public.visitas_terreno
  add column if not exists pagado boolean not null default false;

comment on column public.visitas_terreno.pagado is 'true cuando el vendedor ya cobro una venta a credito (marcado manualmente)';

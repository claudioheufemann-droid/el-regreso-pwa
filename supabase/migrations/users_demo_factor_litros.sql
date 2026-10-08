-- Modo demo de Ventas (para grabar videos): factor por usuario que multiplica
-- litros, ingresos, pedidos y clientes al MOSTRAR /ventas. No toca `ventas`.
-- Apagar = dejar la columna en NULL.
alter table public.users add column if not exists demo_factor_litros numeric;
comment on column public.users.demo_factor_litros is 'Factor de visualización ficticia en /ventas (NULL = datos reales). Solo para demos.';

-- Habilita Supabase Realtime para la tabla tasks — necesario para que las
-- eliminaciones (y en general los cambios) se propaguen en vivo a todas las
-- ventanas/usuarios con el módulo de Gestión abierto, sin depender de refetch
-- por foco/visibilidad.
alter publication supabase_realtime add table public.tasks;

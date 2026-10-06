-- Aplicada en producción el 5-oct-2026.
-- Permiso para usar el Asistente de datos con acceso completo (igual que un admin
-- dentro del chat) sin hacer a la persona administradora del resto de la app.
-- Se activa por usuario: update users set puede_usar_asistente = true where ...;
alter table public.users add column if not exists puede_usar_asistente boolean not null default false;
comment on column public.users.puede_usar_asistente is
  'Acceso completo al Asistente de datos (lectura de toda la base y propuestas de correos/tareas/avisos) sin ser administrador del resto de la app. 5-oct-2026, primer caso: Jerson.';

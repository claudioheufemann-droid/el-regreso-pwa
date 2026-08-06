-- Cotizaciones: cada vendedor ve SOLO las suyas; los administradores ven las
-- de todo el equipo. Antes las tres políticas eran `true`, así que cualquier
-- usuario autenticado veía (y podía editar) las cotizaciones de todos.
--
-- Todas las consultas de cotizaciones en la app usan el cliente con sesión
-- (nunca service-role), así que arreglarlo acá cubre de una vez el historial,
-- el cambio de estado y el reenvío por correo.

-- Helper: evita repetir el subquery a `users` en cada política y deja que el
-- planner lo evalúe una vez por consulta en vez de por fila. SECURITY DEFINER
-- para que no dependa de las políticas de `users` ni pueda recursar.
create or replace function public._es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select u.is_admin from public.users u where u.id = auth.uid()), false)
$$;

drop policy if exists cotizaciones_select_todos on public.cotizaciones;
drop policy if exists cotizaciones_insert_todos on public.cotizaciones;
drop policy if exists cotizaciones_update_todos on public.cotizaciones;

create policy cotizaciones_select on public.cotizaciones
  for select to authenticated
  using (creado_por = auth.uid() or public._es_admin());

-- Estricto a propósito: nadie puede crear una cotización a nombre de otro
-- (el formulario ya manda creado_por = usuario de la sesión).
create policy cotizaciones_insert on public.cotizaciones
  for insert to authenticated
  with check (creado_por = auth.uid());

-- Mismo alcance que la lectura: un vendedor no puede cambiarle el estado a
-- una cotización ajena. El WITH CHECK impide además reasignar creado_por a
-- otro usuario en un UPDATE.
create policy cotizaciones_update on public.cotizaciones
  for update to authenticated
  using (creado_por = auth.uid() or public._es_admin())
  with check (creado_por = auth.uid() or public._es_admin());

-- Acceso de LECTURA amplia para el Asistente de datos, sin usar la llave maestra (service-role) para SQL libre.
-- Capas: (1) rol agente_lector con SELECT sólo sobre lo permitido, a nivel de COLUMNA; (2) guardia de texto dentro de la
-- función (una sentencia, sólo SELECT/WITH, lista blanca de funciones); (3) transacción de sólo lectura + timeout 10 s;
-- (4) tope de filas; (5) la función sólo la puede ejecutar service-role (el servidor de la app), nunca anon/authenticated.
-- Aplicada en producción el 1-oct-2026 y probada con 18 intentos de ataque (todos bloqueados).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'agente_lector') then create role agente_lector nologin; end if;
end $$;
grant agente_lector to postgres with set true, inherit true;
grant usage on schema public to agente_lector;

-- Lo que NUNCA se concede: credenciales/usuarios, notificaciones, costos y márgenes, correo saliente, auditoría,
-- respaldos y las propias tablas del agente. Tablas nuevas quedan DENEGADAS hasta correr agente_refrescar_permisos().
create or replace function public.agente_refrescar_permisos() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t record; cols text; n_tablas int := 0;
  denegadas text[] := array['users','push_subscriptions','notificaciones','correo_outbox_terreno','terreno_auditoria',
                            'costos_productos','costos_precios','simulaciones_rentabilidad','contactos_cobranza','personas_contacto'];
  columnas_denegadas text := '^(rut|email|correo|telefono|celular|fono|whatsapp|contacto|codigo_postal|password|token|secret|endpoint|p256dh|auth)(_.*)?$|^direccion|_(rut|email|telefono|celular|token|password|secret)$';
begin
  execute 'revoke all on all tables in schema public from agente_lector';
  for t in select schemaname, tablename from pg_policies where policyname = 'agente_lector_select' loop
    execute format('drop policy agente_lector_select on %I.%I', t.schemaname, t.tablename);
  end loop;

  for t in
    select c.oid, c.relname, c.relkind from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind in ('r','p','v','m')
      and c.relname !~ '^(_backup_|agente_)' and not (c.relname = any(denegadas))
  loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
    where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped and a.attname !~* columnas_denegadas;
    if cols is null then continue; end if;
    execute format('grant select (%s) on public.%I to agente_lector', cols, t.relname);
    if t.relkind in ('r','p') then
      execute format('create policy agente_lector_select on public.%I for select to agente_lector using (true)', t.relname);
    end if;
    n_tablas := n_tablas + 1;
  end loop;
  return format('%s tablas/vistas legibles por agente_lector', n_tablas);
end $$;
revoke all on function public.agente_refrescar_permisos() from public, anon, authenticated;
grant execute on function public.agente_refrescar_permisos() to service_role;

-- La función que ejecuta el SQL vive en un schema propio y es DUEÑA agente_lector: corre con sus permisos limitados
-- (no hace falta SET ROLE, que exigiría darle membresía al rol de conexión de PostgREST).
create schema if not exists agente authorization agente_lector;
revoke all on schema agente from public;
grant usage, create on schema agente to postgres;

create or replace function agente.consultar(p_sql text, p_max integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v text; s text; fn text; maxf integer := least(greatest(coalesce(p_max, 200), 1), 500); filas jsonb; total integer;
  permitidas text[] := array[
    'count','sum','avg','min','max','stddev','stddev_pop','stddev_samp','variance','string_agg','array_agg','json_agg','jsonb_agg',
    'json_object_agg','jsonb_object_agg','bool_and','bool_or','every','percentile_cont','percentile_disc','mode','corr',
    'row_number','rank','dense_rank','percent_rank','cume_dist','ntile','lag','lead','first_value','last_value','nth_value',
    'coalesce','nullif','greatest','least','abs','round','ceil','ceiling','floor','trunc','mod','power','sqrt','sign',
    'lower','upper','initcap','length','char_length','substring','substr','left','right','position','strpos','replace','trim',
    'ltrim','rtrim','btrim','concat','concat_ws','split_part','regexp_replace','lpad','rpad','repeat','reverse','translate',
    'now','current_date','current_timestamp','date_trunc','date_part','extract','age','make_date','to_char','to_date','to_timestamp',
    'to_jsonb','jsonb_build_object','generate_series','unnest','array_length','cast',
    'numeric','decimal','varchar','char','timestamp','timestamptz','time','interval','int4','int8','float8','text',
    'in','exists','over','filter','values','from','join','select','and','or','not','where','on','as','when','then','else','case','end',
    'by','using','any','all','some','between','like','ilike','similar','lateral','union','intersect','except','limit','offset',
    'having','group','order','distinct','partition','rows','range','within','with','materialized','row','array',
    '_excluir_cliente','_excluir_producto','_excluir_cliente_finanzas'];
begin
  v := btrim(coalesce(p_sql, ''));
  if right(v, 1) = ';' then v := btrim(left(v, length(v) - 1)); end if;
  if v = '' then raise exception 'Consulta vacía.'; end if;
  if length(v) > 4000 then raise exception 'Consulta demasiado larga (máx. 4000 caracteres).'; end if;
  if v ~ ';' then raise exception 'Una sola sentencia por consulta.'; end if;
  if v ~ '--|/\*|\$' then raise exception 'No se permiten comentarios ni dollar-quoting.'; end if;
  s := lower(regexp_replace(v, '''[^'']*''', '''''', 'g'));
  if s !~ '^\s*(select|with)\M' then raise exception 'Sólo se permiten consultas SELECT (o WITH ... SELECT).'; end if;
  if s ~ '\m(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|execute|vacuum|analyze|lock|listen|notify|unlisten|set|reset|show|declare|fetch|prepare|deallocate|discard|refresh|reindex|cluster|comment|security|into)\M' then
    raise exception 'La consulta contiene una palabra no permitida (sólo lectura).';
  end if;
  if s ~ '\mpg_[a-z0-9_]*|information_schema|current_setting|set_config' then raise exception 'No se permite consultar el catálogo del sistema.'; end if;
  for fn in select lower((regexp_matches(s, '([a-z_][a-z0-9_]*)\s*\(', 'g'))[1]) loop
    if not (fn = any(permitidas)) then raise exception 'Función no permitida: %. Usa sólo funciones estándar de SQL (sum, count, date_trunc, coalesce, ...).', fn; end if;
  end loop;

  set local statement_timeout = '10s';
  set local transaction_read_only = on;
  execute format('select coalesce(jsonb_agg(to_jsonb(q)), ''[]''::jsonb) from (select * from (%s) x limit %s) q', v, maxf + 1) into filas;
  total := jsonb_array_length(filas);
  if total > maxf then
    select jsonb_agg(e) into filas from (select e from jsonb_array_elements(filas) with ordinality t(e, i) where i <= maxf) z;
  end if;
  return jsonb_build_object('filas', filas, 'filas_devueltas', least(total, maxf), 'truncado', total > maxf);
end $$;
alter function agente.consultar(text, integer) owner to agente_lector;
revoke all on function agente.consultar(text, integer) from public;
grant execute on function agente.consultar(text, integer) to postgres;

create or replace function public.agente_consultar(p_sql text, p_max integer default 200) returns jsonb
language sql security definer set search_path = public, pg_temp as $$ select agente.consultar(p_sql, p_max) $$;
revoke all on function public.agente_consultar(text, integer) from public, anon, authenticated;
grant execute on function public.agente_consultar(text, integer) to service_role;

-- Descubrimiento de esquema: sólo muestra lo que agente_lector puede leer (tablas y columnas permitidas).
create or replace function public.agente_esquema(p_tabla text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare res jsonb;
begin
  if p_tabla is null then
    select coalesce(jsonb_agg(jsonb_build_object('tabla', c.relname, 'filas_aprox', greatest(c.reltuples, 0)::bigint, 'nota', obj_description(c.oid)) order by c.relname), '[]')
      into res from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relkind in ('r','p','v','m') and has_any_column_privilege('agente_lector', c.oid, 'select');
  else
    select coalesce(jsonb_agg(jsonb_build_object('columna', a.attname, 'tipo', format_type(a.atttypid, a.atttypmod), 'nota', col_description(c.oid, a.attnum)) order by a.attnum), '[]')
      into res from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where ns.nspname = 'public' and c.relname = p_tabla and has_column_privilege('agente_lector', c.oid, a.attnum, 'select');
  end if;
  return res;
end $$;
revoke all on function public.agente_esquema(text) from public, anon, authenticated;
grant execute on function public.agente_esquema(text) to service_role;

select public.agente_refrescar_permisos();

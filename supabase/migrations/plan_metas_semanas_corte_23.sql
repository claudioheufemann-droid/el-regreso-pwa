-- Semanas del plan de metas: lunes a domingo, partidas en el corte del período 24→23
-- (regla de Claudio, 2026-11-10).
--
-- Si el período termina el miércoles 23, la semana termina ese miércoles y la
-- siguiente parte el jueves 24: son "semanas cortas", con número propio, para
-- que nunca una semana mezcle dos meses. Aplica para siempre: un trigger parte
-- cualquier fila que cruce un lunes o un día 24, venga de donde venga el plan.
--
-- La meta de la semana partida NO se reparte parejo por días: el plan se armó
-- con una tasa diaria por período (p.ej. S3 19–25 oct = 5 días × tasa Oct +
-- 2 días × tasa Nov = $2.160.000 exacto), así que cada trozo lleva la tasa de
-- su período (sacada de las semanas enteras de ese período del mismo vendedor).
-- El total de la semana original se conserva exacto. meta_litros es columna
-- generada (cajas y barriles), se recalcula sola en cada trozo.
--
-- Respaldo previo: public.plan_metas_semanales_bkp_20261110.

-- Mes comercial (24→23) al que pertenece un día; se nombra por el mes en que termina.
create or replace function public.periodo_comercial(d date)
returns date language sql immutable as $$
  select case when extract(day from d) >= 24
              then (date_trunc('month', d) + interval '1 month')::date
              else date_trunc('month', d)::date end
$$;

-- Calendario de semanas comerciales para armar planes futuros:
-- corta en cada lunes y en cada día 24.
create or replace function public.semanas_comerciales(p_desde date, p_hasta date)
returns table (semana int, fecha_inicio date, fecha_fin date)
language sql immutable as $$
  with d as (
    select g::date as dia from generate_series(p_desde, p_hasta, interval '1 day') g
  ), m as (
    select dia,
           sum(case when dia = p_desde or extract(isodow from dia) = 1 or extract(day from dia) = 24
                    then 1 else 0 end) over (order by dia) as grp
    from d
  )
  select grp::int, min(dia), max(dia) from m group by grp order by grp
$$;

alter table public.plan_metas_semanales drop constraint if exists plan_metas_semanales_semana_check;
alter table public.plan_metas_semanales add constraint plan_metas_semanales_semana_check check (semana >= 1);

create or replace function public.plan_metas_partir_semanas(p_temporada text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  c date;
  da int; db int;
  ra numeric; rb numeric; w numeric;
  partidas int := 0;
  a_neto numeric; a_cn int; a_ck int; a_cc int; a_b int;
begin
  -- Marca para que el trigger no vuelva a entrar con los insert/update de acá.
  perform set_config('plan_metas.partiendo', '1', true);
  loop
    select m.*,
           (select min(x::date) from generate_series(m.fecha_inicio + 1, m.fecha_fin, interval '1 day') x
             where extract(isodow from x) = 1 or extract(day from x) = 24) as corte
      into r
      from plan_metas_semanales m
     where (p_temporada is null or m.temporada = p_temporada)
       and exists (select 1 from generate_series(m.fecha_inicio + 1, m.fecha_fin, interval '1 day') x
                    where extract(isodow from x) = 1 or extract(day from x) = 24)
     order by m.temporada, m.fecha_inicio, m.id
     limit 1;
    exit when not found;

    c  := r.corte;
    da := c - r.fecha_inicio;
    db := r.fecha_fin - c + 1;

    -- Tasa diaria de cada período = semanas enteras de ese período (mismo vendedor).
    select avg(s.meta_neto / (s.fecha_fin - s.fecha_inicio + 1)) into ra
      from plan_metas_semanales s
     where s.temporada = r.temporada and s.user_id = r.user_id and s.id <> r.id
       and periodo_comercial(s.fecha_inicio) = periodo_comercial(s.fecha_fin)
       and periodo_comercial(s.fecha_inicio) = periodo_comercial(r.fecha_inicio);
    select avg(s.meta_neto / (s.fecha_fin - s.fecha_inicio + 1)) into rb
      from plan_metas_semanales s
     where s.temporada = r.temporada and s.user_id = r.user_id and s.id <> r.id
       and periodo_comercial(s.fecha_inicio) = periodo_comercial(s.fecha_fin)
       and periodo_comercial(s.fecha_inicio) = periodo_comercial(c);

    if coalesce(ra, 0) > 0 and coalesce(rb, 0) > 0 then
      w := (da * ra) / (da * ra + db * rb);
    else
      w := da::numeric / (da + db);
    end if;

    a_neto   := round(r.meta_neto * w);
    a_cn     := round(r.meta_clientes_nuevos * w);
    a_ck     := round(r.meta_cajas_kombucha * w);
    a_cc     := round(r.meta_cajas_cerveza * w);
    a_b      := round(r.meta_barriles * w);

    -- Trozo B (desde el corte): número provisorio, se renumera al final.
    insert into plan_metas_semanales
      (temporada, territorio, user_id, semana, fecha_inicio, fecha_fin,
       meta_neto, meta_clientes_nuevos, meta_cajas_kombucha, meta_cajas_cerveza, meta_barriles)
    values
      (r.temporada, r.territorio, r.user_id, 100000 + partidas, c, r.fecha_fin,
       r.meta_neto - a_neto, r.meta_clientes_nuevos - a_cn,
       r.meta_cajas_kombucha - a_ck, r.meta_cajas_cerveza - a_cc, r.meta_barriles - a_b);

    -- Trozo A (hasta el día antes del corte).
    update plan_metas_semanales
       set fecha_fin = c - 1,
           meta_neto = a_neto, meta_clientes_nuevos = a_cn,
           meta_cajas_kombucha = a_ck, meta_cajas_cerveza = a_cc, meta_barriles = a_b,
           updated_at = now()
     where id = r.id;

    partidas := partidas + 1;
  end loop;

  -- Renumerar por fecha (mismo número para todos los vendedores). En dos pasos
  -- por la restricción única (temporada, user_id, semana).
  if exists (
    select 1 from (
      select semana, dense_rank() over (partition by temporada order by fecha_inicio)::int as n
        from plan_metas_semanales where p_temporada is null or temporada = p_temporada
    ) x where x.semana <> x.n
  ) then
    update plan_metas_semanales set semana = semana + 1000000
     where p_temporada is null or temporada = p_temporada;
    update plan_metas_semanales m set semana = x.n
      from (select id, dense_rank() over (partition by temporada order by fecha_inicio)::int as n
              from plan_metas_semanales where p_temporada is null or temporada = p_temporada) x
     where x.id = m.id;
  end if;

  perform set_config('plan_metas.partiendo', '', true);
  return partidas;
end;
$$;

revoke all on function public.plan_metas_partir_semanas(text) from public, anon, authenticated;

create or replace function public.plan_metas_partir_semanas_trg()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('plan_metas.partiendo', true), '') = '1' then return null; end if;
  perform plan_metas_partir_semanas(null);
  return null;
end;
$$;

drop trigger if exists plan_metas_semanas_corte on public.plan_metas_semanales;
create trigger plan_metas_semanas_corte
  after insert or update of fecha_inicio, fecha_fin on public.plan_metas_semanales
  for each statement execute function public.plan_metas_partir_semanas_trg();

-- Aplicar a lo ya cargado.
select public.plan_metas_partir_semanas(null);

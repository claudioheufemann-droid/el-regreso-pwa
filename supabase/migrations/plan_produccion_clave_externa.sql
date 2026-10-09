-- Gantt de Google Sheets → plan_produccion (9-oct-2026): cada lote que viene
-- del Sheets se identifica por sheets:<tanque>:<inicio> para poder
-- actualizarlo o borrarlo en la siguiente sincronización sin duplicar.
alter table public.plan_produccion add column if not exists clave_externa text;
create unique index if not exists plan_produccion_clave_externa_uq
  on public.plan_produccion (clave_externa) where clave_externa is not null;
comment on column public.plan_produccion.clave_externa is 'Origen externo del lote (sheets:<tanque>:<inicio>). NULL = creado en la app.';

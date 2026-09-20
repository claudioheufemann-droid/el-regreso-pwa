-- El nivel `general` es una sola serie y no tiene clave — en forecast_produccion
-- se guarda con clave null, y la calibración tiene que poder espejar eso.
--
-- NULLS NOT DISTINCT en el índice único: por defecto Postgres considera que dos
-- NULL son distintos entre sí, o sea que sin esto la fila de `general` se podría
-- insertar repetida en cada corrida en vez de actualizarse.
alter table public.calibracion_sigma
  alter column clave drop not null;

alter table public.calibracion_sigma
  drop constraint if exists calibracion_sigma_nivel_clave_key;

create unique index if not exists calibracion_sigma_nivel_clave_uq
  on public.calibracion_sigma (nivel, clave) nulls not distinct;

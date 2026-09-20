-- Deja registrado con qué factor se corrigió la banda de Prophet en la corrida
-- que generó esta fila. Sin esto no hay forma de saber, mirando un colchón,
-- si salió de la banda cruda (k=1, subestimada ~2x) o de la calibrada.
-- Default 1 = comportamiento anterior, para las filas ya cargadas.
alter table public.stock_seguridad
  add column if not exists k_sigma numeric not null default 1;

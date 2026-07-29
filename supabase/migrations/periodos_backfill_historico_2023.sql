-- Backfill de periodos de venta 24->23 desde Enero 2023 (cuando arranca el
-- dato de fecha_pedido en `ventas`) hasta justo antes de Mayo 2026 (el
-- periodo mas antiguo que ya existia). Pedido de Claudio, 29-jul-2026: ver
-- todo el respaldo historico disponible en el selector de periodo.
insert into periodos (nombre, fecha_inicio, fecha_fin, activo)
select
  (array['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'])[extract(month from (d + interval '1 month'))::int]
    || ' ' || extract(year from (d + interval '1 month'))::int as nombre,
  d::date as fecha_inicio,
  (d + interval '1 month' - interval '1 day')::date as fecha_fin,
  false as activo
from generate_series('2022-12-24'::date, '2026-03-24'::date, interval '1 month') as d
order by d;

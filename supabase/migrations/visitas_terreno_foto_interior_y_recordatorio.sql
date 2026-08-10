-- Rediseño del flujo de fotos en terreno (pedido de Claudio 2026-08-07):
-- las 4 fotos (frontis, interior, exhibición, competencia) dejan de ser
-- obligatorias DURANTE la visita — se piden recién al cerrar, son
-- opcionales ahí también, y si quedan pendientes el vendedor puede
-- completarlas después desde el Historial. Un cron por hora le recuerda
-- hasta que las suba.
--
-- `foto_interior` es la única columna nueva de las 4 fotos — exterior,
-- exhibición y competencia ya existían. `recordatorio_fotos_last_at`
-- evita que el cron mande más de un push por hora por visita, sin
-- depender de que el cron corra exactamente en punto.
alter table public.visitas_terreno
  add column if not exists foto_interior text,
  add column if not exists recordatorio_fotos_last_at timestamptz;

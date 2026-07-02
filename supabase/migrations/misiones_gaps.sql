-- =============================================================================
-- MISIONES — Esquema para los 3 gaps avanzados
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
-- Seguro de re-ejecutar (idempotente).
-- =============================================================================

-- ── Relajar el CHECK de estado (admite posponer + auto-completado) ───────────
-- Elimina cualquier CHECK previo sobre la tabla y recrea uno permisivo.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'misiones'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE misiones DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE misiones ADD CONSTRAINT misiones_estado_check
  CHECK (estado IN (
    'pendiente',
    'contactado_pedido',
    'contactado_sin_pedido',
    'sin_respuesta',
    'pospuesto',         -- GAP 1
    'auto_completado'    -- GAP 2
  ));

-- ── GAP 1: Posponer + snooze ─────────────────────────────────────────────────
ALTER TABLE misiones ADD COLUMN IF NOT EXISTS snooze_until      date;
ALTER TABLE misiones ADD COLUMN IF NOT EXISTS intentos_contacto int DEFAULT 0;

-- ── GAP 2: Misiones dinámicas (auto-completar por compra) ───────────────────
ALTER TABLE misiones ADD COLUMN IF NOT EXISTS completado_canal  text;     -- 'vendedor' | 'auto'
ALTER TABLE misiones ADD COLUMN IF NOT EXISTS resultado_litros  numeric;  -- litros declarados o de la venta

-- ── GAP 3: Priorización por volumen ──────────────────────────────────────────
ALTER TABLE misiones ADD COLUMN IF NOT EXISTS volumen_promedio    numeric; -- litros prom. por pedido del cliente
ALTER TABLE misiones ADD COLUMN IF NOT EXISTS litros_ultima_compra numeric;
ALTER TABLE misiones ADD COLUMN IF NOT EXISTS prioridad_calculada numeric; -- score combinado urgencia+volumen+valor

CREATE INDEX IF NOT EXISTS idx_misiones_snooze     ON misiones (snooze_until);
CREATE INDEX IF NOT EXISTS idx_misiones_prioridad  ON misiones (prioridad_calculada DESC);

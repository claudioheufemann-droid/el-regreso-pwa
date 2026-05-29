-- ──────────────────────────────────────────────────────────────────────────────
-- MISIONES SEMANALES: tabla para registrar contactos realizados
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contactos_realizados (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor        text        NOT NULL,
  nombre_fantasia text        NOT NULL,
  semana          date        NOT NULL,   -- Lunes de la semana correspondiente
  completado_at   timestamptz DEFAULT now(),
  nota            text,
  UNIQUE (vendedor, nombre_fantasia, semana)
);

CREATE INDEX IF NOT EXISTS idx_contactos_semana   ON contactos_realizados (semana);
CREATE INDEX IF NOT EXISTS idx_contactos_vendedor ON contactos_realizados (vendedor);

ALTER TABLE contactos_realizados ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer y escribir sus propios registros
CREATE POLICY "authenticated_all" ON contactos_realizados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

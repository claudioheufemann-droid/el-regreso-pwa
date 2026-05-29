-- =============================================================================
-- TABLA MISIONES: asignación explícita de contactos por vendedor/semana
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS misiones (
  id                       uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor                 text        NOT NULL,
  nombre_fantasia          text        NOT NULL,
  semana                   date        NOT NULL,        -- Lunes de la semana
  alert_level              text        NOT NULL,        -- critico | vencido | proximo
  score                    int,
  segmento                 text,
  dias_sin_compra          int,
  ciclo_promedio_dias      int,
  siguiente_compra_estimada date,
  estado                   text        NOT NULL DEFAULT 'pendiente'
                           CHECK (estado IN ('pendiente','completada')),
  completado_at            timestamptz,
  nota                     text,
  created_at               timestamptz DEFAULT now(),
  UNIQUE (vendedor, nombre_fantasia, semana)
);

CREATE INDEX IF NOT EXISTS idx_misiones_semana   ON misiones (semana);
CREATE INDEX IF NOT EXISTS idx_misiones_vendedor ON misiones (vendedor);
CREATE INDEX IF NOT EXISTS idx_misiones_estado   ON misiones (estado);

ALTER TABLE misiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all" ON misiones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT ALL ON misiones TO authenticated;

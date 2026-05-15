-- ============================================================
-- VENTAS TRACKER - El Regreso Beer
-- Schema para Supabase
-- Períodos: del 24 de cada mes al 23 del siguiente
-- ============================================================

-- Tabla principal de ventas
CREATE TABLE IF NOT EXISTS ventas (
  id BIGSERIAL PRIMARY KEY,
  fecha_entrega DATE NOT NULL,
  fecha_entrega TIMESTAMPTZ,
  vendedor_actual TEXT NOT NULL,
  nombre_fantasia TEXT,
  categoria_producto TEXT,       -- Cerveza, Kombucha, Merch, S/C
  categoria_negocio TEXT,        -- Bar, Minimarket, Cafetería, etc.
  producto TEXT,
  envase TEXT,
  litros DECIMAL(10, 3) DEFAULT 0,
  total_sin_impuesto DECIMAL(15, 2) DEFAULT 0,
  pedido TEXT,
  tipo_venta TEXT,
  localidad TEXT,
  provincia TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas (fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor ON ventas (vendedor_actual);
CREATE INDEX IF NOT EXISTS idx_ventas_categoria ON ventas (categoria_negocio);

-- Períodos de seguimiento (24→23)
CREATE TABLE IF NOT EXISTS periodos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,          -- e.g. "Abril 24 – Mayo 23 2026"
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  activo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Solo un período activo a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_periodos_activo ON periodos (activo) WHERE activo = TRUE;

-- Metas por vendedor y categoría
CREATE TABLE IF NOT EXISTS metas (
  id BIGSERIAL PRIMARY KEY,
  periodo_id BIGINT REFERENCES periodos(id) ON DELETE CASCADE,
  vendedor TEXT NOT NULL,        -- 'Javier Badilla' | 'Charly Urrejola'
  tipo TEXT NOT NULL CHECK (tipo IN ('mensual', 'semanal')),
  semana_numero INT,             -- 1-5, solo para metas semanales
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  categoria_negocio TEXT NOT NULL, -- 'Total' | 'Bar' | 'Minimarket' | etc.
  meta_litros DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metas_periodo ON metas (periodo_id);
CREATE INDEX IF NOT EXISTS idx_metas_vendedor ON metas (vendedor);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER metas_updated_at
  BEFORE UPDATE ON metas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer
CREATE POLICY "ventas_read" ON ventas FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "periodos_read" ON periodos FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "metas_read" ON metas FOR SELECT TO authenticated USING (TRUE);

-- Solo admins pueden escribir (benja y claudio)
-- Los admins se identifican por metadata en auth.users
CREATE POLICY "ventas_write_admin" ON ventas FOR ALL TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE POLICY "periodos_write_admin" ON periodos FOR ALL TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

CREATE POLICY "metas_write_admin" ON metas FOR ALL TO authenticated
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Período activo actual (24 Abr → 23 May 2026)
INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, activo)
VALUES ('Abril 24 – Mayo 23 2026', '2026-04-24', '2026-05-23', TRUE)
ON CONFLICT DO NOTHING;

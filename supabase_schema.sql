-- ============================================================
-- VENTAS TRACKER - El Regreso Beer
-- Proyecto Supabase: El Regreso Tracker Sales
-- ============================================================

CREATE TABLE IF NOT EXISTS ventas (
  id BIGSERIAL PRIMARY KEY,
  fecha_pedido DATE NOT NULL,
  vendedor_actual TEXT NOT NULL,
  nombre_fantasia TEXT,
  categoria_producto TEXT,
  categoria_negocio TEXT,
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

CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas (fecha_pedido);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor ON ventas (vendedor_actual);
CREATE INDEX IF NOT EXISTS idx_ventas_categoria ON ventas (categoria_negocio);

CREATE TABLE IF NOT EXISTS periodos (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  activo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_periodos_activo ON periodos (activo) WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS metas (
  id BIGSERIAL PRIMARY KEY,
  periodo_id BIGINT REFERENCES periodos(id) ON DELETE CASCADE,
  vendedor TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('mensual', 'semanal')),
  semana_numero INT,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  categoria_negocio TEXT NOT NULL,
  meta_litros DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metas_periodo ON metas (periodo_id);
CREATE INDEX IF NOT EXISTS idx_metas_vendedor ON metas (vendedor);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER metas_updated_at
  BEFORE UPDATE ON metas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS abierto (app sin login)
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ventas_all" ON ventas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "periodos_all" ON periodos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "metas_all" ON metas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Período inicial
INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, activo)
VALUES ('Abril 24 – Mayo 23 2026', '2026-04-24', '2026-05-23', TRUE);

-- ═══════════════════════════════════════════════════════════════
-- Módulo Venta en Terreno — Tablas Supabase
-- ═══════════════════════════════════════════════════════════════

-- 1. Clientes registrados en terreno (nuevos)
CREATE TABLE IF NOT EXISTS clientes_terreno (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_fantasia text        NOT NULL,
  razon_social    text,
  rut             text,
  direccion       text,
  contacto        text,
  telefono        text,
  canal           text,
  lat             decimal(10,7),
  lng             decimal(10,7),
  creado_por      uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Visitas en terreno
CREATE TABLE IF NOT EXISTS visitas_terreno (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- cliente puede ser de la tabla de ventas (nombre_fantasia) o de clientes_terreno
  cliente_nombre      text        NOT NULL,
  cliente_terreno_id  uuid        REFERENCES clientes_terreno(id) ON DELETE SET NULL,
  es_cliente_nuevo    boolean     NOT NULL DEFAULT false,
  -- GPS
  lat                 decimal(10,7),
  lng                 decimal(10,7),
  direccion_gps       text,
  -- Fotos (URLs en Supabase Storage)
  foto_exterior       text,
  foto_exhibicion     text,
  foto_competencia    text,
  -- Resultado
  tiene_venta         boolean,
  motivo_sin_venta    text,
  observaciones       text,
  total_pedido        numeric(12,2) DEFAULT 0,
  -- Estado: en_progreso | completada | cancelada
  estado              text        NOT NULL DEFAULT 'en_progreso',
  iniciada_at         timestamptz NOT NULL DEFAULT now(),
  completada_at       timestamptz
);

-- 3. Items del pedido de terreno
CREATE TABLE IF NOT EXISTS visitas_terreno_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  visita_id   uuid        NOT NULL REFERENCES visitas_terreno(id) ON DELETE CASCADE,
  producto    text        NOT NULL,
  categoria   text,       -- 'Cerveza' | 'Kombucha'
  envase      text,
  cantidad    integer     NOT NULL DEFAULT 1,
  precio_unit numeric(10,2),
  subtotal    numeric(12,2)
);

-- ── Índices ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_visitas_vendedor  ON visitas_terreno(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_visitas_fecha     ON visitas_terreno(iniciada_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_estado    ON visitas_terreno(estado);
CREATE INDEX IF NOT EXISTS idx_items_visita      ON visitas_terreno_items(visita_id);

-- ── Row Level Security ─────────────────────────────────────────
ALTER TABLE clientes_terreno      ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas_terreno       ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas_terreno_items ENABLE ROW LEVEL SECURITY;

-- clientes_terreno: todos los autenticados pueden leer, solo el creador escribe
CREATE POLICY "clientes_terreno_select" ON clientes_terreno
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "clientes_terreno_insert" ON clientes_terreno
  FOR INSERT TO authenticated WITH CHECK (creado_por = auth.uid());

-- visitas_terreno: vendedor ve las suyas, admin ve todas
CREATE POLICY "visitas_select_own" ON visitas_terreno
  FOR SELECT TO authenticated USING (
    vendedor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
    )
  );

CREATE POLICY "visitas_insert_own" ON visitas_terreno
  FOR INSERT TO authenticated WITH CHECK (vendedor_id = auth.uid());

CREATE POLICY "visitas_update_own" ON visitas_terreno
  FOR UPDATE TO authenticated USING (vendedor_id = auth.uid());

-- items: heredan acceso de su visita
CREATE POLICY "items_select" ON visitas_terreno_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM visitas_terreno v
      WHERE v.id = visita_id
        AND (v.vendedor_id = auth.uid()
          OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true))
    )
  );

CREATE POLICY "items_insert" ON visitas_terreno_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM visitas_terreno v
      WHERE v.id = visita_id AND v.vendedor_id = auth.uid()
    )
  );

CREATE POLICY "items_delete" ON visitas_terreno_items
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM visitas_terreno v
      WHERE v.id = visita_id AND v.vendedor_id = auth.uid()
    )
  );

-- ── Storage bucket para fotos ──────────────────────────────────
-- Ejecutar manualmente en Supabase Dashboard > Storage:
-- Crear bucket: "terreno-fotos" (privado)
-- O via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('terreno-fotos', 'terreno-fotos', false);

-- Stock de productos en Camara General Barrios Bajos (Frio) — barriles y
-- envases. Se carga manual desde un Excel del sistema de bodega (informe
-- jerarquico multi-seccion, no una tabla plana; el parseo vive en
-- lib/stockParser.ts, no aca).
--
-- Es una FOTO del momento, no historico acumulativo: cada carga reemplaza
-- por completo la anterior (mismo patron que otras cargas de la app).
CREATE TABLE stock_productos (
  id                  bigserial PRIMARY KEY,
  fecha_informe       date NOT NULL,
  tipo                text NOT NULL CHECK (tipo IN ('barril','envase')),
  producto             text NOT NULL,
  codigo_producto      text,
  categoria            text,          -- 'Cerveza' | 'Kombucha' | 'Otros'
  cantidad             integer NOT NULL,  -- Nº de barriles, o unidades de envase
  litros               numeric,           -- solo tipo='barril' (cantidad * tamaño)
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_productos_tipo ON stock_productos (tipo);
CREATE INDEX idx_stock_productos_fecha ON stock_productos (fecha_informe DESC);

ALTER TABLE stock_productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_select_todos ON stock_productos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY stock_write_admin ON stock_productos
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin))
  WITH CHECK(EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin));

-- =============================================================================
-- COLD LEADS — posibles clientes + potencial de venta estimado
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
-- Seguro de re-ejecutar.
-- =============================================================================

-- 1. Tabla de leads
CREATE TABLE IF NOT EXISTS cold_leads (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre            text NOT NULL,
  region            text,
  ciudad            text,
  tipo_buscado      text,
  producto_sugerido text,
  categoria         text,              -- categoría original (Google)
  categoria_mapeada text,              -- nuestra categoria_negocio más cercana
  direccion         text,
  telefono          text,
  sitio_web         text,
  rating            numeric,
  lat               double precision,
  lng               double precision,
  litros_potencial  numeric,           -- litros/mes estimados
  score_lead        numeric,           -- 0-100 prioridad
  en_zona           boolean DEFAULT false,   -- ¿ciudad donde ya despachamos?
  estado            text DEFAULT 'nuevo'
                    CHECK (estado IN ('nuevo','contactado','convertido','descartado')),
  vendedor_asignado text,
  nota              text,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (nombre, ciudad)
);

CREATE INDEX IF NOT EXISTS idx_cold_leads_zona  ON cold_leads (en_zona, score_lead DESC);
CREATE INDEX IF NOT EXISTS idx_cold_leads_estado ON cold_leads (estado);

ALTER TABLE cold_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_leads" ON cold_leads;
CREATE POLICY "auth_all_leads" ON cold_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON cold_leads TO authenticated;
GRANT SELECT ON cold_leads TO anon;


-- 2. Potencial por categoría: litros/mes promedio y mediana de clientes con historial
CREATE OR REPLACE FUNCTION get_categoria_potencial()
RETURNS TABLE (
  categoria          text,
  litros_mes_prom    numeric,
  litros_mes_mediana numeric,
  n_clientes         bigint
)
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  WITH cli_cat AS (
    SELECT v.nombre_fantasia,
           COALESCE(NULLIF(MODE() WITHIN GROUP (ORDER BY v.categoria_negocio), '-'), 'Otros') AS categoria
    FROM ventas v
    WHERE v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia)
    GROUP BY v.nombre_fantasia
  ),
  cli_lpm AS (
    SELECT crm.nombre_fantasia,
           crm.litros_totales / GREATEST(crm.meses_activo, 1) AS lpm
    FROM client_raw_metrics crm
    WHERE crm.litros_totales > 0
  )
  SELECT c.categoria,
         ROUND(AVG(l.lpm), 1),
         ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.lpm)::numeric, 1),
         COUNT(*)
  FROM cli_lpm l
  JOIN cli_cat c ON c.nombre_fantasia = l.nombre_fantasia
  GROUP BY c.categoria
  HAVING COUNT(*) >= 2
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION get_categoria_potencial TO anon, authenticated;

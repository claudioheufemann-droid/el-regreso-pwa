-- =============================================================================
-- DEUDA COMERCIAL SIN MAQUILA — vista `deudores_comercial`
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
--
-- La maquila (co-packing a otras cervecerías: "Litros Maquila", "Latas
-- Finales") el ERP la factura al mismo cliente y entra en su deuda, pero no es
-- del área comercial (pedido de Claudio, 2026-11-03, a raíz de El Growler).
-- /ventas/deudores ya la descontaba en el servidor; el resto de las pantallas
-- comerciales (Terreno, ficha de cliente, mapa, Control Comercial, comisiones,
-- asistente) leían `deudores` crudo.
--
-- `deudores_maquila` guarda, por cliente, cuánto de su deuda es maquila. La
-- llena /api/deudores/upload después de cada carga del ERP
-- (lib/deudaComercial.ts → actualizarMaquilaDeudores), reconstruyendo las
-- facturas con lib/cobranza.ts — el ERP no dice qué documento es maquila.
--
-- `deudores_comercial` es `deudores` con esa plata descontada y sin los
-- clientes que son 100% maquila. Mismas columnas: basta cambiar el nombre de
-- la tabla en la consulta. Seguro de re-ejecutar.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.deudores_maquila (
  nombre_fantasia text PRIMARY KEY,
  -- Nunca compró cerveza ni kombucha: se saca entero de la vista.
  solo_maquila    boolean NOT NULL DEFAULT false,
  vencida         numeric NOT NULL DEFAULT 0,
  por_vencer      numeric NOT NULL DEFAULT 0,
  -- La vencida repartida en los tramos del ERP (diasMoraERP de cada documento).
  b14 numeric NOT NULL DEFAULT 0,
  b29 numeric NOT NULL DEFAULT 0,
  b44 numeric NOT NULL DEFAULT 0,
  b59 numeric NOT NULL DEFAULT 0,
  b89 numeric NOT NULL DEFAULT 0,
  b90 numeric NOT NULL DEFAULT 0,
  actualizado_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.deudores_maquila ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deudores_maquila_service ON public.deudores_maquila;
CREATE POLICY deudores_maquila_service ON public.deudores_maquila
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Lectura abierta: la vista hace INNER JOIN con `deudores`, cuya RLS por
-- región decide qué cliente ve cada vendedor.
DROP POLICY IF EXISTS deudores_maquila_read ON public.deudores_maquila;
CREATE POLICY deudores_maquila_read ON public.deudores_maquila
  FOR SELECT TO authenticated, agente_lector USING (true);

CREATE OR REPLACE VIEW public.deudores_comercial
WITH (security_invoker = true) AS
SELECT
  d.id, d.nombre_fantasia, d.razon_social, d.email, d.telefono, d.localidad,
  greatest(coalesce(d.saldo_total, 0) - coalesce(m.vencida, 0) - coalesce(m.por_vencer, 0), 0) AS saldo_total,
  greatest(coalesce(d.deuda_vencida, 0) - coalesce(m.vencida, 0), 0) AS deuda_vencida,
  d.barriles_adeudados, d.ultimo_pago, d.categoria_cliente, d.vendedor, d.tipo_cliente,
  d.fecha_ultima_compra, d.fecha_alta, d.limite_cta_cte,
  greatest(coalesce(d.deuda_menor_14_dias, 0)    - coalesce(m.b14, 0), 0) AS deuda_menor_14_dias,
  greatest(coalesce(d.deuda_entre_15_29_dias, 0) - coalesce(m.b29, 0), 0) AS deuda_entre_15_29_dias,
  greatest(coalesce(d.deuda_entre_30_44_dias, 0) - coalesce(m.b44, 0), 0) AS deuda_entre_30_44_dias,
  greatest(coalesce(d.deuda_entre_45_59_dias, 0) - coalesce(m.b59, 0), 0) AS deuda_entre_45_59_dias,
  greatest(coalesce(d.deuda_entre_60_89_dias, 0) - coalesce(m.b89, 0), 0) AS deuda_entre_60_89_dias,
  greatest(coalesce(d.deuda_mas_90_dias, 0)      - coalesce(m.b90, 0), 0) AS deuda_mas_90_dias,
  d.dias_pago, d.upload_batch_id, d.external_remito_mas_antiguo, d.external_fecha,
  d.created_at, d.updated_at,
  coalesce(m.vencida, 0) AS maquila_vencida
FROM public.deudores d
LEFT JOIN public.deudores_maquila m ON m.nombre_fantasia = d.nombre_fantasia
WHERE NOT coalesce(m.solo_maquila, false);

GRANT SELECT ON public.deudores_comercial TO authenticated, service_role, agente_lector;

-- Las funciones SQL comerciales pasan a leer la vista. Se reescriben a partir
-- de su propia definición (sólo cambia `deudores` → `deudores_comercial`;
-- `deudores_historial` y `clientes_deudores` no calzan con \mdeudores\M), así
-- no se duplica acá su lógica, que es de Control Comercial y Comisiones.
DO $$
DECLARE
  f text;
  def text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'comision_gerente_cartera', 'comision_gerente_por_cliente', 'comision_vendedor_cartera',
    'fn_cobranza_aging', 'fn_cobranza_kpis', 'fn_equipo_resumen'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f;
    IF def IS NULL THEN CONTINUE; END IF;
    EXECUTE regexp_replace(def, '\mdeudores\M(?!_comercial)', 'deudores_comercial', 'g');
  END LOOP;
END $$;

-- =============================================================================
-- DETECCIÓN AUTOMÁTICA DE CLIENTES DE TEMPORADA
-- Aplicar DESPUÉS de ciclo_estacional_v2.sql.
--
-- Por qué existe: marcar a mano cuáles de los 765 clientes son de temporada no
-- iba a pasar nunca. Esto los detecta desde sus propias compras; el marcado
-- manual en clientes_estado sigue teniendo prioridad cuando existe.
--
-- Por qué además acota `temporada_baja`: en la primera versión el flag era
-- "el mes proyectado alarga el ciclo >15%", que en agosto/septiembre es cierto
-- para CASI TODOS (487 de 765 clientes). Como get_pending_call_alerts excluye
-- los clientes en temporada baja, el vendedor se quedaba sin lista de llamados
-- justo en temporada baja. Ahora el flag aplica sólo a clientes de temporada:
-- para el resto, que agosto sea lento es normal y no apaga sus alertas.
-- =============================================================================

CREATE OR REPLACE VIEW clientes_estacionalidad_auto AS
WITH base AS (
  SELECT
    nombre_fantasia,
    SUM(litros)                                                                    AS litros_tot,
    SUM(litros) FILTER (WHERE EXTRACT(MONTH FROM fecha_pedido)::int IN (12,1,2,3)) AS litros_verano,
    COUNT(DISTINCT pedido)                                                         AS pedidos,
    (MAX(fecha_pedido) - MIN(fecha_pedido)) / 30.44                                AS meses
  FROM ventas
  WHERE nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(nombre_fantasia)
  GROUP BY 1
)
SELECT
  nombre_fantasia,
  ROUND((litros_verano / NULLIF(litros_tot, 0))::numeric, 3) AS share_verano,
  pedidos,
  ROUND(meses::numeric, 1)                                   AS meses_historial,
  -- dic-mar son 4/12 del año → 33% esperado sin estacionalidad. >55% = de
  -- verano; <15% = de invierno. Se exige historial real (>=8 pedidos, >=12
  -- meses) para no etiquetar clientes por puro ruido.
  -- Con estos umbrales: 29 de 173 clientes con historial suficiente (ago 2026).
  (pedidos >= 8 AND meses >= 12
   AND (litros_verano / NULLIF(litros_tot, 0) > 0.55
        OR litros_verano / NULLIF(litros_tot, 0) < 0.15))    AS es_estacional_auto
FROM base;

GRANT SELECT ON clientes_estacionalidad_auto TO anon, authenticated;

-- El resto del cambio (usar esta vista dentro de client_raw_metrics y acotar
-- temporada_baja a `es_estacional AND factor > 1.15`) está incorporado en la
-- definición final de client_raw_metrics, en calibracion_modelo.sql.

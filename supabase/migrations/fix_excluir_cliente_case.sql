-- =============================================================================
-- FIX: _excluir_cliente — case-insensitive + variante con 'v' minúscula
-- Causa raíz: el ERP exporta 'Cliente ventas (Javier)' (v minúscula)
--             causando que Javier mostrara 65.44 L de más en la app.
-- Ejecutar en: https://supabase.com/dashboard/project/tzqmqufcuvbwskjiaorn/sql
-- =============================================================================

CREATE OR REPLACE FUNCTION _excluir_cliente(nombre text) RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT LOWER(nombre) = ANY(ARRAY[
    -- Movimientos internos de vendedores
    lower('Cliente Ventas (Javier)'),
    lower('Cliente ventas (Javier)'),
    lower('Cliente Ventas (Charly)'),
    lower('Cliente ventas (Charly)'),
    lower('Cliente Ventas (Carlos)'),
    lower('Cliente ventas (Carlos)'),
    -- PDV y mermas
    lower('Cliente PDV'),
    lower('Cliente Merma PDV'),
    lower('Cliente Mermas Producto Terminado')
  ])
$$;

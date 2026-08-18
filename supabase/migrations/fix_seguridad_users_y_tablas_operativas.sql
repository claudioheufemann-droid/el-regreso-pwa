-- Auditoría de seguridad 27-jul-2026. Hallazgos y fixes:

-- 1) CRÍTICO: cualquier empleado con sesión podía auto-promoverse a admin.
--    users_write era ALL USING(authenticated) WITH CHECK(authenticated), sin
--    acotar a la propia fila ni proteger columnas de privilegio. Verificado
--    antes de aplicar: la app NO escribe `users` desde el navegador, solo
--    desde endpoints server-side con service key que ya validan isAdmin
--    (app/api/admin/usuarios, app/api/admin/crear-vendedor).
DROP POLICY IF EXISTS users_write ON users;

CREATE POLICY users_update_propio ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND is_admin       IS NOT DISTINCT FROM (SELECT u.is_admin       FROM users u WHERE u.id = auth.uid())
    AND region         IS NOT DISTINCT FROM (SELECT u.region         FROM users u WHERE u.id = auth.uid())
    AND vendedores_erp IS NOT DISTINCT FROM (SELECT u.vendedores_erp FROM users u WHERE u.id = auth.uid())
  );

-- 2) ALTO: despachos/entregas/lotes_produccion/alertas_inventario tenían
--    policy `auth` con USING(true) para rol `public` (incluye `anon`, sin
--    login). Con solo la anon key (viaja en el bundle JS) se podía leer y
--    BORRAR despachos, entregas, lotes de producción y alertas de inventario
--    sin sesión.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['despachos','despacho_paradas','entregas',
                           'lotes_produccion','lotes_produccion_items',
                           'lotes_recepcion_items','alertas_inventario']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth ON %I', t);
    EXECUTE format($f$
      CREATE POLICY %I_autenticados ON %I
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    $f$, t, t);
  END LOOP;
END $$;

-- 3) push_subscriptions: cualquier empleado podía leer/borrar la suscripción
--    push de otro (policy sin filtrar por user_id).
DROP POLICY IF EXISTS push_all ON push_subscriptions;
CREATE POLICY push_propias ON push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4) RLS deshabilitado + grants anon en tablas _backup_* (copias completas de
--    clientes/ventas de toda la empresa, legibles/borrables desde internet
--    sin login) y en regiones_provincias (lookup que usan las policies de
--    scope regional; cualquiera podía reescribirlo).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
           WHERE schemaname='public' AND tablename LIKE '\_backup\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

ALTER TABLE regiones_provincias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regiones_lectura ON regiones_provincias;
CREATE POLICY regiones_lectura ON regiones_provincias
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS regiones_escritura_admin ON regiones_provincias;
CREATE POLICY regiones_escritura_admin ON regiones_provincias
  FOR ALL TO authenticated
  USING     (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin))
  WITH CHECK(EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_admin));

REVOKE ALL ON regiones_provincias FROM anon;

-- Pendiente para una pasada posterior (no aplicado en esta migración, requiere
-- más pruebas por su alcance): clientes_select_todos / ventas_select_todos
-- son SELECT USING(true) para `public` — filtración cross-región en lectura,
-- y endpoints deudores/list, deudores/upload, clientes/upload, clientes/rutas
-- usan SUPABASE_SERVICE_KEY sin verificar sesión/admin.

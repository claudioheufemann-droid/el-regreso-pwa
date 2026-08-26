-- ═══════════════════════════════════════════════════════════════════════════
-- Entregas: escribir solo si vas en ese viaje  (2026-08-26)
--
-- ⚠️ NO APLICADA TODAVÍA — requiere el visto bueno de Claudio antes de correr
--    contra producción, porque endurece permisos de una tabla operativa en uso.
--
-- Contexto
-- --------
-- `fix_seguridad_users_y_tablas_operativas.sql` sacó a `anon` de estas tablas
-- (bien), pero dejó a TODO usuario autenticado con `FOR ALL USING(true)` sobre
-- `entregas` y `despacho_paradas`. Es el mismo agujero que ya se cerró para
-- `viajes_flota` en `viajes_flota_rls_solo_conductor_modifica.sql`, con el
-- mismo razonamiento: la UI de ViajeDetailClient oculta los controles a quien
-- no es el conductor, pero eso es cosmético — con la anon key (que viaja en el
-- bundle JS) cualquier empleado con sesión podía marcar entregada la parada de
-- otro camión, o reescribir una prueba de entrega ya registrada.
--
-- Una entrega no es un dato cualquiera: dispara stock, facturación y cobranza,
-- y su foto/guía es la evidencia ante el cliente.
--
-- Qué hace
-- --------
-- Lectura sigue abierta a cualquier autenticado (todos pueden VER el estado del
-- reparto — eso es lo que pidió logística). Escribir requiere ser una de estas
-- personas: el conductor del viaje, el chofer del despacho, quien armó el
-- despacho, o un admin.
--
-- El mismo criterio quedó además en la API
-- (app/api/logistica/paradas/[id]/entregar/route.ts), para que el 403 llegue
-- con un mensaje entendible y no como un error crudo de Postgres.
-- ═══════════════════════════════════════════════════════════════════════════

-- Quién puede tocar el reparto al que pertenece una parada.
CREATE OR REPLACE FUNCTION public.puede_operar_parada(p_parada_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.despacho_paradas dp
    JOIN public.despachos d ON d.id = dp.despacho_id
    LEFT JOIN public.viajes_flota v ON v.id = d.viaje_flota_id
    WHERE dp.id = p_parada_id
      AND (
        v.conductor_id = auth.uid()
        OR d.chofer_id   = auth.uid()
        OR d.creado_por  = auth.uid()
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin
  );
$$;

-- ── entregas ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS entregas_autenticados ON public.entregas;

CREATE POLICY entregas_select_autenticados ON public.entregas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY entregas_insert_de_su_viaje ON public.entregas
  FOR INSERT TO authenticated
  WITH CHECK (public.puede_operar_parada(parada_id));

CREATE POLICY entregas_update_de_su_viaje ON public.entregas
  FOR UPDATE TO authenticated
  USING (public.puede_operar_parada(parada_id))
  WITH CHECK (public.puede_operar_parada(parada_id));

-- Borrar una prueba de entrega es siempre una corrección: solo admin.
CREATE POLICY entregas_delete_admin ON public.entregas
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin));

-- ── despacho_paradas ───────────────────────────────────────────────────────
-- Insertar queda abierto: armar el despacho crea las paradas antes de que
-- exista viaje/conductor, así que exigir la regla acá rompería ese flujo.
DROP POLICY IF EXISTS despacho_paradas_autenticados ON public.despacho_paradas;

CREATE POLICY despacho_paradas_select_autenticados ON public.despacho_paradas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY despacho_paradas_insert_autenticados ON public.despacho_paradas
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY despacho_paradas_update_de_su_viaje ON public.despacho_paradas
  FOR UPDATE TO authenticated
  USING (public.puede_operar_parada(id))
  WITH CHECK (public.puede_operar_parada(id));

CREATE POLICY despacho_paradas_delete_de_su_viaje ON public.despacho_paradas
  FOR DELETE TO authenticated
  USING (public.puede_operar_parada(id));

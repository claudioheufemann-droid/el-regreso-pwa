-- Corrección a pedido explícito de Claudio: la excepción para admin que
-- yo había agregado (para "poder corregir errores") no era lo pedido —
-- la regla es SOLO el conductor del viaje, sin excepción, ni siquiera
-- para admin. Se reemplazan las policies de UPDATE/DELETE quitando el
-- OR de is_admin.
DROP POLICY IF EXISTS "update_conductor_o_admin" ON public.viajes_flota;
DROP POLICY IF EXISTS "delete_conductor_o_admin" ON public.viajes_flota;

CREATE POLICY "update_solo_conductor" ON public.viajes_flota
  FOR UPDATE TO authenticated
  USING (conductor_id = auth.uid())
  WITH CHECK (conductor_id = auth.uid());

CREATE POLICY "delete_solo_conductor" ON public.viajes_flota
  FOR DELETE TO authenticated
  USING (conductor_id = auth.uid());

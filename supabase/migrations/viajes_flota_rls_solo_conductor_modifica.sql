-- Pedido de Claudio: en el detalle de un viaje (paradas, marcar entregas,
-- cerrar reparto), solo el conductor asignado puede modificar -el resto
-- puede entrar a ver, pero no tocar datos de una entrega que no hizo.
-- La UI (ViajeDetailClient.tsx) ya oculta los controles para quien no es
-- el conductor, pero eso solo es cosmetico: la policy "auth" anterior
-- daba ALL (select/insert/update/delete) a cualquier usuario autenticado
-- sin ninguna restriccion, asi que cualquiera podia igual actualizar el
-- viaje de otro llamando a la API de Supabase directo. Se reemplaza esa
-- policy unica por una por comando: lectura e insercion siguen abiertas
-- (todos pueden ver, y crear viajes -check-in, despachos-), pero
-- actualizar/borrar solo lo puede hacer el conductor_id del viaje o un
-- admin (para poder corregir errores).
DROP POLICY IF EXISTS "auth" ON public.viajes_flota;

CREATE POLICY "select_authenticated" ON public.viajes_flota
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "insert_authenticated" ON public.viajes_flota
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "update_conductor_o_admin" ON public.viajes_flota
  FOR UPDATE TO authenticated
  USING (
    conductor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  )
  WITH CHECK (
    conductor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  );

CREATE POLICY "delete_conductor_o_admin" ON public.viajes_flota
  FOR DELETE TO authenticated
  USING (
    conductor_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin)
  );

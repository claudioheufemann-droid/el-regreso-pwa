-- Pedido del usuario: "todos los usuarios puedan ver las ventas del modulo de
-- venta ya que ahora solo lo pueden algunos usuarios". Causa real: las
-- politicas RLS ventas_region / clientes_region (cmd=ALL) solo dejaban ver
-- filas a admins o a usuarios con `region` asignada (join contra
-- regiones_provincias). Un usuario sin region (ej. produccion, logistica,
-- gestion) veia el modulo Ventas "abierto" en la UI pero con listas vacias,
-- porque RLS filtraba todo silenciosamente.
--
-- Se separa LECTURA de ESCRITURA: cualquier usuario autenticado puede ver
-- ventas/clientes (la pestaña Ventas ya estaba destapada para todos a nivel
-- de layout/navegacion, esto solo empareja los datos). Escritura sigue
-- restringida a admin o a la region del usuario, igual que antes — no se
-- amplia quien puede insertar/editar/borrar.

DROP POLICY IF EXISTS ventas_region ON ventas;
CREATE POLICY ventas_select_todos ON ventas
  FOR SELECT USING (true);
CREATE POLICY ventas_write_admin_o_region ON ventas
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
    OR provincia IN (
      SELECT unnest(rp.provincias) FROM users u
      JOIN regiones_provincias rp ON rp.region = u.region
      WHERE u.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
    OR provincia IN (
      SELECT unnest(rp.provincias) FROM users u
      JOIN regiones_provincias rp ON rp.region = u.region
      WHERE u.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS clientes_region ON clientes;
CREATE POLICY clientes_select_todos ON clientes
  FOR SELECT USING (true);
CREATE POLICY clientes_write_admin_o_region ON clientes
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
    OR provincia IN (
      SELECT unnest(rp.provincias) FROM users u
      JOIN regiones_provincias rp ON rp.region = u.region
      WHERE u.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.is_admin = true)
    OR provincia IN (
      SELECT unnest(rp.provincias) FROM users u
      JOIN regiones_provincias rp ON rp.region = u.region
      WHERE u.id = auth.uid()
    )
  );

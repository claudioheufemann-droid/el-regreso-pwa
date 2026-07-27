-- Causa raiz de los bugs de misiones: no habia forma confiable de saber que
-- vendedor del ERP corresponde a cada usuario que inicia sesion. El codigo
-- comparaba users.nombre con misiones.vendedor/ventas.vendedor_actual y casi
-- nunca calzaban:
--   ERP 'Claudio Heufemann' vs login 'Claudio H.'
--   ERP 'Marcelo Diaz'      vs login 'Marcelo D.'
--   ERP 'Yadro Fabijancic'  vs login 'Yadro Favijancic'  (typo b/v)
-- Resultado: la reconciliacion ("ya compro -> completar mision") nunca
-- encontraba nada, ningun vendedor podia marcar sus propias misiones como
-- contactadas (siempre 403), y el calendario de pedidos les salia vacio.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS vendedores_erp text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN users.vendedores_erp IS
  'Nombres de ventas.vendedor_actual / misiones.vendedor que corresponden a este usuario. Vacio = no es vendedor de terreno (no se le asignan misiones propias).';

CREATE INDEX IF NOT EXISTS idx_users_vendedores_erp ON users USING GIN (vendedores_erp);

UPDATE users SET vendedores_erp = ARRAY['Claudio Heufemann']            WHERE email='claudio.heufemann@elregresobeer.com';
UPDATE users SET vendedores_erp = ARRAY['Marcelo Diaz']                 WHERE email='marcelo.diaz@elregresobeer.com';
UPDATE users SET vendedores_erp = ARRAY['Yadro Fabijancic','Yadro Favijancic'] WHERE email='yadro.favijancic@elregresobeer.com';
UPDATE users SET vendedores_erp = ARRAY['Mariel Lillo']                 WHERE email='mariel.lillo@elregresobeer.com';
UPDATE users SET vendedores_erp = ARRAY['Douglas Koenig']               WHERE email='douglas@elregresobeer.com';
UPDATE users SET vendedores_erp = ARRAY['Rodrigo Solis']                WHERE email='rodrigo.solis@elregresobeer.com';
-- 'Transición 1'/'Transición 2' y 'Equipo Ventas' quedan sin dueño a
-- propósito (decisión del usuario, 27-jul-2026): son carteras sin vendedor
-- de terreno asignado hoy. Solo admin las ve, vía VENDEDORES_SCOPE completo.

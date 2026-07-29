-- Pedido de Claudio: nuevo tipo de viaje "operador_logistico" -cuando se
-- le entrega un envio a un tercero (Cacem, Varmontt) para que ellos lo
-- despachen a otra ciudad, en vez de repartirlo directo El Regreso. Se
-- guarda separado de "motivo"/"destino_declarado" (que son texto libre)
-- para poder reportar despues cuanto se despacha por cada operador y a
-- que ciudades, sin tener que parsear texto.
ALTER TABLE public.viajes_flota
  ADD COLUMN operador_logistico text,
  ADD COLUMN ciudad_destino text,
  ADD COLUMN foto_guia_envio text;

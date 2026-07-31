-- Backfill de `codigo` en costos_precios para los productos que ya tienen
-- foto real subida (mismo mapeo codigo->imagen que usa Stock/Cotizaciones
-- en CODIGO_IMAGENES). El resto queda sin código — cae al emoji de
-- respaldo en el módulo hasta que se suba su foto.
update public.costos_precios set codigo = 'C-1'  where producto = 'Arboretum';
update public.costos_precios set codigo = 'C-2'  where producto = 'La Barra APA';
update public.costos_precios set codigo = 'C-4'  where producto = 'Descenso West Coast IPA';
update public.costos_precios set codigo = 'C-5'  where producto = 'Aguas Blancas';
update public.costos_precios set codigo = 'C-8'  where producto = 'Mocho English';
update public.costos_precios set codigo = 'C-9'  where producto = 'Fisura';
update public.costos_precios set codigo = 'K-1'  where producto = 'Kombucha Natural';
update public.costos_precios set codigo = 'K-2'  where producto = 'Kombucha Lemon (Fresh)';
update public.costos_precios set codigo = 'K-4'  where producto = 'Kombucha Berry Menta';
update public.costos_precios set codigo = 'K-6'  where producto = 'Kombucha Maqui (Hop)';
update public.costos_precios set codigo = 'K-10' where producto = 'Kombucha Maracuyá Cardamomo';
update public.costos_precios set codigo = 'K-11' where producto = 'Kombucha Mango';
update public.costos_precios set codigo = 'K-22' where producto = 'Kombucha Detox';

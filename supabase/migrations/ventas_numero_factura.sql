-- El informe "Ventas Detalladas" del ERP sí trae el número de factura (columna
-- "Factura", junto al N° de pedido) — antes /api/upload-ventas lo descartaba
-- porque no estaba en el mapeo de columnas. Se guarda por línea de venta,
-- igual que el resto de los campos del informe.
alter table public.ventas add column if not exists numero_factura text;

-- Índice liviano: no es alta cardinalidad de búsqueda hoy, pero deja la puerta
-- abierta a buscar por N° de factura sin escaneo completo si hace falta.
create index if not exists ventas_numero_factura_idx on public.ventas (numero_factura) where numero_factura is not null;

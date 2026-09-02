-- Número de factura por pedido, ingresado a mano por el equipo comercial una
-- vez que el ERP la emite. Vive en su propia tabla y NO en `ventas` a
-- propósito: el sync de ventas borra y reinserta filas por pedido en cada
-- carga del ERP (ver app/api/upload-ventas/route.ts), así que cualquier dato
-- guardado directamente en `ventas` se perdería en la próxima carga. Mismo
-- patrón que `contactos_cobranza`.
create table if not exists public.facturas_pedido (
  pedido text primary key,
  numero_factura text not null,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.facturas_pedido enable row level security;
-- Sin políticas: sólo el service-role (usado por las rutas /api/deudores/*)
-- puede leer o escribir, igual que contactos_cobranza.

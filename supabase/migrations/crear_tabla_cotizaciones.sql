-- Módulo de Cotizaciones: cada fila es una cotización armada y enviada a un
-- cliente (existente o prospecto). items guarda un snapshot de lo cotizado
-- (producto, envase, precio unitario, cantidad, descuento por línea, subtotal)
-- para que el historial no cambie si después se edita el catálogo de precios.
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,

  creado_por uuid references public.users(id),
  creado_por_nombre text not null,
  creado_por_email text not null,

  zona text not null check (zona in ('valdivia','santiago')),

  cliente_id bigint references public.clientes(id),
  cliente_nombre text not null,
  cliente_empresa text,
  cliente_email text,
  cliente_telefono text,

  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  descuento_total numeric not null default 0,
  total numeric not null default 0,

  notas text,
  estado text not null default 'borrador' check (estado in ('borrador','enviada','ganada','perdida')),
  imagen_url text,
  enviado_email_at timestamptz,
  enviado_whatsapp_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cotizaciones_created_at on public.cotizaciones (created_at desc);
create index if not exists idx_cotizaciones_creado_por on public.cotizaciones (creado_por);
create index if not exists idx_cotizaciones_cliente_nombre on public.cotizaciones (cliente_nombre);

alter table public.cotizaciones enable row level security;

-- Historial visible para todo el equipo (vendedores + admin/gerencia), igual
-- que clientes/stock. Cualquier usuario autenticado puede crear y actualizar
-- (marcar enviada/ganada/perdida) — no está restringido a "solo el dueño"
-- porque gerencia también necesita poder gestionar cotizaciones de terreno.
create policy "cotizaciones_select_todos" on public.cotizaciones
  for select to authenticated using (true);
create policy "cotizaciones_insert_todos" on public.cotizaciones
  for insert to authenticated with check (true);
create policy "cotizaciones_update_todos" on public.cotizaciones
  for update to authenticated using (true);

-- Bucket público para la imagen de marca generada (igual patrón que
-- logistica-evidence / terreno-fotos).
insert into storage.buckets (id, name, public)
values ('cotizaciones', 'cotizaciones', true)
on conflict (id) do nothing;

create policy "cotizaciones_storage_select_todos" on storage.objects
  for select to public using (bucket_id = 'cotizaciones');
create policy "cotizaciones_storage_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'cotizaciones');

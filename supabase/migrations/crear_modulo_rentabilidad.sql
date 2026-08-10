-- Módulo Rentabilidad: costos, precios y márgenes internos. Acceso
-- restringido a Claudio, Benjamín y Douglas — nunca a vendedores ni a
-- clientes. No reemplaza Cotizaciones (que sigue siendo el flujo
-- cliente-facing con solo precio de venta).

-- Permiso dedicado, separado de is_admin (is_admin hoy incluye a más
-- gente — ej. Rodrigo Solis — que no debe ver costos/márgenes).
alter table public.users
  add column if not exists puede_ver_margenes boolean not null default false;

update public.users
  set puede_ver_margenes = true
  where id in (
    '7c8f5399-4b32-42cf-9500-7473f9140a27', -- Claudio H.
    'f040ec5f-285d-409f-9406-01ca8d130bf1', -- Benjamin A.
    'a4da9450-0deb-45e7-90f4-2364f96fbd55'  -- Douglas Koenig
  );

-- Costo y precio neto por producto × zona × formato. IVA (19%, siempre) e
-- ILA (20.5%, solo si aplica_ila) se calculan en la app a partir del
-- precio_neto — nunca se guardan hardcodeados para no desincronizarse si
-- cambia la tasa.
create table if not exists public.costos_precios (
  id uuid primary key default gen_random_uuid(),
  producto text not null,
  codigo text,
  categoria text not null check (categoria in ('cerveza', 'kombucha')),
  zona text not null check (zona in ('sur', 'santiago', 'supermercados')),
  formato text not null check (formato in ('lata', 'barril')),
  costo_neto numeric not null default 0,
  precio_neto numeric not null default 0,
  aplica_ila boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (producto, zona, formato)
);

alter table public.costos_precios enable row level security;

create policy costos_precios_acceso
  on public.costos_precios
  for all
  to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.puede_ver_margenes))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.puede_ver_margenes));

-- Simulaciones guardadas ("si vendo X a este bar con Y% descuento").
create table if not exists public.simulaciones_rentabilidad (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  nota text,
  zona text not null check (zona in ('sur', 'santiago', 'supermercados')),
  items jsonb not null,
  venta_neta_total numeric not null,
  costo_total numeric not null,
  margen_clp numeric not null,
  margen_pct numeric not null
);

alter table public.simulaciones_rentabilidad enable row level security;

create policy simulaciones_rentabilidad_acceso
  on public.simulaciones_rentabilidad
  for all
  to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.puede_ver_margenes))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.puede_ver_margenes));

-- Seed: filas para los 25 productos × 3 zonas × 2 formatos, en cero —
-- mañana se cargan los valores reales de costo/precio (por planilla o
-- edición manual en el módulo). aplica_ila = true solo para cervezas.
insert into public.costos_precios (producto, categoria, zona, formato, aplica_ila)
select p.producto, p.categoria, z.zona, f.formato, (p.categoria = 'cerveza')
from (values
  ('Aguas Blancas', 'cerveza'), ('Arboretum', 'cerveza'), ('Ámbar Lager', 'cerveza'),
  ('Barley Wine', 'cerveza'), ('Carrot Cake Stout', 'cerveza'), ('Cucumbeer Sour', 'cerveza'),
  ('Del Caribe Sour', 'cerveza'), ('Descenso West Coast IPA', 'cerveza'), ('Doble Hazy IPA', 'cerveza'),
  ('Doble IPA', 'cerveza'), ('Fisura', 'cerveza'), ('Helles Colab', 'cerveza'),
  ('Imperial Stout', 'cerveza'), ('La Barra APA', 'cerveza'), ('Mocho English', 'cerveza'),
  ('Red IPA', 'cerveza'),
  ('Kombucha Natural', 'kombucha'), ('Kombucha Lemon (Fresh)', 'kombucha'),
  ('Kombucha Berry Menta', 'kombucha'), ('Kombucha Maqui (Hop)', 'kombucha'),
  ('Kombucha Maracuyá Cardamomo', 'kombucha'), ('Kombucha Detox', 'kombucha'),
  ('Kombucha Mango', 'kombucha'), ('Kombucha Experimental Piña Albahaca', 'kombucha'),
  ('Kombucha Lupulada', 'kombucha')
) as p(producto, categoria)
cross join (values ('sur'), ('santiago'), ('supermercados')) as z(zona)
cross join (values ('lata'), ('barril')) as f(formato)
on conflict (producto, zona, formato) do nothing;

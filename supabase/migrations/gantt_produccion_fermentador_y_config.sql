-- Carta Gantt de ocupación de fermentadores.
--
-- Hasta ahora el plan sólo sabía QUÉ cocer y CUÁNDO. El tanque se elegía en el
-- cliente y vivía en un useState (`anclasTanque`), o sea que se perdía al
-- recargar y no lo veía nadie más. Para que el Gantt sirva como planificación
-- de planta de verdad, el tanque y la duración tienen que ser del plan.

alter table public.plan_produccion
  -- Nombre del fermentador, no FK: los tanques se renombran en el ERP y no
  -- queremos que eso borre en cascada un plan ya armado. Se cruza por nombre
  -- igual que ocupacionPlanta en app/produccion/page.tsx.
  add column if not exists fermentador text,
  -- Días CORRIDOS que el lote ocupa el tanque. Null = usar el default del
  -- producto en config_produccion_producto. Se guarda acá además de en la
  -- config porque un lote puntual puede durar distinto sin que eso cambie la
  -- regla del producto.
  add column if not exists dias_ocupacion integer
    check (dias_ocupacion is null or (dias_ocupacion > 0 and dias_ocupacion <= 120));

comment on column public.plan_produccion.fermentador is
  'Fermentador asignado en el Gantt. Null = todavía sin asignar.';
comment on column public.plan_produccion.dias_ocupacion is
  'Días corridos de ocupación del tanque. Null = hereda de config_produccion_producto.';

-- Configuración por producto: cuánto tarda en el fermentador, con qué volumen
-- se suele cocer y de qué color se pinta en el Gantt. Es el "apartado de
-- setting" de la sección.
create table if not exists public.config_produccion_producto (
  producto text primary key,
  categoria text not null check (categoria in ('cerveza', 'kombucha')),
  -- Días CORRIDOS, no hábiles: la fermentación no se detiene el fin de semana.
  -- El Gantt del Excel usaba columnas de días hábiles, lo que hacía ver 10 un
  -- bloque que en realidad dura 12 días corridos.
  dias_fermentacion integer not null default 14
    check (dias_fermentacion > 0 and dias_fermentacion <= 120),
  -- Litros con los que se suele cocer este producto. Null = usar la capacidad
  -- del tanque que se elija.
  litros_objetivo integer check (litros_objetivo is null or litros_objetivo > 0),
  -- Color del bloque, hex #rrggbb. Se valida el formato para que el front
  -- pueda meterlo directo en un style sin sanitizar.
  color text not null default '#8C8C8C' check (color ~ '^#[0-9a-fA-F]{6}$'),
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid references public.users(id)
);

alter table public.config_produccion_producto enable row level security;

-- Lectura para cualquier autenticado; escritura sólo para quien puede tocar
-- el plan de producción (mismo criterio que plan_produccion).
create policy config_produccion_producto_select
  on public.config_produccion_producto for select to authenticated using (true);

create policy config_produccion_producto_escribe
  on public.config_produccion_producto for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.is_admin));

-- Semilla desde el catálogo real. Los días salen del Gantt que hoy se lleva a
-- mano en Excel (17-18 días hábiles cerveza ≈ 24 corridos; 10 hábiles kombucha
-- ≈ 12 corridos). Los colores son una paleta de arranque, distinguible entre
-- productos de la misma línea — se ajustan desde la UI.
insert into public.config_produccion_producto (producto, categoria, dias_fermentacion, color)
select p.producto,
       p.categoria,
       case when p.categoria = 'cerveza' then 24 else 12 end,
       (array['#B5502A','#3A6EA5','#2F7A55','#8B5E3C','#7D5BA6','#C08A2E',
              '#4A7C9B','#A34E6B','#5C8A3A','#96632E','#6B5BA6','#B0793A'])
         [1 + (row_number() over (partition by p.categoria order by p.producto) - 1) % 12]
from (select distinct producto, categoria from public.costos_precios
      where categoria in ('cerveza','kombucha')) p
on conflict (producto) do nothing;

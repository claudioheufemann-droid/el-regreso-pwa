-- Trazabilidad de lotes de producción (diseño propio, sin copiar estructura del ERP).
-- Reutiliza: recetas, receta_insumos, insumos, fermentadores, plan_produccion.
-- Agrega: lotes, lote_etapas, lote_insumos, lote_envasado.
-- NO APLICADA: revisar y aplicar a mano.

-- Un lote = una cocción (o varias unidas) que ocupa un fermentador.
create table if not exists public.lotes (
  id              uuid primary key default gen_random_uuid(),
  codigo          text not null unique,                 -- número de lote visible (ej. "2610-014")
  receta_id       uuid references public.recetas(id),
  producto        text not null,
  categoria       text check (categoria in ('cerveza','kombucha')),
  plan_id         uuid references public.plan_produccion(id) on delete set null,
  fermentador_id  uuid references public.fermentadores(id),
  fecha_coccion   date not null,
  litros_iniciales numeric not null check (litros_iniciales > 0),
  litros_merma    numeric not null default 0 check (litros_merma >= 0),
  estado          text not null default 'activo'
                  check (estado in ('activo','finalizado','desactivado')),
  etapa_actual    text not null default 'coccion'
                  check (etapa_actual in ('coccion','fermentacion','maduracion','listo','envasado','finalizado')),
  lote_origen_id  uuid references public.lotes(id),     -- división o unión de lotes
  observaciones   text,
  creado_por      uuid,
  creado_at       timestamptz not null default now(),
  actualizado_at  timestamptz not null default now()
);
create index if not exists lotes_estado_idx on public.lotes (estado, fecha_coccion desc);
create index if not exists lotes_fermentador_idx on public.lotes (fermentador_id) where estado = 'activo';

-- Historial de etapas: cuándo entró y salió cada lote de cada etapa.
create table if not exists public.lote_etapas (
  id          uuid primary key default gen_random_uuid(),
  lote_id     uuid not null references public.lotes(id) on delete cascade,
  etapa       text not null,
  fecha_inicio timestamptz not null default now(),
  fecha_fin   timestamptz,
  tareas      jsonb not null default '[]'::jsonb,   -- checklist: [{nombre, hecha, hecha_at}]
  mediciones  jsonb not null default '{}'::jsonb,   -- ej. {"densidad":1.012,"temp_c":18,"ph":4.4}
  observaciones text,
  registrado_por uuid
);
create index if not exists lote_etapas_lote_idx on public.lote_etapas (lote_id, fecha_inicio);

-- Insumos realmente consumidos en el lote (receta teórica vs. real).
create table if not exists public.lote_insumos (
  id          uuid primary key default gen_random_uuid(),
  lote_id     uuid not null references public.lotes(id) on delete cascade,
  insumo_id   uuid not null references public.insumos(id),
  cantidad_teorica numeric,                          -- escalada desde receta_insumos
  cantidad_real    numeric not null check (cantidad_real >= 0),
  lote_proveedor   text,                             -- trazabilidad hacia atrás
  creado_at   timestamptz not null default now()
);
create index if not exists lote_insumos_lote_idx on public.lote_insumos (lote_id);
create index if not exists lote_insumos_insumo_idx on public.lote_insumos (insumo_id);

-- Salidas del lote: barriles y latas, para trazabilidad hacia adelante.
create table if not exists public.lote_envasado (
  id          uuid primary key default gen_random_uuid(),
  lote_id     uuid not null references public.lotes(id) on delete cascade,
  formato     text not null check (formato in ('barril','lata','botella')),
  capacidad_ml integer,                              -- 50000, 30000, 473, 354...
  unidades    integer not null check (unidades > 0),
  litros      numeric not null check (litros > 0),
  fecha       date not null default current_date,
  observaciones text
);
create index if not exists lote_envasado_lote_idx on public.lote_envasado (lote_id);

-- Lectura para usuarios autenticados y el agente; escritura solo vía service_role (API).
do $$
declare t text;
begin
  foreach t in array array['lotes','lote_etapas','lote_insumos','lote_envasado'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t||'_select_authenticated', t);
    execute format('create policy %I on public.%I for select to agente_lector using (true)', 'agente_lector_select', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t||'_all_service_role', t);
  end loop;
end $$;

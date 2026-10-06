-- Listas de chequeo del Asistente de datos (5-oct-2026), ej. "pedidos cargados en el camión".
-- La lista se arma en el servidor (lista_pedidos_por_despachar lee los pedidos reales;
-- crear_lista deja una lista libre) y se marca desde el chat. Sólo service-role, como
-- el resto de agente_*. items = [{ id, texto, detalle, hecho, hecho_por, hecho_at }].
create table if not exists public.agente_listas (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid references public.agente_conversaciones(id) on delete set null,
  creado_por uuid not null references public.users(id),
  titulo text not null check (char_length(titulo) between 1 and 200),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agente_listas_conv_idx on public.agente_listas (conversacion_id, created_at);
create index if not exists agente_listas_creado_por_idx on public.agente_listas (creado_por);
alter table public.agente_listas enable row level security;
comment on table public.agente_listas is
  'Listas de chequeo creadas por el Asistente de datos (ej. pedidos cargados en el camión). Se marcan desde el chat.';

-- Marca/desmarca UN ítem de forma atómica (dos personas marcando a la vez no se pisan).
create or replace function public.agente_lista_marcar(p_lista uuid, p_item text, p_hecho boolean, p_por text)
returns jsonb
language sql
as $$
  update public.agente_listas l
  set items = (
        select coalesce(jsonb_agg(
          case when it->>'id' = p_item
            then it || jsonb_build_object('hecho', p_hecho,
                                          'hecho_por', case when p_hecho then p_por else null end,
                                          'hecho_at', case when p_hecho then to_jsonb(now()) else 'null'::jsonb end)
            else it end
          order by ord), '[]'::jsonb)
        from jsonb_array_elements(l.items) with ordinality as e(it, ord)
      ),
      updated_at = now()
  where l.id = p_lista
  returning l.items;
$$;
revoke all on function public.agente_lista_marcar(uuid, text, boolean, text) from public, anon, authenticated;

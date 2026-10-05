-- Correos que el Asistente de datos PROPONE y una persona ENVÍA (5-oct-2026).
--
-- El agente nunca envía: la herramienta preparar_correo_vendedor sólo inserta
-- un borrador 'pendiente'; el envío lo hace POST /api/agente/correos/[id]
-- cuando el administrador aprieta "Enviar" en el chat. El destinatario es
-- siempre un usuario de la app con cartera de ventas (users.vendedores_erp no
-- vacío), resuelto en el servidor: el modelo jamás ve ni elige una dirección.
-- Sin policies a propósito (sólo service-role), como el resto de agente_*.
create table if not exists public.agente_correos (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid references public.agente_conversaciones(id) on delete set null,
  creado_por uuid not null references public.users(id),
  destinatario_id uuid not null references public.users(id),
  destinatario_nombre text not null,
  asunto text not null check (char_length(asunto) between 1 and 200),
  cuerpo text not null check (char_length(cuerpo) between 1 and 5000),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'enviado', 'descartado', 'error')),
  error text,
  enviado_por uuid references public.users(id),
  enviado_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agente_correos_conv_idx on public.agente_correos (conversacion_id, created_at);
create index if not exists agente_correos_creado_por_idx on public.agente_correos (creado_por);
create index if not exists agente_correos_destinatario_idx on public.agente_correos (destinatario_id);

alter table public.agente_correos enable row level security;

comment on table public.agente_correos is
  'Borradores de correo propuestos por el Asistente de datos. estado=pendiente hasta que un admin lo envía o descarta desde el chat; el agente no puede enviar.';

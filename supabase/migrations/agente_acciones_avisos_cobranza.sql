-- Asistente de datos, segunda tanda de herramientas (5-oct-2026).
--
-- 1. Borradores de correo: además del correo, pueden salir como notificación
--    al celular del vendedor (push + campanita) o por ambos canales.
alter table public.agente_correos
  add column if not exists canal text not null default 'correo' check (canal in ('correo', 'push', 'ambos'));

-- 2. Otras acciones propuestas por el agente que una persona confirma en el chat:
--    'tarea' (crea una tarea en Gestión para un vendedor) y 'aviso' (programa o
--    cancela un aviso semanal). Mismo patrón que agente_correos: el agente sólo
--    inserta 'pendiente'; ejecutar es POST /api/agente/acciones/[id].
create table if not exists public.agente_acciones (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid references public.agente_conversaciones(id) on delete set null,
  creado_por uuid not null references public.users(id),
  tipo text not null check (tipo in ('tarea', 'aviso_crear', 'aviso_cancelar')),
  titulo text not null check (char_length(titulo) between 1 and 200),
  datos jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'ejecutando', 'hecha', 'descartada', 'error')),
  resultado jsonb,
  error text,
  ejecutada_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agente_acciones_conv_idx on public.agente_acciones (conversacion_id, created_at);
create index if not exists agente_acciones_creado_por_idx on public.agente_acciones (creado_por);
alter table public.agente_acciones enable row level security;
comment on table public.agente_acciones is
  'Acciones (tareas, avisos) propuestas por el Asistente de datos; sólo se ejecutan cuando un admin las confirma en el chat.';

-- 3. Avisos programados: cada semana, el día elegido, el cron
--    /api/cron/agente-avisos deja al usuario un borrador por vendedor con sus
--    clientes por pedir (no envía nada) y le avisa que están listos para revisar.
create table if not exists public.agente_avisos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.users(id),
  tipo text not null default 'clientes_por_pedir' check (tipo in ('clientes_por_pedir')),
  dia_semana int not null check (dia_semana between 1 and 7),  -- ISO: 1 = lunes
  dias_ventana int not null default 7 check (dias_ventana between 1 and 30),
  canal text not null default 'correo' check (canal in ('correo', 'push', 'ambos')),
  activo boolean not null default true,
  ultima_ejecucion date,
  created_at timestamptz not null default now()
);
create index if not exists agente_avisos_usuario_idx on public.agente_avisos (usuario_id);
alter table public.agente_avisos enable row level security;
comment on table public.agente_avisos is
  'Avisos semanales del Asistente de datos. El cron prepara borradores (agente_correos) y avisa al usuario; nunca envía a los vendedores sin confirmación.';

-- 4. Facturas impagas con su vencimiento (entrega + plazo de la ficha), una fila
--    por factura. La usa la herramienta cobranza_vendedor. Mismos criterios que
--    pagado_por_ciclo: pagada = cualquier pago en cobros_erp.
create or replace function public.cobranza_facturas_impagas(p_desde date)
returns table(numero_factura text, cliente text, vendedor text, fecha_entrega date, neto numeric, litros numeric, dias_pago int, vence date, dias_vencida int)
language sql
stable
as $$
  with plazos as (
    select distinct on (lower(trim(nombre_fantasia))) lower(trim(nombre_fantasia)) as clave, dias_pago
    from clientes order by lower(trim(nombre_fantasia)), id
  ),
  pagadas as (select distinct factura from cobros_erp where factura is not null),
  f as (
    select ve.numero_factura,
           max(ve.nombre_fantasia) as cliente,
           max(coalesce(nullif(trim(ve.vendedor_actual), ''), 'Sin vendedor')) as vendedor,
           max(ve.fecha_entrega) as fecha_entrega,
           round(sum(coalesce(ve.total_sin_impuesto, 0))) as neto,
           round(sum(coalesce(ve.litros, 0)), 1) as litros
    from ventas ve
    left join pagadas pg on pg.factura = ve.numero_factura
    where ve.fecha_entrega >= p_desde and ve.numero_factura is not null and pg.factura is null
      and lower(ve.nombre_fantasia) not like '%cliente pdv%' and lower(ve.nombre_fantasia) not like '%basecamp el regreso%'
    group by ve.numero_factura
  )
  select f.numero_factura, f.cliente, f.vendedor, f.fecha_entrega, f.neto, f.litros,
         pl.dias_pago, f.fecha_entrega + pl.dias_pago as vence,
         case when pl.dias_pago is null then null else current_date - (f.fecha_entrega + pl.dias_pago) end as dias_vencida
  from f left join plazos pl on pl.clave = lower(trim(f.cliente));
$$;

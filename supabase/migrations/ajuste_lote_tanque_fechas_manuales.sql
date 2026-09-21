-- Ajuste manual de fechas para un lote físico detectado en el ERP.
--
-- El bloque 'en_tanque' del Gantt (ver GanttProduccion.tsx) reconstruye la
-- fecha de inicio de un lote que YA está fermentando retrocediendo la fecha
-- de embarrillado estimada del ERP con la duración configurada del producto.
-- Esa reconstrucción puede salir mal — pasó con Kombucha Detox y Berry Menta,
-- cuyo ciclo real (40 días) no coincidía con el default sembrado en
-- config_produccion_producto (12 días) — y corregir el default del PRODUCTO
-- para arreglar UN lote puntual sería un efecto secundario: ese default
-- también alimenta el forecast de stock de seguridad y las alarmas de
-- quiebre para TODOS los lotes futuros del producto, no sólo el que está
-- fermentando hoy.
--
-- Esta tabla guarda el ajuste por LOTE FÍSICO, no por producto: se identifica
-- por tanque + código de lote del ERP (la columna "Lote" del informe de
-- stock), así que corregir "esta cocción específica de Kombucha Detox" no
-- toca ninguna otra cocción de Kombucha Detox, pasada o futura.
create table if not exists public.ajuste_lote_tanque (
  tanque text not null,
  codigo_lote text not null,
  -- Fecha de cocción — el dato que el ERP no trae y que hasta ahora sólo se
  -- podía estimar. Null = seguir usando la fecha reconstruida.
  fecha_inicio_manual date,
  -- Fecha de embarrillado — por si la estimada del ERP también está errada
  -- para este lote puntual. Null = usar la del ERP.
  fecha_embarrillado_manual date,
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid references public.users(id),
  primary key (tanque, codigo_lote),
  check (
    fecha_inicio_manual is not null or fecha_embarrillado_manual is not null
  )
);

comment on table public.ajuste_lote_tanque is
  'Corrección manual de fechas para un lote físico ya en fermentación, detectado desde el informe del ERP. Vive aparte de config_produccion_producto para no alterar la duración por defecto del producto.';

alter table public.ajuste_lote_tanque enable row level security;

-- Mismo patrón que plan_produccion (no el de config_produccion_producto):
-- la escritura real pasa por /api/produccion/ajuste-tanque con
-- createAdminClient() (service-role), porque en modo demo no hay sesión real
-- de Supabase y RLS `authenticated` bloquearía la escritura desde ahí. El
-- gate de "quién puede" vive en el server route (getServerUser + isAdmin o
-- macroArea==='produccion'), igual que el resto de Producción.
create policy ajuste_lote_tanque_select
  on public.ajuste_lote_tanque for select to authenticated using (true);

create policy ajuste_lote_tanque_all_service_role
  on public.ajuste_lote_tanque for all to service_role using (true) with check (true);

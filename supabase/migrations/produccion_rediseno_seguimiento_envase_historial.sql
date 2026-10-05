-- Rediseño del módulo Producción (4-oct-2026). Tres piezas que faltaban para
-- que el módulo muestre información de valor y no sólo proyecciones:
--
-- 1) SEGUIMIENTO DE LOTES: plan_produccion sólo tenía la fecha y los litros
--    PLANIFICADOS, y nadie pasaba un lote a "en curso" ni a "completado" (al
--    4-oct: 18 planificados, 48 cancelados, 0 completados). Sin lo real no se
--    puede comparar plan vs. cocinado. Se agregan fecha real de cocción,
--    fecha de término y litros reales.
--
-- 2) ENVASE COMO INSUMO: el presupuesto de insumos sólo tenía malta, lúpulo,
--    levadura y "otros"; faltaban latas, etiquetas y tapas, así que el costo
--    de producir en lata salía subestimado. Tabla propia (y no filas en
--    `insumos`) porque el informe de insumos que se sube reemplaza ese
--    catálogo, y el envase se cuenta por unidad, no por gramos/ml.
--
-- 3) HISTORIAL DE STOCK: /api/stock/upload borra stock_productos y lo vuelve a
--    insertar, así que sólo existe la última foto y no se puede medir cuántos
--    días estuvo quebrada una línea fija. Un trigger copia cada fila insertada
--    a stock_productos_diario (una foto por día; la última carga del día gana).

-- 1) Seguimiento real de cada lote
alter table plan_produccion
  add column if not exists fecha_inicio_real date,
  add column if not exists fecha_fin_real date,
  add column if not exists litros_reales numeric check (litros_reales is null or litros_reales >= 0);

comment on column plan_produccion.fecha_inicio_real is 'Día en que de verdad se cocinó (al pasar a en_curso).';
comment on column plan_produccion.fecha_fin_real is 'Día en que se terminó/envasó (al pasar a completado).';
comment on column plan_produccion.litros_reales is 'Litros que de verdad salieron del lote (al completarlo).';

-- 2) Envase: latas, etiquetas y tapas, por unidad
create table if not exists produccion_envase (
  clave text primary key,
  nombre text not null,
  tipo text not null check (tipo in ('lata', 'etiqueta', 'tapa')),
  -- ml de la lata a la que corresponde (473 cerveza, 354 kombucha); null = sirve a todas
  ml integer check (ml is null or ml > 0),
  -- cuántas van por cada lata envasada (1 etiqueta y 1 tapa por lata, por defecto)
  por_lata numeric not null default 1 check (por_lata > 0),
  precio_unitario numeric check (precio_unitario is null or precio_unitario >= 0),
  stock_unidades numeric check (stock_unidades is null or stock_unidades >= 0),
  actualizado_at timestamptz not null default now(),
  actualizado_por uuid references users(id)
);

insert into produccion_envase (clave, nombre, tipo, ml, por_lata) values
  ('lata_473', 'Lata 473 ml', 'lata', 473, 1),
  ('lata_354', 'Lata 354 ml', 'lata', 354, 1),
  ('etiqueta_473', 'Etiqueta lata 473 ml', 'etiqueta', 473, 1),
  ('etiqueta_354', 'Etiqueta lata 354 ml', 'etiqueta', 354, 1),
  ('tapa', 'Tapa de lata', 'tapa', null, 1)
on conflict (clave) do nothing;

alter table produccion_envase enable row level security;
create policy produccion_envase_select on produccion_envase for select to authenticated using (true);
create policy produccion_envase_escribe on produccion_envase for all to authenticated
  using (exists (select 1 from users u where u.id = auth.uid() and u.is_admin))
  with check (exists (select 1 from users u where u.id = auth.uid() and u.is_admin));
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'agente_lector') then
    execute 'create policy agente_lector_select on produccion_envase for select to agente_lector using (true)';
    execute 'grant select on produccion_envase to agente_lector';
  end if;
end $$;

-- 3) Historial diario de stock de producto terminado
create table if not exists stock_productos_diario (
  fecha date not null,
  producto text not null,
  tipo text not null default '',
  camara text not null default '',
  cantidad numeric not null default 0,
  litros numeric,
  primary key (fecha, producto, tipo, camara)
);
create index if not exists stock_productos_diario_fecha on stock_productos_diario (fecha);

alter table stock_productos_diario enable row level security;
create policy stock_productos_diario_select on stock_productos_diario for select to authenticated using (true);
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'agente_lector') then
    execute 'create policy agente_lector_select on stock_productos_diario for select to agente_lector using (true)';
    execute 'grant select on stock_productos_diario to agente_lector';
  end if;
end $$;

-- Cada inserción reconstruye la foto de ESE día desde la tabla completa (no
-- sólo desde las filas recién insertadas): así da lo mismo si el upload
-- inserta todo de una vez o por tandas, y una segunda carga del mismo día
-- reemplaza a la primera en vez de sumarse.
create or replace function stock_productos_diario_copiar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from stock_productos_diario d
  using (select distinct fecha_informe from nuevas where fecha_informe is not null) f
  where d.fecha = f.fecha_informe;

  insert into stock_productos_diario (fecha, producto, tipo, camara, cantidad, litros)
  select s.fecha_informe, s.producto, coalesce(s.tipo, ''), coalesce(s.camara, ''), sum(coalesce(s.cantidad, 0)), sum(s.litros)
  from stock_productos s
  where s.fecha_informe in (select distinct fecha_informe from nuevas) and s.producto is not null
  group by s.fecha_informe, s.producto, coalesce(s.tipo, ''), coalesce(s.camara, '');
  return null;
end $$;

drop trigger if exists stock_productos_diario_copiar on stock_productos;
create trigger stock_productos_diario_copiar
  after insert on stock_productos
  referencing new table as nuevas
  for each statement execute function stock_productos_diario_copiar();

-- Arranque: la foto vigente pasa a ser el primer día del historial.
insert into stock_productos_diario (fecha, producto, tipo, camara, cantidad, litros)
select fecha_informe, producto, coalesce(tipo, ''), coalesce(camara, ''), sum(coalesce(cantidad, 0)), sum(litros)
from stock_productos
where fecha_informe is not null and producto is not null
group by fecha_informe, producto, coalesce(tipo, ''), coalesce(camara, '')
on conflict do nothing;

-- El informe "Ventas Detalladas" del ERP trae la "Fecha de facturación" (hoja
-- Datos: "FechaDeFacturacion") y /api/upload-ventas la descartaba. Es la fecha
-- de emisión de la factura, y de ahí corre el plazo de pago del cliente: el
-- vencimiento que imprime la factura es esa fecha + dias_pago. Deudores la usa
-- para que el vencimiento sea exactamente el de la factura (pedido de Claudio,
-- 2026-10-26: Ecole aparecía vencida cuando su factura vencía al día siguiente).
alter table public.ventas add column if not exists fecha_facturacion date;

comment on column public.ventas.fecha_facturacion is 'Fecha de emisión de la factura (columna "Fecha de facturación" del informe Ventas Detalladas). Base del vencimiento en Deudores: fecha_facturacion + dias_pago.';

-- La carga de ventas inserta con una lista de columnas explícita: hay que
-- sumarle fecha_facturacion o el dato se pierde aunque la ruta lo mande.
create or replace function public.reemplazar_ventas(p_pedidos text[], p_sin_pedido jsonb, p_filas jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_insertadas integer := 0;
  r record;
begin
  -- Serializa cargas concurrentes. pg_advisory_xact_lock (no la variante de
  -- sesión) porque el pooler de Supabase trabaja en modo transacción.
  perform pg_advisory_xact_lock(hashtext('upload_ventas'));

  if p_pedidos is not null and array_length(p_pedidos, 1) > 0 then
    delete from ventas where pedido = any(p_pedidos);
  end if;

  for r in
    select * from jsonb_to_recordset(coalesce(p_sin_pedido, '[]'::jsonb))
      as x(vendedor text, fecha date)
  loop
    delete from ventas
     where vendedor_actual = r.vendedor
       and fecha_pedido = r.fecha
       and (pedido is null or pedido !~ '^[0-9]+$');
  end loop;

  insert into ventas (
    fecha_pedido, vendedor_actual, nombre_fantasia, categoria_producto,
    categoria_negocio, producto, envase, litros, total_sin_impuesto, pedido,
    tipo_venta, localidad, provincia, fecha_entrega, fecha_entrega_estimada,
    entrega_informada, fecha_entrega_hora, numero_factura, fecha_facturacion,
    responsable_al_momento
  )
  select
    fecha_pedido, vendedor_actual, nombre_fantasia, categoria_producto,
    categoria_negocio, producto, envase,
    coalesce(litros, 0), coalesce(total_sin_impuesto, 0), pedido,
    tipo_venta, localidad, provincia, fecha_entrega, fecha_entrega_estimada,
    coalesce(entrega_informada, false), fecha_entrega_hora,
    numero_factura, fecha_facturacion, responsable_al_momento
  from jsonb_populate_recordset(null::ventas, p_filas);

  get diagnostics v_insertadas = row_count;
  return v_insertadas;
end;
$function$;

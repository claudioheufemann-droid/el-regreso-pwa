-- Metas: las devoluciones NO restan unidades (regla de Claudio, 2026-10-28).
-- El ERP carga las devoluciones con pedido = 'Devolución', litros negativos y
-- $0 (p. ej. 4 barriles de Punto Growler Santiago el 27-oct dejaron a la
-- Metropolitana con -1 barril en la S4, aunque vendió 3). Esa mercadería es de
-- una venta anterior y no debe castigar la semana en que vuelve: en Metas los
-- litros, cajas y barriles cuentan sólo lo vendido. El neto no cambia (las
-- devoluciones vienen en $0).
do $$
declare
  v text;
  d text;
  viejo constant text := 'COALESCE(v.litros, 0::numeric) AS litros,';
  nuevo constant text := 'CASE WHEN v.pedido = ''Devolución''::text OR v.litros < 0::numeric THEN 0::numeric ELSE COALESCE(v.litros, 0::numeric) END AS litros,';
begin
  foreach v in array array['plan_metas_avance', 'plan_metas_periodo_avance'] loop
    d := pg_get_viewdef(('public.' || v)::regclass, true);
    if position(viejo in d) = 0 then
      raise exception 'expresión de litros no encontrada en %', v;
    end if;
    d := replace(d, viejo, nuevo);
    execute format('create or replace view public.%I with (security_invoker = true) as %s', v, d);
  end loop;
end $$;

-- Detalle por cliente: misma regla para los litros que muestra cada cliente.
do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.plan_metas_detalle_clientes(uuid, date, date)'::regprocedure);
  if position('coalesce(v.litros, 0::numeric) as litros' in d) = 0 then
    raise exception 'expresión de litros no encontrada en plan_metas_detalle_clientes';
  end if;
  d := replace(d, 'coalesce(v.litros, 0::numeric) as litros',
    'case when v.pedido = ''Devolución'' or v.litros < 0 then 0::numeric else coalesce(v.litros, 0::numeric) end as litros');
  -- Y la devolución sola no aparece como "cliente" de la semana ($0, sin venta).
  d := replace(d, 'where b.vendedor_actual = any (u.vendedores_erp) and b.fecha_pedido >= p_desde and b.fecha_pedido <= p_hasta',
    'where b.vendedor_actual = any (u.vendedores_erp) and b.fecha_pedido >= p_desde and b.fecha_pedido <= p_hasta and b.pedido is distinct from ''Devolución''');
  execute d;
end $$;

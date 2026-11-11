-- Score de clientes (client_metrics_calc → client_metrics_cache → client_scores):
-- las devoluciones y los pedidos en $0 NO son compras (2026-11-11).
-- La Birra Esquina devolvió 30 L el 10-nov y quedó "ok, 1 día sin comprar"
-- cuando su última compra real fue el 20-ago (83 días: en fuga). Misma regla
-- que la cartera (cartera_sin_devoluciones.sql): un día cuenta como compra sólo
-- si tiene una línea vendida (litros > 0 o neto > 0) y no es devolución.
do $$
declare
  d text := pg_get_viewdef('public.client_metrics_calc'::regclass, true);
  n text;
  filtro_viejo constant text := 'WHERE v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia) AND';
  filtro_nuevo constant text := 'WHERE v.nombre_fantasia IS NOT NULL AND NOT _excluir_cliente(v.nombre_fantasia) AND v.pedido IS DISTINCT FROM ''Devolución''::text AND (COALESCE(v.litros, 0::numeric) > 0::numeric OR COALESCE(v.total_sin_impuesto, 0::numeric) > 0::numeric) AND';
  join_viejo constant text := 'v.fecha_pedido = od.fecha_pedido AND NOT _excluir_cliente(v.nombre_fantasia)';
  join_nuevo constant text := 'v.fecha_pedido = od.fecha_pedido AND NOT _excluir_cliente(v.nombre_fantasia) AND v.pedido IS DISTINCT FROM ''Devolución''::text';
begin
  if position('Devolución' in d) > 0 then
    raise notice 'client_metrics_calc ya excluye devoluciones';
    return;
  end if;
  n := replace(d, filtro_viejo, filtro_nuevo);
  if n = d then raise exception 'no se encontró el filtro de order_dates'; end if;
  d := n;
  n := replace(d, join_viejo, join_nuevo);
  if n = d then raise exception 'no se encontró el join de aggregated'; end if;
  execute 'CREATE OR REPLACE VIEW public.client_metrics_calc AS ' || n;
end $$;

REFRESH MATERIALIZED VIEW CONCURRENTLY public.client_metrics_cache;
REFRESH MATERIALIZED VIEW CONCURRENTLY public.client_scores;

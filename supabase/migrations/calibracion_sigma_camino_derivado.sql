-- Un producto×envase marcado `derivado` no usa banda propia: generar_forecast.py
-- ::derivar_de_producto le da la del producto padre escalada por la proporción
-- reciente del formato. El `k` medido sobre un ajuste propio corrige entonces
-- el cociente equivocado para esas series.
--
-- calibrar_sigma.py ahora mide los dos caminos y deja ambos acá; el pipeline
-- elige según el método con el que salió esa serie en esa corrida, que puede
-- cambiar de corrida en corrida.
alter table public.calibracion_sigma
  add column if not exists k_derivado numeric check (k_derivado is null or k_derivado > 0),
  add column if not exists k_crudo_derivado numeric,
  add column if not exists folds_derivado integer;

comment on column public.calibracion_sigma.k is
  'Factor aplicado cuando la serie sale con modelo propio (metodo=propio).';
comment on column public.calibracion_sigma.k_derivado is
  'Factor aplicado cuando la serie sale derivada del producto padre (metodo=derivado). Null si no se pudo medir.';

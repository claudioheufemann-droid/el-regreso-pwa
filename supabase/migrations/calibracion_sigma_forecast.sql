-- Factor de corrección del sigma que alimenta el stock de seguridad.
--
-- El colchón de Producción se calcula con la banda que Prophet declara
-- (generar_forecast.py: sigma = (litrosMax-litrosMin)/(2*1.2816)), que es la
-- autoevaluación del modelo sobre su propio ajuste y no su error fuera de
-- muestra. Medida contra la realidad (19-sep-2026) esa banda cubre 28% de los
-- meses a nivel producto y 48% a nivel producto×envase, cuando debería cubrir
-- 80%: el sigma real es ~1.8x/~2.2x el declarado.
--
-- `scripts/forecast/calibrar_sigma.py` corre un walk-forward por serie y deja
-- acá el cociente `k` = sigma_real / sigma_banda. generar_forecast.py lo lee y
-- multiplica. Se recalcula aparte y de tanto en tanto (son ~1.100 ajustes de
-- Prophet): la calibración es una propiedad del modelo, no del mes.
create table if not exists public.calibracion_sigma (
  id bigint generated always as identity primary key,
  nivel text not null check (nivel in ('producto', 'producto_envase')),
  clave text not null,
  -- k aplicado: el k_crudo de la serie encogido hacia la mediana del nivel
  -- según cuántos folds tuvo, y acotado a [1, 4]. Piso en 1 a propósito: si
  -- una serie midió su banda más ancha que su error, no le achicamos el
  -- colchón — con pocos folds eso puede ser suerte, y equivocarse hacia el
  -- colchón chico cuesta quiebre y góndola.
  k numeric not null check (k > 0),
  k_crudo numeric,          -- sin shrinkage ni tope, para poder auditar
  folds integer not null,   -- residuales que respaldan la medición
  sigma_real numeric,       -- desvío de los residuales del walk-forward
  sigma_banda numeric,      -- el que declaraba la banda de Prophet
  sesgo_litros numeric,     -- media de los residuales (no entra en k, ver script)
  generado_at timestamptz not null default now(),
  unique (nivel, clave)
);

alter table public.calibracion_sigma enable row level security;

-- Mismo criterio que stock_seguridad / forecast_produccion: lectura para
-- cualquier usuario autenticado; la escritura entra con la service key desde
-- el script, que salta RLS.
create policy calibracion_sigma_select
  on public.calibracion_sigma
  for select
  to authenticated
  using (true);

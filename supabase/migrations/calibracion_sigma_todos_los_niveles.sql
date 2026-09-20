-- general y envase también alimentan el gráfico de Forecasting. Si sólo se
-- corrigieran producto y producto×envase, el total dejaría de cuadrar con la
-- suma de las partes y la sección mostraría dos verdades distintas.
alter table public.calibracion_sigma
  drop constraint if exists calibracion_sigma_nivel_check;

alter table public.calibracion_sigma
  add constraint calibracion_sigma_nivel_check
  check (nivel in ('general', 'envase', 'producto', 'producto_envase'));

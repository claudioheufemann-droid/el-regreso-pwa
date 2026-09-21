-- Segundo factor de calibración: `b`, el que corrige el CENTRO del forecast.
--
-- Prophet sobre-pronostica sistemáticamente (+42% a nivel producto, +35% a
-- nivel producto×envase, medido en backtest_forecast_produccion.py). Ese sesgo
-- entra lineal al punto de reorden vía demanda_semanal = yhat/4.33, o sea que
-- venía mandando a cocer de más.
--
-- Es multiplicativo (forecast corregido = forecast × b) porque el sesgo es
-- proporcional al nivel de la serie, no una cantidad fija de litros. b < 1
-- significa que la serie sobre-pronostica.
--
-- OJO con el orden: hasta ahora este sesgo venía TAPANDO el colchón chico que
-- corrige `k`. Los dos factores tienen que estar aplicados juntos; aplicar `b`
-- sin `k` baja el punto de reorden y destapa el faltante. Por eso `k` se
-- implementó primero.
alter table public.calibracion_sigma
  add column if not exists b numeric check (b is null or b > 0),
  add column if not exists b_crudo numeric,
  add column if not exists b_derivado numeric check (b_derivado is null or b_derivado > 0),
  add column if not exists b_crudo_derivado numeric;

comment on column public.calibracion_sigma.b is
  'Factor multiplicativo sobre el forecast cuando la serie sale con modelo propio. b<1 = sobre-pronostica.';
comment on column public.calibracion_sigma.b_derivado is
  'Idem, para cuando la serie sale derivada del producto padre.';

comment on table public.calibracion_sigma is
  'Calibración del forecast de Producción contra su error real medido en walk-forward: k corrige el ancho del colchón, b corrige el centro. Los genera scripts/forecast/calibrar_sigma.py.';

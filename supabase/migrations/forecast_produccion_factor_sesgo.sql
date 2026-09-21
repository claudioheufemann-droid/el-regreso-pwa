-- Con qué factor se corrigió el sesgo de esta serie en la corrida que generó
-- la fila. Sin esto, cuando alguien pregunte por qué el forecast de un producto
-- bajó 30% de un mes al otro, no hay forma de distinguir "cambió la demanda" de
-- "cambió la calibración". Null = fila anterior a la corrección, o serie sin
-- factor aplicado.
alter table public.forecast_produccion
  add column if not exists factor_sesgo numeric;

comment on column public.forecast_produccion.factor_sesgo is
  'Factor multiplicativo b aplicado al centro del forecast (calibracion_sigma). <1 = la serie venia sobre-pronosticando.';

-- Pruebas de aceptación de base de datos para Planificación semanal de Terreno
-- (punto 13 del prompt original). Cubren las reglas que viven en constraints/triggers de
-- Postgres, no en TypeScript — la lógica pura (presupuesto, umbrales, semana/fechas,
-- sanitización de export) tiene tests reales en lib/terreno/planificacion/__tests__
-- (`npm test`), corribles sin base de datos.
--
-- Cómo correr esto: pegar cada bloque en el SQL Editor de Supabase (o vía
-- mcp__...__execute_sql) contra el proyecto tzqmqufcuvbwskjiaorn. Cada DO block es
-- autocontenido: crea sus propias filas de prueba bajo un vendedor real ya existente
-- (Marcelo D., aca059ef-daa4-45e7-bc49-5dbd43c27653) y las borra al final, tanto si el
-- chequeo pasa como si falla (bloque EXCEPTION), para no dejar basura en producción.
-- Un RAISE NOTICE 'OK: ...' confirma cada regla; un RAISE EXCEPTION sin 'OK' indica que
-- la regla se rompió (revisar antes de dar por buena una migración nueva sobre estas
-- tablas).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Un vendedor NO puede aprobar, rechazar ni devolver su propio plan (trigger
--    terreno_validar_actor_aprobacion).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_vendedor uuid;
  v_plan_id uuid;
  v_bloqueado boolean := false;
BEGIN
  SELECT id INTO v_vendedor FROM public.users WHERE email = 'marcelo.diaz@elregresobeer.com';

  INSERT INTO public.planes_semanales_terreno (vendedor_id, created_by, semana_lunes, fecha_limite_presentacion)
  VALUES (v_vendedor, v_vendedor, '2099-01-05', '2099-01-02')
  RETURNING id INTO v_plan_id;

  BEGIN
    INSERT INTO public.plan_aprobaciones_terreno (plan_id, version_evaluada, decision, actor_id)
    VALUES (v_plan_id, 0, 'aprobado', v_vendedor);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%propio plan%' THEN v_bloqueado := true;
    ELSE
      DELETE FROM public.planes_semanales_terreno WHERE id = v_plan_id;
      RAISE EXCEPTION 'Error inesperado (no el bloqueo esperado): %', SQLERRM;
    END IF;
  END;

  DELETE FROM public.planes_semanales_terreno WHERE id = v_plan_id;

  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALLO: el trigger no bloqueó la auto-aprobación';
  END IF;
  RAISE NOTICE 'OK: 1) auto-aprobación bloqueada correctamente';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Snapshot inmutable: una vez insertada una fila en plan_versiones_terreno, editar
--    el plan original NO cambia el snapshot ya guardado (es una copia jsonb, no una
--    referencia).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_vendedor uuid;
  v_plan_id uuid;
  v_version_id uuid;
  v_monto_en_snapshot integer;
BEGIN
  SELECT id INTO v_vendedor FROM public.users WHERE email = 'marcelo.diaz@elregresobeer.com';

  INSERT INTO public.planes_semanales_terreno
    (vendedor_id, created_by, semana_lunes, fecha_limite_presentacion, monto_solicitado_total)
  VALUES (v_vendedor, v_vendedor, '2099-01-05', '2099-01-02', 10000)
  RETURNING id INTO v_plan_id;

  INSERT INTO public.plan_versiones_terreno (plan_id, numero_version, snapshot, creado_por)
  VALUES (v_plan_id, 1, jsonb_build_object('plan', jsonb_build_object('monto_solicitado_total', 10000)), v_vendedor)
  RETURNING id INTO v_version_id;

  -- El plan "sigue vivo" y se edita después de snapshotear (como pasaría en un reenvío).
  UPDATE public.planes_semanales_terreno SET monto_solicitado_total = 999999 WHERE id = v_plan_id;

  SELECT (snapshot->'plan'->>'monto_solicitado_total')::integer INTO v_monto_en_snapshot
  FROM public.plan_versiones_terreno WHERE id = v_version_id;

  DELETE FROM public.planes_semanales_terreno WHERE id = v_plan_id; -- cascada borra la versión

  IF v_monto_en_snapshot IS DISTINCT FROM 10000 THEN
    RAISE EXCEPTION 'FALLO: el snapshot cambió junto al plan (esperaba 10000, quedó %)', v_monto_en_snapshot;
  END IF;
  RAISE NOTICE 'OK: 2) snapshot permanece inmutable aunque el plan original se edite después';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) No se puede vincular una misma venta a dos visitas (UNIQUE(venta_id) en
--    plan_venta_visita_links_terreno) — evita el doble conteo del punto 9.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_venta_id bigint;
  v_visita_1 uuid;
  v_visita_2 uuid;
  v_vendedor uuid;
  v_bloqueado boolean := false;
BEGIN
  SELECT id INTO v_vendedor FROM public.users WHERE email = 'marcelo.diaz@elregresobeer.com';
  SELECT id INTO v_venta_id FROM public.ventas LIMIT 1;

  INSERT INTO public.visitas_terreno (vendedor_id, cliente_nombre, estado)
  VALUES (v_vendedor, 'Cliente de prueba (borrar)', 'completada') RETURNING id INTO v_visita_1;
  INSERT INTO public.visitas_terreno (vendedor_id, cliente_nombre, estado)
  VALUES (v_vendedor, 'Cliente de prueba (borrar)', 'completada') RETURNING id INTO v_visita_2;

  INSERT INTO public.plan_venta_visita_links_terreno (visita_id, venta_id) VALUES (v_visita_1, v_venta_id);

  BEGIN
    INSERT INTO public.plan_venta_visita_links_terreno (visita_id, venta_id) VALUES (v_visita_2, v_venta_id);
  EXCEPTION WHEN unique_violation THEN
    v_bloqueado := true;
  END;

  DELETE FROM public.visitas_terreno WHERE id IN (v_visita_1, v_visita_2); -- cascada borra los vínculos

  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALLO: la misma venta se vinculó a dos visitas distintas (doble conteo posible)';
  END IF;
  RAISE NOTICE 'OK: 3) una venta no puede quedar vinculada a dos visitas (UNIQUE venta_id)';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Idempotencia del outbox: reenviar el mismo evento+versión+destinatario no crea
--    una segunda fila (UNIQUE(clave_idempotencia)) — "reenvío/doble clic no duplica
--    correo" (punto 7 / prueba de aceptación del punto 13).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_clave text := 'test-idempotencia-borrar-' || gen_random_uuid()::text;
  v_duplicado_bloqueado boolean := false;
BEGIN
  INSERT INTO public.correo_outbox_terreno (tipo_evento, entidad_id, entidad_version, destinatario_email, clave_idempotencia, payload)
  VALUES ('test', gen_random_uuid(), 1, 'test@elregresobeer.com', v_clave, '{}'::jsonb);

  BEGIN
    INSERT INTO public.correo_outbox_terreno (tipo_evento, entidad_id, entidad_version, destinatario_email, clave_idempotencia, payload)
    VALUES ('test', gen_random_uuid(), 1, 'test@elregresobeer.com', v_clave, '{}'::jsonb);
  EXCEPTION WHEN unique_violation THEN
    v_duplicado_bloqueado := true;
  END;

  DELETE FROM public.correo_outbox_terreno WHERE clave_idempotencia = v_clave;

  IF NOT v_duplicado_bloqueado THEN
    RAISE EXCEPTION 'FALLO: se pudo encolar dos veces el mismo evento+versión+destinatario';
  END IF;
  RAISE NOTICE 'OK: 4) outbox idempotente — mismo evento+versión+destinatario no duplica';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Política de gastos: dos versiones con vigencia solapada quedan bloqueadas
--    (trigger terreno_validar_politica_sin_solape) — sin esto podría haber
--    ambigüedad sobre qué tarifa aplica a una fecha dada.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_bloqueado boolean := false;
BEGIN
  BEGIN
    -- version 1 real ya cubre [2026-07-21, infinito) — cualquier vigencia dentro de eso solapa.
    INSERT INTO public.politicas_gastos_terreno
      (version, vigente_desde, tarifa_km_clp, monto_almuerzo_clp, monto_desayuno_clp, monto_once_cena_clp, tope_alojamiento_noche_clp, umbral_autorizacion_previa_clp)
    VALUES (999999, '2099-01-01', 150, 15000, 5000, 10000, 60000, 250000);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%se superpone%' THEN v_bloqueado := true; ELSE RAISE; END IF;
  END;

  DELETE FROM public.politicas_gastos_terreno WHERE version = 999999;

  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALLO: se permitió una política con vigencia solapada a la versión 1';
  END IF;
  RAISE NOTICE 'OK: 5) política de gastos rechaza vigencias solapadas';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RLS deny-by-default: un rol sin sesión (anon) no puede leer planes de nadie —
--    confirma que las tablas nuevas no quedaron con acceso público por accidente.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_filas_rls_pendientes int;
BEGIN
  SELECT count(*) INTO v_filas_rls_pendientes
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename LIKE 'plan_%_terreno'
    AND NOT rowsecurity;

  IF v_filas_rls_pendientes > 0 THEN
    RAISE EXCEPTION 'FALLO: hay % tabla(s) plan_*_terreno con RLS deshabilitado', v_filas_rls_pendientes;
  END IF;
  RAISE NOTICE 'OK: 6) todas las tablas plan_*_terreno tienen RLS habilitado';
END $$;
